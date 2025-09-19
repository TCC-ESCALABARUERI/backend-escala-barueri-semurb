import express from 'express'
import supabase from '../../supabase.js'
import bcrypt from 'bcrypt'

const route = express.Router()

// confirmação de leitura da escala
route.put('/confirmacaoEscala', async (req, res) => {
    const { matricula_funcionario } = req.body
    try {
        //confirmação de leitura da escala 
        const { data: confirmacao, error } = await supabase
            .from('escala_confirmacao')
            .update({
                status: "Confirmado",
                data_confirmacao: new Date().toISOString()
            })
            .eq('matricula_funcionario', matricula_funcionario)

        if (error) {
            throw error
        }

        res.status(200).json({ message: 'Escala confirmada com sucesso.' })
    } catch (error) {
        res.status(500).json({ message: 'Erro ao confirmar escala.', error: error.message })
    }
})

// alteração de senha

export default route