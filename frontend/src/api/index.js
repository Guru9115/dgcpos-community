import axios from 'axios'
import { Capacitor } from '@capacitor/core'

const PROD_API = 'https://api.dgcpos.net/api'

// Resolve API base defensively for production domains.
// Priority:
// 1) explicit VITE_API_URL
// 2) Capacitor iOS/Android app -> production API
// 3) app/preview hosts -> production API
// 4) local/dev fallback -> relative /api
const resolveBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api`
  }

  if (Capacitor.isNativePlatform()) {
    return PROD_API
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    const isProdAppHost = host === 'app.dgcpos.net' || host === 'admin.dgcpos.net'
    const isPreviewHost =
      host.endsWith('.dgc-retailos-frontend.pages.dev') ||
      host.endsWith('.dg-retailos-frontend.pages.dev')
    if (isProdAppHost || isPreviewHost) {
      return PROD_API
    }
  }

  return '/api'
}

const BASE = resolveBase()

const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

// ── JWT token helpers ────────────────────────────────────────────────────────
const safeSessionStorage = {
  getItem: (k) => {
    try { return window.sessionStorage.getItem(k) } catch { return null }
  },
  setItem: (k, v) => {
    try { window.sessionStorage.setItem(k, v) } catch { }
  },
  removeItem: (k) => {
    try { window.sessionStorage.removeItem(k) } catch { }
  },
}

const safeLocalStorage = {
  getItem: (k) => {
    try { return window.localStorage.getItem(k) } catch { return null }
  },
  setItem: (k, v) => {
    try { window.localStorage.setItem(k, v) } catch { }
  },
  removeItem: (k) => {
    try { window.localStorage.removeItem(k) } catch { }
  },
}

// Access tokens stay in sessionStorage only (never passwords, never long-lived JWT in localStorage).
let refreshPersistent = safeLocalStorage.getItem('dg_remember_me') === '1'

const migrateLegacyToken = (key) => {
  const legacyValue = safeLocalStorage.getItem(key)
  if (legacyValue) {
    safeSessionStorage.setItem(key, legacyValue)
    safeLocalStorage.removeItem(key)
    return legacyValue
  }
  return null
}

export const loginPrefs = {
  getRememberMe: () => safeLocalStorage.getItem('dg_remember_me') !== '0',
  setRememberMe: (on) => {
    safeLocalStorage.setItem('dg_remember_me', on ? '1' : '0')
    refreshPersistent = !!on
    if (!on) safeLocalStorage.removeItem('dg_refresh')
  },
  getSavedUsername: () => safeLocalStorage.getItem('dg_saved_username'),
  setSavedUsername: (username, remember) => {
    if (remember && username) safeLocalStorage.setItem('dg_saved_username', username)
    else safeLocalStorage.removeItem('dg_saved_username')
  },
}

export const tokenStore = {
  setPersistentRefresh: (on) => {
    refreshPersistent = !!on
    loginPrefs.setRememberMe(!!on)
  },
  isPersistentRefresh: () => refreshPersistent,
  get: () => safeSessionStorage.getItem('dg_token') || migrateLegacyToken('dg_token'),
  set: (t) => {
    safeSessionStorage.setItem('dg_token', t)
    safeLocalStorage.removeItem('dg_token')
  },
  clear: () => {
    safeSessionStorage.removeItem('dg_token')
    safeLocalStorage.removeItem('dg_token')
  },
  getRefresh: () => {
    const sessionValue = safeSessionStorage.getItem('dg_refresh')
    if (sessionValue) return sessionValue
    if (refreshPersistent) {
      const stored = safeLocalStorage.getItem('dg_refresh')
      if (stored) {
        safeSessionStorage.setItem('dg_refresh', stored)
        return stored
      }
    }
    return migrateLegacyToken('dg_refresh')
  },
  setRefresh: (t) => {
    safeSessionStorage.setItem('dg_refresh', t)
    if (refreshPersistent) safeLocalStorage.setItem('dg_refresh', t)
    else safeLocalStorage.removeItem('dg_refresh')
  },
  clearRefresh: () => {
    safeSessionStorage.removeItem('dg_refresh')
    safeLocalStorage.removeItem('dg_refresh')
  },
}

// Transient failures (deploy blips, gateway timeouts, offline) must not sign the user out.
export function isTransientError(err) {
  if (!err?.response) return true
  const status = err.response.status
  if (status >= 500 && status <= 599) return true
  if (status === 408 || status === 429) return true
  return false
}

function isAuthError(err) {
  const status = err.response?.status
  return status === 401 || status === 403
}

function shouldForceLogout(err) {
  if (isTransientError(err)) return false
  return isAuthError(err)
}

/** Whether AuthContext / interceptors should wipe stored credentials. */
export function shouldClearSession(err, { afterRefreshAttempt = false } = {}) {
  if (isTransientError(err)) return false
  const status = err?.response?.status
  if (status !== 401 && status !== 403) return false
  if (afterRefreshAttempt) return true
  if (tokenStore.getRefresh()) return false
  return true
}

function clearSessionAndRedirectLogin() {
  tokenStore.clear()
  tokenStore.clearRefresh()
  if (
    window.location.pathname !== '/login'
    && !window.location.pathname.startsWith('/beta')
  ) {
    window.location.href = '/login'
  }
}

// Shared refresh — one in-flight refresh for interceptor + AuthContext (avoids rotation races).
let refreshPromise = null

export async function refreshAccessToken() {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return null
  if (!refreshPromise) {
    refreshPromise = api.post(
      '/auth/refresh',
      { refresh_token: refresh },
      { skipAuthRefresh: true },
    )
      .then((res) => {
        if (res.data?.token) {
          tokenStore.set(res.data.token)
          if (res.data.refresh_token) tokenStore.setRefresh(res.data.refresh_token)
          return res.data
        }
        return null
      })
      .catch((err) => {
        if (shouldForceLogout(err)) clearSessionAndRedirectLogin()
        throw err
      })
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

// Request interceptor — attach JWT token to every request
api.interceptors.request.use(config => {
  const token = tokenStore.get()
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// Response interceptor — refresh on 401; only sign out on explicit auth failures
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (
      err.response?.status === 401
      && !original._retry
      && !original.skipAuthRefresh
      && tokenStore.getRefresh()
    ) {
      original._retry = true
      try {
        const data = await refreshAccessToken()
        if (data?.token) {
          original.headers['Authorization'] = `Bearer ${data.token}`
          return api(original)
        }
      } catch {
        return Promise.reject(err)
      }
    }
    const securityCodes = new Set([
      'session_revoked',
      'account_disabled',
      'merchant_service_disabled',
      'must_change_password',
    ])
    const code = err.response?.data?.code
    if (
      (err.response?.status === 401 || err.response?.status === 403 || err.response?.status === 429)
      && securityCodes.has(code)
      && window.location.pathname !== '/login'
      && !window.location.pathname.startsWith('/beta')
    ) {
      clearSessionAndRedirectLogin()
      return Promise.reject(err)
    }
    if (err.response?.status === 503 && err.response?.data?.maintenance) {
      return Promise.reject(err)
    }
    if (
      err.response?.status === 401
      && shouldForceLogout(err)
      && !tokenStore.getRefresh()
      && window.location.pathname !== '/login'
      && !window.location.pathname.startsWith('/beta')
    ) {
      clearSessionAndRedirectLogin()
    }
    return Promise.reject(err)
  }
)

// ── Auth ────────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: (data) => api.post('/auth/refresh', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  forceChangePassword: (data) => api.put('/auth/force-change-password', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPasswordRequest: (data) => api.post('/auth/reset-password-request', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  verifyEmail: (data) => api.post('/auth/verify-email', data),
  signup: (data) => api.post('/auth/signup', data),
  googleAuth: (data) => api.post('/auth/google', data),
  betaGuestEnter: (data) => api.post('/auth/beta-guest', data),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
}

// ── Store team IAM (owner/manager) ──────────────────────────────────
export const teamAPI = {
  getContext: () => api.get('/team/context'),
  getUser: (id) => api.get(`/team/users/${id}`),
  updateUser: (id, data) => api.put(`/team/users/${id}`, data),
  resetPassword: (id, data) => api.post(`/team/users/${id}/reset-password`, data),
  resetDevice: (id, data) => api.post(`/team/users/${id}/reset-device`, data),
  setStatus: (id, data) => api.put(`/team/users/${id}/status`, data),
}

// ── Superadmin platform ─────────────────────────────────────────────
export const adminAPI = {
  getOverview: () => api.get('/admin/overview'),
  getAccessPolicy: () => api.get('/admin/access-policy'),
  updateAccessPolicy: (data) => api.put('/admin/access-policy', data),
  getPlatformModules: () => api.get('/admin/platform-modules'),
  updatePlatformModules: (data) => api.put('/admin/platform-modules', data),
  getMobileRelease: () => api.get('/admin/mobile-release'),
  publishMobileRelease: (data) => api.put('/admin/mobile-release', data),
  getPlatformStatus: () => api.get('/admin/platform-status'),
  getPublicPlatformStatus: () => api.get('/platform-status'),
  getMaintenanceDraft: () => api.get('/admin/maintenance-draft'),
  saveMaintenanceDraft: (data) => api.put('/admin/maintenance-draft', data),
  notifyMaintenance: (data) => api.post('/admin/maintenance-notify', data),
  previewMaintenanceNotify: () => api.get('/admin/maintenance-notify/preview'),
  listUsers: (params) => api.get('/admin/users', { params }),
  getMenuItems: () => api.get('/admin/menu-items'),
  listAccounts: (params) => api.get('/admin/accounts', { params }),
  getUserAccess: (id) => api.get(`/admin/users/${id}`),
  createUser: (data) => api.post('/admin/users', data),
  updateUserAccess: (id, data) => api.put(`/admin/users/${id}`, data),
  resetUserPassword: (id, data) => api.post(`/admin/users/${id}/reset-password`, data),
  resetUserDevice: (id, data) => api.post(`/admin/users/${id}/reset-device`, data),
  setUserStatus: (id, data) => api.put(`/admin/users/${id}/status`, data),
  getAccountAccess: (id) => api.get(`/admin/accounts/${id}/access`),
  updateAccountAccess: (id, data) => api.put(`/admin/accounts/${id}/access`, data),
  exportPlatform: (format = 'csv') => api.get('/admin/export', {
    params: { format },
    responseType: 'blob',
  }),
  getBusinessCategories: () => api.get('/admin/business-categories'),
  updateCategoryModules: (categoryId, data) => api.put(`/admin/business-categories/${categoryId}/modules`, data),
  getTestLab: () => api.get('/admin/test-lab'),
  setTestLabAccount: (accountId) => api.put('/admin/test-lab/account', { account_id: accountId }),
  getLicenseConfig: () => api.get('/admin/licenses/config'),
  issueLicense: (data) => api.post('/admin/licenses/issue', data),
  resolvePremiumRequest: (requestId, data) => api.post(`/admin/premium-requests/${requestId}/resolve`, data),
  setAccountModuleGrants: (accountId, data) => api.put(`/admin/accounts/${accountId}/module-grants`, data),
  getIamActivity: (params) => api.get('/admin/iam-activity', { params }),
  getMenuTemplates: () => api.get('/admin/menu-templates'),
  applyMenuTemplate: (accountId, data) => api.post(`/admin/accounts/${accountId}/apply-menu-template`, data),
}

// ── POS Payments ────────────────────────────────────────────────────
export const paymentsAPI = {
  getMethods: () => api.get('/payments/methods'),
  initiate: (data) => api.post('/payments/initiate', data),
  verify: (data) => api.post('/payments/verify', data),
}

// ── Billing ─────────────────────────────────────────────────────────
export const billingAPI = {
  getPlans: () => api.get('/billing/plans'),
  getStatus: () => api.get('/billing/status'),
  checkout: (data) => api.post('/billing/checkout', data),
  portal: () => api.post('/billing/portal'),
  requestPremiumModule: (data) => api.post('/billing/premium-request', data),
}

// ── Onboarding & Beta ───────────────────────────────────────────────
export const onboardingAPI = {
  getBetaInfo: () => api.get('/onboarding/beta-info'),
  submitBetaInterest: (data) => api.post('/onboarding/beta-interest', data),
  validateBetaEnrollment: (token) => api.get('/onboarding/beta-enrollment', { params: { token } }),
  getChecklist: () => api.get('/onboarding/checklist'),
  completeStep: (stepId) => api.post(`/onboarding/checklist/${stepId}`),
  updateProfile: (data) => api.put('/onboarding/profile', data),
  submitFeedback: (data) => api.post('/onboarding/feedback', data),
  getBetaLeads: () => api.get('/onboarding/beta-leads'),
  updateBetaLead: (id, data) => api.put(`/onboarding/beta-leads/${id}`, data),
}

// ── Hospitality ─────────────────────────────────────────────────────
export const hospitalityAPI = {
  getStatus: () => api.get('/hospitality/status'),
  getDashboard: () => api.get('/hospitality/dashboard'),
  listProperties: () => api.get('/hospitality/properties'),
  createProperty: (data) => api.post('/hospitality/properties', data),
  updateProperty: (id, data) => api.put(`/hospitality/properties/${id}`, data),
  listRooms: (params) => api.get('/hospitality/rooms', { params }),
  createRoom: (data) => api.post('/hospitality/rooms', data),
  updateRoom: (id, data) => api.put(`/hospitality/rooms/${id}`, data),
  setHousekeepingStatus: (roomId, housekeeping_status) =>
    api.put(`/hospitality/rooms/${roomId}/housekeeping`, { housekeeping_status }),
  deleteRoom: (id) => api.delete(`/hospitality/rooms/${id}`),
  checkAvailability: (params) => api.get('/hospitality/availability', { params }),
  listBookings: (params) => api.get('/hospitality/bookings', { params }),
  createBooking: (data) => api.post('/hospitality/bookings', data),
  getBooking: (id) => api.get(`/hospitality/bookings/${id}`),
  cancelBooking: (id, data) => api.post(`/hospitality/bookings/${id}/cancel`, data),
  checkIn: (id) => api.post(`/hospitality/bookings/${id}/check-in`),
  checkOut: (id) => api.post(`/hospitality/bookings/${id}/check-out`),
  listChargeableFolios: () => api.get('/hospitality/folios/chargeable'),
  getFolio: (bookingId) => api.get(`/hospitality/bookings/${bookingId}/folio`),
  settleFolio: (bookingId, data) => api.post(`/hospitality/bookings/${bookingId}/folio/settle`, data),
  listRoomOnBazaar: (roomId, data) => api.post(`/hospitality/rooms/${roomId}/list-on-bazaar`, data),
  uploadFile: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/hospitality/files', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  publicStays: (params) => api.get('/hospitality/public/stays', { params }),
  publicStayQuote: (postId, params) => api.get(`/hospitality/public/rooms/${postId}/quote`, { params }),
  publicStayCalendar: (postId, params) => api.get(`/hospitality/public/rooms/${postId}/calendar`, { params }),
  listRateRules: (params) => api.get('/hospitality/rate-rules', { params }),
  createRateRule: (data) => api.post('/hospitality/rate-rules', data),
  updateRateRule: (id, data) => api.put(`/hospitality/rate-rules/${id}`, data),
  deleteRateRule: (id) => api.delete(`/hospitality/rate-rules/${id}`),
  presetWeekendSurge: (data) => api.post('/hospitality/rate-rules/presets/weekend-surge', data),
  getGmailStatus: () => api.get('/hospitality/gmail/status'),
  connectGmail: () => api.post('/hospitality/gmail/connect'),
  disconnectGmail: () => api.delete('/hospitality/gmail/disconnect'),
  syncGmail: () => api.post('/hospitality/gmail/sync'),
  listImports: (params) => api.get('/hospitality/imports', { params }),
  confirmImport: (id) => api.post(`/hospitality/imports/${id}/confirm`),
  assignImport: (id, data) => api.post(`/hospitality/imports/${id}/assign`, data),
  dismissImport: (id, data) => api.post(`/hospitality/imports/${id}/dismiss`, data),
}

// ── Dashboard ───────────────────────────────────────────────────────
export const dashboardAPI = {
  getBundle: (params) => api.get('/dashboard/bundle', { params }),
  getKPIs: (params) => api.get('/dashboard/kpis', { params }),
  getSalesTrend: (params) => api.get('/dashboard/sales-trend', { params }),
  getTopProducts: (params) => api.get('/dashboard/top-products', { params }),
  getRecentTransactions: (params) => api.get('/dashboard/recent-transactions', { params }),
  getMonthlyRevenue: (params) => api.get('/dashboard/monthly-revenue', { params }),
  getHourlySales: (params) => api.get('/dashboard/hourly-sales', { params }),
  getPaymentBreakdown: (params) => api.get('/dashboard/payment-breakdown', { params }),
  getTopCustomers: (params) => api.get('/dashboard/top-customers', { params }),
}

// ── Notifications ────────────────────────────────────────────────────
export const notificationsAPI = {
  getAll: () => api.get('/notifications/'),
}

// ── Products ────────────────────────────────────────────────────────
export const productsAPI = {
  getAll: (params) => api.get('/products/', { params }),
  getById: (id) => api.get(`/products/${id}`),
  getByBarcode: (barcode) => api.get(`/products/barcode/${barcode}`),
  create: (data) => api.post('/products/', data),
  update: (id, d) => api.put(`/products/${id}`, d),
  delete: (id) => api.delete(`/products/${id}`),
  getCategories: () => api.get('/products/categories'),
  unlistFromBazaar: (id) => api.post(`/products/${id}/unlist-bazaar`),
  createCategory: (data) => api.post('/products/categories', data),
  getSampleCatalog: () => api.get('/products/sample-catalog'),
  createSampleBatch: (data) => api.post('/products/sample-batch', data),
  placeholderImage: (name) => api.get('/products/placeholder-image', { params: { name } }),
}

// ── Inventory ───────────────────────────────────────────────────────
export const inventoryAPI = {
  getMovements: (params) => api.get('/inventory/movements', { params }),
  adjustStock: (data) => api.post('/inventory/adjust', data),
  getLowStock: () => api.get('/inventory/low-stock'),
  getValuation: () => api.get('/inventory/valuation'),
  getPurchases: () => api.get('/inventory/purchases'),
  createPurchase: (data) => api.post('/inventory/purchases', data),
}

// ── Sales ───────────────────────────────────────────────────────────
export const salesAPI = {
  getAll: (params) => api.get('/sales/', { params }),
  getById: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales/', data),
  void: (id) => api.put(`/sales/${id}/void`),
  refund: (id, d) => api.put(`/sales/${id}/refund`, d),
  emailReceipt: (id, d) => api.post(`/sales/${id}/email-receipt`, d),
}

// ── Customers ───────────────────────────────────────────────────────
export const customersAPI = {
  getAll: (params) => api.get('/customers/', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers/', data),
  update: (id, d) => api.put(`/customers/${id}`, d),
  delete: (id) => api.delete(`/customers/${id}`),
  getTiers: () => api.get('/customers/tiers'),
  getMemberStats: () => api.get('/customers/membership-stats'),
  adjustPoints: (id, d) => api.post(`/customers/${id}/adjust-points`, d),
  getPointHistory: (id) => api.get(`/customers/${id}/point-history`),
}

// ── Suppliers ───────────────────────────────────────────────────────
export const suppliersAPI = {
  getAll: () => api.get('/suppliers/'),
  create: (data) => api.post('/suppliers/', data),
  update: (id, d) => api.put(`/suppliers/${id}`, d),
  delete: (id) => api.delete(`/suppliers/${id}`),
}

// ── Reports ─────────────────────────────────────────────────────────
export const reportsAPI = {
  daily: (params) => api.get('/reports/daily', { params }),
  summary: (params) => api.get('/reports/summary', { params }),
  inventory: () => api.get('/reports/inventory'),
  products: (params) => api.get('/reports/products', { params }),
  staff: (params) => api.get('/reports/staff', { params }),
  exportCSV: (params) => api.get('/reports/export/csv', { params, responseType: 'blob' }),
  exportXLSX: (params) => api.get('/reports/export/xlsx', { params, responseType: 'blob' }),
}

// ── Audit Logs ─────────────────────────────────────────────────────
export const auditAPI = {
  getLogs: (params) => api.get('/audit/', { params }),
}

// ── Finance ─────────────────────────────────────────────────────────
export const financeAPI = {
  getExpenses: () => api.get('/finance/expenses'),
  createExpense: (data) => api.post('/finance/expenses', data),
  updateExpense: (id, d) => api.put(`/finance/expenses/${id}`, d),
  deleteExpense: (id) => api.delete(`/finance/expenses/${id}`),
  getSummary: (params) => api.get('/finance/summary', { params }),
}

// ── Settings ────────────────────────────────────────────────────────
export const licenseAPI = {
  getStatus: () => api.get('/license/status'),
  activate: (key) => api.post('/license/activate', { key }),
  deactivate: () => api.post('/license/deactivate'),
}

export const settingsAPI = {
  getAll: () => api.get('/settings/'),
  update: (data) => api.put('/settings/', data),
  backup: () => api.get('/settings/backup'),
  backupStatus: () => api.get('/settings/backup/status'),
  backupDownload: () => api.get('/settings/backup/download', { responseType: 'blob' }),
  backupEmail: (email) => api.post('/settings/backup/email', email ? { email } : {}),
  uploadLogo: (logo) => api.post('/settings/logo', { logo }),
  getVersion: () => api.get('/settings/version'),
  checkUpdate: () => api.get('/settings/update/check'),
  applyUpdate: (data) => api.post('/settings/update/apply', data),
  getUpdateLog: () => api.get('/settings/update/log'),
  gdriveStatus: () => api.get('/settings/gdrive/status'),
  gdriveAuth: () => api.get('/settings/gdrive/auth'),
  gdriveDisconnect: () => api.post('/settings/gdrive/disconnect'),
  gdriveUploadCreds: (c) => api.post('/settings/gdrive/upload-credentials', { credentials: c }),
  gdriveBackup: () => api.post('/settings/gdrive/backup'),
}

// ── AI Assistant ─────────────────────────────────────────────────────
export const aiAPI = {
  getInsights: () => api.get('/ai/insights'),
  chat: (data) => api.post('/ai/chat', data),
}

// ── Health check ─────────────────────────────────────────────────────
export const healthAPI = {
  check: () => api.get('/health'),
}

export const mobileReleaseAPI = {
  get: () => api.get('/mobile-release'),
}

// ── DGC Bazaar — cross-store product listings (API: /marketplace) ─────
export const marketplaceAPI = {
  list: (params) => api.get('/marketplace/', { params }),
  get: (id) => api.get(`/marketplace/${id}`),
  create: (data) => api.post('/marketplace/', data),
  listFromProduct: (productId) => api.post(`/marketplace/from-product/${productId}`),
  listFromProductWithImage: (productId, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/marketplace/from-product/${productId}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  createWithImage: (file, body, extraFiles = []) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', body.title || '')
    if (body.description) fd.append('description', body.description)
    fd.append('price', String(body.price ?? 0))
    fd.append('visibility', body.visibility || 'public')
    if (body.bazaar_category) fd.append('bazaar_category', body.bazaar_category)
    if (body.product_id) fd.append('product_id', String(body.product_id))
    extraFiles.forEach((ef) => {
      if (ef) fd.append('extra_files', ef)
    })
    return api.post('/marketplace/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  remove: (id) => api.delete(`/marketplace/${id}`),
  toggleLike: (id) => api.post(`/marketplace/${id}/like`),
  placeOrder: (id, data) => api.post(`/marketplace/${id}/order`, data),
  listOrders: (params) => api.get('/marketplace/orders', { params }),
  updateOrderStatus: (id, data) => api.put(`/marketplace/orders/${id}/status`, data),
  publicFeed: (params) => api.get('/marketplace/public', { params }),
  fetchImage: (fileUrl) => {
    const path = (fileUrl || '').replace(/^\/api/, '')
    return api.get(path, { responseType: 'blob' })
  },
}

// ── DGC Bazaar — paid ad slots ─────────────────────────────────────────
export const bazaarAdsAPI = {
  packages: () => api.get('/marketplace/ads/packages'),
  public: () => api.get('/marketplace/ads/public'),
  mine: () => api.get('/marketplace/ads/mine'),
  pending: () => api.get('/marketplace/ads/pending'),
  create: (file, body) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', body.title || '')
    if (body.subtitle) fd.append('subtitle', body.subtitle)
    if (body.link_url) fd.append('link_url', body.link_url)
    fd.append('slot_type', body.slot_type || 'inline')
    fd.append('package', body.package || 'weekly')
    return api.post('/marketplace/ads/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  submit: (id, data) => api.post(`/marketplace/ads/${id}/submit`, data),
  paymentComplete: (id, data) => api.post(`/marketplace/ads/${id}/payment-complete`, data),
  approve: (id) => api.put(`/marketplace/ads/${id}/approve`),
  reject: (id, data) => api.put(`/marketplace/ads/${id}/reject`, data),
  remove: (id) => api.delete(`/marketplace/ads/${id}`),
  adminAll: (params) => api.get('/marketplace/ads/admin/all', { params }),
  adminPublish: (files, body) => {
    const fd = new FormData()
    const list = Array.isArray(files) ? files : [files].filter(Boolean)
    list.forEach((f) => fd.append('files', f))
    if (list[0]) fd.append('file', list[0])
    fd.append('title', body.title || '')
    if (body.subtitle) fd.append('subtitle', body.subtitle)
    if (body.link_url) fd.append('link_url', body.link_url)
    fd.append('slot_type', body.slot_type || 'top_carousel')
    fd.append('days', String(body.days || 30))
    return api.post('/marketplace/ads/admin/publish', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  adminDeactivate: (id) => api.put(`/marketplace/ads/admin/${id}/deactivate`),
}

// ── Payables — rent, salary, utilities (paid / due) ──────────────────
export const payablesAPI = {
  list: (params) => api.get('/payables/', { params }),
  create: (data) => api.post('/payables/', data),
  update: (id, data) => api.put(`/payables/${id}`, data),
  markPaid: (id, data) => api.post(`/payables/${id}/mark-paid`, data),
  remove: (id) => api.delete(`/payables/${id}`),
  getRecurring: () => api.get('/payables/recurring'),
  saveRecurring: (data) => api.put('/payables/recurring', data),
}

// ── DSR — Daily Sales Register ───────────────────────────────────────
export const dsrAPI = {
  // daily sales entries
  getSales: (month, year) => api.get('/dsr/sales', { params: { month, year } }),
  addSale: (data) => api.post('/dsr/sales', data),
  updateSale: (id, data) => api.put(`/dsr/sales/${id}`, data),
  deleteSale: (id) => api.delete(`/dsr/sales/${id}`),
  // wholesale purchases
  getPurchases: (month, year) => api.get('/dsr/purchases', { params: { month, year } }),
  addPurchase: (data) => api.post('/dsr/purchases', data),
  deletePurchase: (id) => api.delete(`/dsr/purchases/${id}`),
  // fixed costs
  getFixedCosts: (month, year) => api.get('/dsr/fixed-costs', { params: { month, year } }),
  addFixedCost: (data) => api.post('/dsr/fixed-costs', data),
  deleteFixedCost: (id) => api.delete(`/dsr/fixed-costs/${id}`),
  // monthly P&L
  getPLReport: (month, year) => api.get('/dsr/pl-report', { params: { month, year } }),
}

// ── Cashier Sessions ─────────────────────────────────────────────────────────
export const cashierSessionsAPI = {
  getActive: () => api.get('/cashier-sessions/active'),
  open: (data) => api.post('/cashier-sessions/open', data),
  close: (id, d) => api.put(`/cashier-sessions/${id}/close`, d),
  getAll: (params) => api.get('/cashier-sessions/', { params }),
}

// ── Product Variants ──────────────────────────────────────────────────────────
export const variantsAPI = {
  list: (productId) => api.get(`/variants/${productId}`),
  create: (productId, d) => api.post(`/variants/${productId}`, d),
  update: (vid, d) => api.put(`/variants/item/${vid}`, d),
  remove: (vid) => api.delete(`/variants/item/${vid}`),
  byBarcode: (barcode) => api.get(`/variants/by-barcode/${barcode}`),
}

// ── Purchase Orders ───────────────────────────────────────────────────────────
export const purchaseOrdersAPI = {
  getAll: (params) => api.get('/purchase-orders/', { params }),
  getById: (id) => api.get(`/purchase-orders/${id}`),
  create: (data) => api.post('/purchase-orders/', data),
  update: (id, d) => api.put(`/purchase-orders/${id}`, d),
  send: (id) => api.put(`/purchase-orders/${id}/send`),
  receive: (id, d) => api.put(`/purchase-orders/${id}/receive`, d),
  cancel: (id) => api.put(`/purchase-orders/${id}/cancel`),
}

// ── Promotions ────────────────────────────────────────────────────────────────
export const promotionsAPI = {
  getAll: (params) => api.get('/promotions/', { params }),
  getActive: () => api.get('/promotions/active'),
  create: (data) => api.post('/promotions/', data),
  update: (id, d) => api.put(`/promotions/${id}`, d),
  remove: (id) => api.delete(`/promotions/${id}`),
  apply: (data) => api.post('/promotions/apply', data),
}

// ── Gift Cards ────────────────────────────────────────────────────────────────
export const giftCardsAPI = {
  getAll: (params) => api.get('/gift-cards/', { params }),
  issue: (data) => api.post('/gift-cards/', data),
  lookup: (code) => api.get(`/gift-cards/lookup/${code}`),
  redeem: (id, d) => api.put(`/gift-cards/${id}/redeem`, d),
  void: (id) => api.put(`/gift-cards/${id}/void`),
}

// ── Staff Targets ─────────────────────────────────────────────────────────────
export const staffTargetsAPI = {
  list: (params) => api.get('/staff-targets/', { params }),
  set: (data) => api.post('/staff-targets/', data),
  remove: (id) => api.delete(`/staff-targets/${id}`),
  leaderboard: (params) => api.get('/staff-targets/leaderboard', { params }),
}

// ── Inventory (stock take) ────────────────────────────────────────────────────
export const stockTakeAPI = {
  getProducts: () => api.get('/inventory/stock-take'),
  submit: (data) => api.post('/inventory/stock-take', data),
}

// ── Returns ───────────────────────────────────────────────────────────────────
export const returnsAPI = {
  getAll: (params) => api.get('/returns/', { params }),
  eligible: (saleId) => api.get(`/returns/eligible/${saleId}`),
  create: (data) => api.post('/returns/', data),
}

// ── Layaway ───────────────────────────────────────────────────────────────────
export const layawayAPI = {
  getAll: (params) => api.get('/layaway/', { params }),
  getById: (id) => api.get(`/layaway/${id}`),
  create: (data) => api.post('/layaway/', data),
  addPayment: (id, d) => api.post(`/layaway/${id}/payment`, d),
  cancel: (id, d) => api.put(`/layaway/${id}/cancel`, d),
}

// ── Bulk Import ───────────────────────────────────────────────────────────────
export const bulkImportAPI = {
  importProducts: (file, storeType) => {
    const fd = new FormData()
    fd.append('file', file)
    if (storeType) fd.append('store_type', storeType)
    return api.post('/import/products', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  previewImport: (file, storeType) => {
    const fd = new FormData()
    fd.append('file', file)
    if (storeType) fd.append('store_type', storeType)
    return api.post('/import/products/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  getStoreTypes: () => api.get('/import/store-types'),
  getTemplate: () => api.get('/import/products/template', { responseType: 'blob' }),
  importRows: (rows, storeType) => api.post('/import/products/rows', {
    rows,
    ...(storeType ? { store_type: storeType } : {}),
  }),
}

// ── Alterations ───────────────────────────────────────────────────────────────
export const alterationsAPI = {
  getAll: (params) => api.get('/alterations/', { params }),
  create: (data) => api.post('/alterations/', data),
  getById: (id) => api.get(`/alterations/${id}`),
  update: (id, d) => api.put(`/alterations/${id}`, d),
  updateStatus: (id, s) => api.put(`/alterations/${id}/status`, { status: s }),
}

// ── Deliveries ────────────────────────────────────────────────────────────────
export const deliveriesAPI = {
  getAll: (params) => api.get('/deliveries/', { params }),
  create: (data) => api.post('/deliveries/', data),
  getById: (id) => api.get(`/deliveries/${id}`),
  update: (id, d) => api.put(`/deliveries/${id}`, d),
  updateStatus: (id, d) => api.put(`/deliveries/${id}/status`, d),
}

// ── Platform Support Chat (seller ↔ superadmin) ─────────────────────────────
export const supportChatAPI = {
  getConfig: () => api.get('/support/config'),
  getThread: (since) => api.get('/support/thread', { params: since ? { since } : {} }),
  sendMessage: (data) => api.post('/support/thread/messages', data),
  setCallEnabled: (call_enabled) => api.put('/support/call', { call_enabled }),
  listThreads: () => api.get('/support/threads'),
  getMessages: (threadId, since) =>
    api.get(`/support/threads/${threadId}/messages`, { params: since ? { since } : {} }),
  reply: (threadId, data) => api.post(`/support/threads/${threadId}/messages`, data),
  setThreadStatus: (threadId, status) => api.put(`/support/threads/${threadId}/status`, { status }),
}

// ── DC Messenger ──────────────────────────────────────────────────────────────
export const messengerAPI = {
  lookup: (params) => api.get('/messenger/lookup', { params }),
  getThreads: () => api.get('/messenger/threads'),
  createThread: (data) => api.post('/messenger/threads', data),
  getMessages: (threadId, since) =>
    api.get(`/messenger/threads/${threadId}/messages`, { params: since ? { since } : {} }),
  sendMessage: (threadId, data) => api.post(`/messenger/threads/${threadId}/messages`, data),
  uploadFile: (threadId, file, caption, meta = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    if (caption) fd.append('caption', caption)
    if (meta.is_e2ee) {
      fd.append('is_e2ee', 'true')
      if (meta.original_name) fd.append('original_name', meta.original_name)
      if (meta.original_mime) fd.append('original_mime', meta.original_mime)
    }
    return api.post(`/messenger/threads/${threadId}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  updateOrderStatus: (msgId, status) =>
    api.put(`/messenger/messages/${msgId}/order-status`, { status }),
  simulateReply: (data) => api.post('/messenger/simulate-contact-reply', data),
  getE2EEBackupStatus: () => api.get('/messenger/e2ee/backup'),
  getE2EEBackupFull: () => api.get('/messenger/e2ee/backup', { params: { full: '1' } }),
  saveE2EEBackup: (data) => api.post('/messenger/e2ee/backup', data),
  deleteE2EEBackup: () => api.delete('/messenger/e2ee/backup'),
  fetchFile: (fileUrl) => {
    const path = (fileUrl || '').replace(/^\/api/, '')
    return api.get(path, { responseType: 'blob' })
  },
}

export default api
