import express from "express"
import cors from 'cors'

//Importação das Rotas
import loginMaster from './routes/ADM_MASTER/public.js'
import routePrivateMaster from './routes/ADM_MASTER/private.js'

const app = express()
app.use(cors())
app.use(express.json()) 

//Definição das Rotas

app.use(
    '/', 
    // ADM Master
    loginMaster,
    routePrivateMaster
    // ADM
    // User
)

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000')
})