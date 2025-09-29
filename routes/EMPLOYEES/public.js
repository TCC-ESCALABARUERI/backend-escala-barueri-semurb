import express from 'express'
import bcrypt from 'bcrypt'
import supabase from '../../supabase.js'
import jwt from 'jsonwebtoken'

const route = express.Router()

// Rota de login para funcionário
route.post('/loginFuncionario', async (req, res) => {
    // Extrai matrícula e senha 
    const { matricula_funcionario, senha } = req.body

    // Valida se ambos os campos foram enviados
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

        // Retorna erro se houver problema na consulta
        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar usuário', erro: error })

        // Retorna erro se funcionário não for encontrado
        if (!funcionario) return res.status(404).json({ mensagem: 'Usuário não encontrado' })

        // Compara a senha informada com o hash salvo no banco
        const senhaValida = await bcrypt.compare(senha, funcionario.senha)
        if (!senhaValida) return res.status(401).json({ mensagem: 'Credenciais Inválidas' })

        // Gera token JWT para autenticação
        const token = jwt.sign(
            { id: funcionario.id, matricula_funcionario: funcionario.matricula_funcionario },
            process.env.JWT_SECRET || 'secreta',
            { expiresIn: '2h' }
        )

        // retorna setor, escala, regiao e equipe do funcionário em paralelo
        const [escalaRes, setorRes, regiaoRes, equipeRes, confirmacaoRes] = await Promise.all([
            supabase.from('escala').select('*').eq('id_escala', funcionario.id_escala).maybeSingle(),
            supabase.from('setor').select('*').eq('id_setor', funcionario.id_setor).maybeSingle(),
            supabase.from('regiao').select('*').eq('id_regiao', funcionario.id_regiao).maybeSingle(),
            supabase.from('equipe').select('*').eq('id_equipe', funcionario.id_equipe).maybeSingle(),
            supabase.from('escala_confirmacao').select('*').eq('matricula_funcionario', funcionario.matricula_funcionario).maybeSingle()
        ])

        // Retorna dados do funcionário, token, setor e escala
        return res.status(200).json({
            mensagem: 'Login bem-sucedido',
            funcionario,
            token,
            setor: setorRes.data,
            escala: escalaRes.data,
            regiao: regiaoRes.data,
            equipe: equipeRes.data,
            confirmacaoEscala: confirmacaoRes.data
        })
    } catch (error) {
        // Retorna erro genérico do servidor
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

export default route