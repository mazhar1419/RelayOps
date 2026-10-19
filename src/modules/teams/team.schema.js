
import { z } from 'zod'

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
})
