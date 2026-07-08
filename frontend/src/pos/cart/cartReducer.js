import { buildLineItemFromProduct, lineMatchKey, normalizeCart, recalcLineTotal } from './lineItems'
import { safeCartNum } from './math'

export const CartActionType = {
  ADD: 'ADD',
  UPDATE_QTY: 'UPDATE_QTY',
  REMOVE: 'REMOVE',
  CLEAR: 'CLEAR',
  SET: 'SET',
}

/**
 * @returns {{ cart: object[], error?: string, atMax?: boolean }}
 */
export function addItemToCart(cart, product, variant = null) {
  const isVariant = !!variant
  const stock = isVariant ? variant.stock_qty : product.stock_qty
  if (safeCartNum(stock) <= 0) {
    return { cart: normalizeCart(cart), error: 'out_of_stock' }
  }

  const cartKey = isVariant ? `${product.id}:${variant.id}` : product.id
  const items = normalizeCart(cart)
  const existing = items.find((i) => lineMatchKey(i) === cartKey)

  if (existing) {
    if (existing.qty >= stock) {
      return { cart: items, error: 'max_stock', atMax: true }
    }
    return {
      cart: items.map((i) => {
        if (lineMatchKey(i) !== cartKey) return i
        return recalcLineTotal(i, i.qty + 1)
      }),
    }
  }

  const line = buildLineItemFromProduct(product, variant)
  if (!line) return { cart: items, error: 'invalid_product' }
  return { cart: [...items, line] }
}

export function updateCartQty(cart, keyOrPid, delta) {
  const items = normalizeCart(cart)
  return items
    .map((i) => {
      const itemKey = lineMatchKey(i)
      if (itemKey !== keyOrPid && i.product_id !== keyOrPid) return i
      const newQty = Math.max(0, Math.min(i.qty + delta, i.max_qty || 0))
      if (newQty === 0) return null
      return recalcLineTotal(i, newQty)
    })
    .filter(Boolean)
}

export function removeCartItem(cart, productId, variantId = null) {
  return normalizeCart(cart).filter(
    (i) => !(i.product_id === productId && (variantId == null || i.variant_id === variantId)),
  )
}

export function clearCart() {
  return []
}