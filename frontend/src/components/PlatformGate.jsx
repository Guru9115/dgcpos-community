import { useQuery } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import PlatformMaintenance from './PlatformMaintenance'
import { usePageVisible } from '../hooks/usePageVisible'

const PROD_API = 'https://api.dgcpos.com/api'
const STATUS_CACHE_KEY = 'dgc_platform_status_v1'
const STATUS_CACHE_MS = 120_000

const isAdminHost = () =>
  typeof window !== 'undefined' && window.location.hostname === 'admin.dgcpos.com'

function resolveStatusApiBase() {
  if (import.meta.env.VITE_API_URL) return `${import.meta.env.VITE_API_URL}/api`
  if (Capacitor.isNativePlatform()) return PROD_API
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'app.dgcpos.com' || host === 'admin.dgcpos.com') return PROD_API
  }
  return '/api'
}

function readCachedStatus() {
  try {
    const raw = sessionStorage.getItem(STATUS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.data || Date.now() - parsed.at > STATUS_CACHE_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCachedStatus(data) {
  try {
    sessionStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch { /* ignore */ }
}

async function fetchPlatformStatus() {
  const base = resolveStatusApiBase()
  const res = await fetch(`${base}/platform-status`, {
    credentials: 'include',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('status unavailable')
  const data = await res.json()
  writeCachedStatus(data)
  return data
}

export default function PlatformGate({ children }) {
  const onAdminHost = isAdminHost()
  const pageVisible = usePageVisible()
  const cached = readCachedStatus()

  const { data } = useQuery({
    queryKey: ['platform-status-public'],
    queryFn: fetchPlatformStatus,
    enabled: !onAdminHost,
    initialData: cached ?? undefined,
    staleTime: 120_000,
    refetchInterval: pageVisible ? 120_000 : false,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  if (onAdminHost) return children

  // Never block the shell on status fetch — only overlay when app is confirmed offline.
  const appOffline = data?.sites?.app === false
  if (appOffline) {
    return (
      <PlatformMaintenance
        title="DGC POS is offline"
        message={data?.maintenance_message}
      />
    )
  }

  return children
}