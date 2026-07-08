/**
 * WakeLockProvider
 * - Mounts once in the app
 * - Keeps screen awake on iPad / Android tablet
 * - Shows a tiny "Screen Active" pill when wake lock is held (optional, tablet only)
 * - Falls back gracefully on browsers without Wake Lock API
 */
import { useEffect, useState, useRef } from 'react'
import { getDeviceInfo } from '../hooks/useWakeLock'
import { MonitorOff } from 'lucide-react'

export function WakeLockProvider({ children }) {
  const lockRef   = useRef(null)
  const [status,  setStatus]  = useState('idle')   // idle | active | unsupported | error
  const [device,  setDevice]  = useState(null)
  const [showBadge, setShowBadge] = useState(false)

  const acquire = async () => {
    if (!('wakeLock' in navigator)) {
      setStatus('unsupported')
      return
    }
    if (lockRef.current && !lockRef.current.released) return
    try {
      lockRef.current = await navigator.wakeLock.request('screen')
      setStatus('active')
      lockRef.current.addEventListener('release', () => {
        setStatus('idle')
      })
      console.info('[WakeLock] ✅ Screen wake lock active — display will not sleep')
    } catch (err) {
      setStatus('error')
      console.warn('[WakeLock] Could not acquire:', err.message)
    }
  }

  useEffect(() => {
    const info = getDeviceInfo()
    setDevice(info)

    // Only apply on tablets (iPad / Android tablet)
    // On desktop/laptop the OS manages sleep separately
    if (!info.isTablet) {
      console.info(`[WakeLock] ${info.os} — not a tablet, skipping`)
      return
    }

    console.info(`[WakeLock] ${info.os} detected (iPad/tablet) — requesting wake lock`)
    acquire()

    // Badge: show briefly then fade, only on tablets
    setShowBadge(true)
    const t = setTimeout(() => setShowBadge(false), 4000)

    // Re-acquire when tab returns to foreground
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisible)
      if (lockRef.current && !lockRef.current.released) {
        lockRef.current.release()
        lockRef.current = null
      }
    }
  }, [])

  return (
    <>
      {children}

      {/* Tiny "Screen Active" badge — shown only on iPad for 4s on mount */}
      {showBadge && device?.isTablet && status === 'active' && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9998,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            background: 'rgba(16,185,129,0.14)',
            border: '1px solid rgba(16,185,129,0.28)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.30)',
            animation: 'wl-fadein 0.4s ease, wl-fadeout 0.6s ease 3.4s forwards',
            pointerEvents: 'none',
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399' }} />
          <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#34D399', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            Screen Active — Display won't sleep
          </span>
        </div>
      )}

      {/* Unsupported notice — shows once, then gone */}
      {showBadge && device?.isTablet && status === 'unsupported' && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9998,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            background: 'rgba(234,179,8,0.12)',
            border: '1px solid rgba(234,179,8,0.25)',
            backdropFilter: 'blur(14px)',
            animation: 'wl-fadein 0.4s ease, wl-fadeout 0.6s ease 3.4s forwards',
            pointerEvents: 'none',
          }}
        >
          <MonitorOff size={11} style={{ color: '#FCD34D' }} />
          <span style={{ fontSize: '0.70rem', fontWeight: 700, color: '#FCD34D', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            Wake Lock not supported — update your browser
          </span>
        </div>
      )}

      <style>{`
        @keyframes wl-fadein  { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes wl-fadeout { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
    </>
  )
}
