import express from 'express'
import bcrypt from 'bcrypt'
import supabase from '../../supabase.js'
import jwt from 'jsonwebtoken'

const route = express.Router()

// Função para validar campos obrigatórios
function validarCampos(campos, body) {
  for (const campo of campos) {
    if (!body[campo]) return campo
  }
  return null
}

// Rota de login para funcionário
route.post('/loginFuncionario', async (req, res) => {
  const { matricula_funcionario, senha } = req.body

  if (!matricula_funcionario || !senha) {
    return res.status(400).json({ mensagem: 'Matricula e senha são obrigatórios!' })
  }

  try {
    // Busca funcionário pelo número de matrícula
    const { data: funcionario, error } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()

    if (error) return res.status(400).json({ mensagem: 'Erro ao buscar usuário', erro: error })
    if (!funcionario) return res.status(404).json({ mensagem: 'Usuário não encontrado' })

    // Valida senha
    const senhaValida = await bcrypt.compare(senha, funcionario.senha)
    if (!senhaValida) return res.status(401).json({ mensagem: 'Credenciais Inválidas' })

    // Gera token
    const token = jwt.sign(
      { matricula_funcionario: funcionario.matricula_funcionario },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    // Busca informações relacionadas em paralelo
    const [escalaRes, turnoRes, setorRes, regiaoRes, equipeRes, confirmacaoRes, notificacoesRes] =
      await Promise.all([
        supabase.from('escala').select('*').eq('id_escala', funcionario.id_escala).maybeSingle(),
        supabase.from('turno').select('*').eq('id_turno', funcionario.id_turno).maybeSingle(),
        supabase.from('setor').select('*').eq('id_setor', funcionario.id_setor).maybeSingle(),
        supabase.from('regiao').select('*').eq('id_regiao', funcionario.id_regiao).maybeSingle(),
        supabase.from('equipe').select('*').eq('id_equipe', funcionario.id_equipe).maybeSingle(),
        supabase
          .from('escala_confirmacao')
          .select('*')
          .eq('matricula_funcionario', funcionario.matricula_funcionario)
          .order('data_confirmacao', { ascending: false })
          .limit(1),
        supabase
          .from('notificacoes')
          .select('*')
          .eq('matricula_funcionario', funcionario.matricula_funcionario)
          .order('enviada_em', { ascending: false })
      ])

    return res.status(200).json({
      mensagem: 'Login bem-sucedido',
      funcionario,
      token,
      setor: setorRes.data,
      escala: escalaRes.data,
      turno: turnoRes.data,
      regiao: regiaoRes.data,
      equipe: equipeRes.data,
      confirmacaoEscala: confirmacaoRes.data?.length > 0 ? confirmacaoRes.data[0] : null,
      notificacoes: notificacoesRes.data
    })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Envio de código de verificação por email 
// Envio de código de verificação por email 
route.post('/envioVerificacao_email', async (req, res) => {
  try {
    const obrigatorios = ['email']
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando)
      return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

    const { email } = req.body

    const { data: emailFuncionario, error } = await supabase
      .from('funcionario')
      .select('matricula_funcionario, email')
      .eq('email', email)
      .maybeSingle()

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar email do funcionário', erro: error })
    }

    if (!emailFuncionario) {
      return res.status(404).json({ mensagem: 'Email não encontrado' })
    }

    const matricula_funcionario = emailFuncionario.matricula_funcionario

    // Gerar um código de verificação (6 dígitos)
    const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString()

    // enviar email (aguardar resposta e tratar falha, mas não abortar por completo)
    try {
      const mailResp = await fetch('https://webmailsender.vercel.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialType: 'oauth2',
          credentials: {
            user: process.env.EMAIL_USER,
            clientId: process.env.EMAIL_CLIENT_ID,
            clientSecret: process.env.EMAIL_CLIENT_SECRET,
            refreshToken: process.env.REFRESH_TOKEN
          },
          mailOptions: {
            from: `"Escala Semurb" <${process.env.EMAIL_USER}>`,
            to: emailFuncionario.email,
            subject: 'Código de Verificação',
            html: `<h1 style="color: pink">Seu código de verificação é: ${codigoVerificacao}</h1>`
          }
        })
      })

      if (!mailResp.ok) {
        console.warn('Falha ao enviar email, status:', mailResp.status)
      }
    } catch (err) {
      console.error('Erro ao enviar email:', err)
    }

    // armazenar o codigo no banco de dados (retornar o registro inserido)
    const { data: novoCodigo, error: errInsert } = await supabase
      .from('codigo_validacao')
      .insert([
        {
          codigo: codigoVerificacao,
          matricula_funcionario: matricula_funcionario
        }
      ])
      .select()
      .single()

    if (errInsert) {
      console.error('Erro ao inserir código de validação:', errInsert)
      return res.status(400).json({ mensagem: 'Erro ao armazenar código de verificação', erro: errInsert })
    }

    // Em produção não retorne o código na resposta; aqui mantido para testes
    return res.status(200).json({
      mensagem: 'Código de verificação enviado com sucesso' ,codigoVerificacao,
      // codigoVerificacao, // comentar/remover em produção
      matricula_funcionario
    })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// verificação do código enviado para 
route.post('/verificacaoCodigo', async (req, res) => {
  try {
    const obrigatorios = ['matricula_funcionario', 'codigo']
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando)
      return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

    const { matricula_funcionario, codigo } = req.body

    const { data: codigoValidacao, error } = await supabase
      .from('codigo_validacao')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .eq('codigo', codigo)
      .maybeSingle()

      console.log("ERRO: ", error)

    if (error)
      return res.status(400).json({ mensagem: 'Erro ao buscar código de verificação', erro: error })

    // Verificar se o código existe e é válido, e verificar se não expirou (apos 5 minutos)
    if (!codigoValidacao) {
      return res.status(400).json({ mensagem: 'Código de verificação inválido' })
    }

    const agora = new Date()
    const criadoEm = new Date(codigoValidacao.criado_em)
    const diferencaEmMinutos = (agora - criadoEm) / 1000 / 60

    if (diferencaEmMinutos > 5) {
      return res.status(400).json({ mensagem: 'Código de verificação expirado' })
    }

    return res.status(200).json({ mensagem: 'Código de verificação válido', codigo })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

route.put('/redefinirSenha', async (req, res) => {
  try {
    const obrigatorios = ['codigo', 'matricula_funcionario', 'nova_senha', 'confirmar_senha']
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando)
      return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

    const { codigo, matricula_funcionario, nova_senha, confirmar_senha } = req.body

    const { data: codigoValidacao, error } = await supabase
      .from('codigo_validacao')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .eq('codigo', codigo)
      .maybeSingle()

    if (error)
      return res.status(400).json({ mensagem: 'Erro ao buscar código de verificação', erro: error })
    if (!codigoValidacao) {
      return res.status(400).json({ mensagem: 'Código de verificação inválido' })
    }

    //verificar se o código expirou (5 minutos)
    const agora = new Date()
    const criadoEm = new Date(codigoValidacao.criado_em)
    const diferencaEmMinutos = (agora - criadoEm) / 1000 / 60

    if (diferencaEmMinutos > 5) {
      return res.status(400).json({ mensagem: 'Código de verificação expirado' })
    }

    if (nova_senha !== confirmar_senha) {
      return res.status(400).json({ mensagem: 'As senhas não coincidem' })
    }

    const senhaHash = await bcrypt.hash(nova_senha, 10)

    const { data: funcionarioAtualizado, error: erroAtualizacao } = await supabase
      .from('funcionario')
      .update({ senha: senhaHash })
      .eq('matricula_funcionario', matricula_funcionario)
      .select()
      .maybeSingle()

    if (erroAtualizacao)
      return res.status(400).json({ mensagem: 'Erro ao atualizar a senha', erro: erroAtualizacao })

    return res.status(200).json({ mensagem: 'Senha atualizada com sucesso', funcionarioAtualizado })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// deletar todos os codigos do usuario apos a redefinição de senha
route.delete('/deletarCodigos/:matricula_funcionario', async (req, res) => {
  try {
    const { matricula_funcionario } = req.params

    const { data, error } = await supabase
      .from('codigo_validacao')
      .delete()
      .eq('matricula_funcionario', matricula_funcionario)

    if (error)
      return res
        .status(400)
        .json({ mensagem: 'Erro ao deletar códigos de verificação', erro: error })

    return res.status(200).json({ mensagem: 'Códigos de verificação deletados com sucesso' })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

export default route
