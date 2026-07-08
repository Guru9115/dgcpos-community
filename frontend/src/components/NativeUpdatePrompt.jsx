/**
 * iOS/Android native app — update available banner + local notification.
 * Apple does not allow silent in-app installs; Update opens download_url (TestFlight / install page).
 */
import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Download, RefreshCw, X, Sparkles } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { isNativeApp } from '../utils/capacitorInit'
import { isNewerVersion } from '../utils/compareVersion'

const PROD_API = 'https://api.dgcpos.net/api'
const NOTIFY_KEY = 'dgc_ios_update_notified'

async function fetchRelease() {
  const res = await fetch(`${PROD_API}/mobile-release`, { cache: 'no-store' })
  if (!res.ok) throw new Error('release check failed')
  return res.json()
}

async function notifyUpdate(release) {
  const last = localStorage.getItem(NOTIFY_KEY)
  if (last === release.ios_version) return
  try {
    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [{
        id: 9001,
        title: 'DGC POS Update Available',
        body: `Version ${release.ios_version} is ready. Tap Update in the app.`,
        schedule: { at: new Date(Date.now() + 1500) },
      }],
    })
    localStorage.setItem(NOTIFY_KEY, release.ios_version)
  } catch { /* ignore */ }
}

export default function NativeUpdatePrompt() {
  const [visible, setVisible] = useState(false)
  const [release, setRelease] = useState(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const [opening, setOpening] = useState(false)

  const check = useCallback(async () => {
    if (!isNativeApp() || !Capacitor.isNativePlatform()) return
    try {
      const info = await App.getInfo()
      const installed = info.version || '0'
      setCurrentVersion(installed)
      const remote = await fetchRelease()
      setRelease(remote)
      const needsUpdate = isNewerVersion(remote.ios_version, installed)
      if (needsUpdate && remote.notify_users !== false) {
        setVisible(true)
        await notifyUpdate(remote)
      } else {
        setVisible(false)
      }
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    check()
    const id = setInterval(check, 10 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [check])

  const openUpdate = async () => {
    const url = release?.download_url || 'https://dgcpos.net/install'
    setOpening(true)
    try {
      await Browser.open({ url })
    } catch {
      window.open(url, '_blank')
    } finally {
      setOpening(false)
    }
  }

  if (!visible || !release) return null
  const forced = release.force_update === true

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 90 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 90 }}
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10000, width: 'min(94vw, 420px)',
          background: 'rgba(255,255,255,0.96)',
          border: '1px solid rgba(11,95,255,0.2)',
          borderRadius: 18,
          boxShadow: '0 20px 50px rgba(7,27,82,0.15)',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: 'rgba(11,95,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={18} color="#0B5FFF" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            Update Available — v{release.ios_version}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.4 }}>
            Installed: v{currentVersion}
            {release.release_notes ? ` · ${release.release_notes.slice(0, 80)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={openUpdate} disabled={opening}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10, border: 'none',
              background: '#0B5FFF', color: '#fff',
              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
            }}>
            {opening ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
            {opening ? 'Opening…' : 'Update'}
          </button>
          {!forced && (
            <button type="button" onClick={() => setVisible(false)}
              style={{
                padding: '6px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: '#fff', color: '#64748b', fontSize: '0.68rem', cursor: 'pointer',
              }}>
              <X size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Later
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}