import { describe, it, expect } from 'vitest'
import {
  cartItemKey,
  normalizeCart,
  normalizeCartItem,
  buildLineItemFromProduct,
} from './lineItems'
import { addItemToCart, updateCartQty, removeCartItem } from './cartReducer'

describe('lineItems', () => {
  it('normalizes malformed held-sale lines', () => {
    const items = normalizeCart([
      { product_id: 1, product_name: null, qty: '2', unit_price: '100', total: null },
      { product_id: null, qty: 1 },
    ])
    expect(items).toHaveLength(1)
    expect(items[0].product_name).toBe('Item')
    expect(items[0].qty).toBe(2)
    expect(items[0].total).toBe(200)
  })

  it('uses variant-safe react keys', () => {
    const a = { product_id: 5, variant_id: 1 }
    const b = { product_id: 5, variant_id: 2 }
    expect(cartItemKey(a)).toBe('5:1')
    expect(cartItemKey(b)).toBe('5:2')
    expect(cartItemKey(a)).not.toBe(cartItemKey(b))
  })

  it('builds variant line items with label', () => {
    const line = buildLineItemFromProduct(
      { id: 10, name: 'Shirt', selling_price: 500, cost_price: 200, stock_qty: 0 },
      { id: 3, size: 'M', color: 'Blue', selling_price: 550, stock_qty: 4, sku: 'SH-M' },
    )
    expect(line.product_name).toContain('Shirt')
    expect(line.product_name).toContain('M / Blue')
    expect(line.max_qty).toBe(4)
  })
})

describe('cartReducer', () => {
  const product = { id: 1, name: 'Tea', selling_price: 50, cost_price: 20, stock_qty: 10 }

  it('adds and increments quantity', () => {
    const first = addItemToCart([], product)
    expect(first.cart).toHaveLength(1)
    const second = addItemToCart(first.cart, product)
    expect(second.cart[0].qty).toBe(2)
  })

  it('blocks add when out of stock', () => {
    const out = addItemToCart([], { ...product, stock_qty: 0 })
    expect(out.error).toBe('out_of_stock')
  })

  it('updates qty and removes at zero', () => {
    const { cart } = addItemToCart([], product)
    const bumped = updateCartQty(cart, 1, 2)
    expect(bumped[0].qty).toBe(3)
    const cleared = updateCartQty(bumped, 1, -3)
    expect(cleared).toHaveLength(0)
  })

  it('removes variant line without touching base product', () => {
    const variantLine = normalizeCartItem({
      product_id: 1,
      variant_id: 9,
      product_name: 'Tea · Large',
      qty: 1,
      unit_price: 60,
      total: 60,
      max_qty: 5,
    })
    const baseLine = buildLineItemFromProduct(product)
    const cart = [baseLine, variantLine]
    const next = removeCartItem(cart, 1, 9)
    expect(next).toHaveLength(1)
    expect(next[0].variant_id).toBeNull()
  })
})