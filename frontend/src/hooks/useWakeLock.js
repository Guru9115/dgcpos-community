/**
 * useWakeLock — Prevent screen sleep on iPad / tablet / touch devices
 *
 * Strategy:
 *  1. Detect device: iPad, Android tablet, or any touch device
 *  2. Request Screen Wake Lock API (supported in Safari 16.4+, Chrome, Edge)
 *  3. Re-acquire on visibilitychange (lock releases when tab goes background)
 *  4. Log device info for debugging
 */
import { useEffect, useRef } from 'react'

// ── Device detection ─────────────────────────────────────────
export function getDeviceInfo() {
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''

  const isIPad =
    /iPad/.test(ua) ||
    // iPad on iOS 13+ reports as "MacIntel" with touch
    (platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    /Macintosh/.test(ua) && navigator.maxTouchPoints > 1

  const isIPhone   = /iPhone/.test(ua)
  const isAndroid  = /Android/.test(ua)
  const isTablet   = isIPad || (isAndroid && !/Mobile/.test(ua))
  const isMobile   = isIPhone || (isAndroid && /Mobile/.test(ua))
  const isTouch    = navigator.maxTouchPoints > 0

  let os = 'Desktop'
  if (isIPad)          os = 'iPadOS'
  else if (isIPhone)   os = 'iOS'
  else if (isAndroid)  os = 'Android'
  else if (/Win/.test(platform))  os = 'Windows'
  else if (/Mac/.test(platform))  os = 'macOS'
  else if (/Linux/.test(platform)) os = 'Linux'

  // Display mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true

  return { isIPad, isIPhone, isAndroid, isTablet, isMobile, isTouch, os, isStandalone }
}

// ── Hook ─────────────────────────────────────────────────────
export function useWakeLock({ onlyOnTablet = false } = {}) {
  const lockRef     = useRef(null)
  const enabledRef  = useRef(false)

  const acquire = async () => {
    if (!('wakeLock' in navigator)) return  // API not supported
    if (lockRef.current && !lockRef.current.released) return  // already held
    try {
      lockRef.current = await navigator.wakeLock.request('screen')
      console.info('[WakeLock] ✅ Screen wake lock acquired — device will not sleep')
    } catch (err) {
      // May fail if battery saver mode, page not visible, or permission denied
      console.warn('[WakeLock] ⚠️ Could not acquire wake lock:', err.message)
    }
  }

  const release = async () => {
    if (lockRef.current && !lockRef.current.released) {
      await lockRef.current.release()
      lockRef.current = null
      console.info('[WakeLock] Released screen wake lock')
    }
  }

  useEffect(() => {
    const { isTablet, isTouch, os } = getDeviceInfo()

    // Decide whether to enable
    if (onlyOnTablet) {
      enabledRef.current = isTablet
    } else {
      enabledRef.current = true  // always (e.g. for POS terminals)
    }

    if (!enabledRef.current) {
      console.info('[WakeLock] Not a tablet — wake lock skipped')
      return
    }

    console.info(`[WakeLock] Device: ${os} | touch: ${isTouch} | tablet: ${isTablet}`)

    // Acquire immediately
    acquire()

    // Re-acquire when tab becomes visible again (lock auto-releases on background)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        acquire()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Re-acquire on full-screen change (some browsers release on fullscreen toggle)
    document.addEventListener('fullscreenchange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('fullscreenchange', onVisibility)
      release()
    }
  }, [onlyOnTablet])

  return { acquire, release, getDeviceInfo }
}
