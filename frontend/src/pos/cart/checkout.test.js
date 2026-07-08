import { describe, it, expect } from 'vitest'
import {
  canOpenCheckout,
  buildSalePayload,
  buildOfflineReceipt,
  isDiscountBlocked,
} from './checkout'
import { POS_MAX_DISCOUNT_PCT } from './constants'

const cart = [
  { product_id: 1, variant_id: 2, qty: 1, unit_price: 120, total: 120, discount: 0, max_qty: 5, product_name: 'Item' },
]

describe('checkout', () => {
  it('blocks checkout when cart empty or discount too high', () => {
    expect(canOpenCheckout([], '0')).toEqual({ ok: false, reason: 'empty' })
    expect(canOpenCheckout(cart, String(POS_MAX_DISCOUNT_PCT + 1))).toEqual({ ok: false, reason: 'discount_exceeded' })
    expect(canOpenCheckout(cart, '5')).toEqual({ ok: true })
  })

  it('builds sale payload with variant_id and folio', () => {
    const payload = buildSalePayload({
      cart,
      customer: { id: 9 },
      discPct: 0,
      taxPct: 0,
      redeemPoints: 0,
      payment: 'cash',
      folioBookingId: 42,
      totals: { subtotal: 120, discAmt: 0, taxAmt: 0, gcDiscount: 0, total: 120 },
    })
    expect(payload.items[0].variant_id).toBe(2)
    expect(payload.customer_id).toBe(9)
    expect(payload.folio_booking_id).toBe(42)
  })

  it('builds offline receipt snapshot', () => {
    const receipt = buildOfflineReceipt({
      cart,
      customer: { name: 'Alex' },
      discPct: 10,
      taxPct: 0,
      payment: 'cash',
      totals: { subtotal: 120, discAmt: 12, taxAmt: 0, gcDiscount: 0, total: 108 },
    })
    expect(receipt.offline).toBe(true)
    expect(receipt.customer_name).toBe('Alex')
    expect(receipt.total).toBe(108)
    expect(receipt.items).toHaveLength(1)
  })

  it('detects blocked discount', () => {
    expect(isDiscountBlocked('0')).toBe(false)
    expect(isDiscountBlocked(String(POS_MAX_DISCOUNT_PCT + 0.1))).toBe(true)
  })
})