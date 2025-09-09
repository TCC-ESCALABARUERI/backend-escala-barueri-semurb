import express from 'express'
import bcrypt from 'bcrypt'
import supabase from '../../supabase.js'

const route = express.Router()

// Cadastrar Funcionário
route.post('/cadastrarFuncionario', async (req, res) => {
    try {
        const { matricula, nome, senha, email, telefone, cargo, regiao, equipe } = req.body

        if (!matricula || !nome || !senha || !email || !telefone || !regiao || !equipe) {
            return res.status(400).json({ mensagem: 'Preencha todos os campos obrigatórios' })
        }

        // Criptografar senha
        const salt = await bcrypt.genSalt(10)
        const senhaHash = await bcrypt.hash(senha, salt)

        // Verificar se matrícula já existe
        const { data: funcionarioExistente } = await supabase
            .from('funcionario')
            .select('*')
            .eq('matricula_funcionario', matricula)
            .maybeSingle()

        if (funcionarioExistente) {
            return res.status(400).json({ mensagem: 'Matrícula já cadastrada' })
        }

        // Inserir funcionário
        const { data, error } = await supabase
            .from('funcionario')
            .insert([{
                matricula_funcionario: matricula,
                nome: nome,
                email: email,
                senha: senhaHash,
                telefone: telefone,
                regiao: regiao,
                equipe: equipe,
                cargo: cargo || 'Funcionário',
                status_permissao: 'Não'
            }])
            .select()

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao inserir dados', erro: error })
        }

        res.status(201).json({ mensagem: 'Funcionário cadastrado com sucesso', funcionario: data[0] })

    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


// Listar Funcionários
route.get('/listarFuncionarios', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('funcionario')
            .select('matricula_funcionario, nome, email, telefone, regiao, equipe, cargo, status_permissao')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao listar funcionários', erro: error })
        }

        res.status(200).json({ funcionarios: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


// Editar Permissão
route.put('/editarPermissao/:matricula', async (req, res) => {
    try {
        const { matricula } = req.params
        const { permissao } = req.body // "Sim" ou "Não"

        if (!permissao) {
            return res.status(400).json({ mensagem: 'Informe a permissão (Sim ou Não)' })
        }

        const { data, error } = await supabase
            .from('funcionario')
            .update({ status_permissao: permissao })
            .eq('matricula_funcionario', matricula)
            .select()

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao atualizar permissão', erro: error })
        }

        res.status(200).json({ mensagem: 'Permissão atualizada com sucesso', funcionario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


// Editar Funcionário
route.put('/editarFuncionario/:matricula', async (req, res) => {
    try {
        const { matricula } = req.params
        const { nome, email, telefone, cargo, regiao, equipe } = req.body

        const { data, error } = await supabase
            .from('funcionario')
            .update({
                nome: nome,
                email: email,
                telefone: telefone,
                cargo: cargo,
                regiao: regiao,
                equipe: equipe
            })
            .eq('matricula_funcionario', matricula)
            .select()

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao atualizar funcionário', erro: error })
        }

        res.status(200).json({ mensagem: 'Funcionário atualizado com sucesso', funcionario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


// Deletar Funcionário
route.delete('/deletarFuncionario/:matricula', async (req, res) => {
    try {
        const { matricula } = req.params

        const { error } = await supabase
            .from('funcionario')
            .delete()
            .eq('matricula_funcionario', matricula)

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao deletar funcionário', erro: error })
        }

        res.status(200).json({ mensagem: 'Funcionário deletado com sucesso' })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

export default route
