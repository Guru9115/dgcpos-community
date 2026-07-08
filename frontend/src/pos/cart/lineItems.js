import { safeCartNum } from './math'

export const cartItemKey = (item, index = 0) => {
  if (!item) return `cart-${index}`
  if (item.variant_id != null) return `${item.product_id}:${item.variant_id}`
  return String(item.product_id ?? `line-${index}`)
}

export const lineMatchKey = (item) => (
  item?.variant_id != null ? `${item.product_id}:${item.variant_id}` : item?.product_id
)

export const normalizeCartItem = (raw, index = 0) => {
  if (!raw || raw.product_id == null) return null
  const up = safeCartNum(raw.unit_price)
  const d = safeCartNum(raw.discount)
  const q = Math.max(0, safeCartNum(raw.qty))
  return {
    ...raw,
    product_id: raw.product_id,
    variant_id: raw.variant_id ?? null,
    product_name: String(raw.product_name || raw.name || 'Item'),
    sku: raw.sku || '',
    unit_price: up,
    cost_price: safeCartNum(raw.cost_price),
    qty: q || 1,
    total: Math.max(0, safeCartNum(raw.total) || q * up - d),
    discount: d,
    max_qty: Math.max(q, safeCartNum(raw.max_qty)),
  }
}

export const normalizeCart = (items) => {
  if (!Array.isArray(items)) return []
  return items.map((item, i) => normalizeCartItem(item, i)).filter(Boolean)
}

export const buildLineItemFromProduct = (product, variant = null) => {
  const isVariant = !!variant
  const stock = isVariant ? variant.stock_qty : product.stock_qty
  const price = isVariant
    ? (variant.effective_price || variant.selling_price || product.selling_price)
    : product.selling_price
  const vlabel = isVariant ? [variant.size, variant.color].filter(Boolean).join(' / ') : null
  const vsku = isVariant ? (variant.sku || product.sku) : product.sku
  const up = safeCartNum(price)

  return normalizeCartItem({
    product_id: product.id,
    variant_id: variant ? variant.id : null,
    variant_label: vlabel,
    product_name: `${product.name || 'Item'}${vlabel ? ` · ${vlabel}` : ''}`,
    sku: vsku || '',
    unit_price: up,
    cost_price: safeCartNum(variant?.effective_cost || variant?.cost_price || product.cost_price),
    qty: 1,
    total: up,
    max_qty: safeCartNum(stock),
    discount: 0,
  })
}

export const recalcLineTotal = (item, qty) => {
  const up = safeCartNum(item.unit_price)
  const d = safeCartNum(item.discount)
  const newQty = Math.max(0, qty)
  return {
    ...item,
    qty: newQty,
    unit_price: up,
    discount: d,
    total: Math.max(0, newQty * up - d),
  }
}