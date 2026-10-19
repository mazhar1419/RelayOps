
import { apiRequest } from './api.js'

export function listIncidents(teamId, { limit = 20, offset = 0 } = {}) {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  return apiRequest(
    `/teams/${encodeURIComponent(teamId)}/incidents?${query}`,
  )
}

export function createIncident(teamId, incident) {
  return apiRequest(`/teams/${encodeURIComponent(teamId)}/incidents`, {
    method: 'POST',
    body: incident,
  })
}

export function updateIncident(teamId, incidentId, changes) {
  return apiRequest(
    `/teams/${encodeURIComponent(teamId)}/incidents/${encodeURIComponent(incidentId)}`,
    {
      method: 'PATCH',
      body: changes,
    },
  )
}
