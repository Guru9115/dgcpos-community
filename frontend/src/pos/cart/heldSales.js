import { HELD_SALES_KEY, MAX_HELD_SALES } from './constants'
import { normalizeCart } from './lineItems'
import { asArray } from './math'

export function validateHeldSale(raw) {
  if (!raw || typeof raw !== 'object') return null
  const cart = normalizeCart(raw.cart)
  if (!cart.length) return null
  return {
    id: Number(raw.id) || Date.now(),
    cart,
    customer: raw.customer && typeof raw.customer === 'object' ? raw.customer : null,
    discPct: raw.discPct ?? '',
    taxPct: raw.taxPct ?? '',
    promoCode: raw.promoCode ?? '',
    promoDiscount: Number(raw.promoDiscount) || 0,
    appliedPromo: raw.appliedPromo ?? null,
    heldAt: typeof raw.heldAt === 'string' ? raw.heldAt : new Date().toISOString(),
  }
}

export function loadHeldSales(storage = localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(HELD_SALES_KEY) || '[]')
    return asArray(raw).map(validateHeldSale).filter(Boolean).slice(0, MAX_HELD_SALES)
  } catch {
    return []
  }
}

export function saveHeldSales(sales, storage = localStorage) {
  const valid = asArray(sales).map(validateHeldSale).filter(Boolean).slice(0, MAX_HELD_SALES)
  storage.setItem(HELD_SALES_KEY, JSON.stringify(valid))
  return valid
}

export function createHeldSaleSnapshot(state) {
  const {
    cart,
    customer,
    discPct,
    taxPct,
    promoCode,
    promoDiscount,
    appliedPromo,
  } = state
  const normalized = normalizeCart(cart)
  if (!normalized.length) return null
  return validateHeldSale({
    id: Date.now(),
    cart: normalized,
    customer,
    discPct,
    taxPct,
    promoCode,
    promoDiscount,
    appliedPromo,
    heldAt: new Date().toISOString(),
  })
}