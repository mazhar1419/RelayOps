
import { Router } from 'express'
import { createTeamSchema } from './team.schema.js'

function parsePositiveId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null

  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function createTeamRouter(service, authenticate) {
  const router = Router()

  router.use(authenticate)

  router.post('/', async (req, res, next) => {
    try {
      const parsed = createTeamSchema.safeParse(req.body)

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            details: parsed.error.issues,
          },
        })
      }

      const team = await service.create(
        parsed.data.name,
        req.auth.userId,
      )

      return res.status(201).json({ data: team })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/', async (req, res, next) => {
    try {
      const teams = await service.list(req.auth.userId)
      return res.status(200).json({ data: teams })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:teamId', async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId)

      if (teamId === null) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ID',
            message: 'teamId must be a positive integer',
          },
        })
      }

      const team = await service.get(teamId, req.auth.userId)
      return res.status(200).json({ data: team })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
