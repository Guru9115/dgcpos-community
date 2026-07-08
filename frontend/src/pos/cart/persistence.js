import { CART_DRAFT_KEY, CART_DRAFT_VERSION } from './constants'
import { normalizeCart } from './lineItems'
import { asArray } from './math'

export function validateCartDraft(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.v !== CART_DRAFT_VERSION) return null
  const cart = normalizeCart(raw.cart)
  if (!cart.length) return null
  return {
    cart,
    discPct: raw.discPct ?? '',
    taxPct: raw.taxPct ?? '',
    promoCode: raw.promoCode ?? '',
    promoDiscount: Number(raw.promoDiscount) || 0,
    savedAt: raw.savedAt || null,
  }
}

export function loadCartDraft(storage = sessionStorage) {
  try {
    const raw = JSON.parse(storage.getItem(CART_DRAFT_KEY) || 'null')
    return validateCartDraft(raw)
  } catch {
    return null
  }
}

export function saveCartDraft(state, storage = sessionStorage) {
  const cart = normalizeCart(state.cart)
  if (!cart.length) {
    storage.removeItem(CART_DRAFT_KEY)
    return null
  }
  const draft = {
    v: CART_DRAFT_VERSION,
    cart,
    discPct: state.discPct ?? '',
    taxPct: state.taxPct ?? '',
    promoCode: state.promoCode ?? '',
    promoDiscount: state.promoDiscount ?? 0,
    savedAt: new Date().toISOString(),
  }
  storage.setItem(CART_DRAFT_KEY, JSON.stringify(draft))
  return draft
}

export function clearCartDraft(storage = sessionStorage) {
  storage.removeItem(CART_DRAFT_KEY)
}