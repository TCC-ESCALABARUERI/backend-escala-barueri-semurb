import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

const authToken = (req, res, next) => {
    const token = req.headers.authorization

    if (!token) {  
        return res.status(401).json({ message: 'Acesso negado!' })
    }

    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET)
        
        req.user = decoded 
    }
    catch (error) {
        return res.status(400).json({ message: 'Token inválido!' })
    }

    next()
}

export default authToken