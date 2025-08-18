import express from 'express'
import dotenv from 'dotenv'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { prisma } from 'prisma/prisma-client'

import { authController } from './controllers/auth.controller'
import { userController } from './controllers/user.controller'
import { goalController } from './controllers/goal.controller'
import { friendshipController } from './controllers/friendship.controller'
import { settingsController } from './controllers/settings.controller'
import { errorMiddleware } from './middlewares/error.middleware'
import './scheduler'

dotenv.config()
const app = express()
const port = process.env.PORT || 4000

// Функция для создания временного пользователя
async function createTempUser() {
	try {
		const existingUser = await prisma.user.findUnique({
			where: { id: '1' }
		})

		if (!existingUser) {
			await prisma.user.create({
				data: {
					id: '1',
					firstName: 'Temporary',
					lastName: 'User',
					username: 'temp_user',
					photoUrl: '',
					inviteCode: 'invite_1',
					pin: 'temporary_pin',
					chatId: '1'
				}
			})
			console.log('Временный пользователь создан с ID: 1')
		}

		// Создаем временные настройки уведомлений
		const existingSettings = await prisma.notificationSettings.findUnique({
			where: { userId: '1' }
		})

		if (!existingSettings) {
			await prisma.notificationSettings.create({
				data: {
					userId: '1',
					todaySubGoalsNotifications: true,
					tomorrowSubGoalNotifications: true,
					monthlyGoalDeadlineNotifications: true,
					customNotifications: true
				}
			})
			console.log('Временные настройки уведомлений созданы для пользователя ID: 1')
		}
	} catch (error) {
		console.error('Ошибка при создании временного пользователя:', error)
	}
}

// Безопасность
app.use(helmet())

// Увеличиваем лимит для больших JSON-запросов
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Парсер cookies
app.use(cookieParser())

// CORS с поддержкой любых origin и credentials
app.use(cors({
  origin: ['https://celiscope.ru', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.options('*', cors()) // Важно! для обработки preflight


// Контроллеры
app.use('/api/auth', authController)
app.use('/api/user', userController)
app.use('/api/goal', goalController)
app.use('/api/friendship', friendshipController)
app.use('/api/settings', settingsController)

// Обработка ошибок
app.use(errorMiddleware)

// Запуск сервера
app.listen(port, async () => {
	console.log(`Tseleskop Server listening on port ${port}`)
	// Создаем временного пользователя при запуске
	await createTempUser()
})
