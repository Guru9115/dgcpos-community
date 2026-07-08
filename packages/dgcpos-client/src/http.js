import { parseErrorResponse } from './errors.js'

function joinUrl(base, path) {
  const root = base.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}${suffix}`
}

function buildQuery(params) {
  if (!params || typeof params !== 'object') return ''
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    qs.set(key, String(value))
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

export function createHttp({ baseUrl, getToken, setTokens, onUnauthorized }) {
  const apiRoot = joinUrl(baseUrl, '/api')

  async function request(method, path, { body, params, skipAuth = false, skipRefresh = false } = {}) {
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const token = !skipAuth && getToken?.()
    if (token) headers.Authorization = `Bearer ${token}`

    const url = `${joinUrl(apiRoot, path)}${buildQuery(params)}`
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    if (res.status === 401 && !skipRefresh && !skipAuth && onUnauthorized) {
      const refreshed = await onUnauthorized()
      if (refreshed) {
        return request(method, path, { body, params, skipAuth, skipRefresh: true })
      }
    }

    if (!res.ok) throw await parseErrorResponse(res)

    if (res.status === 204) return null
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) return res.json()
    return res.text()
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
  }
}