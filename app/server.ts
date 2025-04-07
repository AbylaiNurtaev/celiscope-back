import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'

import { authController } from './controllers/auth.controller'
import { friendshipController } from './controllers/friendship.controller'
import { goalController } from './controllers/goal.controller'
import { userController } from './controllers/user.controller'
import { errorMiddleware } from './middlewares/error.middleware'
import './scheduler'
import { settingsController } from './controllers/settings.controller'

dotenv.config()
const app = express()
const port = process.env.PORT || 4000

app.use(helmet())
app.use(
	cors({
	  origin: '*', // или '*' если не используешь credentials
	  credentials: true,
	  allowedHeaders: ['Content-Type', 'Authorization']
	})
  )
  
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authController)
app.use('/api/user', userController)
app.use('/api/goal', goalController)
app.use('/api/friendship', friendshipController)
app.use('/api/settings', settingsController)

app.use(errorMiddleware)

app.listen(port, () => {
	console.log(`Tseleskop Server listening on port ${port}`)
})
