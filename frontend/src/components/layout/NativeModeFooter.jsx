/**
 * iOS native mode bar — Bazaar · Chat · Tools · Call · Updates · Settings
 */
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import {
  Store, MessageCircle, Wrench, Phone, Download, Settings, Headphones,
} from 'lucide-react'
import { messengerAPI, supportChatAPI } from '../../api'
import { isNativeApp } from '../../utils/capacitorInit'
import { isNewerVersion } from '../../utils/compareVersion'

const TABS = [
  { to: '/marketplace', label: 'Bazaar', icon: Store, match: ['/marketplace', '/bazaar-ai'] },
  { to: '/support', label: 'Support', icon: Headphones, badge: 'support' },
  { to: '/chat', label: 'Chat', icon: MessageCircle, badge: 'chat' },
  { to: '/call', label: 'Call', icon: Phone },
  { to: '/updates', label: 'Updates', icon: Download, badge: 'updates' },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function NativeModeFooter() {
  const location = useLocation()
  const native = isNativeApp()
  const onBazaar = location.pathname.startsWith('/marketplace') || location.pathname.startsWith('/bazaar-ai')
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (!native || !Capacitor.isNativePlatform()) return
    let cancelled = false
    ;(async () => {
      try {
        const info = await App.getInfo()
        const res = await fetch('https://api.dgcpos.net/api/mobile-release', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data = await res.json()
        setUpdateAvailable(isNewerVersion(data.ios_version, info.version))
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [native, location.pathname])

  const { data: messengerUnread = 0 } = useQuery({
    queryKey: ['messenger-unread-footer'],
    queryFn: () => messengerAPI.getThreads().then((r) => r.data?.unread_total || 0),
    enabled: native,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const { data: supportUnread = 0 } = useQuery({
    queryKey: ['support-unread-footer-native'],
    queryFn: () => supportChatAPI.getThread().then((r) => r.data?.thread?.unread_seller || 0),
    enabled: native,
    refetchInterval: 20_000,
    staleTime: 8_000,
  })

  if (!native) return null

  return (
    <nav className="dgc-native-mode-footer" aria-label="App modes">
      {TABS.map(({ to, label, icon: Icon, match, badge }) => {
        const active = match
          ? match.some((p) => location.pathname.startsWith(p))
          : location.pathname === to || location.pathname.startsWith(`${to}/`)
        const showChatPulse = badge === 'chat' && onBazaar
        const count = badge === 'chat' ? messengerUnread : badge === 'support' ? supportUnread : 0
        const dot = badge === 'updates' && updateAvailable

        return (
          <NavLink
            key={to}
            to={to}
            className={`dgc-native-mode-tab${active ? ' active' : ''}${showChatPulse ? ' dgc-native-mode-tab--bazaar-chat' : ''}`}
          >
            <span className="dgc-native-mode-icon-wrap">
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {count > 0 && <span className="dgc-native-mode-badge">{count > 9 ? '9+' : count}</span>}
              {dot && <span className="dgc-native-mode-dot" />}
            </span>
            <span className="dgc-native-mode-label">{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}