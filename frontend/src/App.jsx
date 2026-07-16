import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './store/AuthContext'
import { tokenStore } from './api'
import { BRAND_LOGO, BRAND_TAGLINE, brandColors, pageMeshBackground } from './theme/brand'
import AppShell from './components/layout/AppShell'
import PlatformGate from './components/PlatformGate'
import { createEnterpriseRoutes } from '@ee/routes'
import Login from './pages/Login'
import Beta from './pages/Beta'

// ── Route-based code splitting ─────────────────────────────────────────────
// Each page is loaded ONLY when the user navigates to it.
// This reduces the initial bundle from ~985KB to ~180KB (gzip: ~55KB)
const CustomerDisplay = lazy(() => import('./pages/CustomerDisplay'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Products = lazy(() => import('./pages/Products'))
const Inventory = lazy(() => import('./pages/Inventory'))
const POS = lazy(() => import('./pages/POS'))
const Customers = lazy(() => import('./pages/Customers'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Reports = lazy(() => import('./pages/Reports'))
const Finance = lazy(() => import('./pages/Finance'))
const Settings = lazy(() => import('./pages/Settings'))
const Sales = lazy(() => import('./pages/Sales'))
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'))
const Promotions = lazy(() => import('./pages/Promotions'))
const DSR = lazy(() => import('./pages/DSR'))
const Marketplace = lazy(() => import('./pages/Marketplace'))
const StockTake = lazy(() => import('./pages/StockTake'))
const Returns = lazy(() => import('./pages/Returns'))
const Layaway = lazy(() => import('./pages/Layaway'))
const Alterations = lazy(() => import('./pages/Alterations'))
const Deliveries = lazy(() => import('./pages/Deliveries'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))

function SessionReconnecting({ onRetry }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: pageMeshBackground,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center',
    }}>
      <img src={BRAND_LOGO} alt="DGC POS" style={{ width: 72, height: 72, objectFit: 'contain' }} />
      <h2 style={{ margin: 0, color: brandColors.navy, fontSize: 20, fontWeight: 600 }}>
        Reconnecting…
      </h2>
      <p style={{ margin: 0, maxWidth: 360, color: brandColors.slate, lineHeight: 1.5 }}>
        The server is temporarily unavailable. Your session is still saved — we will restore it automatically.
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 8, padding: '10px 20px', borderRadius: 10, border: 'none',
          background: brandColors.blue, color: '#fff', fontWeight: 600, cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}

function ProtectedRoute({ children, roles, superadminOnly }) {
  const { user, loading, sessionDegraded, refetch } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) {
    if (hasStoredSession() || sessionDegraded) {
      return <SessionReconnecting onRetry={refetch} />
    }
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (superadminOnly && user.role !== 'superadmin') return <Navigate to="/" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: pageMeshBackground,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column',
      animation: 'splashIn 0.6s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <style>{`
        @keyframes splashIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes goldRise   { from { opacity:0; transform:translateY(22px) scale(0.94) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes taglineIn  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes lineExpand { from { width:0; opacity:0 } to { width:80px; opacity:1 } }
        @keyframes orbPulse   { 0%,100% { opacity:0.18; transform:scale(1) } 50% { opacity:0.35; transform:scale(1.08) } }
        @keyframes ringExpand { 0% { transform:scale(0.6); opacity:0 } 60% { opacity:1 } 100% { transform:scale(1); opacity:1 } }
        @keyframes arcSpin    { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes dotPop1    { 0%,80%,100%{transform:scale(0.6);opacity:0.3} 40%{transform:scale(1);opacity:1} }
        @keyframes dotPop2    { 0%,100%{transform:scale(0.6);opacity:0.3} 50%{transform:scale(1);opacity:1} }
        @keyframes dotPop3    { 0%,20%,100%{transform:scale(0.6);opacity:0.3} 60%{transform:scale(1);opacity:1} }
        @keyframes shimmer    { 0%{background-position:-200% center} 100%{background-position:200% center} }
      `}</style>

      {/* Radial glow behind logo */}
      <div style={{
        position: 'absolute', width: 360, height: 360, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(11,95,255,0.14) 0%, transparent 70%)`,
        animation: 'orbPulse 3s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Outer decorative ring */}
      <div style={{
        position: 'absolute', width: 220, height: 220, borderRadius: '50%',
        border: '1px solid rgba(11,95,255,0.18)',
        animation: 'ringExpand 0.9s cubic-bezier(0.16,1,0.3,1) 0.1s both',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 160, height: 160, borderRadius: '50%',
        border: '1px solid rgba(11,95,255,0.10)',
        animation: 'ringExpand 0.9s cubic-bezier(0.16,1,0.3,1) 0.25s both',
        pointerEvents: 'none',
      }} />

      {/* Center content */}
      <div style={{ position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        <img
          src={BRAND_LOGO}
          alt="DGC POS"
          style={{
            width: 'min(320px, 78vw)',
            height: 'auto',
            objectFit: 'contain',
            animation: 'goldRise 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s both',
            filter: 'drop-shadow(0 12px 28px rgba(11,95,255,0.22))',
          }}
        />

        <div style={{
          height: 1,
          width: 80,
          background: 'linear-gradient(90deg,transparent,rgba(11,95,255,0.55),transparent)',
          margin: '14px auto 10px',
          animation: 'lineExpand 0.6s cubic-bezier(0.16,1,0.3,1) 0.55s both',
        }} />

        <div style={{
          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: '#64748b',
          animation: 'taglineIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.65s both',
        }}>
          {BRAND_TAGLINE}
        </div>
      </div>

      {/* Spinner — arc style */}
      <div style={{ position: 'relative', marginTop: 48, width: 40, height: 40, animation: 'ringExpand 0.6s ease 0.8s both' }}>
        {/* Track ring */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(11,95,255,0.14)',
        }} />
        {/* Spinning arc */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: brandColors.blue,
          borderRightColor: 'rgba(11,95,255,0.35)',
          animation: 'arcSpin 0.9s cubic-bezier(0.4,0,0.6,1) infinite',
        }} />
        {/* Center dot */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 5, height: 5, borderRadius: '50%',
          background: 'rgba(11,95,255,0.65)',
        }} />
      </div>

      {/* Loading dots */}
      <div style={{ display: 'flex', gap: 7, marginTop: 20, animation: 'taglineIn 0.5s ease 1s both' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'rgba(11,95,255,0.55)',
            animation: `dotPop${i + 1} 1.2s ease ${0.1 * i}s infinite`,
          }} />
        ))}
      </div>

      {/* Bottom watermark */}
      <div style={{
        position: 'absolute', bottom: 32,
        fontSize: '0.56rem', letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'rgba(7,27,82,0.22)',
        fontWeight: 600,
        animation: 'taglineIn 0.6s ease 1.1s both',
      }}>
        Designed by GuruShah
      </div>
    </div>
  )
}

const isAdminHost = () =>
  typeof window !== 'undefined' && window.location.hostname === 'admin.dgcpos.com'

function hasStoredSession() {
  return !!(tokenStore.get() || tokenStore.getRefresh())
}

export default function App() {
  const { user, loading, sessionDegraded, refetch } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />

  if (isAdminHost()) {
    if (!user && location.pathname !== '/login') {
      if (hasStoredSession() || sessionDegraded) {
        return <SessionReconnecting onRetry={refetch} />
      }
      return <Navigate to="/login?redirect=/admin" replace />
    }
    if (user && user.role !== 'superadmin') {
      return <Navigate to="/login?redirect=/admin" replace />
    }
  }

  return (
    <PlatformGate>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/beta" element={user ? <Navigate to="/" replace /> : <Beta />} />
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Navigate to="/login?mode=signup" replace />} />
        <Route path="/reset-password" element={user ? <Navigate to="/" replace /> : <Navigate to="/login?mode=reset" replace />} />
        <Route path="/display" element={<CustomerDisplay />} />
        <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="pos" element={<POS />} />
          <Route path="customers" element={<Customers />} />
          <Route path="sales" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><Sales /></ProtectedRoute>} />
          <Route path="suppliers" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><Suppliers /></ProtectedRoute>} />
          <Route path="reports" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><Reports /></ProtectedRoute>} />
          <Route path="finance" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><Finance /></ProtectedRoute>} />
          <Route path="dsr" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><DSR /></ProtectedRoute>} />
          <Route path="marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
          {createEnterpriseRoutes(ProtectedRoute)}
          <Route path="purchase-orders" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><PurchaseOrders /></ProtectedRoute>} />
          <Route path="promotions" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><Promotions /></ProtectedRoute>} />
          <Route path="stock-take" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><StockTake /></ProtectedRoute>} />
          <Route path="returns" element={<ProtectedRoute roles={['owner', 'superadmin', 'manager']}><Returns /></ProtectedRoute>} />
          <Route path="layaway" element={<Layaway />} />
          <Route path="alterations" element={<Alterations />} />
          <Route path="deliveries" element={<Deliveries />} />
          <Route path="audit" element={<ProtectedRoute roles={['owner', 'superadmin']}><AuditLogs /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute roles={['owner', 'manager', 'superadmin']}><Settings /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </PlatformGate>
  )
}
