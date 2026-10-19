
export function createTeamService(pool, repository) {
  return {
    async create(name, userId) {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')

        const team = await repository.create(client, name, userId)

        await repository.addMember(
          client,
          team.id,
          userId,
          'owner',
        )

        await client.query('COMMIT')

        return { ...team, role: 'owner' }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async list(userId) {
      return repository.listForUser(userId)
    },

    async get(teamId, userId) {
      const team = await repository.findForUser(teamId, userId)

      if (!team) {
        const error = new Error('Team not found')
        error.status = 404
        error.code = 'TEAM_NOT_FOUND'
        throw error
      }

      return team
    },
  }
}
