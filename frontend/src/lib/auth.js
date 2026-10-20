import { apiRequest } from './api.js'

export function register(email, password) {
  return apiRequest('/auth/register', { method: 'POST', body: { email, password } })
}
export function verifyEmail(email, code) {
  return apiRequest('/auth/verify-email', { method: 'POST', body: { email, code } })
}
export function resendVerification(email) {
  return apiRequest('/auth/resend-verification', { method: 'POST', body: { email } })
}
export function login(email, password) {
  return apiRequest('/auth/login', { method: 'POST', body: { email, password } })
}
export function getCurrentUser() { return apiRequest('/auth/me') }
export function logout() { return apiRequest('/auth/logout', { method: 'POST' }) }
