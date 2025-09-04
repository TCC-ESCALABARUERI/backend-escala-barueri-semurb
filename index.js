import express from "express"
import cors from 'cors'
import dotenv from 'dotenv'

//Importação das Rotas


const app = express()

app.use(cors())
app.use(express.json()) 

dotenv.config()

console.log("Server is running on port 3000")

