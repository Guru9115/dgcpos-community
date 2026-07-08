import { describe, it, expect } from 'vitest'
import { validateCartDraft, saveCartDraft, loadCartDraft, clearCartDraft } from './persistence'
import { CART_DRAFT_VERSION } from './constants'

describe('cart draft persistence', () => {
  const storage = {
    store: {},
    getItem(k) { return this.store[k] ?? null },
    setItem(k, v) { this.store[k] = v },
    removeItem(k) { delete this.store[k] },
  }

  it('validates draft schema version', () => {
    expect(validateCartDraft({ v: 999, cart: [{ product_id: 1, qty: 1, unit_price: 1, total: 1 }] })).toBeNull()
    expect(validateCartDraft({
      v: CART_DRAFT_VERSION,
      cart: [{ product_id: 2, qty: 1, unit_price: 99, total: 99, max_qty: 3 }],
    })).toBeTruthy()
  })

  it('saves and restores session cart draft', () => {
    saveCartDraft({
      cart: [{ product_id: 7, qty: 1, unit_price: 15, total: 15, max_qty: 2 }],
      discPct: '0',
      taxPct: '13',
      promoCode: '',
      promoDiscount: 0,
    }, storage)
    const draft = loadCartDraft(storage)
    expect(draft.cart).toHaveLength(1)
    expect(draft.taxPct).toBe('13')
    clearCartDraft(storage)
    expect(loadCartDraft(storage)).toBeNull()
  })
})