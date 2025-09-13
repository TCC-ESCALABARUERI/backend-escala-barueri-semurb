import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import supabase from '../../supabase.js'

const route = express.Router()

// Função para validar campos obrigatórios
function validarCampos(campos, body) {
    for (const campo of campos) {
        if (!body[campo]) return campo
    }
    return null
}

// login de Funcionário
route.post('/loginAdm', async (req, res) => {
    try {
        const obrigatorios = ['matricula_funcionario', 'senha']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

        const { matricula_funcionario, senha } = req.body

        const { data: funcionario, error } = await supabase
            .from('funcionario')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .maybeSingle()

        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar usuário', erro: error })
        if (!funcionario) return res.status(404).json({ mensagem: 'Usuário não encontrado' })

        const senhaValida = await bcrypt.compare(senha, funcionario.senha)
        if (!senhaValida) return res.status(401).json({ mensagem: 'Credenciais Inválidas' })

        // verificar se existe a permissao de adm
        if (funcionario.status_permissao !== 'Sim') {
            return res.status(403).json({ mensagem: 'Acesso negado: Permissão de administrador necessária' })
        }

        const token = jwt.sign(
            { id: funcionario.id, matricula_funcionario: funcionario.matricula_funcionario },
            process.env.JWT_SECRET || 'secreta',
            { expiresIn: '2h' }
        )
        
        return res.status(200).json({ mensagem: 'Login bem-sucedido', funcionario, token })
    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

export default route