/**
 * DGCPOS edition — Community vs Enterprise (Phase P1).
 * Community repo defaults to community; set VITE_DGCPOS_EDITION=enterprise only for licensed EE builds.
 */
import { isRuntimeEnterprise } from './runtime'

export const EDITION = (import.meta.env.VITE_DGCPOS_EDITION || 'community').toLowerCase()
export const IS_ENTERPRISE = EDITION !== 'community'
export const IS_COMMUNITY = EDITION === 'community'

/** Route path prefixes hidden in Community Edition builds */
export const EE_ROUTE_PREFIXES = [
  '/assistant',
  '/payables',
  '/bazaar-ai',
  '/inventory-scan',
  '/chat',
  '/support',
  '/tools',
  '/call',
  '/updates',
  '/hotel',
  '/gift-cards',
  '/staff-targets',
  '/admin',
  '/beta-leads',
]

export function isEnterprise() {
  return IS_ENTERPRISE
}

export function isCommunity() {
  return IS_COMMUNITY
}

export function isNavPathEnabled(path) {
  if (!path || IS_ENTERPRISE || isRuntimeEnterprise()) return true
  const normalized = path.split('?')[0]
  return !EE_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  )
}

export function editionLabel() {
  return IS_ENTERPRISE ? 'Enterprise' : 'Community'
}