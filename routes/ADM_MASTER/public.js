import express from 'express'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import supabase from '../../supabase.js'

dotenv.config()

const route = express.Router()

route.post('/loginMaster', async (req, res) => {
    try {
        const { registration, password } = req.body

        if (registration ==! process.env.REGISTRATION_MASTER && password ==! process.env.PASSWORD_MASTER) {
            return res.status(400).json({ message: 'Credenciais Inválidas' })
        }

        // gerar token JWT para autenticação
        const token = jwt.sign(
                { registration },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            )

        res.status(200).json({ message: 'Login bem-sucedido', token })

    } catch (error) {
        console.error('Erro ao fazer login:', error);
        res.status(500).json({ error: 'Erro com o servidor' })
    }
})

export default route
