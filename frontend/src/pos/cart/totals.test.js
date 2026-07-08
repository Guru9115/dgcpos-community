import { describe, it, expect } from 'vitest'
import { computeCartTotals } from './totals'

const sampleCart = [
  { product_id: 1, qty: 2, unit_price: 100, total: 200, discount: 0, max_qty: 10 },
  { product_id: 2, variant_id: 4, qty: 1, unit_price: 50, total: 50, discount: 0, max_qty: 5 },
]

describe('computeCartTotals', () => {
  it('calculates subtotal from line totals', () => {
    const t = computeCartTotals(sampleCart)
    expect(t.subtotal).toBe(250)
    expect(t.total).toBe(250)
  })

  it('applies percent discount, tax, points, and gift card in order', () => {
    const t = computeCartTotals(sampleCart, {
      discPct: 10,
      taxPct: 13,
      redeemPoints: 20,
      pointsRate: 1,
      appliedGC: { redeemAmt: 30 },
    })
    expect(t.discAmt).toBe(25)
    expect(t.taxAmt).toBeCloseTo(29.25)
    expect(t.redeemValue).toBe(20)
    expect(t.gcDiscount).toBe(30)
    expect(t.total).toBeCloseTo(204.25)
  })

  it('clamps promo + percent discount to subtotal', () => {
    const t = computeCartTotals(sampleCart, { discPct: 50, promoDiscount: 200 })
    expect(t.discAmt).toBe(250)
    expect(t.total).toBe(0)
  })
})