import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { applyDeviceFormFactorClasses, watchDeviceFormFactor } from './deviceFormFactor'

export const isNativeApp = () => {
  if (typeof window !== 'undefined' && window.__DGC_IS_NATIVE__ === true) return true
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const BOOT_GRACE_MS = 12000

function hideBootFallback() {
  document.getElementById('dgc-boot-fallback')?.remove()
}

function clearStuckScrollLock() {
  document.body.style.removeProperty('overflow')
  document.documentElement.style.removeProperty('overflow')
}

function paintNativeShell() {
  document.documentElement.style.background = '#f6f9fc'
  document.body.style.background = '#f6f9fc'
  const root = document.getElementById('root')
  if (root) root.style.background = '#f6f9fc'
}

async function purgeServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map(r => r.unregister()))
  } catch { /* ignore */ }
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch { /* ignore */ }
}

async function hideSplashWhenReady() {
  try {
    await SplashScreen.hide({ fadeOutDuration: 250 })
  } catch { /* ignore */ }
}

/** Configure native shell after React has painted. */
export async function initCapacitor() {
  if (!isNativeApp()) return

  try {
    window.__DGC_BOOT_GRACE__ = true
    setTimeout(() => { window.__DGC_BOOT_GRACE__ = false }, BOOT_GRACE_MS)

    document.documentElement.classList.add('dgc-native-app')
    applyDeviceFormFactorClasses()
    watchDeviceFormFactor()
    paintNativeShell()
    clearStuckScrollLock()

    purgeServiceWorkers().catch(() => {})

    try {
      await StatusBar.setStyle({ style: Style.Light })
      await StatusBar.setBackgroundColor({ color: '#F6F9FC' })
    } catch { /* simulator */ }

    App.addListener('backButton', ({ canGoBack }) => {
      if (window.__DGC_SIDEBAR_OPEN__) {
        window.dispatchEvent(new Event('dgc:close-sidebar'))
        return
      }
      if (canGoBack) window.history.back()
      else App.minimizeApp()
    }).catch(() => {})

    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      clearStuckScrollLock()
      paintNativeShell()
      hideSplashWhenReady()
    }).catch(() => {})

    import('../plugins/dgcCoreAI').then((mod) => {
      mod.default.startHealthMonitor({ intervalMinutes: 5 }).catch(() => {})
    }).catch(() => {})
  } catch (err) {
    console.error('[CapacitorInit]', err)
    paintNativeShell()
    hideSplashWhenReady()
  }
}

export function onAppRendered() {
  paintNativeShell()
  window.__DGC_APP_RENDERED__ = true
  if (isNativeApp()) {
    requestAnimationFrame(() => {
      hideBootFallback()
      hideSplashWhenReady()
    })
  } else {
    hideBootFallback()
  }
}