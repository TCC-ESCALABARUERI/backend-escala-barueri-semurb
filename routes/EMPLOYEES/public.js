import express from 'express'
import bcrypt from 'bcrypt'
import supabase from '../../supabase.js'
import jwt from 'jsonwebtoken'

const route = express.Router()

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
      { expiresIn: '1m' }
    )

    // Busca informações relacionadas em paralelo
    const [escalaRes, setorRes, regiaoRes, equipeRes, confirmacaoRes, notificacoesRes] = await Promise.all([
      supabase.from('escala').select('*').eq('id_escala', funcionario.id_escala).maybeSingle(),
      supabase.from('setor').select('*').eq('id_setor', funcionario.id_setor).maybeSingle(),
      supabase.from('regiao').select('*').eq('id_regiao', funcionario.id_regiao).maybeSingle(),
      supabase.from('equipe').select('*').eq('id_equipe', funcionario.id_equipe).maybeSingle(),
      supabase.from('escala_confirmacao')
        .select('*')
        .eq('matricula_funcionario', funcionario.matricula_funcionario)
        .order('data_confirmacao', { ascending: false })
        .limit(1),
      supabase.from('notificacoes')
      .select('*')
      .eq('matricula_funcionario', funcionario.matricula_funcionario)
      .order('enviada_em', { ascending: false })
      .single()
      
    ])

    return res.status(200).json({
      mensagem: 'Login bem-sucedido',
      funcionario,
      token,
      setor: setorRes.data,
      escala: escalaRes.data,
      regiao: regiaoRes.data,
      equipe: equipeRes.data,
      confirmacaoEscala: confirmacaoRes.data?.length > 0 ? confirmacaoRes.data[0] : null,
      notificacoes: notificacoesRes.data
    })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})


export default route