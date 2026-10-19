
const API_BASE = '/api/v1'

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function readResponse(response) {
  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  return null
}

async function getCsrfToken() {
  const response = await fetch(`${API_BASE}/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  })

  const payload = await readResponse(response)

  if (!response.ok || !payload?.csrfToken) {
    throw new ApiError(
      'Could not initialize security token',
      response.status,
      payload?.error?.code,
    )
  }

  return payload.csrfToken
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})

  headers.set('Accept', 'application/json')

  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method)

  if (!isSafeMethod) {
    const csrfToken = await getCsrfToken()
    headers.set('x-csrf-token', csrfToken)
  }

  let body = options.body

  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    body,
    credentials: 'include',
  })

  const payload = await readResponse(response)

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || 'Request failed',
      response.status,
      payload?.error?.code,
      payload?.error?.details,
    )
  }

  return payload?.data ?? payload
}
