/**
 * Runtime edition from /api/license/status (self-hosted Community + license key).
 */
import { IS_COMMUNITY } from './index'

let runtime = {
  loaded: false,
  licensed: false,
  edition: null,
}

export function setRuntimeEdition(payload = {}) {
  runtime = {
    loaded: true,
    licensed: !!payload.licensed,
    edition: payload.edition || null,
  }
}

export function isRuntimeEnterprise() {
  if (!IS_COMMUNITY) return true
  return runtime.licensed && runtime.edition === 'enterprise'
}

export function getRuntimeEditionState() {
  return { ...runtime }
}