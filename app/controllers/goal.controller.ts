import { uploadFile } from '@/lib/s3'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { goalCreateSchema } from '@/schemas/goal-create.schema'
import { goalUpdateSchema } from '@/schemas/goal-update.schema'
import { goalService } from '@/services/goal.service'
import { tokenService } from '@/services/token.service'
import { ApiError } from '@/utils/api-error'
import { User } from '@prisma/client'
import { type NextFunction, type Request, type Response, Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import heicConvert from 'heic-convert'

const router = Router()

const storage = multer.memoryStorage()
const upload = multer({
	storage: storage,
	limits: {
		fileSize: 15 * 1024 * 1024 // 15MB limit
	}
})

router.post(
	'/create',
	authMiddleware,
	upload.single('image'),
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			if (!req.file) {
				console.log('No file uploaded')
			}

			const { info } = req.body

			const { value: data, error } = goalCreateSchema.validate(
				JSON.parse(info),
				{
					abortEarly: false
				}
			)

			if (error) throw new ApiError(400, error.message)

			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User

			if (req.file) {
				try {
					// Проверяем формат файла
					const metadata = await sharp(req.file.buffer).metadata();
					
					let imageBuffer = req.file.buffer;
					
					// Если формат HEIF/HEIC, конвертируем в JPG
					if (metadata.format === 'heif') {
						imageBuffer = await heicConvert({
							buffer: req.file.buffer,
							format: 'JPEG',
							quality: 0.9
						});
					}

					const fileBuffer = await sharp(imageBuffer)
						.rotate()
						.toFormat('jpeg')
						.toBuffer()
					const imageUrl = await uploadFile(fileBuffer, `goal-${Date.now()}.jpg`)
					data.imageUrl = imageUrl
				} catch (error) {
					throw new ApiError(400, 'Ошибка при обработке изображения. Пожалуйста, загрузите изображение в поддерживаемом формате (JPG, PNG, HEIC)');
				}
			} else if (!data.imageUrl) {
				// Если файл не загружен и не указан URL изображения, используем изображение по умолчанию
				data.imageUrl = 'https://celiscope.ru/placeholder-image.jpg'
			}

			const goal = await goalService.createGoal(user.id, data)

			res.status(200).json(goal)
		} catch (err) {
			next(err)
		}
	}
)

router.get(
	'/',
	authMiddleware,
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User

			const goal = await goalService.getGoals(user.id)

			res.status(200).json(goal)
		} catch (err) {
			next(err)
		}
	}
)
router.get(
	'/friends',
	authMiddleware,
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User

			const goal = await goalService.getFriendGoals(user.id)

			res.status(200).json(goal)
		} catch (err) {
			next(err)
		}
	}
)

router.post(
	'/:goalId/complete',
	authMiddleware,
	upload.single('image'),
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User
			const goalId = parseInt(req.params.goalId)

			if (isNaN(goalId)) {
				throw new ApiError(400, 'Invalid goal ID')
			}

			try {
				let imageBuffer = req.file.buffer;
				
				// Проверяем формат файла
				const metadata = await sharp(req.file.buffer).metadata();
				
				// Если формат HEIF/HEIC, конвертируем в JPG
				if (metadata.format === 'heif') {
					imageBuffer = await heicConvert({
						buffer: req.file.buffer,
						format: 'JPEG',
						quality: 0.9
					});
				}

				const fileBuffer = await sharp(imageBuffer)
					.rotate()
					.toFormat('jpeg')
					.toBuffer()
				const goal = await goalService.completeGoal(user.id, goalId, fileBuffer)

				res.status(200).json(goal)
			} catch (error) {
				throw new ApiError(400, 'Ошибка при обработке изображения. Пожалуйста, загрузите изображение в поддерживаемом формате (JPG, PNG, HEIC)');
			}
		} catch (err) {
			next(err)
		}
	}
)

router.post(
	'/sub-goal/:subGoalId/complete',
	authMiddleware,
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User
			const subGoalId = parseInt(req.params.subGoalId)

			if (isNaN(subGoalId)) {
				throw new ApiError(400, 'Invalid sub-goal ID')
			}

			const subGoal = await goalService.completeSubGoal(user.id, subGoalId)
			res.status(200).json(subGoal)
		} catch (err) {
			next(err)
		}
	}
)

router.post(
	'/sub-goal/:subGoalId/uncomplete',
	authMiddleware,
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User
			const subGoalId = parseInt(req.params.subGoalId)

			if (isNaN(subGoalId)) {
				throw new ApiError(400, 'Invalid sub-goal ID')
			}

			const subGoal = await goalService.uncompleteSubGoal(user.id, subGoalId)
			res.status(200).json(subGoal)
		} catch (err) {
			next(err)
		}
	}
)

router.get(
	'/:goalId',
	authMiddleware,
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User
			const goalId = parseInt(req.params.goalId)

			if (isNaN(goalId)) {
				throw new ApiError(400, 'Invalid goal ID')
			}

			const goal = await goalService.getGoal(user.id, goalId)
			res.status(200).json(goal)
		} catch (err) {
			next(err)
		}
	}
)

router.put(
	'/:goalId',
	authMiddleware,
	upload.single('image'),
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = req.headers.authorization?.split(' ')[1]
			const user: User = tokenService.validateAccess(token) as User
			const goalId = parseInt(req.params.goalId)

			if (isNaN(goalId)) {
				throw new ApiError(400, 'Invalid goal ID')
			}

			const { info } = req.body
			const parsedInfo = JSON.parse(info)

			// Удаляем пустые значения
			Object.keys(parsedInfo).forEach(key => {
				if (parsedInfo[key] === '' || parsedInfo[key] === null) {
					delete parsedInfo[key]
				}
			})

			// Логируем значение deadline перед валидацией
			if (parsedInfo.deadline) {
				console.log('Полученное значение deadline:', parsedInfo.deadline)
			}

			const { value: data, error } = goalUpdateSchema.validate(
				parsedInfo,
				{
					abortEarly: false
				}
			)

			if (error) throw new ApiError(400, error.message)

			if (req.file) {
				try {
					// Проверяем формат файла
					const metadata = await sharp(req.file.buffer).metadata();
					
					let imageBuffer = req.file.buffer;
					
					// Если формат HEIF/HEIC, конвертируем в JPG
					if (metadata.format === 'heif') {
						imageBuffer = await heicConvert({
							buffer: req.file.buffer,
							format: 'JPEG',
							quality: 0.9
						});
					}

					const fileBuffer = await sharp(imageBuffer)
						.rotate()
						.toFormat('jpeg')
						.toBuffer()
					const imageUrl = await uploadFile(fileBuffer, `goal-${Date.now()}.jpg`)
					data.imageUrl = imageUrl
				} catch (error) {
					throw new ApiError(400, 'Ошибка при обработке изображения. Пожалуйста, загрузите изображение в поддерживаемом формате (JPG, PNG, HEIC)');
				}
			}

			const goal = await goalService.updateGoal(user.id, goalId, data)
			res.status(200).json(goal)
		} catch (err) {
			next(err)
		}
	}
)

export const goalController = router
