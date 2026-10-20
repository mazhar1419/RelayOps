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

export function listMembers(teamId) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/members`)
}
export function addMember(teamId, email, role) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/members`, { method: 'POST', body: { email, role } })
}
export function updateMemberRole(teamId, userId, role) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { role } })
}
export function removeMember(teamId, userId) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}
export function listInvitations(teamId) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/invitations`)
}
export function cancelInvitation(teamId, invitationId) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' })
}
