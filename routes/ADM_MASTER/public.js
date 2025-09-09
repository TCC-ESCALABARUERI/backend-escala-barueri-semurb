import express from 'express'
import dotenv from 'dotenv/config'

const route = express.Router()

route.post('/loginMaster', (req, res) => {
    try {
        const { registration, password } = req.body

        if (registration === process.env.REGISTRATION_MASTER && password === process.env.PASSWORD_MASTER) {
            res.status(200).json({ message: 'Login bem-sucedido' })
        }
        else {
            res.status(401).json({ error: 'Credenciais inválidas' })
        }
    }
    catch (error) {
        console.error('Erro ao fazer login:', error)
        res.status(500).json({ error: 'Erro com o servidor' })
    }
})

export default route