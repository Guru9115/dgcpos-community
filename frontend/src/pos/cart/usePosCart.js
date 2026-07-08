import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { POS_MAX_DISCOUNT_PCT } from './constants'
import { addItemToCart, updateCartQty, removeCartItem, clearCart } from './cartReducer'
import { normalizeCart } from './lineItems'
import { computeCartTotals } from './totals'
import { safeCartNum } from './math'
import {
  loadHeldSales,
  saveHeldSales,
  createHeldSaleSnapshot,
} from './heldSales'
import { loadCartDraft, saveCartDraft, clearCartDraft } from './persistence'
import {
  canOpenCheckout,
  buildSalePayload,
  buildOfflineReceipt,
  isDiscountBlocked,
} from './checkout'
import { trackCartEvent } from './telemetry'

const EMPTY_ADJUSTMENTS = {
  discPct: '',
  taxPct: '',
  promoCode: '',
  promoDiscount: 0,
  appliedPromo: null,
  gcCode: '',
  appliedGC: null,
  payment: 'cash',
  amtPaid: '',
  splitPayment: false,
  cashAmount: '',
  cardAmount: '',
}

export function usePosCart({ settings = {}, redeemPoints = 0 } = {}) {
  const draftLoaded = useRef(false)

  const [cart, setCart] = useState(() => {
    const draft = loadCartDraft()
    return draft?.cart ?? []
  })
  const [discPct, setDiscPct] = useState(() => loadCartDraft()?.discPct ?? '')
  const [taxPct, setTaxPct] = useState(() => loadCartDraft()?.taxPct ?? '')
  const [promoCode, setPromoCode] = useState(() => loadCartDraft()?.promoCode ?? '')
  const [promoDiscount, setPromoDiscount] = useState(() => loadCartDraft()?.promoDiscount ?? 0)
  const [appliedPromo, setAppliedPromo] = useState(null)
  const [gcCode, setGcCode] = useState('')
  const [appliedGC, setAppliedGC] = useState(null)
  const [payment, setPayment] = useState('cash')
  const [amtPaid, setAmtPaid] = useState('')
  const [splitPayment, setSplitPayment] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [cardAmount, setCardAmount] = useState('')
  const [heldSales, setHeldSales] = useState(() => loadHeldSales())

  const pointsRate = safeCartNum(settings.points_redemption_rate) || 1
  const currency = settings.currency || 'Rs.'

  const totals = useMemo(
    () => computeCartTotals(cart, {
      discPct,
      taxPct,
      promoDiscount,
      redeemPoints,
      pointsRate,
      appliedGC,
    }),
    [cart, discPct, taxPct, promoDiscount, redeemPoints, pointsRate, appliedGC],
  )

  const { subtotal, discAmt, taxAmt, redeemValue, gcDiscount, total } = totals
  const change = Math.max(0, safeCartNum(amtPaid) - total)
  const cur = useCallback(
    (v) => `${currency} ${safeCartNum(v).toFixed(2)}`,
    [currency],
  )

  // Persist cart draft (session recovery)
  useEffect(() => {
    if (!draftLoaded.current) {
      draftLoaded.current = true
      return
    }
    saveCartDraft({ cart, discPct, taxPct, promoCode, promoDiscount })
  }, [cart, discPct, taxPct, promoCode, promoDiscount])

  useEffect(() => {
    if (settings?.tax_rate != null && taxPct === '') {
      setTaxPct(String(settings.tax_rate))
    }
  }, [settings?.tax_rate, taxPct])

  const pulseMobileCart = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      return true
    }
    return false
  }, [])

  const addToCart = useCallback((product, variant = null) => {
    setCart((prev) => {
      const { cart: next, error, atMax } = addItemToCart(prev, product, variant)
      if (error === 'out_of_stock') toast.error('Out of stock')
      if (error === 'max_stock' || atMax) toast.error('Max stock reached for this option')
      if (!error) {
        trackCartEvent('item_added', { productId: product.id, variantId: variant?.id ?? null })
      }
      return next
    })
    if (pulseMobileCart()) {
      trackCartEvent('mobile_cart_pulse')
    }
    return { mobilePulse: pulseMobileCart() }
  }, [pulseMobileCart])

  const updateQty = useCallback((keyOrPid, delta) => {
    setCart((prev) => {
      const next = updateCartQty(prev, keyOrPid, delta)
      trackCartEvent('qty_updated', { key: keyOrPid, delta, count: next.length })
      return next
    })
  }, [])

  const removeFromCart = useCallback((productId, variantId = null) => {
    setCart((prev) => {
      const next = removeCartItem(prev, productId, variantId)
      trackCartEvent('item_removed', { productId, variantId })
      return next
    })
  }, [])

  const clearCartState = useCallback(() => {
    setCart(clearCart())
    clearCartDraft()
    trackCartEvent('cart_cleared')
  }, [])

  const resetAdjustments = useCallback(() => {
    setDiscPct(EMPTY_ADJUSTMENTS.discPct)
    setPromoCode(EMPTY_ADJUSTMENTS.promoCode)
    setPromoDiscount(EMPTY_ADJUSTMENTS.promoDiscount)
    setAppliedPromo(EMPTY_ADJUSTMENTS.appliedPromo)
    setGcCode(EMPTY_ADJUSTMENTS.gcCode)
    setAppliedGC(EMPTY_ADJUSTMENTS.appliedGC)
    setAmtPaid(EMPTY_ADJUSTMENTS.amtPaid)
    setSplitPayment(EMPTY_ADJUSTMENTS.splitPayment)
    setCashAmount(EMPTY_ADJUSTMENTS.cashAmount)
    setCardAmount(EMPTY_ADJUSTMENTS.cardAmount)
    setPayment(EMPTY_ADJUSTMENTS.payment)
  }, [])

  const resetAfterSale = useCallback(() => {
    clearCartState()
    resetAdjustments()
    trackCartEvent('sale_completed_reset')
  }, [clearCartState, resetAdjustments])

  const holdSale = useCallback(({ customer } = {}) => {
    const snapshot = createHeldSaleSnapshot({
      cart,
      customer,
      discPct,
      taxPct,
      promoCode,
      promoDiscount,
      appliedPromo,
    })
    if (!snapshot) {
      toast.error('Cart is empty')
      return false
    }
    const next = [...heldSales, snapshot]
    const saved = saveHeldSales(next)
    setHeldSales(saved)
    clearCartState()
    resetAdjustments()
    trackCartEvent('sale_held', { heldId: snapshot.id, items: snapshot.cart.length })
    toast.success('Sale held')
    return true
  }, [cart, discPct, taxPct, promoCode, promoDiscount, appliedPromo, heldSales, clearCartState, resetAdjustments])

  const recallSale = useCallback((held) => {
    if (!held?.cart?.length) return null
    const patch = {
      cart: normalizeCart(held.cart),
      customer: held.customer || null,
      discPct: held.discPct || '',
      taxPct: held.taxPct || '',
      promoCode: held.promoCode || '',
      promoDiscount: held.promoDiscount || 0,
      appliedPromo: held.appliedPromo || null,
    }
    setCart(patch.cart)
    setDiscPct(patch.discPct)
    setTaxPct(patch.taxPct)
    setPromoCode(patch.promoCode)
    setPromoDiscount(patch.promoDiscount)
    setAppliedPromo(patch.appliedPromo)
    const next = heldSales.filter((h) => h.id !== held.id)
    const saved = saveHeldSales(next)
    setHeldSales(saved)
    trackCartEvent('sale_recalled', { heldId: held.id })
    toast.success('Sale recalled')
    return patch
  }, [heldSales])

  const deleteHeldSale = useCallback((heldId) => {
    const next = heldSales.filter((h) => h.id !== heldId)
    setHeldSales(saveHeldSales(next))
    trackCartEvent('held_deleted', { heldId })
  }, [heldSales])

  const validateCheckout = useCallback(() => {
    const result = canOpenCheckout(cart, discPct)
    if (!result.ok) {
      if (result.reason === 'empty') toast.error('Cart is empty')
      if (result.reason === 'discount_exceeded') {
        toast.error(`Discount ${parseFloat(discPct) || 0}% exceeds max ${POS_MAX_DISCOUNT_PCT}%. Reduce first.`, { duration: 4000 })
      }
      return false
    }
    return true
  }, [cart, discPct])

  const getSalePayload = useCallback((opts = {}) => buildSalePayload({
    cart,
    discPct,
    taxPct,
    redeemPoints,
    payment,
    amtPaid,
    totals,
    ...opts,
  }), [cart, discPct, taxPct, redeemPoints, payment, amtPaid, totals])

  const getOfflineReceipt = useCallback((opts = {}) => buildOfflineReceipt({
    cart,
    discPct,
    taxPct,
    totals,
    payment,
    ...opts,
  }), [cart, discPct, taxPct, totals, payment])

  return {
    cart,
    setCart,
    discPct,
    setDiscPct,
    taxPct,
    setTaxPct,
    promoCode,
    setPromoCode,
    promoDiscount,
    setPromoDiscount,
    appliedPromo,
    setAppliedPromo,
    gcCode,
    setGcCode,
    appliedGC,
    setAppliedGC,
    payment,
    setPayment,
    amtPaid,
    setAmtPaid,
    splitPayment,
    setSplitPayment,
    cashAmount,
    setCashAmount,
    cardAmount,
    setCardAmount,
    heldSales,
    subtotal,
    discAmt,
    taxAmt,
    redeemValue,
    gcDiscount,
    total,
    change,
    pointsRate,
    cur,
    currency,
    discountBlocked: isDiscountBlocked(discPct),
    addToCart,
    updateQty,
    removeFromCart,
    clearCart: clearCartState,
    holdSale,
    recallSale,
    deleteHeldSale,
    resetAfterSale,
    resetAdjustments,
    validateCheckout,
    getSalePayload,
    getOfflineReceipt,
    POS_MAX_DISCOUNT_PCT,
  }
}