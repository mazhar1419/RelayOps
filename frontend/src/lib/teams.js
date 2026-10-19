
import { apiRequest } from './api.js'

export function listTeams() {
  return apiRequest('/teams')
}

export function createTeam(name) {
  return apiRequest('/teams', {
    method: 'POST',
    body: { name },
  })
}

export function getTeam(teamId) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}`)
}
