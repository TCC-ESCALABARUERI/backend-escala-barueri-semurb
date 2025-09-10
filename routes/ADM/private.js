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

// Função para buscar usuário por matrícula
async function buscarUsuario(matricula_funcionario) {
    return await supabase
        .from('funcionario')
        .select('*')
        .eq('matricula_funcionario', matricula_funcionario)
        .maybeSingle()
}

// SETOR

route.post('/cadastrarUsuarioSetor', async (req, res) => {
    try {
        const obrigatorios = ['matricula_funcionario', 'nome', 'email', 'senha', 'telefone', 'id_setor']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

        const { matricula_funcionario, nome, email, senha, telefone, cargo, regiao, equipe, id_setor } = req.body

        const { data: usuarioExistente, error: erroBusca } = await buscarUsuario(matricula_funcionario)
        if (erroBusca) return res.status(400).json({ mensagem: 'Erro ao buscar usuário', erro: erroBusca })

        if (!usuarioExistente) {
            const senhaHash = await bcrypt.hash(senha, 10)
            const { data, error } = await supabase
                .from('funcionario')
                .insert([{
                    matricula_funcionario,
                    nome,
                    email,
                    senha: senhaHash,
                    telefone,
                    cargo: cargo || 'Funcionário',
                    regiao,
                    equipe,
                    id_setor,
                    status_permissao: 'Não'
                }])
                .select()

            if (error) return res.status(400).json({ mensagem: 'Erro ao cadastrar usuário', erro: error })
            return res.status(201).json({ mensagem: 'Usuário criado e vinculado ao setor com sucesso', usuario: data[0] })
        }

        if (usuarioExistente.id_setor && usuarioExistente.id_setor !== id_setor) {
            return res.status(403).json({ mensagem: 'Usuário já está em outro setor. Apenas o administrador do setor atual pode removê-lo.' })
        }

        const { data, error } = await supabase
            .from('funcionario')
            .update({ id_setor })
            .eq('matricula_funcionario', matricula_funcionario)
            .select()

        if (error) return res.status(400).json({ mensagem: 'Erro ao vincular usuário ao setor', erro: error })
        res.status(200).json({ mensagem: 'Usuário vinculado ao setor com sucesso', usuario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

route.delete('/removerUsuarioSetor/:matricula', async (req, res) => {
    try {
        const { matricula } = req.params
        const { id_admin } = req.body

        const { data: admin, error: erroAdmin } = await buscarUsuario(id_admin)
        if (erroAdmin || !admin) return res.status(400).json({ mensagem: 'Erro ao buscar admin', erro: erroAdmin })

        if (admin.status_permissao !== 'Sim' || !admin.id_setor) {
            return res.status(403).json({ mensagem: 'Somente administradores do setor podem remover usuários' })
        }

        const { data: usuario, error: erroUsuario } = await buscarUsuario(matricula)
        if (erroUsuario || !usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado', erro: erroUsuario })

        if (usuario.id_setor !== admin.id_setor) {
            return res.status(403).json({ mensagem: 'Você só pode remover usuários do seu próprio setor' })
        }

        const { data, error } = await supabase
            .from('funcionario')
            .update({ id_setor: null })
            .eq('matricula_funcionario', matricula)
            .select()

        if (error) return res.status(400).json({ mensagem: 'Erro ao remover usuário do setor', erro: error })
        res.status(200).json({ mensagem: 'Usuário removido do setor com sucesso', usuario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

route.get('/listarUsuariosSetor/:id_setor', async (req, res) => {
    try {
        const { id_setor } = req.params
        const { data, error } = await supabase
            .from('funcionario')
            .select('*')
            .eq('id_setor', id_setor)

        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar usuários do setor', erro: error })
        res.status(200).json({ funcionario: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// ESCALA

route.post('/cadastrarUsuarioEscala', async (req, res) => {
    try {
        const obrigatorios = ['matricula_funcionario', 'id_escala']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

        const { matricula_funcionario, id_escala } = req.body
        const { data, error } = await supabase
            .from('funcionario')
            .update({ id_escala })
            .eq('matricula_funcionario', matricula_funcionario)
            .select()

        if (error) return res.status(400).json({ mensagem: 'Erro ao vincular usuário à escala', erro: error })
        res.status(200).json({ mensagem: 'Usuário vinculado/movido para a escala com sucesso', usuario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

route.get('/listarUsuariosEscala/:id_escala', async (req, res) => {
    try {
        const { id_escala } = req.params
        const { data, error } = await supabase
            .from('funcionario')
            .select('*')
            .eq('id_escala', id_escala)

        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar usuários da escala', erro: error })
        res.status(200).json({ usuarios: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// Listar escalas existentes
route.get('/listarEscalas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('escala').select('*')
        if (error) return res.status(400).json({ mensagem: 'Erro ao listar escalas', erro: error })
        res.status(200).json({ escalas: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// TURNO 

route.post('/cadastrarUsuarioTurno', async (req, res) => {
    try {
        const obrigatorios = ['matricula_funcionario', 'id_turno']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

        const { matricula_funcionario, id_turno } = req.body
        const { data, error } = await supabase
            .from('funcionario')
            .update({ id_turno })
            .eq('matricula_funcionario', matricula_funcionario)
            .select()

        if (error) return res.status(400).json({ mensagem: 'Erro ao vincular usuário ao turno', erro: error })
        res.status(200).json({ mensagem: 'Usuário vinculado/movido para o turno com sucesso', usuario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

route.get('/listarUsuariosTurno/:id_turno', async (req, res) => {
    try {
        const { id_turno } = req.params
        const { data, error } = await supabase
            .from('funcionario')
            .select('*')
            .eq('id_turno', id_turno)

        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar usuários do turno', erro: error })
        res.status(200).json({ usuarios: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// Listar turnos existentes
route.get('/listarTurnos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('turno').select('*')
        if (error) return res.status(400).json({ mensagem: 'Erro ao listar turnos', erro: error })
        res.status(200).json({ turnos: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// EDITAR USUÁRIO

route.put('/editarUsuario/:matricula', async (req, res) => {
    try {
        const { matricula } = req.params
        const { nome, email, senha, telefone, cargo, regiao, equipe, id_setor, id_escala, id_turno } = req.body

        let updateData = { nome, email, telefone, cargo, regiao, equipe, id_setor, id_escala, id_turno }

        if (senha) {
            updateData.senha = await bcrypt.hash(senha, 10)
        }

        const { data, error } = await supabase
            .from('funcionario')
            .update(updateData)
            .eq('matricula_funcionario', matricula)
            .select()

        if (error) return res.status(400).json({ mensagem: 'Erro ao editar usuário', erro: error })
        res.status(200).json({ mensagem: 'Usuário atualizado com sucesso', usuario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

export default route
