import { describe, it, expect } from 'vitest'
import {
  validateHeldSale,
  loadHeldSales,
  saveHeldSales,
  createHeldSaleSnapshot,
} from './heldSales'

describe('heldSales persistence', () => {
  const storage = {
    store: {},
    getItem(k) { return this.store[k] ?? null },
    setItem(k, v) { this.store[k] = v },
    removeItem(k) { delete this.store[k] },
  }

  it('rejects invalid held sale payloads', () => {
    expect(validateHeldSale(null)).toBeNull()
    expect(validateHeldSale({ cart: [] })).toBeNull()
    expect(validateHeldSale({ cart: [{ product_id: 1, qty: 1, unit_price: 10, total: 10 }] })).toBeTruthy()
  })

  it('round-trips held sales through storage', () => {
    const snapshot = createHeldSaleSnapshot({
      cart: [{ product_id: 3, qty: 2, unit_price: 40, total: 80, max_qty: 10 }],
      customer: { id: 1, name: 'Sam' },
      discPct: '5',
      taxPct: '13',
      promoCode: 'SAVE',
      promoDiscount: 10,
      appliedPromo: { name: 'SAVE' },
    })
    saveHeldSales([snapshot], storage)
    const loaded = loadHeldSales(storage)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].cart[0].qty).toBe(2)
    expect(loaded[0].customer.name).toBe('Sam')
  })
})