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

// Cadastrar funcionário no setor do adm
route.post('/cadastrarFuncionario', async (req, res) => {
    try {
        const obrigatorios = [ 'matricula_adm', 'matricula_funcionario', 'nome', 'senha', 'email', 'telefone', 'regiao', 'equipe' ]
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) {
            return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
        }

        const { matricula_adm, matricula_funcionario, nome, senha, email, telefone, cargo, regiao, equipe } = req.body

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

        // verificar setor do adm para vincular ao funcionario
        const { data: adm } = await supabase
            .from('funcionario')
            .select('id_setor')
            .eq('matricula_funcionario', matricula_adm)
            .maybeSingle()

        // Inserir funcionário
        const { data, error } = await supabase
            .from('funcionario')
            .insert([{
                matricula_funcionario: matricula_funcionario,
                nome: nome,
                email: email,
                senha: senhaHash,
                telefone: telefone,
                regiao: regiao,
                equipe: equipe,
                id_setor: adm.id_setor,
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

// vincular funcionário existente ao setor do adm
route.post('/vincularFuncionarioSetor', async (req, res) => {
    try {
        const obrigatorios = [ 'matricula_adm', 'matricula_funcionario' ]
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) {
            return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
        }

        const { matricula_adm, matricula_funcionario } = req.body

        // verificar setor do adm para vincular ao funcionario
        const { data: adm } = await supabase
            .from('funcionario')
            .select('id_setor')
            .eq('matricula_funcionario', matricula_adm)
            .maybeSingle()

        if (!adm) {
            return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
        }

        // Verificar se funcionário existe
        const { data: funcionarioExistente, error: errorFuncionario } = await supabase
            .from('funcionario')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .maybeSingle()

        if (errorFuncionario) {
            return res.status(400).json({ mensagem: 'Erro ao buscar funcionário', erro: errorFuncionario })
        }

        if (!funcionarioExistente) {
            return res.status(400).json({ mensagem: 'Matrícula do funcionário não encontrada' })
        }

        // Atualizar funcionário com o id_setor do adm
        const { data, error } = await supabase
            .from('funcionario')
            .update({ id_setor: adm.id_setor })
            .eq('matricula_funcionario', matricula_funcionario)
            .select()

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao atualizar dados', erro: error })
        }

        res.status(200).json({ mensagem: 'Funcionário vinculado ao setor com sucesso', funcionario: data[0] })

    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// cadastrar escala do funcionário

route.post



export default route