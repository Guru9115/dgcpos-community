import { isNavPathEnabled } from '../edition'

const prefetched = new Set()

const ROUTE_LOADERS = {
  '/': () => import('../pages/Dashboard'),
  '/pos': () => import('../pages/POS'),
  '/products': () => import('../pages/Products'),
  '/inventory': () => import('../pages/Inventory'),
  '/customers': () => import('../pages/Customers'),
  '/sales': () => import('../pages/Sales'),
  '/marketplace': () => import('../pages/Marketplace'),
  '/reports': () => import('../pages/Reports'),
  '/settings': () => import('../pages/Settings'),
}

if (isNavPathEnabled('/hotel')) {
  ROUTE_LOADERS['/hotel'] = () => import('../../ee-frontend/pages/HospitalityDashboard')
}

export function prefetchRoute(path) {
  const key = path?.split('?')[0]
  if (!key || prefetched.has(key)) return
  const loader = ROUTE_LOADERS[key]
  if (!loader) return
  prefetched.add(key)
  loader().catch(() => { prefetched.delete(key) })
}

export function prefetchCoreRoutes() {
  const run = () => {
    prefetchRoute('/')
    setTimeout(() => prefetchRoute('/pos'), 4000)
    setTimeout(() => prefetchRoute('/products'), 8000)
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 5000 })
  } else {
    setTimeout(run, 3000)
  }
}