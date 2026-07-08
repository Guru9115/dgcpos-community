import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './store/AuthContext'
import { PWAInstallPrompt, OfflineIndicator, UpdateNotification } from './components/PWAInstallPrompt'
import NativeUpdatePrompt from './components/NativeUpdatePrompt'
import { LockProvider } from './store/LockContext'
import { WakeLockProvider } from './components/WakeLockProvider'
import { initCapacitor, isNativeApp, onAppRendered } from './utils/capacitorInit'
import { applyDeviceFormFactorClasses, watchDeviceFormFactor } from './utils/deviceFormFactor'
import { prefetchCoreRoutes } from './utils/prefetchRoutes'
import { IS_COMMUNITY } from './edition'
import { setRuntimeEdition } from './edition/runtime'
import { licenseAPI } from './api'
import './theme/light-cloudflare.css'
import './theme/instant-touch.css'
import './index.css'
import './theme/liquid-glass-global.css'
import './theme/bazaar-marketplace.css'
import './theme/dgcbazaar-theme.css'

const native = isNativeApp()
const Router = native ? HashRouter : BrowserRouter

applyDeviceFormFactorClasses()
if (!native) watchDeviceFormFactor()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:  1000 * 60 * 2,
      gcTime:     1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

if (IS_COMMUNITY) {
  licenseAPI.getStatus()
    .then((res) => setRuntimeEdition(res.data || {}))
    .catch(() => {})
}

async function checkVersionAndUpdate() {
  if (native) return
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) return
    const { version: serverVersion } = await res.json()
    const localVersion = document.documentElement.dataset.appVersion || ''
    if (!serverVersion || !localVersion || serverVersion === localVersion) return
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map(r => r.unregister()))
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
    window.location.replace(window.location.href.split('?')[0] + '?v=' + serverVersion)
  } catch {}
}

if ('serviceWorker' in navigator && !native) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem('dgc_sw_reloading') === '1') return
    sessionStorage.setItem('dgc_sw_reloading', '1')
    window.location.reload()
  })
  window.addEventListener('load', () => {
    checkVersionAndUpdate()
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return
      reg.update().catch(() => {})
    })
  })
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function AppProviders({ children }) {
  if (!googleClientId) return children
  return <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>
}

function NativeExtras() {
  if (native) return <NativeUpdatePrompt />
  return (
    <>
      <UpdateNotification />
      <PWAInstallPrompt />
      <OfflineIndicator />
    </>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#071b52;background:#f6f9fc;min-height:100vh">DGC POS failed to start.</div>'
} else {
  const tree = (
    <Router>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AppProviders>
            <AuthProvider>
              <WakeLockProvider>
                <LockProvider>
                  <App />
                  <NativeExtras />
                </LockProvider>
              </WakeLockProvider>
              <Toaster
                position="top-right"
                toastOptions={{
                  className: 'toast-glass',
                  style: {
                    color: '#0f172a',
                    borderRadius: '14px',
                    fontSize: '13px',
                    fontFamily: '"Inter", sans-serif',
                    fontWeight: 600,
                  },
                  success: { iconTheme: { primary: '#10B981', secondary: '#ffffff' } },
                  error:   { iconTheme: { primary: '#ef4444', secondary: '#ffffff' } },
                }}
              />
            </AuthProvider>
          </AppProviders>
        </ErrorBoundary>
      </QueryClientProvider>
    </Router>
  )

  ReactDOM.createRoot(rootEl).render(
    native ? tree : <React.StrictMode>{tree}</React.StrictMode>
  )

  window.__DGC_APP_MOUNTED__ = true
  onAppRendered()
  prefetchCoreRoutes()

  /* Capacitor plugins AFTER React paint */
  requestAnimationFrame(() => {
    initCapacitor().catch(() => {})
  })
}