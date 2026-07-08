import { POS_MAX_DISCOUNT_PCT } from './constants'
import { normalizeCart } from './lineItems'
import { safeCartNum } from './math'
import { computeCartTotals } from './totals'

export function getDiscountPct(discPct) {
  return safeCartNum(discPct)
}

export function isDiscountBlocked(discPct) {
  return getDiscountPct(discPct) > POS_MAX_DISCOUNT_PCT
}

export function canOpenCheckout(cart, discPct) {
  const items = normalizeCart(cart)
  if (!items.length) return { ok: false, reason: 'empty' }
  if (isDiscountBlocked(discPct)) return { ok: false, reason: 'discount_exceeded' }
  return { ok: true }
}

export function buildSalePayload({
  cart,
  customer,
  discPct,
  taxPct,
  redeemPoints,
  payment,
  amtPaid,
  chosenMethod,
  chosenAmt,
  folioBookingId,
  totals,
}) {
  const items = normalizeCart(cart)
  const t = totals || computeCartTotals(items, { discPct, taxPct, redeemPoints })
  const method = chosenMethod || payment
  const paid = chosenAmt != null ? chosenAmt : (amtPaid != null ? amtPaid : t.total)

  return {
    items: items.map((i) => ({
      product_id: i.product_id,
      variant_id: i.variant_id || null,
      qty: safeCartNum(i.qty),
      unit_price: safeCartNum(i.unit_price),
      discount: safeCartNum(i.discount),
    })),
    customer_id: customer?.id || null,
    discount_pct: safeCartNum(discPct),
    discount_amount: Math.min(
      Math.max(0, safeCartNum(t.discAmt) + safeCartNum(t.gcDiscount)),
      Math.max(0, t.subtotal),
    ),
    tax_pct: safeCartNum(taxPct),
    redeem_points: Math.max(0, Math.floor(safeCartNum(redeemPoints))),
    payment_method: method,
    amount_paid: Math.max(0, safeCartNum(paid)),
    ...(folioBookingId ? { folio_booking_id: folioBookingId } : {}),
  }
}

export function buildOfflineReceipt({
  cart,
  customer,
  discPct,
  taxPct,
  totals,
  payment,
  chosenMethod,
}) {
  const items = normalizeCart(cart)
  const t = totals || computeCartTotals(items, { discPct, taxPct })
  const discAmt = Math.min(
    Math.max(0, safeCartNum(t.discAmt) + safeCartNum(t.gcDiscount)),
    Math.max(0, t.subtotal),
  )

  return {
    offline: true,
    invoice_number: `OFFLINE-${Date.now()}`,
    sale_date: new Date().toISOString(),
    customer_name: customer?.name || 'Walk-in',
    subtotal: t.subtotal,
    discount_amount: discAmt,
    discount_pct: safeCartNum(discPct),
    tax_amount: t.taxAmt || 0,
    tax_pct: safeCartNum(taxPct),
    total: t.total,
    amount_paid: t.total,
    payment_method: chosenMethod || payment,
    change_amount: 0,
    items: items.map((i) => ({
      product_name: i.product_name,
      sku: i.sku || '',
      qty: safeCartNum(i.qty),
      unit_price: safeCartNum(i.unit_price),
      total: safeCartNum(i.total),
      discount: safeCartNum(i.discount),
    })),
  }
}