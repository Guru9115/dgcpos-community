import { safeCartNum } from './math'
import { normalizeCart } from './lineItems'

/**
 * Pure cart totals — mirrors POS checkout math (NaN-safe).
 */
export function computeCartTotals(cart, opts = {}) {
  const items = normalizeCart(cart)
  const {
    discPct = '',
    taxPct = '',
    promoDiscount = 0,
    redeemPoints = 0,
    pointsRate = 1,
    appliedGC = null,
  } = opts

  const subtotal = items.reduce((a, i) => a + safeCartNum(i.total), 0)
  const dPct = safeCartNum(discPct)
  const rawDisc = subtotal * (dPct / 100) + safeCartNum(promoDiscount)
  const discAmt = Math.min(Math.max(0, rawDisc), Math.max(0, subtotal))
  const tPct = safeCartNum(taxPct)
  const taxAmt = (subtotal - discAmt) * (tPct / 100)
  const rate = safeCartNum(pointsRate) || 1
  const redeemValue = Math.min(
    safeCartNum(redeemPoints) * rate,
    Math.max(0, subtotal - discAmt + taxAmt),
  )
  const maxOtherDeduct = Math.max(0, subtotal - discAmt + taxAmt - redeemValue)
  const gcDiscount = appliedGC
    ? Math.min(safeCartNum(appliedGC.redeemAmt), maxOtherDeduct)
    : 0
  const total = Math.max(0, subtotal - discAmt + taxAmt - redeemValue - gcDiscount)

  return {
    subtotal,
    discAmt,
    taxAmt,
    redeemValue,
    gcDiscount,
    total,
    maxOtherDeduct,
    itemCount: items.length,
  }
}