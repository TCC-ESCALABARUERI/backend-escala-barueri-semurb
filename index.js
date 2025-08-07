import express from "express"
import cors from 'cors'
import dotenv from 'dotenv'

const app = express()

app.use(cors())
app.use(express.json()) 

dotenv.config()

app.get("/", (req, res) => {
  res.send("Welcome to the API!")
})

console.log("Server is running on port 3000")

