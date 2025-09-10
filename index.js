import express from "express"
import cors from 'cors'

//Importação das Rotas

// Adm Master
import loginMaster from './routes/ADM_MASTER/public.js'
import routePrivateMaster from './routes/ADM_MASTER/private.js'
//Adm
import loginAdm from './routes/ADM/public.js'
import routePrivateAdm from './routes/ADM/private.js'
//Funcionário
import loginFuncionario from './routes/EMPLOYEES/public.js'
import routePrivateFuncionario from './routes/EMPLOYEES/private.js'

const app = express()
app.use(cors())
app.use(express.json()) 

//Definição das Rotas

app.use(
    '/', 
    // ADM Master
    loginMaster,
    routePrivateMaster,
    // ADM
    loginAdm,
    routePrivateAdm, 
    // User
    loginFuncionario,
    routePrivateFuncionario
)

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000')
})