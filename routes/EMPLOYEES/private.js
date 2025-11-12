import express from 'express'
import supabase from '../../supabase.js'
import bcrypt from 'bcrypt'

const route = express.Router()

// Função para validar campos obrigatórios
function validarCampos(campos, body) {
  for (const campo of campos) {
    if (!body[campo]) return campo
  }
  return null
}

// confirmação de leitura da escala
route.put('/confirmacaoEscala/:matricula_funcionario', async (req, res) => {
  const { matricula_funcionario } = req.params

  try {
    // Buscar a confirmação mais recente
    const { data: ultimaConfirmacao, error: erroBusca } = await supabase
      .from('escala_confirmacao')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .order('data_confirmacao', { ascending: false }) // pega a mais recente
      .limit(1)

    if (erroBusca) {
      return res
        .status(500)
        .json({ message: 'Erro ao buscar confirmação.', error: erroBusca.message })
    }

    if (ultimaConfirmacao && ultimaConfirmacao.length > 0) {
      const confirmacao = ultimaConfirmacao[0]

      if (confirmacao.status === 'Confirmado') {
        return res.status(400).json({ message: 'A escala mais recente já foi confirmada.' })
      }

      // Atualizar somente a mais recente
      const { data: confirmada, error: erroUpdate } = await supabase
        .from('escala_confirmacao')
        .update({
          status: 'Confirmado',
          data_confirmacao: new Date().toISOString()
        })
        .eq('id_confirmacao', confirmacao.id_confirmacao) // atualiza só a última
        .select()
        .single()

      if (erroUpdate) {
        return res
          .status(500)
          .json({ message: 'Erro ao confirmar escala.', error: erroUpdate.message })
      }

      return res.status(200).json({ message: 'Escala confirmada com sucesso.', confirmada })
    }

    return res.status(404).json({ message: 'Nenhuma escala encontrada para esse funcionário.' })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao confirmar escala.', error: error.message })
  }
})

// alteração de senha

route.put('/alterarSenha', async (req, res) => {
  const { matricula_funcionario, nova_senha, confirmar_nova_senha } = req.body

  try {
    // validação de entrada
    if (!matricula_funcionario || !nova_senha || !confirmar_nova_senha) {
      return res.status(400).json({ message: 'Matrícula e nova senha são obrigatórias.' })
    }

    // vericar se ambas a senhas são iguais
    if (nova_senha != confirmar_nova_senha) {
      return res.status(400).json({ message: 'Senhas diferentes! Verifique e tente novamente.' })
    }

    // gerar hash da nova senha
    const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10
    const hashedPassword = await bcrypt.hash(nova_senha, saltRounds)

    // atualizar a senha no banco de dados
    const { data, error } = await supabase
      .from('funcionario')
      .update({ senha: hashedPassword })
      .eq('matricula_funcionario', matricula_funcionario)
      .select('matricula_funcionario, nome') // não retorna senha

    if (error) {
      throw error
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Funcionário não encontrado.' })
    }

    res.status(200).json({ message: 'Senha alterada com sucesso.', funcionario: data[0] })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao alterar senha.', error: error.message })
  }
})

// editar informacoes
route.put('/editarInformacoes/:matricula_funcionario', async (req, res) => {
  try {
    const { matricula_funcionario } = req.params
    const camposObrigatorios = ['email', 'telefone']

    const campoFaltando = validarCampos(camposObrigatorios, req.body)
    if (campoFaltando) {
      return res
        .status(400)
        .json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
    }

    const { email, telefone } = req.body

    const { data, error } = await supabase
      .from('funcionario')
      .update({ email, telefone })
      .eq('matricula_funcionario', matricula_funcionario)
      .select('matricula_funcionario, nome, email, telefone')

    if (error) {
      throw error
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Funcionário não encontrado.' })
    }

    res.status(200).json({ message: 'Informações atualizadas com sucesso.', funcionario: data[0] })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar informações.', error: error.message })
  }
})

route.get('/diasEspecificos/:matricula_funcionario', async (req, res) => {
  try {
    const { matricula_funcionario } = req.params

    const { data: diasEspecificos, error } = await supabase
      .from('dias_especificos')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)

    if (error) {
      return res.status(400).json({
        mensagem: 'Erro ao listar dias específicos do funcionário',
        erro: error.message
      })
    }

    return res.status(200).json({
      mensagem: 'Listagem bem-sucedida',
      diasEspecificos
    })

  } catch (err) {
    return res.status(500).json({
      mensagem: 'Erro no servidor',
      erro: err.message
    })
  }
})

export default route
