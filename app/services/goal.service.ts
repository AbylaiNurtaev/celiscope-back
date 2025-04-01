import { getDeadline } from '@/utils/get-deadline'
import { prisma } from 'prisma/prisma-client'
import { uploadFile } from '@/lib/s3'
import { ApiError } from '@/utils/api-error'
import { SubGoal } from '@prisma/client'

class GoalService {
	async createGoal(
		userId: string,
		data: {
			title: string
			urgencyLevel: 'LOW' | 'AVERAGE' | 'HIGH'
			specific: string
			measurable: string
			attainable: string
			award: string
			description: string
			relevant: string
			privacy: 'PRIVATE' | 'PUBLIC'
			deadline: '3_MONTHS' | '6_MONTHS' | '1_YEAR'
			imageUrl: string
			subGoals?: { description: string; deadline: Date }[]
		}
	) {
		const deadline = getDeadline(data.deadline)
		const { subGoals, ...dataWithoutSubGoals } = data

		delete dataWithoutSubGoals.deadline

		const goal = await prisma.goal.create({
			data: { userId, deadline, ...dataWithoutSubGoals }
		})

		if (subGoals) {
			await Promise.all(
				subGoals.map(subGoal =>
					prisma.subGoal.create({
						data: { goalId: goal.id, ...subGoal }
					})
				)
			)
		}

		return { ...goal, subGoals: subGoals || [] }
	}

	async getGoals(userId: string) {
		return await prisma.goal.findMany({
			where: { userId },
			include: { 
				subGoals: {
					orderBy: {
						deadline: 'asc'
					}
				}
			}
		})
	}

	async getFriendGoals(userId: string) {
		const friendShips = await prisma.friendship.findMany({
			where: {
				OR: [{ firstUserId: userId }, { secondUserId: userId }]
			}
		})

		const friendsIds = friendShips.map(friendship => {
			return friendship.firstUserId === userId
				? friendship.secondUserId
				: friendship.firstUserId
		})

		const goals = await prisma.goal.findMany({
			where: { userId: { in: friendsIds }, privacy: 'PUBLIC' },
			include: { 
				subGoals: {
					orderBy: {
						deadline: 'asc'
					}
				}
			}
		})

		return goals
	}

	async completeGoal(userId: string, goalId: number, fileBuffer: Buffer) {
		const completedImageUrl = await uploadFile(
			fileBuffer,
			`goal-${goalId}-${Date.now()}.jpg`
		)
		const goal = await prisma.goal.update({
			where: { id: goalId, userId },
			data: { isCompleted: true, completedAt: new Date(), imageUrl: completedImageUrl },
			include: {
				user: true
			}
		})

		return goal
	}

	async completeSubGoal(userId: string, subGoalId: number): Promise<SubGoal> {
		const subGoal = await prisma.subGoal.findUnique({
			where: { id: subGoalId },
			include: { goal: true }
		})

		if (!subGoal) throw new ApiError(404, 'Подцель не найдена')
		if (subGoal.goal.userId !== userId) throw new ApiError(403, 'Нет доступа к этой подцели')

		return prisma.subGoal.update({
			where: { id: subGoalId },
			data: { isCompleted: true, completedAt: new Date() }
		})
	}

	async getGoal(userId: string, goalId: number) {
		const goal = await prisma.goal.findFirst({
			where: {
				id: goalId,
				userId
			},
			include: {
				subGoals: {
					orderBy: {
						deadline: 'asc'
					}
				}
			}
		})

		if (!goal) {
			throw new ApiError(404, 'Цель не найдена')
		}

		return goal
	}

	async updateGoal(userId: string, goalId: number, data: Partial<{
		title: string
		urgencyLevel: 'LOW' | 'AVERAGE' | 'HIGH'
		specific: string
		measurable: string
		attainable: string
		award: string
		description: string
		relevant: string
		privacy: 'PRIVATE' | 'PUBLIC'
		deadline: '3_MONTHS' | '6_MONTHS' | '1_YEAR'
		imageUrl: string
		subGoals: { description: string; deadline: Date }[]
	}>) {
		const goal = await prisma.goal.findFirst({
			where: {
				id: goalId,
				userId
			},
			include: {
				subGoals: {
					orderBy: {
						deadline: 'asc'
					}
				}
			}
		})

		if (!goal) {
			throw new ApiError(404, 'Цель не найдена')
		}

		const { subGoals, deadline, ...dataWithoutSubGoals } = data

		const updateData = {
			...dataWithoutSubGoals,
			...(deadline ? { deadline: getDeadline(deadline) } : {})
		}

		const updatedGoal = await prisma.goal.update({
			where: {
				id: goalId
			},
			data: updateData,
			include: {
				subGoals: {
					orderBy: {
						deadline: 'asc'
					}
				}
			}
		})

		if (subGoals) {
			// Удаляем старые подцели
			await prisma.subGoal.deleteMany({
				where: {
					goalId
				}
			})

			// Создаем новые подцели
			await Promise.all(
				subGoals.map(subGoal =>
					prisma.subGoal.create({
						data: { goalId, ...subGoal }
					})
				)
			)

			// Получаем обновленную цель с новыми подцелями
			return await prisma.goal.findUnique({
				where: {
					id: goalId
				},
				include: {
					subGoals: {
						orderBy: {
							deadline: 'asc'
						}
					}
				}
			})
		}

		return updatedGoal
	}
}

export const goalService = new GoalService()
