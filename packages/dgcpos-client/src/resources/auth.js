export function createAuthResource(http, client) {
  return {
    async login({ username, password, remember = false }) {
      const data = await http.post('/auth/login', { username, password, remember }, { skipAuth: true })
      client._setSession(data)
      return data
    },

    async refresh(refreshToken) {
      const token = refreshToken ?? client._refreshToken
      if (!token) throw new Error('No refresh token')
      const data = await http.post('/auth/refresh', { refresh_token: token }, { skipAuth: true })
      client._setSession(data)
      return data
    },

    async me() {
      return http.get('/auth/me')
    },

    async logout() {
      try {
        await http.post('/auth/logout', {})
      } finally {
        client._clearSession()
      }
    },

    setToken(token, refreshToken) {
      client._setSession({ token, refresh_token: refreshToken })
    },
  }
}