/**
 * Phase 8 — Mobile/PWA
 * Install banner + offline indicator
 */
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Wifi, WifiOff, X, RefreshCw, Sparkles } from 'lucide-react'

/* ── PWA Update Notification ────────────────────────────────────────── */
export function UpdateNotification() {
  const [needsUpdate, setNeedsUpdate] = useState(false)
  const [updating,    setUpdating]    = useState(false)
  const [reg,         setReg]         = useState(null)

  useEffect(() => {
    const handler = (e) => {
      setReg(e.detail?.registration || null)
      setNeedsUpdate(true)
    }
    window.addEventListener('sw-update-available', handler)

    let interval = null
    let registration = null
    const onVisible = () => {
      if (document.visibilityState === 'visible' && registration) {
        registration.update().catch(() => {})
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        registration = reg
        const check = () => registration.update().catch(() => {})
        check()
        document.addEventListener('visibilitychange', onVisible)
        interval = setInterval(check, 5 * 60 * 1000)
      })
    }

    return () => {
      window.removeEventListener('sw-update-available', handler)
      document.removeEventListener('visibilitychange', onVisible)
      if (interval) clearInterval(interval)
    }
  }, [])

  const doUpdate = useCallback(() => {
    setUpdating(true)
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    // Give SW time to activate then reload
    setTimeout(() => window.location.reload(), 800)
  }, [reg])

  if (!needsUpdate) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 90, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit={{    opacity: 0, y: 90, scale: 0.96 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10000, width: 'min(94vw, 420px)',
          background: 'linear-gradient(135deg, rgba(10,18,32,0.98) 0%, rgba(15,28,55,0.98) 100%)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(11,95,255,0.35)',
          borderRadius: 20,
          boxShadow: '0 24px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(11,95,255,0.10), 0 0 40px rgba(11,95,255,0.08)',
          padding: '1.1rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: 14,
        }}
      >
        {/* Gold icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 13, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(11,95,255,0.18) 0%, rgba(11,95,255,0.08) 100%)',
          border: '1px solid rgba(11,95,255,0.30)',
          boxShadow: '0 0 16px rgba(11,95,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={20} style={{ color: '#E8C547' }} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#000000', marginBottom: 3 }}>
            Update Available ✦
          </div>
          <div style={{ fontSize: '0.71rem', color: 'rgba(0,0,0,0.42)', lineHeight: 1.4 }}>
            A new version of DGC RetailOS is ready. Tap Update to apply.
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button onClick={doUpdate} disabled={updating}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.42rem 0.90rem', borderRadius: 10,
              background: 'linear-gradient(135deg, #071B52, #0B5FFF, #60A5FA)',
              border: 'none', color: '#1a0f00',
              fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
              boxShadow: '0 2px 12px rgba(11,95,255,0.35)',
              opacity: updating ? 0.7 : 1,
            }}>
            <RefreshCw size={12} style={{ animation: updating ? 'spin 0.7s linear infinite' : 'none' }} />
            {updating ? 'Updating…' : 'Update Now'}
          </button>
          <button onClick={() => setNeedsUpdate(false)}
            style={{
              padding: '0.38rem', borderRadius: 9, textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.05)',
              color: 'rgba(0,0,0,0.45)',
              fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>
            Later
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── PWA Install Banner ─────────────────────────────────────────────── */
export function PWAInstallPrompt() {
  const [prompt,     setPrompt]     = useState(null)
  const fromMarketing = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('install') === 'pwa'
  const [dismissed,  setDismissed]  = useState(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('install') === 'pwa') {
      return false
    }
    return localStorage.getItem('pwa-dismissed') === '1'
  })
  const [installed,  setInstalled]  = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!prompt) return
    prompt.prompt()
    const result = await prompt.userChoice
    if (result.outcome === 'accepted') setInstalled(true)
    setPrompt(null)
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa-dismissed', '1')
  }

  if (installed || dismissed) return null

  if (!prompt) {
    if (!fromMarketing) return null
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, width: 'min(92vw, 400px)',
            background: 'rgba(10,18,32,0.97)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(11,95,255,0.25)',
            borderRadius: 18,
            padding: '1rem 1.25rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Install DGC POS
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
            Chrome: tap ⋮ menu → <strong>Install app</strong> or <strong>Add to Home screen</strong>
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{   opacity: 0, y: 80 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, width: 'min(92vw, 400px)',
          background: 'rgba(10,18,32,0.97)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(11,95,255,0.25)',
          borderRadius: 18,
          boxShadow: '0 20px 60px rgba(0,0,0,0.70), 0 0 0 1px rgba(11,95,255,0.08)',
          padding: '1rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: 14,
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'rgba(11,95,255,0.12)', border: '1px solid rgba(11,95,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Download size={18} style={{ color: '#E8C547' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#000000', marginBottom: 2 }}>
            Install RetailOS
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.50)' }}>
            Add to home screen for faster access
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={handleInstall}
            style={{ padding: '0.40rem 0.90rem', borderRadius: 9, border: '1px solid rgba(11,95,255,0.30)', background: 'rgba(11,95,255,0.12)', color: '#E8C547', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Install
          </button>
          <button onClick={handleDismiss}
            style={{ padding: '0.40rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.50)', cursor: 'pointer', display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Offline Indicator ──────────────────────────────────────────────── */
export function OfflineIndicator() {
  const [online, setOnline] = useState(navigator.onLine)
  const [justCameBack, setJustCameBack] = useState(false)

  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      setJustCameBack(true)
      setTimeout(() => setJustCameBack(false), 3500)
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {(!online || justCameBack) && (
        <motion.div
          key={online ? 'back' : 'offline'}
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0  }}
          exit={{   opacity: 0, y: -40 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          style={{
            position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0.45rem 1rem',
            borderRadius: 999,
            background: online ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${online ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.28)'}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.40)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {online
            ? <Wifi    size={13} style={{ color: '#34D399' }} />
            : <WifiOff size={13} style={{ color: '#F87171' }} />}
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: online ? '#34D399' : '#F87171', letterSpacing: '0.04em' }}>
            {online ? 'Back Online' : 'No Internet Connection'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
