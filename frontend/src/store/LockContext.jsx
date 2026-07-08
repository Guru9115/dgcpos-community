/**
 * LockContext — Auto-lock / inactivity manager
 * Wraps the whole app; shows LockScreen overlay when idle too long.
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { LockScreen, getLockSettings, saveLockSettings } from '../components/LockScreen'
import { useAuth } from './AuthContext'
import { settingsAPI } from '../api'

const LockCtx = createContext(null)

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export function LockProvider({ children }) {
  const { user } = useAuth()
  const isAuthenticated = !!user
  const [locked,    setLocked]    = useState(false)
  const [cfg,       setCfg]       = useState(getLockSettings)
  const [shopLogo,  setShopLogo]  = useState(null)
  const [shopName,  setShopName]  = useState('Your Store')
  const timerRef = useRef(null)

  // Load shop branding for lock screen
  useEffect(() => {
    if (!isAuthenticated) return
    settingsAPI.getAll().then(r => {
      if (r.data.shop_logo) setShopLogo(r.data.shop_logo)
      if (r.data.shop_name) setShopName(r.data.shop_name)
    }).catch(() => {})
  }, [isAuthenticated])

  const resetTimer = useCallback(() => {
    clearTimeout(timerRef.current)
    if (!cfg.enabled || !isAuthenticated) return
    const ms = (cfg.timeoutMinutes || 10) * 60 * 1000
    timerRef.current = setTimeout(() => setLocked(true), ms)
  }, [cfg, isAuthenticated])

  // Attach activity listeners
  useEffect(() => {
    if (!isAuthenticated || !cfg.enabled) {
      clearTimeout(timerRef.current)
      return
    }
    resetTimer()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [isAuthenticated, cfg, resetTimer])

  // Lock immediately when user logs in if needed, otherwise start fresh
  useEffect(() => {
    if (!isAuthenticated) { setLocked(false); clearTimeout(timerRef.current) }
  }, [isAuthenticated])

  const lock   = useCallback(() => setLocked(true), [])
  const unlock = useCallback(() => { setLocked(false); resetTimer() }, [resetTimer])

  const updateCfg = useCallback((patch) => {
    setCfg(prev => {
      const next = { ...prev, ...patch }
      saveLockSettings(next)
      return next
    })
  }, [])

  return (
    <LockCtx.Provider value={{ locked, lock, unlock, cfg, updateCfg }}>
      {children}
      <AnimatePresence>
        {locked && isAuthenticated && (
          <LockScreen
            key="lock"
            onUnlock={unlock}
            shopLogo={shopLogo}
            shopName={shopName}
          />
        )}
      </AnimatePresence>
    </LockCtx.Provider>
  )
}

export const useLock = () => useContext(LockCtx)
