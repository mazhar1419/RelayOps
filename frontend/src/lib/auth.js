
import { apiRequest } from './api.js'

export function register(email, password) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: { email, password },
  })
}

export function login(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export function getCurrentUser() {
  return apiRequest('/auth/me')
}

export function logout() {
  return apiRequest('/auth/logout', {
    method: 'POST',
  })
}
