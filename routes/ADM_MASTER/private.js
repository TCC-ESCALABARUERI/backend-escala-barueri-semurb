import express from 'express'
import bcrypt from 'bcrypt'
import supabase from '../../supabase.js'

const route = express.Router()

// Cadastrar Funcionário
route.post('/cadastrarFuncionario_master', async (req, res) => {
    try {
        const { matricula_funcionario, nome, email, telefone, cargo, setor, status_permissao } = req.body

        if (!matricula_funcionario || !nome || !email || !telefone || !cargo || !setor || !status_permissao) {
            return res.status(400).json({ mensagem: 'Preencha todos os campos obrigatórios' })
        }

        const senha = matricula_funcionario.toString()

        // Criptografar senha
        const salt = await bcrypt.genSalt(10)
        const senhaHash = await bcrypt.hash(senha, salt)

        // Verificar se matrícula já existe
        const { data: funcionarioExistente } = await supabase
            .from('funcionario')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .maybeSingle()

        if (funcionarioExistente) {
            return res.status(400).json({ mensagem: 'Matrícula já cadastrada' })
        }

        // buscar setor para associar ao funcionário
        const { data: setorData, error: setorError } = await supabase
            .from('setor')
            .select('id_setor')
            .eq('nome_setor', setor)
            .maybeSingle()
            
        if (setorError || !setorData) {
            return res.status(400).json({ mensagem: 'Setor não encontrado', erro: setorError })
        }

        // Inserir funcionário
        const { data, error } = await supabase
            .from('funcionario')
            .insert([{
                matricula_funcionario: matricula_funcionario,
                nome: nome,
                email: email,
                senha: senhaHash,
                telefone: telefone,
                cargo: cargo,
                id_setor: setorData.id_setor,
                status_permissao: status_permissao
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
route.get('/listarFuncionarios_master', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('funcionario')
            .select('*')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao listar funcionários', erro: error })
        }

        res.status(200).json({ funcionarios: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// Listar Funcionário por Setor
route.get('/listarFuncionariosSetor_master/:setor', async (req, res) => {
    try {
        const { setor } = req.params

        // buscar setor pelo nome
        const { data: setorData, error: setorError } = await supabase
            .from('setor')
            .select('id_setor')
            .eq('nome_setor', setor)
            .maybeSingle()

        if (setorError || !setorData) {
            return res.status(400).json({ mensagem: 'Setor não encontrado', erro: setorError })
        }

        // buscar funcionários do setor
        const { data, error } = await supabase
            .from('funcionario')
            .select()
            .eq('id_setor', setorData.id_setor)

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao listar funcionários', erro: error })
        }

        res.status(200).json({ funcionarios: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// editar funcionário por matrícula
route.put('/editarFuncionario_master/:matricula_funcionario', async (req, res) => {
    try {
        const { matricula_funcionario } = req.params
        const { nome, email, senha, telefone, cargo, setor } = req.body

        // dados antigos do funcionario
        const { data: funcionarioDesatualizado } = await supabase
            .from('funcionario')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .maybeSingle()

        if (!funcionarioDesatualizado) {
            return res.status(404).json({ mensagem: 'Funcionário não encontrado' })
        }

        let senhaHash = funcionarioDesatualizado.senha

        // se a senha foi alterada, criptografar a nova senha
        if (senha && senha !== funcionarioDesatualizado.senha) {
            const salt = await bcrypt.genSalt(10)
            senhaHash = await bcrypt.hash(senha, salt)
        }

        // buscar setor para associar ao funcionário
        let setor_id = funcionarioDesatualizado.setor_id
        if (setor) {
            const { data: setorData, error: setorError } = await supabase
                .from('setor')
                .select('id_setor')
                .eq('nome_setor', setor)
                .maybeSingle()

            if (setorError || !setorData) {
                return res.status(400).json({ mensagem: 'Setor não encontrado', erro: setorError })
            }
            setor_id = setorData.id_setor
        }

        // atualizar funcionário
        const { data: funcionarioAtualizado, error } = await supabase
            .from('funcionario')
            .update({
                nome: nome || funcionarioDesatualizado.nome,
                email: email || funcionarioDesatualizado.email,
                senha: senhaHash,
                telefone: telefone || funcionarioDesatualizado.telefone,
                cargo: cargo || funcionarioDesatualizado.cargo,
                id_setor: setor_id,
            })
            .eq('matricula_funcionario', matricula_funcionario)
            .select('*')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao atualizar funcionário', erro: error })
        }

        res.status(200).json({ mensagem: 'Funcionário atualizado com sucesso', funcionario: funcionarioAtualizado[0] }) 
    }
    catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// Editar Permissão
route.put('/editarPermissao/:matricula_funcionario', async (req, res) => {
    try {
        const { matricula_funcionario } = req.params
        const { status_permissao } = req.body // "Sim" ou "Não"

        if (!status_permissao) {
            return res.status(400).json({ mensagem: 'Informe a permissão (Sim ou Não)' })
        }

        const { data, error } = await supabase
            .from('funcionario')
            .update({ status_permissao: stat })
            .eq('matricula_funcionario', matricula_funcionario)
            .select('*')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao atualizar permissão', erro: error })
        }

        res.status(200).json({ mensagem: 'Permissão atualizada com sucesso', funcionario: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// Deletar Funcionário
route.delete('/deletarFuncionario_master/:matricula_funcionario', async (req, res) => {
    try {
        const { matricula_funcionario } = req.params

        const { error } = await supabase
            .from('funcionario')
            .delete()
            .eq('matricula_funcionario', matricula_funcionario)

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao deletar funcionário', erro: error })
        }

        res.status(200).json({ mensagem: 'Funcionário deletado com sucesso' })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

//Setores

// Criar Setor
route.post('/cadastrarSetor', async (req, res) => {
    try {
        const { nome_setor } = req.body

        if (!nome_setor) {
            return res.status(400).json({ mensagem: 'Informe o nome do setor' })
        }

        // Verificar se já existe
        const { data: setorExistente } = await supabase
            .from('setor')
            .select('*')
            .eq('nome_setor', nome_setor)
            .maybeSingle()

        if (setorExistente) {
            return res.status(400).json({ mensagem: 'Setor já cadastrado' })
        }

        const { data, error } = await supabase
            .from('setor')
            .insert([{ nome_setor }])
            .select('*')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao cadastrar setor', erro: error })
        }

        res.status(201).json({ mensagem: 'Setor cadastrado com sucesso', setor: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


// Listar Setores
route.get('/listarSetores', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('setor')
            .select('id_setor, nome_setor')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao listar setores', erro: error })
        }

        res.status(200).json({ setores: data })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


// Editar Setor
route.put('/editarSetor/:id', async (req, res) => {
    try {
        const { id } = req.params
        const { nome_setor } = req.body

        if (!nome_setor) {
            return res.status(400).json({ mensagem: 'Informe o nome do setor' })
        }

        const { data, error } = await supabase
            .from('setor')
            .update({ nome_setor })
            .eq('id_setor', id)
            .select('*')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao atualizar setor', erro: error })
        }

        res.status(200).json({ mensagem: 'Setor atualizado com sucesso', setor: data[0] })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


// Deletar Setor
route.delete('/deletarSetor/:id', async (req, res) => {
    try {
        const { id } = req.params

        const { error } = await supabase
            .from('setor')
            .delete()
            .eq('id_setor', id)

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao deletar setor', erro: error })
        }

        res.status(200).json({ mensagem: 'Setor deletado com sucesso' })
    } catch (error) {
        res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})


export default route
