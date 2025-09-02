import { UserDto } from '@/dtos/user.dto'
import { InitData } from '@/typing/interfaces'
import { ApiError } from '@/utils/api-error'
import { User } from '@prisma/client'
// import bcrypt from 'bcrypt'
import { prisma } from 'prisma/prisma-client'
import { tokenService } from './token.service'

interface Data {
	initData: InitData
	// pin: string
}

class AuthService {
	async auth(data: Data) {
		// Checking candidate
		const candidate = await prisma.user.findUnique({
			where: { id: data.initData.user.id.toString() }
		})
		let user: User

		// Hashing password
		// const hashedPin = await bcrypt.hash(data.pin, 12)

		if (candidate) {
			// const isPasswordMatches = await bcrypt.compare(data.pin, candidate.pin)
			// if (!isPasswordMatches) throw new ApiError(400, 'Пин код не верный')

			// Update chatId if it's not set
			if (!candidate.chatId) {
				user = await prisma.user.update({
					where: { id: candidate.id },
					data: { chatId: data.initData.user.id.toString() }
				})
			} else {
				user = candidate
			}
		} else {
			user = await prisma.user.create({
				data: {
					id: data.initData.user.id.toString(),
					firstName: data.initData.user.first_name,
					lastName: data.initData.user.last_name,
					username: data.initData.user.username,
					photoUrl: data.initData.user.photo_url,
					inviteCode: `invite_${data.initData.user.id.toString()}`,
					// pin: hashedPin, // PIN-код больше не требуется
					chatId: data.initData.user.id.toString()
				}
			})
		}

		// Creating DTO
		const userSafe = new UserDto(user)

		// Creating refresh token
		const { accessToken, refreshToken } = tokenService.generateTokens({
			...userSafe
		})

		// Saving refresh token
		await tokenService.saveRefresh(refreshToken, user.id)

		// Returning data
		return { accessToken, refreshToken, user: userSafe }
	}

	async refresh(refreshToken: string) {
		// Validating Refresh Token
		if (!refreshToken || !refreshToken.length)
			throw new ApiError(401, 'Unauthorized')

		const userData: any = tokenService.validateRefresh(refreshToken)
		const tokenFromDb = await tokenService.findRefresh(refreshToken)
		if (!userData || !tokenFromDb) throw new ApiError(401, 'Unauthorized')

		// Checking user
		const user = await prisma.user.findUnique({
			where: { id: userData.id }
		})

		// Creating DTO
		const userSafe = new UserDto(user)

		// Generating tokens
		const tokens = tokenService.generateTokens({
			...userSafe
		})

		// Saving refresh token
		await tokenService.saveRefresh(tokens.refreshToken, userSafe.id)

		// Returning data
		return { ...tokens, user: userSafe }
	}
}

export const authService = new AuthService()
