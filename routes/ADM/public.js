import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import supabase from '../../supabase.js'

const route = express.Router()

route.post('/loginAdm', async (req, res) => {
  try {
    const { matricula, senha } = req.body

    if (!matricula || !senha) {
      return res.status(400).json({ mensagem: 'Matrícula e senha são obrigatórias.' })
    }

    const { data: user, error } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula)
      .maybeSingle()

    if (error) throw error
    if (!user) return res.status(400).json({ mensagem: 'Credenciais inválidas.' })

    const senhaValida = await bcrypt.compare(senha, user.senha)
    if (!senhaValida) return res.status(400).json({ mensagem: 'Credenciais inválidas.' })

    if (user.status_permissao !== "Sim") {
      return res.status(403).json({ mensagem: 'Acesso negado.' })
    }

    const token = jwt.sign(
      {
        id: user.id,
        nome: user.nome,
        matricula: user.matricula_funcionario,
        cargo: user.cargo,
        regiao: user.regiao,
        equipe: user.equipe
      },
      process.env.JWT_SECRET || 'secreta',
      { expiresIn: '2h' }
    )

    return res.status(200).json({ message: 'Login realizado com sucesso', token })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ mensagem: 'Erro interno.' })
  }
})

export default route