/** Map nav paths to menu permission keys (superadmin tick-list). */
const PATH_TO_MENU = {
  '/': 'dashboard',
  '/pos': 'pos',
  '/customers': 'customers',
  '/hotel': 'hotel',
  '/hotel/rooms': 'hotel_rooms',
  '/hotel/bookings': 'hotel_bookings',
  '/marketplace': 'marketplace',
  '/products': 'products',
  '/inventory': 'inventory',
  '/stock-take': 'stock_take',
  '/suppliers': 'suppliers',
  '/purchase-orders': 'purchase_orders',
  '/sales': 'sales',
  '/returns': 'returns',
  '/layaway': 'layaway',
  '/finance': 'finance',
  '/reports': 'reports',
  '/payables': 'payables',
  '/dsr': 'dsr',
  '/promotions': 'promotions',
  '/gift-cards': 'gift_cards',
  '/staff-targets': 'staff_targets',
  '/assistant': 'assistant',
  '/support': 'support',
  '/settings': 'settings',
  '/audit': 'audit',
}

export function pathToMenuKey(path) {
  if (!path) return null
  if (PATH_TO_MENU[path]) return PATH_TO_MENU[path]
  const base = `/${path.split('/').filter(Boolean)[0]}`
  return PATH_TO_MENU[base] || null
}

export function isMenuAllowed(user, path) {
  if (!user) return true
  if (user.role === 'superadmin') return true
  if (user.merchant_service_enabled === false) return false
  const perms = user.menu_permissions
  if (!perms || !perms.length) return true
  const key = pathToMenuKey(path)
  if (!key) return true
  return perms.includes(key)
}