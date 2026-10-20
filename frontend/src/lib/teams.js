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

export function rotateWebhookSecret(teamId) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/webhook-secret`, {
    method: 'POST',
    body: {},
  })
}

export function revokeWebhookSecret(teamId) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/webhook-secret`, {
    method: 'DELETE',
  })
}
