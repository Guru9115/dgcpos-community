/**
 * Phase 2 — Layout Framework
 * Sidebar · Topbar · Notification Bell · Live Alerts · Logo Watermark
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../store/AuthContext'
import { useLock } from '../../store/LockContext'
import { settingsAPI, inventoryAPI, salesAPI, notificationsAPI } from '../../api'
import { useHospitalityEnabled } from '../../hooks/useHospitalityEnabled'
import toast from 'react-hot-toast'
import {
  LayoutDashboard, Package, Warehouse, ShoppingCart, Users, Truck,
  BarChart3, DollarSign, Settings, LogOut, Menu, X, Lock,
  Sparkles, Receipt, Bell, AlertTriangle, TrendingUp, ChevronRight,
  Brain, BookOpen, ClipboardList, Tag, Gift, Target, ClipboardCheck, RotateCcw, Archive, Scissors, Bike, ShieldCheck, Rocket, Gauge, Wallet, Store, BedDouble, Calendar, ScanLine, Table2, Headphones, Mail, Inbox
} from 'lucide-react'
import { roleChips, glass, colors, gradients } from '../../theme/tokens'
import { BRAND_LOGO, BRAND_TAGLINE, brandColors, pageMeshBackground } from '../../theme/brand'
import BetaBanner from '../BetaBanner'
import SuperadminUserMenu from '../admin/SuperadminUserMenu'
import { isNativeApp } from '../../utils/capacitorInit'
import { shouldUsePersistentSidebar, watchDeviceFormFactor } from '../../utils/deviceFormFactor'
import { isMenuAllowed } from '../../utils/menuPermissions'
import { isNavPathEnabled } from '../../edition'
import NativeModeFooter from './NativeModeFooter'
import LiveClock from './LiveClock'
import { prefetchRoute } from '../../utils/prefetchRoutes'
import { usePageVisible } from '../../hooks/usePageVisible'

const nativeApp = isNativeApp()

const isSuperadminRole = (role) => role === 'superadmin'

function canSeeNavItem(item, role, user) {
  if (!isNavPathEnabled(item.to)) return false
  if (item.superadminOnly) return isSuperadminRole(role)
  if (item.roles) {
    const expanded = new Set(item.roles)
    if (expanded.has('sales_staff')) { expanded.add('staff'); expanded.add('engineer') }
    if (expanded.has('manager')) expanded.add('operations_staff')
    if (!expanded.has(role)) return false
  }
  if (user && !isMenuAllowed(user, item.to)) return false
  return true
}

const baseNavGroups = (hospitalityEnabled) => [
  {
    label: null,
    items: [
      { to: hospitalityEnabled ? '/hotel' : '/', icon: hospitalityEnabled ? BedDouble : LayoutDashboard, label: hospitalityEnabled ? 'Hotel Dashboard' : 'Dashboard', exact: true },
      { to: '/pos', icon: ShoppingCart, label: 'Point of Sale' },
      { to: '/customers', icon: Users, label: 'Customers' },
    ],
  },
  ...(hospitalityEnabled ? [{
    label: 'HOSPITALITY',
    items: [
      { to: '/hotel/rooms', icon: BedDouble, label: 'Rooms', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/hotel/pricing', icon: TrendingUp, label: 'Pricing', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/hotel/bookings', icon: Calendar, label: 'Bookings' },
      { to: '/hotel/imports', icon: Inbox, label: 'Import inbox', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/hotel/integrations', icon: Mail, label: 'Integrations', roles: ['owner', 'superadmin'] },
    ],
  }] : []),
  {
    label: 'COMMUNITY',
    items: [
      { to: '/marketplace', icon: Store, label: <>DGC <span className="dgc-bazaar-brown">Bazaar</span></> },
      ...(nativeApp ? [
        { to: '/bazaar-ai', icon: ScanLine, label: 'Bazaar AI Capture', roles: ['owner', 'superadmin', 'manager'] },
        { to: '/inventory-scan', icon: Table2, label: 'Table Scan Import', roles: ['owner', 'superadmin', 'manager'] },
      ] : []),
    ],
  },
  {
    label: 'CATALOGUE',
    items: [
      { to: '/products', icon: Package, label: 'Products' },
      { to: '/inventory', icon: Warehouse, label: 'Inventory' },
      { to: '/stock-take', icon: ClipboardCheck, label: 'Stock Take', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/suppliers', icon: Truck, label: 'Suppliers', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/purchase-orders', icon: ClipboardList, label: 'Purchase Orders', roles: ['owner', 'superadmin', 'manager'] },
    ],
  },
  {
    label: 'SALES & OPS',
    items: [
      { to: '/sales', icon: Receipt, label: 'Sales History', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/returns', icon: RotateCcw, label: 'Returns', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/layaway', icon: Archive, label: 'Layaway', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/alterations', icon: Scissors, label: 'Alterations', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/deliveries', icon: Bike, label: 'Deliveries', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/gift-cards', icon: Gift, label: 'Gift Cards', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/promotions', icon: Tag, label: 'Promotions', roles: ['owner', 'superadmin', 'manager'] },
    ],
  },
  {
    label: 'FINANCE & REPORTS',
    items: [
      { to: '/finance', icon: DollarSign, label: 'Finance', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/payables', icon: Wallet, label: 'Payables', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/dsr', icon: BookOpen, label: 'DSR Register', roles: ['owner', 'superadmin', 'manager'] },
    ],
  },
  {
    label: 'TEAM & AI',
    items: [
      { to: '/staff-targets', icon: Target, label: 'Staff Targets', roles: ['owner', 'superadmin', 'manager'] },
      { to: '/assistant', icon: Brain, label: 'AI Assistant', roles: ['owner', 'superadmin', 'manager'] },
    ],
  },
  {
    label: 'COMMAND CENTER',
    items: [
      { to: '/admin', icon: Gauge, label: 'Dashboard', superadminOnly: true, exact: true },
      { to: '/admin/users', icon: Users, label: 'User Access', superadminOnly: true },
      { to: '/admin/merchants', icon: Store, label: 'Merchant Access', superadminOnly: true },
      { to: '/beta-leads', icon: Rocket, label: 'Beta Leads', superadminOnly: true },
    ],
  },
  {
    label: null,
    items: [
      { to: '/support', icon: Headphones, label: 'DGC Support', roles: ['owner', 'manager', 'superadmin'] },
      { to: '/audit', icon: ShieldCheck, label: 'Audit Logs', roles: ['owner', 'superadmin'] },
      { to: '/settings', icon: Settings, label: 'Settings', roles: ['owner', 'superadmin'] },
    ],
  },
]

/* ── Notification Bell ─────────────────────────────────────────────── */
const NOTIF_ICONS = {
  stock: AlertTriangle, alteration: Receipt, layaway: TrendingUp, delivery: TrendingUp,
  marketplace_order: Store, support_chat: Headphones, support_inbox: Headphones,
  shipping: TrendingUp, premium_request: Sparkles, bazaar_guest_order: Store,
}
const NOTIF_STYLES = {
  critical: { color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.22)' },
  warning: { color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.22)' },
  info: { color: '#60A5FA', bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.22)' },
}

function NotificationBell({ role }) {
  const navigate = useNavigate()
  const pageVisible = usePageVisible()
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (!['owner', 'superadmin', 'manager'].includes(role) || !pageVisible) return
    const load = async () => {
      try {
        const res = await notificationsAPI.getAll()
        const notes = res.data?.notifications || []
        setAlerts(notes)
        setUnread(notes.filter(n => n.level !== 'info').length)
      } catch { }
    }
    const defer = setTimeout(load, 2500)
    const t = setInterval(load, 60_000)
    return () => { clearTimeout(defer); clearInterval(t) }
  }, [role, pageVisible])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!['owner', 'superadmin', 'manager'].includes(role)) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(v => !v); setUnread(0) }}
        style={{
          position: 'relative', padding: 7, borderRadius: 10,
          background: open ? 'rgba(11,95,255,0.1)' : 'rgba(255,255,255,0.9)',
          border: `1px solid ${open ? 'rgba(11,95,255,0.22)' : 'rgba(7,27,82,0.08)'}`,
          cursor: 'pointer', display: 'flex', color: open ? brandColors.blue : '#64748b',
          transition: 'all 0.22s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: open ? '0 2px 10px rgba(11,95,255,0.12)' : 'none',
        }}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            width: 15, height: 15, borderRadius: '50%',
            background: '#EF4444', color: '#EDE8DF',
            fontSize: '0.55rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid #0D1117',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute', top: 42, right: 0,
              width: 330, zIndex: 200,
              background: 'rgba(255,255,255,0.98)',
              backdropFilter: 'blur(20px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
              border: '1px solid rgba(7,27,82,0.08)',
              borderRadius: 16,
              boxShadow: '0 12px 40px rgba(7,27,82,0.1), 0 4px 12px rgba(7,27,82,0.05)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid rgba(7,27,82,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#071B52' }}>Notifications</span>
              <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ maxHeight: 380, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(7,27,82,0.12) transparent' }}>
              {alerts.length === 0
                ? <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>All clear ✓</div>
                : alerts.map(a => {
                  const Icon = NOTIF_ICONS[a.type] || AlertTriangle
                  const s = NOTIF_STYLES[a.level] || NOTIF_STYLES.info
                  return (
                    <div key={a.id}
                      onClick={() => { navigate(a.link || '/'); setOpen(false) }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.70rem 1rem', cursor: 'pointer', borderBottom: '1px solid rgba(7,27,82,0.05)', transition: 'background 0.18s cubic-bezier(0.22,1,0.36,1)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(11,95,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: s.bg, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={13} style={{ color: s.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.77rem', fontWeight: 700, color: '#0f172a' }}>{a.title}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>
                      </div>
                      <ChevronRight size={12} style={{ color: 'rgba(44,26,14,0.26)', flexShrink: 0, marginTop: 4 }} />
                    </div>
                  )
                })
              }
            </div>

            <div style={{ padding: '0.50rem 1rem', borderTop: '1px solid rgba(7,27,82,0.06)', display: 'flex', gap: 10, justifyContent: 'center' }}>
              {[['Inventory', '/inventory'], ['Alterations', '/alterations'], ['Deliveries', '/deliveries']].map(([label, path]) => (
                <button key={path} onClick={() => { navigate(path); setOpen(false) }}
                  style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>
                  {label} →
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Main Layout ───────────────────────────────────────────────────── */
export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [persistentSidebar, setPersistentSidebar] = useState(() => shouldUsePersistentSidebar(nativeApp))
  const canvasRef = useRef(null)
  const chromeTopRef = useRef(null)
  const [paymentActive, setPaymentActive] = useState(() => window.__DGC_PAYMENT_ACTIVE__ === true)
  const closeSidebar = () => setSidebarOpen(false)
  const toggleSidebar = () => setSidebarOpen(v => !v)

  // POS checkout — hide footer so payment panel gets full height
  useEffect(() => {
    const onPayment = (e) => setPaymentActive(!!e.detail?.active)
    window.addEventListener('dgc:payment-mode', onPayment)
    return () => window.removeEventListener('dgc:payment-mode', onPayment)
  }, [])

  // Measure locked header height for native scroll area
  useEffect(() => {
    const canvas = canvasRef.current
    const top = chromeTopRef.current
    if (!canvas || !top) return undefined

    const syncChromeHeights = () => {
      canvas.style.setProperty('--dgc-chrome-top-h', `${top.offsetHeight}px`)
    }

    syncChromeHeights()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncChromeHeights) : null
    ro?.observe(top)
    window.addEventListener('resize', syncChromeHeights)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', syncChromeHeights)
    }
  }, [user?.account])

  useEffect(() => {
    if (nativeApp) {
      return watchDeviceFormFactor(() => {
        setPersistentSidebar(shouldUsePersistentSidebar(true))
      })
    }
    const onResize = () => setPersistentSidebar(shouldUsePersistentSidebar(false))
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    onResize()
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  // Close drawer on route change (persistent sidebar stays open)
  useEffect(() => { if (!persistentSidebar) setSidebarOpen(false) }, [location.pathname, persistentSidebar])

  // iOS: lock page scroll while drawer is open; Android back closes drawer first
  useEffect(() => {
    window.__DGC_SIDEBAR_OPEN__ = sidebarOpen
    if (!nativeApp) return undefined
    if (sidebarOpen) {
      document.body.classList.add('dgc-drawer-open')
      document.documentElement.classList.add('dgc-drawer-open')
    } else {
      document.body.classList.remove('dgc-drawer-open')
      document.documentElement.classList.remove('dgc-drawer-open')
    }
    const onClose = () => setSidebarOpen(false)
    window.addEventListener('dgc:close-sidebar', onClose)
    return () => {
      window.removeEventListener('dgc:close-sidebar', onClose)
      document.body.classList.remove('dgc-drawer-open')
      document.documentElement.classList.remove('dgc-drawer-open')
      window.__DGC_SIDEBAR_OPEN__ = false
    }
  }, [sidebarOpen])
  const [shopName, setShopName] = useState(() => user?.account?.name || 'Your Store')
  const [version, setVersion] = useState(null)
  const { enabled: hospitalityEnabled } = useHospitalityEnabled()

  useEffect(() => {
    if (user?.account?.name) {
      setShopName(user.account.name)
      return
    }
    const defer = setTimeout(() => {
      settingsAPI.getAll()
        .then(r => { if (r.data.shop_name) setShopName(r.data.shop_name) })
        .catch(() => { })
    }, 800)
    return () => clearTimeout(defer)
  }, [user])

  useEffect(() => {
    const defer = setTimeout(() => {
      settingsAPI.getVersion()
        .then(r => { if (r.data?.version) setVersion(r.data.version) })
        .catch(() => { })
    }, 1500)
    return () => clearTimeout(defer)
  }, [])

  const navGroups = useMemo(() => baseNavGroups(hospitalityEnabled), [hospitalityEnabled])
  const nav = useMemo(() => navGroups.flatMap(g => g.items), [navGroups])

  const handleLogout = async () => {
    await logout()
    toast.success('Signed out')
    navigate('/login')
  }

  const { lock } = useLock() || {}

  // ── Keyboard nav ──────────────────────────────────────────────────────
  const [navFocusIdx, setNavFocusIdxState] = useState(null)
  const navFocusIdxRef = useRef(null)
  const navItemRefs = useRef([])

  const setNavFocusIdx = (v) => {
    navFocusIdxRef.current = v
    setNavFocusIdxState(v)
  }

  const visibleNavFlat = useMemo(() =>
    navGroups.flatMap(g => g.items.filter(item => canSeeNavItem(item, user?.role))),
    [user?.role]
  )

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setNavFocusIdxState(prev => {
          const next = prev === null ? 0 : Math.min(prev + 1, visibleNavFlat.length - 1)
          navFocusIdxRef.current = next
          setTimeout(() => navItemRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0)
          return next
        })
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setNavFocusIdxState(prev => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0)
          navFocusIdxRef.current = next
          setTimeout(() => navItemRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0)
          return next
        })
      } else if (e.key === 'Enter') {
        const idx = navFocusIdxRef.current
        if (idx !== null && visibleNavFlat[idx]) {
          e.preventDefault()
          navigate(visibleNavFlat[idx].to)
          setNavFocusIdx(null)
        }
      } else if (e.key === 'Escape') {
        setNavFocusIdx(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visibleNavFlat, navigate])
  // ─────────────────────────────────────────────────────────────────────

  const currentNav = nav.find(n =>
    n.exact
      ? location.pathname === n.to
      : location.pathname.startsWith(n.to) && n.to !== '/'
  )
  const pageTitle = currentNav?.label || 'Dashboard'
  const PageIcon = currentNav?.icon || LayoutDashboard
  const role = user?.role || 'sales_staff'
  const roleChip = roleChips[role] || roleChips.sales_staff

  // Sidebar as JSX variable (NOT a nested component) so navItemRefs stay stable
  let _flatIdx = 0
  const sidebarJSX = (
    <aside className="dgc-sidebar" style={{
      width: 260,
      flexShrink: 0, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100dvh', overflowY: 'auto',
    }}>
      {/* Brand */}
      <div className="dgc-sidebar-brand" style={{ padding: '20px 16px 14px', borderBottom: '1px solid rgba(7,27,82,0.06)' }}>
        <img
          src={BRAND_LOGO}
          alt="DGC POS"
          style={{ width: '100%', maxWidth: 196, height: 'auto', objectFit: 'contain', display: 'block' }}
        />
        <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: 8, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>
          {BRAND_TAGLINE}
        </div>
        {version && (
          <div style={{ fontSize: '0.56rem', color: brandColors.blue, marginTop: 4, letterSpacing: '0.08em', fontWeight: 700 }}>
            v{version}
          </div>
        )}
      </div>

      {/* Nav - iPad style */}
      <nav style={{
        flex: 1, padding: '8px 4px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        paddingBottom: '1rem',
      }}>
        {navGroups.map((group, gi) => {
          const visible = group.items.filter(item => canSeeNavItem(item, user?.role, user))
          if (!visible.length) return null
          return (
            <div key={gi} className="dgc-nav-group" style={{ marginTop: gi > 0 ? 2 : 0 }}>
              {group.label && (
                <div className="dgc-nav-section-label dgc-text-3d-sub">
                  {group.label}
                </div>
              )}
              {visible.map(({ to, icon: Icon, label, exact }) => {
                const idx = _flatIdx++
                const isFocused = navFocusIdx === idx
                return (
                  <NavLink key={to} to={to} end={exact}
                    ref={el => { navItemRefs.current[idx] = el }}
                    onMouseEnter={() => prefetchRoute(to)}
                    onTouchStart={() => prefetchRoute(to)}
                    onClick={() => { closeSidebar(); setNavFocusIdx(null) }}
                    className={({ isActive }) => `nav-item dgc-nav-item ${isActive ? 'active' : ''}`}
                    style={{
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '11px 14px',
                      fontSize: '14px',
                      minHeight: '44px',
                    }}
                  >
                    <Icon size={15} />
                    <span className="dgc-nav-label dgc-text-3d" style={{ flex: 1 }}>{label}</span>
                    {isFocused && (
                      <span style={{
                        fontSize: '0.56rem', fontWeight: 700,
                        color: brandColors.blue,
                        background: 'rgba(11,95,255,0.08)',
                        border: '1px solid rgba(11,95,255,0.18)',
                        borderRadius: 3, padding: '1px 4px', fontFamily: 'monospace',
                      }}>↵</span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Bottom: keyboard hint + credit — white/grey on liquid glass */}
      <div style={{ padding: '0.60rem 0.75rem 0.70rem', borderTop: '1px solid rgba(7,27,82,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 5 }}>
          {['↑', '↓', '↵'].map(k => (
            <span key={k} style={{
              fontSize: '0.60rem', fontWeight: 700,
              color: navFocusIdx !== null ? brandColors.blue : '#94a3b8',
              background: navFocusIdx !== null ? 'rgba(11,95,255,0.08)' : 'rgba(7,27,82,0.04)',
              border: `1px solid ${navFocusIdx !== null ? 'rgba(11,95,255,0.18)' : 'rgba(7,27,82,0.08)'}`,
              borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', transition: 'all 0.22s',
            }}>{k}</span>
          ))}
          <span style={{ fontSize: '0.56rem', color: '#94a3b8', marginLeft: 2 }}>nav</span>
        </div>
        <div style={{ fontSize: '0.57rem', color: '#94a3b8', letterSpacing: '0.06em', textAlign: 'center' }}>
          Designed by <span style={{ color: '#071B52', fontWeight: 700 }}>GuruShah</span>
        </div>
      </div>
    </aside>
  )

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: brandColors.cloud }}>

      {/* Drawer backdrop — tap outside to close; hamburger is the only opener */}
      <div
        onClick={closeSidebar}
        className={persistentSidebar ? 'dgc-drawer-backdrop hidden' : (nativeApp ? 'dgc-drawer-backdrop' : 'dgc-drawer-backdrop md:hidden')}
        aria-hidden={!sidebarOpen}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'linear-gradient(180deg, rgba(7,27,82,0.18) 0%, rgba(7,27,82,0.24) 100%)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.45)',
          backdropFilter: 'blur(18px) saturate(1.45)',
          opacity: sidebarOpen ? 1 : 0,
          visibility: sidebarOpen ? 'visible' : 'hidden',
          pointerEvents: sidebarOpen ? 'auto' : 'none',
          transition: sidebarOpen
            ? 'opacity 0.32s cubic-bezier(0.32,0.72,0,1), visibility 0s'
            : 'opacity 0.22s cubic-bezier(0.32,0.72,0,1), visibility 0s linear 0.22s',
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)',
        }}
      />

      {/* Persistent sidebar — desktop, iPad, Android tablet (web + native) */}
      {persistentSidebar && (
        <div className="dgc-persistent-sidebar flex shrink-0" style={{ height: '100dvh' }}>
          {sidebarJSX}
        </div>
      )}

      {/* Off-canvas drawer — phones and narrow native portrait */}
      <div
        className={persistentSidebar ? 'dgc-drawer-panel hidden' : (nativeApp ? 'dgc-drawer-panel' : 'dgc-drawer-panel md:hidden')}
        role="dialog"
        aria-modal={sidebarOpen}
        aria-hidden={!sidebarOpen}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
          width: 260, height: '100dvh',
          visibility: sidebarOpen ? 'visible' : 'hidden',
          pointerEvents: sidebarOpen ? 'auto' : 'none',
          WebkitTransform: sidebarOpen ? 'translate3d(0,0,0)' : 'translate3d(-260px,0,0)',
          transform: sidebarOpen ? 'translate3d(0,0,0)' : 'translate3d(-260px,0,0)',
          transition: sidebarOpen
            ? 'transform 0.38s cubic-bezier(0.32,0.72,0,1), visibility 0s'
            : 'transform 0.28s cubic-bezier(0.32,0.72,0,1), visibility 0s linear 0.28s',
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          boxShadow: sidebarOpen ? '4px 0 24px rgba(7,27,82,0.12)' : 'none',
        }}
      >
        {sidebarJSX}

        {/* Close tab — rides the right edge of the sidebar */}
        <button
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'absolute', top: '50%', right: -28,
            transform: 'translateY(-50%)',
            width: 28, height: 64,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.74) 0%, rgba(239,247,255,0.6) 100%)',
            border: '1px solid rgba(7,27,82,0.14)',
            borderLeft: 'none',
            borderRadius: '0 10px 10px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: brandColors.navy, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            backdropFilter: 'blur(22px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
            boxShadow: '2px 0 14px rgba(7,27,82,0.14), inset 0 1px 0 rgba(255,255,255,0.62)',
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Open tab — left edge pull handle (visible only when sidebar is closed) */}
      <div
        className="md:hidden"
        style={{
          position: 'fixed', top: '50%', left: 0, zIndex: 39,
          transform: sidebarOpen ? 'translate3d(-40px,-50%,0)' : 'translate3d(0,-50%,0)',
          transition: sidebarOpen
            ? 'transform 0.28s cubic-bezier(0.32,0.72,0,1)'
            : 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            width: 28, height: 64,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.74) 0%, rgba(239,247,255,0.6) 100%)',
            border: '1px solid rgba(7,27,82,0.14)',
            borderLeft: 'none',
            borderRadius: '0 10px 10px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: brandColors.navy, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            backdropFilter: 'blur(22px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
            boxShadow: '2px 0 14px rgba(7,27,82,0.14), inset 0 1px 0 rgba(255,255,255,0.62)',
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Brand watermark */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <img src={BRAND_LOGO} alt="" style={{ width: '50vw', maxWidth: 620, minWidth: 260, height: 'auto', opacity: 0.04, filter: 'grayscale(10%)', userSelect: 'none', pointerEvents: 'none', transform: 'translateX(120px)' }} />
      </div>

      {/* Main content — header/footer locked; only page body scrolls */}
      <div
        ref={canvasRef}
        className="dgc-app-canvas"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative', zIndex: 1, background: pageMeshBackground }}
      >
        <div ref={chromeTopRef} className="dgc-app-chrome-top">
          <BetaBanner />

          <header className="dgc-topbar" style={{ flexShrink: 0, height: 60, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Hamburger — only way to open menu on iOS / mobile */}
            <button
              type="button"
              className={persistentSidebar ? 'hidden' : (nativeApp ? 'flex' : 'flex md:hidden')}
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={sidebarOpen}
              style={{
                padding: 8, borderRadius: 9, minWidth: 40, minHeight: 40,
                background: sidebarOpen ? 'rgba(11,95,255,0.1)' : 'rgba(255,255,255,0.90)',
                border: `1px solid ${sidebarOpen ? 'rgba(11,95,255,0.22)' : 'rgba(15,23,42,0.10)'}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#071B52', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
              }}
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: brandColors.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PageIcon size={14} style={{ color: '#FFFFFF' }} />
              </div>
              <h1 className="dgc-text-3d" style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.005em' }}>
                {pageTitle}
              </h1>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LiveClock />

            <div className="hidden sm:block" style={{ width: 1, height: 28, background: 'rgba(15,23,42,0.10)' }} />

            {/* Notification Bell */}
            <NotificationBell role={role} />

            <div style={{ width: 1, height: 28, background: 'rgba(15,23,42,0.10)' }} className="hidden sm:block" />

            {/* User menu — superadmin: click name for password; others: static chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isSuperadminRole(role) ? (
                <SuperadminUserMenu user={user} onLogout={handleLogout} />
              ) : (
                <>
                  <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${brandColors.navy} 0%, ${brandColors.blue} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 800, color: '#FFFFFF' }}>
                    {(user?.full_name?.[0] || user?.username?.[0] || 'U').toUpperCase()}
                  </div>
                  <div className="hidden sm:block" style={{ lineHeight: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0F172A' }}>{user?.full_name || user?.username}</div>
                    <div style={{ fontSize: '0.61rem', fontWeight: 700, marginTop: 2, color: roleChip.color }}>{roleChip.label}</div>
                  </div>
                </>
              )}
              {/* Lock button */}
              <button onClick={() => lock?.()}
                title="Lock screen"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 5, padding: '6px 10px', borderRadius: 8,
                  border: '1px solid rgba(15,23,42,0.10)',
                  background: 'rgba(255,255,255,0.86)',
                  color: '#64748B',
                  fontSize: '0.75rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#071B52'; e.currentTarget.style.background = 'rgba(27,47,94,0.08)'; e.currentTarget.style.borderColor = 'rgba(27,47,94,0.22)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(71,85,105,0.95)'; e.currentTarget.style.background = 'rgba(255,255,255,0.86)'; e.currentTarget.style.borderColor = 'rgba(15,23,42,0.10)' }}
              >
                <Lock size={13} />
                <span className="hidden sm:inline">Lock</span>
              </button>
              {/* Logout button */}
              <button onClick={handleLogout}
                title="Sign out"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 5, padding: '6px 10px', borderRadius: 8,
                  border: '1px solid rgba(15,23,42,0.10)',
                  background: 'rgba(255,255,255,0.86)',
                  color: '#64748B',
                  fontSize: '0.75rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#B42318'; e.currentTarget.style.background = 'rgba(244,67,54,0.08)'; e.currentTarget.style.borderColor = 'rgba(244,67,54,0.22)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.background = 'rgba(255,255,255,0.86)'; e.currentTarget.style.borderColor = 'rgba(15,23,42,0.10)' }}
              >
                <LogOut size={13} />
                <span className="hidden sm:inline" style={{ color: '#0F172A' }}>Sign Out</span>
              </button>
            </div>
          </div>
          </header>
        </div>

        <main
          className="dgc-page-main"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          {nativeApp ? (
            <div key={location.pathname} className="dgc-page-enter">
              <Outlet />
            </div>
          ) : (
            <motion.div
              key={location.pathname}
              className="dgc-page-enter dgc-main-scroll"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          )}

          {!nativeApp && !paymentActive && !['/payables', '/products', '/marketplace'].includes(location.pathname) && (
            <footer className="dgc-app-footer">
              © {new Date().getFullYear()} <strong>DGC POS</strong> · All rights reserved
            </footer>
          )}
        </main>

        {nativeApp && !paymentActive && !['/login', '/beta'].includes(location.pathname) && (
          <NativeModeFooter />
        )}
      </div>
    </div>
  )
}
