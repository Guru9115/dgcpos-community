import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePageVisible } from '../hooks/usePageVisible'
import { prefetchCoreRoutes } from '../utils/prefetchRoutes'
import {
  authAPI,
  tokenStore,
  isTransientError,
  shouldClearSession,
  refreshAccessToken,
} from '../api'

const AuthContext = createContext(null)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function withTransientRetries(fn, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientError(err) || i === attempts - 1) throw err
      await sleep(400 * (i + 1))
    }
  }
  throw lastErr
}

function storeTokens(data) {
  if (data?.token) tokenStore.set(data.token)
  if (data?.refresh_token) tokenStore.setRefresh(data.refresh_token)
}

function hasStoredCredentials() {
  return !!(tokenStore.get() || tokenStore.getRefresh())
}

export function AuthProvider({ children }) {
  const pageVisible = usePageVisible()
  const [user, setUser]                         = useState(null)
  const [loading, setLoading]                   = useState(true)
  const [sessionDegraded, setSessionDegraded]   = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  const fetchMe = useCallback(async ({ background = false } = {}) => {
    if (!background) setSessionDegraded(false)

    if (!tokenStore.get() && tokenStore.getRefresh()) {
      try {
        const data = await withTransientRetries(() => refreshAccessToken())
        if (data) storeTokens(data)
      } catch (err) {
        if (shouldClearSession(err, { afterRefreshAttempt: true })) {
          tokenStore.clear()
          tokenStore.clearRefresh()
          setUser(null)
        } else if (hasStoredCredentials()) {
          setSessionDegraded(true)
        }
        setLoading(false)
        return
      }
    }

    if (!tokenStore.get()) {
      setLoading(false)
      return
    }

    try {
      const res = await withTransientRetries(() => authAPI.me())
      setUser(res.data.user)
      setSessionDegraded(false)
      prefetchCoreRoutes()
    } catch (err) {
      if (shouldClearSession(err)) {
        tokenStore.clear()
        tokenStore.clearRefresh()
        setUser(null)
      } else if (hasStoredCredentials()) {
        setSessionDegraded(true)
      } else {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const hasCredentials = !!(tokenStore.get() || tokenStore.getRefresh())
    if (hasCredentials) {
      setLoading(false)
      fetchMe({ background: true })
    } else {
      fetchMe()
    }
  }, [fetchMe])

  useEffect(() => {
    if (!sessionDegraded || !pageVisible) return undefined
    const timer = window.setInterval(() => { fetchMe({ background: true }) }, 12_000)
    return () => window.clearInterval(timer)
  }, [sessionDegraded, pageVisible, fetchMe])

  const login = async (username, password, { remember = false } = {}) => {
    tokenStore.setPersistentRefresh(remember)
    const res = await authAPI.login({
      username: String(username || '').trim(),
      password: String(password || ''),
      remember: !!remember,
    })
    storeTokens(res.data)
    setUser(res.data.user)
    setMustChangePassword(res.data.user?.must_change_password === true)
    setSessionDegraded(false)
    prefetchCoreRoutes()
    return res.data.user
  }

  const signup = async (emailOrPayload, password, fullName, shopName) => {
    const data = typeof emailOrPayload === 'string'
      ? { email: emailOrPayload, password, full_name: fullName, shop_name: shopName }
      : emailOrPayload
    const res = await authAPI.signup(data)
    storeTokens(res.data)
    setUser(res.data.user)
    setSessionDegraded(false)
    return res.data.user
  }

  const googleAuth = async (payload) => {
    const res = await authAPI.googleAuth(payload)
    storeTokens(res.data)
    setUser(res.data.user)
    setMustChangePassword(res.data.user?.must_change_password === true)
    setSessionDegraded(false)
    return res.data.user
  }

  const betaGuestEnter = async (payload) => {
    const res = await authAPI.betaGuestEnter(payload)
    storeTokens(res.data)
    setUser(res.data.user)
    setMustChangePassword(false)
    setSessionDegraded(false)
    return res.data.user
  }

  const logout = async () => {
    try { await authAPI.logout() } catch { /* ignore */ }
    tokenStore.clear()
    tokenStore.clearRefresh()
    setUser(null)
    setMustChangePassword(false)
    setSessionDegraded(false)
  }

  const clearMustChangePassword = () => setMustChangePassword(false)
  const hasRole = (...roles) => user && roles.includes(user.role)
  const isSuperadmin = () => user?.role === 'superadmin'

  return (
    <AuthContext.Provider value={{
      user, loading, sessionDegraded, login, logout, hasRole, isSuperadmin, signup, googleAuth, betaGuestEnter,
      refetch: fetchMe, mustChangePassword, clearMustChangePassword
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}