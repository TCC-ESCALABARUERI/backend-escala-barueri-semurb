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
            { matricula_funcionario: funcionario.matricula_funcionario },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        )

        // retornar escala do funcionario
        const { data: escala } = await supabase
            .from('escala')
            .select('*')
            .eq('id_escala', funcionario.id_escala)
            .maybeSingle()

        // retornar setor do funcionario
        const { data: setor } = await supabase
            .from('setor')
            .select('*')
            .eq('id_setor', funcionario.id_setor)
            .maybeSingle()


        return res.status(200).json({ mensagem: 'Login bem-sucedido', funcionario, token, escala, setor })
    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// Envio de código de verificação por email para ADM
route.post('/envioVerificacaoAdm_email', async (req, res) => {
    try {
        const obrigatorios = ['email']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

        const { email } = req.body

        const { data: emailFuncionario, error } = await supabase
            .from('funcionario')
            .select('*')
            .eq('email', email)
            .maybeSingle()

        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar email do funcionŕio', erro: error })

        const matricula_funcionario = emailFuncionario.matricula_funcionario

        // Gerar um código de verificação (pode ser um número aleatório ou uma string)
        const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString() // Exemplo: código de 6 dígitos

        await fetch('https://webmailsender.vercel.app', {
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
            }),
        })

        // armazenar o codigo no banco de dados
        const { novoCodigo } = await supabase
            .from('codigo_validacao')
            .insert([{
                codigo: codigoVerificacao,
                matricula_funcionario: matricula_funcionario
            }])

        res.status(200).json({ mensagem: 'Código de verificação enviado com sucesso', codigoVerificacao, matricula_funcionario })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// verificação do código enviado para ADM
route.post('/verificacaoCodigoAdm', async (req, res) => {
    try {
        const obrigatorios = ['matricula_funcionario', 'codigo']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

        const { matricula_funcionario, codigo } = req.body

        const { data: codigoValidacao, error } = await supabase
            .from('codigo_validacao')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .eq('codigo', codigo)
            .maybeSingle()

        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar código de verificação', erro: error })
        
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

route.put('/redefinirSenhaAdm', async (req, res) => {
    try {
        const obrigatorios = ['codigo', 'matricula_funcionario', 'nova_senha', 'confirmar_senha']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })
            
        const { codigo, matricula_funcionario, nova_senha, confirmar_senha } = req.body

        const { data: codigoValidacao, error } = await supabase
            .from('codigo_validacao')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .eq('codigo', codigo)
            .maybeSingle()

        if (error) return res.status(400).json({ mensagem: 'Erro ao buscar código de verificação', erro: error })
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

        if (erroAtualizacao) return res.status(400).json({ mensagem: 'Erro ao atualizar a senha', erro: erroAtualizacao })

        return res.status(200).json({ mensagem: 'Senha atualizada com sucesso', funcionarioAtualizado })
    }
    catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// deletar todos os codigos do usuario apos a redefinição de senha
route.delete('/deletarCodigosAdm/:matricula_funcionario', async (req, res) => {
    try {
        const { matricula_funcionario } = req.params

        const { data, error } = await supabase
            .from('codigo_validacao')
            .delete()
            .eq('matricula_funcionario', matricula_funcionario)

        if (error) return res.status(400).json({ mensagem: 'Erro ao deletar códigos de verificação', erro: error })

        return res.status(200).json({ mensagem: 'Códigos de verificação deletados com sucesso' })
    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

export default route