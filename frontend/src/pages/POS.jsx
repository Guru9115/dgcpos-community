/**
 * DGC RetailOS — Point of Sale
 * Orchestrator: holds all state, delegates rendering to focused sub-components.
 *
 * Sub-components:
 *   components/pos/Receipt.jsx         — print receipt overlay
 *   components/pos/ChangeCalculator.jsx — change calculator modal
 *   components/pos/CheckoutModal.jsx   — payment + numpad modal
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productsAPI, salesAPI, customersAPI, settingsAPI, promotionsAPI, giftCardsAPI, variantsAPI, marketplaceAPI, hospitalityAPI } from '../api'
import { useAuth } from '../store/AuthContext'
import toast from 'react-hot-toast'
import {
  Search, Plus, Minus, Trash2, User, Tag, Barcode, CreditCard, Banknote,
  QrCode, Calculator, Award, Crown, UserPlus, ShieldX, Wallet, ChevronRight, X, Check,
  Store, ShoppingBag, ExternalLink, Camera, ImagePlus, CheckCircle, XCircle, Package, Sparkles,
} from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce'
import { usePageVisible } from '../hooks/usePageVisible'
import Receipt from '../components/pos/Receipt'
import ChangeCalculator from '../components/pos/ChangeCalculator'
import CheckoutModal from '../components/pos/CheckoutModal'
import CashierSessionWidget from '../components/CashierSessionWidget'
import SampleCatalogModal from '../components/pos/SampleCatalogModal'
import POSProductGrid from '../components/pos/POSProductGrid'
import { usePosCart, CartPanel, asArray } from '../pos/cart'
import { queueSale, syncOfflineQueue, getPendingCount, setupOnlineListener } from '../utils/offlineQueue'
import { glass } from '../theme/tokens'

// ── Constants ─────────────────────────────────────────────────────────────────
const MARKET_CAT = '__market__'
const MARKET_MINE_CAT = '__market_mine__'

// ── 120 Hz touch optimisation ─────────────────────────────────────────────────
const POS_TOUCH_CSS = `
  .pos-root, .pos-root * { -webkit-tap-highlight-color: backdrop-blur-xl; }
  .pos-root { touch-action: pan-y; user-select: none; -webkit-user-select: none; }
  .pos-root button { touch-action: manipulation; user-select: none; -webkit-user-select: none; cursor: pointer; -webkit-tap-highlight-color: backdrop-blur-xl; outline: none; }
  .np-key { will-change: transform; transform: translateZ(0); transition: transform 70ms cubic-bezier(0.22,1,0.36,1), background 80ms ease, box-shadow 70ms ease !important; }
  .np-key:active { transform: scale(0.88) translateZ(0) !important; box-shadow: grey !important; filter: brightness(1.15); }
  .pos-product-card { will-change: transform; transform: translateZ(0); transition: transform 90ms cubic-bezier(0.22,1,0.36,1), box-shadow 90ms ease !important; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  .pos-product-card:active { transform: scale(0.95) translateZ(0) !important; box-shadow: 0 0 0 2px rgba(10,132,255,0.35) !important; }
  .pos-qty-btn { touch-action: manipulation; will-change: transform; transform: translateZ(0); transition: transform 60ms ease !important; }
  .pos-qty-btn:active { transform: scale(0.82) translateZ(0) !important; }
  .pos-pay-tab { will-change: transform; transform: translateZ(0); transition: transform 80ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease !important; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  .pos-pay-tab:active { transform: scale(0.94) translateZ(0) !important; }
  .pos-preset-btn { touch-action: manipulation; will-change: transform; transform: translateZ(0); transition: transform 70ms ease, background 100ms ease !important; }
  .pos-preset-btn:active { transform: scale(0.92) translateZ(0) !important; }
  .pos-confirm-btn { touch-action: manipulation; will-change: transform; transform: translateZ(0); transition: transform 80ms ease, box-shadow 80ms ease, opacity 100ms ease !important; }
  .pos-confirm-btn:active { transform: scale(0.97) translateZ(0) !important; }
  .pos-bill-scroll { -webkit-overflow-scrolling: touch; overscroll-behavior: contain; scroll-behavior: smooth; scrollbar-width: thin; scrollbar-color: rgba(101,65,20,0.14) transparent; }
  .pos-bill-scroll::-webkit-scrollbar { width: 3px; }
  .pos-bill-scroll::-webkit-scrollbar-thumb { background: rgba(7,27,82,0.12); border-radius: 99px; }
  .pos-cat-chip { touch-action: manipulation; will-change: transform; transform: translateZ(0); transition: transform 70ms ease, background 100ms ease !important; }
  .pos-cat-chip:active { transform: scale(0.93) translateZ(0) !important; }
  .pos-root input, .pos-root select { font-size: 16px; touch-action: manipulation; }
  @media (hover: none) { .pos-root button:hover { background: unset; } }
  .checkout-modal { background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid rgba(7,27,82,0.10); border-radius: 16px; width: 100%; max-width: 940px; height: min(96vh, 720px); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 40px rgba(7,27,82,0.10); color: #0f172a; }
  .checkout-body { flex: 1; display: grid; grid-template-columns: 1fr 380px; overflow: hidden; min-height: 0; }
  .checkout-left { overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 16px 18px; border-right: 1px solid rgba(15,23,42,0.08); display: flex; flex-direction: column; gap: 12px; scrollbar-width: thin; }
  .checkout-right { display: flex; flex-direction: column; padding: 14px 16px; gap: 9px; overflow: hidden; flex-shrink: 0; }
  @media (max-width: 768px) { .checkout-modal { max-width: 100%; border-radius: 18px; } .checkout-body { grid-template-columns: 1fr 320px; } }

  /* ── Mobile checkout: single column, fixed sections, no overlap ── */
  @media (max-width: 600px) {
    .checkout-modal { height: 100dvh; border-radius: 0; max-width: 100%; }
    .checkout-body  { grid-template-columns: 1fr; grid-template-rows: auto 1fr; overflow: hidden; }
    /* Bill summary: compact scrollable strip at top */
    .checkout-left  { border-right: none; border-bottom: 1px solid rgba(15,23,42,0.08); max-height: 200px; min-height: 0; padding: 10px 14px; gap: 8px; }
    /* Payment panel: fills remaining height, NO scroll — everything must fit */
    .checkout-right { overflow: hidden; padding: 10px 14px; gap: 7px; flex: 1; min-height: 0; }
    /* Payment method tabs: smaller on mobile */
    .checkout-right .pos-pay-tab { padding: 7px 4px !important; }
    /* Numpad: fixed 4-row grid using remaining space */
    .checkout-right .np-key { min-height: 0; font-size: 1.35rem !important; border-radius: 10px !important; }
    /* Change/status bar: compact */
    .checkout-change-bar { padding: 6px 10px !important; }
  }

  /* Native: checkout sits below locked header, uses all remaining space */
  html.dgc-native-app .checkout-overlay {
    top: var(--dgc-chrome-top-h, 60px);
    bottom: 0;
    z-index: 180;
    padding: 0 !important;
    align-items: stretch !important;
  }
  html.dgc-native-app .checkout-modal {
    height: 100%;
    max-height: 100%;
    border-radius: 0;
    max-width: 100%;
  }
  html.dgc-native-app .dgc-pos-total-due {
    padding: 12px 14px !important;
  }
  html.dgc-native-app .dgc-pos-total-due .dgc-pos-total-amt {
    font-size: 1.45rem !important;
  }
`

function BazaarListModal({ product, onClose, onListed }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!product) return
    if (product.image_url && (product.image_url.startsWith('http') || product.image_url.startsWith('data:') || product.image_url.startsWith('/api'))) {
      setPreview(product.image_url)
      return
    }
    const name = product.name?.trim()
    if (!name) return
    productsAPI.placeholderImage(name)
      .then((r) => setPreview(r.data?.image_url || null))
      .catch(() => {})
  }, [product])

  const onPick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Please choose an image')
    if (f.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async () => {
    if (!product) return
    setSaving(true)
    try {
      if (file) {
        await marketplaceAPI.listFromProductWithImage(product.id, file)
      } else {
        await marketplaceAPI.listFromProduct(product.id)
      }
      toast.success(`"${product.name}" is live on DGC Bazaar`)
      onListed?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not list on bazaar')
    } finally {
      setSaving(false)
    }
  }

  if (!product) return null

  const modal = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="modal-overlay dgc-modal-layer dgc-upload-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="modal-panel dgc-upload-modal dgc-liquid-frosted mx-4 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h3 className="font-display text-lg font-bold text-txt dgc-text-3d flex items-center gap-2">
            <Store size={18} className="text-gold" /> List on <span className="dgc-bazaar-brown">Bazaar</span>
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-glass text-txt-3"><X size={16} /></button>
        </div>
        <div className="dgc-upload-modal-body px-6 pb-4">
          <p className="text-sm text-txt-2 mb-3">{product.name} — Rs.{Number(product.selling_price || 0).toLocaleString()}</p>
          <p className="text-xs text-txt-3 mb-4">Take a photo or publish with the name-matched preview. Listing syncs to dgcpos.com/bazaar and in-app marketplace by category.</p>

          <div className="rounded-xl overflow-hidden mb-4 bg-glass border border-glass-border min-h-[140px] flex items-center justify-center">
            {preview ? (
              <img src={preview} alt="" className="w-full max-h-48 object-cover" />
            ) : (
              <div className="text-center py-8 text-txt-3 text-sm">
                <Camera size={32} className="mx-auto mb-2 opacity-40" />
                Add a product photo
              </div>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="btn-gold flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5">
              <Camera size={14} /> {file ? 'Retake photo' : 'Take photo'}
            </button>
            {preview && !file && (
              <button type="button" onClick={submit} disabled={saving}
                className="btn-ghost flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5">
                <ImagePlus size={14} /> Use preview
              </button>
            )}
          </div>
          <a href="https://dgcpos.com/dgcbazaar.html" target="_blank" rel="noreferrer"
            className="block text-center text-xs text-gold hover:underline flex items-center justify-center gap-1">
            <ExternalLink size={11} /> Preview on public bazaar
          </a>
        </div>
        <div className="dgc-modal-actions">
          <button type="button" onClick={submit} disabled={saving}
            className="btn-gold w-full py-3 font-bold flex items-center justify-center gap-2">
            <Store size={16} /> {saving ? 'Publishing…' : (file ? 'Publish with photo' : 'Publish listing')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )

  return createPortal(modal, document.body)
}

function BazaarSnapModal({ onClose, onListed, shopName }) {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const onPick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Please choose an image')
    if (f.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Product name required')
    if (!file) return toast.error('Take a photo first')
    setSaving(true)
    try {
      await marketplaceAPI.createWithImage(file, {
        title: title.trim(),
        description: `Listed from ${shopName || 'POS'} counter`,
        price: Number(price) || 0,
      })
      toast.success('Live on DGC Bazaar — customers can order online')
      onListed?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not publish')
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="modal-overlay dgc-modal-layer dgc-upload-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="modal-panel dgc-upload-modal dgc-liquid-frosted mx-4 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h3 className="font-display text-lg font-bold text-txt dgc-text-3d flex items-center gap-2">
            <Camera size={18} className="text-gold" /> Snap &amp; List
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-glass text-txt-3"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="dgc-upload-modal-body px-6 pb-4 space-y-3">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-gold/40 py-8 flex flex-col items-center gap-2 text-txt-3 hover:bg-gold/5 transition">
              {preview ? (
                <img src={preview} alt="" className="w-full max-h-40 object-cover rounded-lg" />
              ) : (
                <>
                  <Camera size={28} className="text-gold opacity-70" />
                  <span className="text-sm font-semibold">Tap to take product photo</span>
                </>
              )}
            </button>
            <div>
              <label className="input-label">Product name</label>
              <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fresh tomatoes 1kg" required />
            </div>
            <div>
              <label className="input-label">Price (Rs)</label>
              <input className="input-field" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="dgc-modal-actions">
            <button type="submit" disabled={saving || !file} className="btn-gold w-full py-3 font-bold">
              {saving ? 'Publishing…' : 'Publish to online bazaar'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )

  return createPortal(modal, document.body)
}

function PosMarketImage({ url, alt }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!url) { setSrc(null); return undefined }
    if (url.startsWith('data:') || url.startsWith('http')) { setSrc(url); return undefined }
    let blobUrl = null
    marketplaceAPI.fetchImage(url).then((res) => {
      blobUrl = URL.createObjectURL(res.data)
      setSrc(blobUrl)
    }).catch(() => setSrc(null))
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [url])
  if (!url || !src) return null
  return <img src={src} alt={alt} style={{ width: '100%', height: 52, objectFit: 'cover', borderRadius: 8, marginBottom: 6, background: 'rgba(27,47,94,0.08)' }} />
}

export default function POS() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const pageVisible = usePageVisible()
  const [searchParams, setSearchParams] = useSearchParams()
  const canMarketPost = ['owner', 'superadmin', 'manager'].includes(user?.role)
  const shopName = user?.account?.name || user?.full_name || 'Your Store'

  // ── Server data via React Query ────────────────────────────────────────────
  const { data: products = [] } = useQuery({
    queryKey: ['pos-products'],
    queryFn: () => productsAPI.getAll({ status: 'active' }).then(r => asArray(r.data)),
    staleTime: 60_000,
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['pos-categories'],
    queryFn: () => productsAPI.getCategories().then(r => r.data),
    staleTime: 300_000,
  })
  const { data: settings = {} } = useQuery({
    queryKey: ['pos-settings'],
    queryFn: () => settingsAPI.getAll().then(r => r.data || {}),
    staleTime: 300_000,
  })
  const { data: hospitalityStatus } = useQuery({
    queryKey: ['hospitality-status-pos'],
    queryFn: () => hospitalityAPI.getStatus().then(r => r.data),
    staleTime: 120_000,
  })
  const { data: chargeableBookings = [] } = useQuery({
    queryKey: ['hospitality-chargeable-folios'],
    queryFn: () => hospitalityAPI.listChargeableFolios().then(r => asArray(r.data)),
    enabled: !!hospitalityStatus?.enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  // ── Local state ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [customer, setCustomer] = useState(null)
  const [customers, setCustomers] = useState([])
  const [custSearch, setCustSearch] = useState('')
  const [custDropOpen, setCustDropOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [showCalc, setShowCalc] = useState(false)
  const [redeemPoints, setRedeemPoints] = useState(0)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickForm, setQuickForm] = useState({ name: '', phone: '' })
  const [quickSaving, setQuickSaving] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showRecall, setShowRecall] = useState(false)
  const cartApi = usePosCart({ settings, redeemPoints })
  const {
    cart,
    discPct,
    taxPct,
    promoDiscount,
    appliedPromo,
    appliedGC,
    payment,
    amtPaid,
    heldSales,
    subtotal,
    discAmt,
    taxAmt,
    redeemValue,
    gcDiscount,
    total,
    cur,
    addToCart: cartAdd,
    clearCart,
    holdSale,
    recallSale,
    deleteHeldSale,
    resetAfterSale,
    validateCheckout,
    getSalePayload,
    getOfflineReceipt,
  } = cartApi
  const [mobileTab, setMobileTab] = useState('products') // 'products' | 'cart'
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [variantPicker, setVariantPicker] = useState(null) // {product, variants:[] , loading}
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [marketOrderPost, setMarketOrderPost] = useState(null)
  const [marketOrderSaving, setMarketOrderSaving] = useState(false)
  const [listingProduct, setListingProduct] = useState(null)
  const [showBazaarSnap, setShowBazaarSnap] = useState(false)
  const [showSampleCatalog, setShowSampleCatalog] = useState(false)
  const [showBazaarOrders, setShowBazaarOrders] = useState(false)
  const [bazaarOrderUpdating, setBazaarOrderUpdating] = useState(null)
  const prevPendingBazaarRef = useRef(0)
  const isMarketView = catFilter === MARKET_CAT || catFilter === MARKET_MINE_CAT

  // Hide app footer during checkout, receipts, and upload modals — keeps bottom actions visible
  useEffect(() => {
    const active = showCheckout || !!receipt || !!listingProduct || showBazaarSnap
      || showSampleCatalog || showBazaarOrders || !!marketOrderPost || showRecall
    window.__DGC_PAYMENT_ACTIVE__ = active
    document.documentElement.classList.toggle('dgc-payment-active', active)
    window.dispatchEvent(new CustomEvent('dgc:payment-mode', { detail: { active } }))
    return () => {
      window.__DGC_PAYMENT_ACTIVE__ = false
      document.documentElement.classList.remove('dgc-payment-active')
      window.dispatchEvent(new CustomEvent('dgc:payment-mode', { detail: { active: false } }))
    }
  }, [showCheckout, receipt, listingProduct, showBazaarSnap, showSampleCatalog, showBazaarOrders, marketOrderPost, showRecall])

  const { data: incomingBazaarOrders = [] } = useQuery({
    queryKey: ['pos-bazaar-incoming'],
    queryFn: () => marketplaceAPI.listOrders({ scope: 'incoming' }).then((r) => (Array.isArray(r.data) ? r.data : [])),
    enabled: canMarketPost,
    staleTime: 15_000,
    refetchInterval: pageVisible ? 30_000 : false,
  })
  const pendingBazaarCount = incomingBazaarOrders.filter((o) => o.status === 'pending').length

  useEffect(() => {
    if (searchParams.get('bazaarOrders') === '1' && canMarketPost) {
      setShowBazaarOrders(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, canMarketPost, setSearchParams])

  useEffect(() => {
    if (pendingBazaarCount > prevPendingBazaarRef.current && prevPendingBazaarRef.current >= 0) {
      const delta = pendingBazaarCount - prevPendingBazaarRef.current
      if (delta > 0 && prevPendingBazaarRef.current > 0) {
        toast.success(`New Bazaar order${delta > 1 ? 's' : ''}! ${pendingBazaarCount} awaiting action`, { icon: '🛒', duration: 5000 })
      }
    }
    prevPendingBazaarRef.current = pendingBazaarCount
  }, [pendingBazaarCount])
  const { data: marketPosts = [], isLoading: marketLoading } = useQuery({
    queryKey: ['pos-marketplace', catFilter === MARKET_MINE_CAT ? 'mine' : 'feed'],
    queryFn: () => marketplaceAPI
      .list({ scope: catFilter === MARKET_MINE_CAT ? 'mine' : 'feed' })
      .then((r) => (Array.isArray(r.data) ? r.data : [])),
    enabled: isMarketView,
    staleTime: 30_000,
  })
  const productSearchRef = useRef(null)
  const customerSearchRef = useRef(null)
  const barcodeRef = useRef(null)

  // Offline queue — sync on connect, track pending count
  useEffect(() => {
    const refreshCount = () => getPendingCount().then(setPendingCount)
    refreshCount()

    const handleOnline = async () => {
      setOnline(true)
      toast('Connection restored — syncing offline sales…', { icon: '📡' })
      const { synced, failed } = await syncOfflineQueue(
        payload => salesAPI.create(payload).then(r => r.data),
        () => { refreshCount(); qc.invalidateQueries({ queryKey: ['pos-products'] }) },
        (err) => console.error('[OfflineSync] failed:', err)
      )
      if (synced > 0) toast.success(`✅ ${synced} offline sale(s) synced`)
      if (failed > 0) toast.error(`⚠️ ${failed} sale(s) failed to sync — check history`)
      refreshCount()
    }
    const handleOffline = () => { setOnline(false); toast('📴 Offline — sales will queue locally', { duration: 5000 }) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Inject touch CSS once
  useEffect(() => {
    const id = 'pos-touch-css'
    if (!document.getElementById(id)) {
      const el = document.createElement('style'); el.id = id; el.textContent = POS_TOUCH_CSS
      document.head.appendChild(el)
    }
  }, [])

  // Auto-focus barcode scanner on mount + after each cart add
  useEffect(() => { barcodeRef.current?.focus() }, [])
  useEffect(() => { if (cart.length > 0) barcodeRef.current?.focus() }, [cart.length])

  const safeNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

  // ── Customer display broadcast ────────────────────────────────────────────
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const send = (status) => {
      const ch = new BroadcastChannel('dgc-pos-display')
      ch.postMessage({ cart, subtotal, discAmt, taxAmt, taxPct, total, currency: settings.currency || 'Rs.', shopName: settings.shop_name || 'Your Store', shopLogo: settings.shop_logo || null, status: status || (cart.length === 0 ? 'idle' : 'active') })
      ch.close()
    }
    send()
    const ping = new BroadcastChannel('dgc-pos-display')
    ping.onmessage = (e) => { if (e.data?.type === 'DISPLAY_READY') send() }
    return () => ping.close()
  }, [cart, subtotal, discAmt, taxAmt, taxPct, total, settings])

  const broadcastStatus = (status) => {
    if (!('BroadcastChannel' in window)) return
    const ch = new BroadcastChannel('dgc-pos-display')
    ch.postMessage({ cart, subtotal, discAmt, taxAmt, taxPct, total, currency: settings.currency || 'Rs.', shopName: settings.shop_name || 'Your Store', shopLogo: settings.shop_logo || null, status })
    ch.close()
  }

  // ── Filtered products (debounced search) ──────────────────────────────────
  const debouncedSearch = useDebounce(search, 120)
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return asArray(products).filter(p => {
      const name = (p.name || '').toLowerCase()
      const matchQ = !q || name.includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)
      const matchC = !catFilter || String(p.category_id) === catFilter
      return matchQ && matchC && (p.stock_qty > 0 || p.has_variants)
    })
  }, [products, debouncedSearch, catFilter])

  const filteredMarket = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return marketPosts.filter((p) => {
      if (!q) return true
      return (
        (p.title || '').toLowerCase().includes(q)
        || (p.store_name || '').toLowerCase().includes(q)
        || (p.description || '').toLowerCase().includes(q)
      )
    })
  }, [marketPosts, debouncedSearch])

  const handleMarketplaceTap = (post) => {
    if (post.is_mine && post.product_id) {
      const product = products.find((p) => p.id === post.product_id)
      if (product) {
        openVariantPicker(product)
        toast.success(`Added from bazaar: ${product.name}`)
        return
      }
    }
    if (post.is_mine) {
      toast('Your bazaar listing — link a product from Inventory to sell at POS', { icon: 'ℹ️' })
      return
    }
    setMarketOrderPost(post)
  }

  const submitMarketOrder = async (e) => {
    e.preventDefault()
    if (!marketOrderPost) return
    const fd = new FormData(e.target)
    const address = (fd.get('address') || '').toString().trim()
    const phone = (fd.get('phone') || '').toString().trim()
    const message = (fd.get('message') || '').toString().trim()
    const qty = Number(fd.get('qty')) || 1
    if (!address || !phone) return toast.error('Address and phone required')
    setMarketOrderSaving(true)
    try {
      await marketplaceAPI.placeOrder(marketOrderPost.id, {
        quantity: qty,
        message,
        delivery_address: address,
        delivery_phone: phone,
      })
      toast.success(`Order sent to ${marketOrderPost.store_name}`)
      setMarketOrderPost(null)
      qc.invalidateQueries({ queryKey: ['marketplace-orders'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not place order')
    } finally {
      setMarketOrderSaving(false)
    }
  }

  const listOnMarketplace = (product, e) => {
    e.stopPropagation()
    if (!canMarketPost) return
    setListingProduct(product)
  }

  const onBazaarListed = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['pos-marketplace'] })
    qc.invalidateQueries({ queryKey: ['marketplace'] })
  }, [qc])

  const onSampleCatalogAdded = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['pos-products'] })
    qc.invalidateQueries({ queryKey: ['pos-categories'] })
    qc.invalidateQueries({ queryKey: ['pos-marketplace'] })
    qc.invalidateQueries({ queryKey: ['marketplace'] })
  }, [qc])

  const updateBazaarOrderStatus = async (orderId, data) => {
    setBazaarOrderUpdating(orderId)
    try {
      await marketplaceAPI.updateOrderStatus(orderId, data)
      toast.success(`Order ${data.status}`)
      qc.invalidateQueries({ queryKey: ['pos-bazaar-incoming'] })
      qc.invalidateQueries({ queryKey: ['marketplace-orders'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update order')
    } finally {
      setBazaarOrderUpdating(null)
    }
  }

  // ── Cart helpers (advanced with variant support) ────────────────────────────
  const openVariantPicker = async (product) => {
    if (!product.has_variants) { addToCart(product); return }
    setVariantPicker({ product, variants: [], loading: true })
    try {
      const res = await variantsAPI.list(product.id)
      const list = (res.data?.variants || []).filter(v => v.is_active && v.stock_qty > 0)
      if (list.length === 0) {
        toast.error('No active variants with stock')
        setVariantPicker(null)
        return
      }
      setVariantPicker({ product, variants: list, loading: false })
    } catch (e) {
      toast.error('Could not load variants')
      setVariantPicker(null)
      // fallback to base product
      addToCart(product)
    }
  }

  const addToCart = (product, variant = null) => {
    const result = cartAdd(product, variant)
    setVariantPicker(null)
    if (result?.mobilePulse) {
      setMobileTab('cart')
      setTimeout(() => setMobileTab('products'), 800)
    }
  }

  const handleHoldSale = () => {
    if (holdSale({ customer })) {
      setCustomer(null)
      setCustSearch('')
      setRedeemPoints(0)
    }
  }

  const handleRecallSale = (held) => {
    if (cart.length && !window.confirm('Discard current cart and recall held sale?')) return
    const patch = recallSale(held)
    if (patch) {
      setCustomer(patch.customer)
      setShowRecall(false)
    }
  }

  // ── Barcode scan ──────────────────────────────────────────────────────────
  // Global barcode scanner — captures rapid keystrokes from USB/BT scanner even when input not focused
  useEffect(() => {
    let buffer = '', lastTime = 0
    const onKey = (e) => {
      const now = Date.now()
      // Scanners type < 50ms between chars; human typing is slower
      if (now - lastTime > 300) buffer = ''
      lastTime = now
      if (e.key === 'Enter' && buffer.length >= 3) {
        // Only fire if not already in a text input
        const tag = document.activeElement?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          const code = buffer.trim()
          buffer = ''
          productsAPI.getByBarcode(code)
            .then(res => { openVariantPicker(res.data); toast.success(`Scanned: ${res.data.name}`) })
            .catch(() => toast.error(`Barcode not found: ${code}`))
        } else {
          buffer = ''
        }
      } else if (e.key.length === 1) {
        buffer += e.key
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addToCart])

  const handleBarcodeSearch = async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return
    try {
      const res = await productsAPI.getByBarcode(e.target.value.trim())
      openVariantPicker(res.data); e.target.value = '';
    } catch { toast.error('Product not found') }
  }

  // ── Checkout ──────────────────────────────────────────────────────────────
  const openCheckout = () => {
    if (!validateCheckout()) return
    setShowCheckout(true)
    broadcastStatus('paying')
  }

  const handleCheckout = async ({ method: chosenMethod, amtPaid: chosenAmt, folioBookingId } = {}) => {
    if (!validateCheckout()) return
    setProcessing(true)
    const payload = getSalePayload({
      customer,
      chosenMethod,
      chosenAmt,
      folioBookingId,
    })

    // Offline mode — save to IndexedDB queue
    if (!navigator.onLine) {
      try {
        await queueSale(payload)
        getPendingCount().then(setPendingCount)
        toast.success('📴 Saved offline — will sync automatically when connected', { duration: 6000 })
        broadcastStatus('complete')
        setTimeout(() => broadcastStatus('idle'), 4000)
        setShowCheckout(false)
        setReceipt(getOfflineReceipt({ customer, chosenMethod }))
        setMobileTab('products')
        resetAfterSale()
        setCustomer(null)
        setCustSearch('')
        setRedeemPoints(0)
        setCustDropOpen(false)
      } catch (err) {
        toast.error('Failed to save offline sale')
      } finally { setProcessing(false) }
      return
    }

    try {
      const res = await salesAPI.create(payload)
      const created = res.data
      toast.success('Sale completed! 🎉')
      broadcastStatus('complete')
      setTimeout(() => broadcastStatus('idle'), 4000)
      setShowCheckout(false)
      setReceipt(created)
      // Redeem GC balance server-side (non-blocking; discount already applied to sale)
      if (appliedGC?.id && gcDiscount > 0) {
        giftCardsAPI.redeem(appliedGC.id, { amount: gcDiscount }).catch(() => { })
      }
      setMobileTab('products')
      resetAfterSale()
      setCustomer(null)
      setCustSearch('')
      setRedeemPoints(0)
      setCustDropOpen(false)
      qc.invalidateQueries({ queryKey: ['pos-products'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      if (folioBookingId) {
        qc.invalidateQueries({ queryKey: ['hospitality-chargeable-folios'] })
        qc.invalidateQueries({ queryKey: ['hospitality-folio', String(folioBookingId)] })
      }
    } catch (err) {
      const status = err.response?.status
      const backendErr = err.response?.data?.error || err.response?.data?.message
      const detail = backendErr || (err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : err.message)
      console.error('[SALE FAILED]', { status, data: err.response?.data, err })
      toast.error(`SALES FAILED${status ? ' (' + status + ')' : ''}: ${detail || 'unknown error'}`)
    } finally { setProcessing(false) }
  }

  // ── Customer search ───────────────────────────────────────────────────────
  const searchCustomers = async (q) => {
    if (!q) { setCustomers([]); setShowQuickAdd(false); setCustDropOpen(false); return }
    try {
      const res = await customersAPI.getAll({ q })
      const list = Array.isArray(res?.data?.customers) ? res.data.customers : []
      setCustomers(list); setCustDropOpen(true); setShowQuickAdd(false)
      const isPhone = /^[0-9+\s-]{6,}$/.test(q)
      setQuickForm({ name: isPhone ? '' : q, phone: isPhone ? q : '' })
    } catch { setCustomers([]); setCustDropOpen(true) }
  }

  const linkCustomer = (c) => {
    setCustomer(c); setCustomers([]); setCustSearch('')
    setCustDropOpen(false); setShowQuickAdd(false)
    toast.success(`${c.name} linked! 🎉`)
  }

  const handleQuickAdd = async (e) => {
    e.preventDefault()
    if (!quickForm.name) { toast.error('Name is required'); return }
    setQuickSaving(true)
    try {
      const res = await customersAPI.create({ name: quickForm.name, phone: quickForm.phone || '' })
      const nc = res.data
      setCustomer(nc); setCustomers([]); setCustSearch('')
      setShowQuickAdd(false); setQuickForm({ name: '', phone: '' })
      toast.success(`${nc.name} added & linked! 🎉`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add customer')
    } finally { setQuickSaving(false) }
  }

  // ── POS keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const onHotkey = (e) => {
      const tag = document.activeElement?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable

      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return }
        if (showCheckout) { setShowCheckout(false); return }
      }

      if (typing && !(e.ctrlKey || e.metaKey || e.key.startsWith('F'))) return

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setShowShortcuts(v => !v)
        return
      }

      if (e.key === 'F2' || e.key === '/') {
        e.preventDefault()
        setMobileTab('products')
        productSearchRef.current?.focus()
        return
      }

      if (e.key === 'F3') {
        e.preventDefault()
        setMobileTab('products')
        barcodeRef.current?.focus()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMobileTab('cart')
        customerSearchRef.current?.focus()
        return
      }

      if (e.key === 'F4') {
        e.preventDefault()
        openCheckout()
        return
      }

      if (e.key === 'F6') {
        e.preventDefault()
        setMobileTab(v => v === 'products' ? 'cart' : 'products')
      }
    }

    window.addEventListener('keydown', onHotkey)
    return () => window.removeEventListener('keydown', onHotkey)
  }, [showShortcuts, showCheckout, cart.length, discPct])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="pos-root flex flex-col lg:flex-row h-full overflow-hidden" style={{ background: '#faf5ff' }}>

      {/* ── MOBILE TAB BAR ─────────────────────────────────── */}
      <div className="dgc-pos-tabbar lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('products')}
          className={`dgc-pos-tab dgc-text-3d ${mobileTab === 'products' ? 'active' : ''}`}>
          {isMarketView ? 'Bazaar' : 'Products'}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`dgc-pos-tab dgc-text-3d relative ${mobileTab === 'cart' ? 'active' : ''}`}>
          Cart
          {cart.length > 0 && (
            <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 28px)', background: '#0B5FFF', color: '#FFFFFF', borderRadius: 999, fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', lineHeight: 1.4 }}>
              {cart.length}
            </span>
          )}
        </button>
      </div>

      {/* ── PRODUCT GRID ────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col overflow-hidden p-5 lg:p-6 gap-4 ${mobileTab !== 'products' ? 'hidden lg:flex' : 'flex'}`} style={{ background: '#faf5ff' }}>
        {/* Search + Barcode + Calculator */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
            <input ref={productSearchRef} className="input-field pl-9" placeholder={isMarketView ? 'Search DGC Bazaar…' : 'Search products…'} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="relative">
            <Barcode size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
            <input ref={barcodeRef} className="input-field pl-9 w-40" placeholder="Scan barcode" onKeyDown={handleBarcodeSearch} />
          </div>
          <button onClick={() => setShowCalc(true)} title="Change Calculator"
            className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(10,132,255,0.10)', border: '1px solid rgba(10,132,255,0.25)', color: '#0A84FF' }}>
            <Calculator size={16} />
            <span className="text-xs font-semibold hidden sm:block">Change Calc</span>
          </button>
          <button onClick={handleHoldSale} title="Hold sale"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-all flex-shrink-0 text-xs font-semibold">
            Hold
          </button>
          {heldSales.length > 0 && (
            <button onClick={() => setShowRecall(true)} title="Recall held sale"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-400 hover:bg-purple-500/20 transition-all flex-shrink-0 text-xs font-semibold relative">
              Recall
              <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#7C3AED', color: '#FFFDF6', fontSize: '0.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {heldSales.length}
              </span>
            </button>
          )}
          {canMarketPost && (
            <button onClick={() => setShowSampleCatalog(true)} title="Add AI sample products with prices and images"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[rgba(245,166,35,0.12)] border border-[rgba(245,166,35,0.35)] text-[#8B5E3C] hover:bg-[rgba(245,166,35,0.22)] transition-all flex-shrink-0 text-xs font-semibold">
              <Sparkles size={13} /> AI Sample Catalog
            </button>
          )}
          {canMarketPost && (
            <button onClick={() => setShowBazaarOrders(true)} title="Bazaar orders from online customers"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[rgba(139,94,60,0.12)] border border-[rgba(139,94,60,0.28)] text-[#8B5E3C] hover:bg-[rgba(139,94,60,0.18)] transition-all flex-shrink-0 text-xs font-semibold relative">
              <ShoppingBag size={13} /> Bazaar Orders
              {pendingBazaarCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: '50%', background: '#EF4444', color: '#FFF', fontSize: '0.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {pendingBazaarCount > 9 ? '9+' : pendingBazaarCount}
                </span>
              )}
            </button>
          )}
          <button onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[rgba(7,27,82,0.10)] text-[#64748B] hover:text-[#071B52] hover:border-[rgba(11,95,255,0.25)] transition-all flex-shrink-0 text-xs font-semibold">
            ? Shortcuts
          </button>
          <CashierSessionWidget />
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0">
          <button onClick={() => setCatFilter('')}
            className={`pos-cat-chip px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${!catFilter ? 'bg-[#071B52] text-white' : 'bg-white/90 text-[#64748B] hover:bg-white hover:text-[#0F172A]'}`}>
            All
          </button>
          <button onClick={() => setCatFilter(MARKET_CAT)}
            className={`pos-cat-chip px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${catFilter === MARKET_CAT ? 'bg-[#0B5FFF] text-white' : 'bg-white/90 text-[#64748B] hover:bg-white hover:text-[#0F172A]'}`}>
            <Store size={14} /> <span className="dgc-bazaar-brown">Bazaar</span>
          </button>
          {canMarketPost && (
            <button onClick={() => setCatFilter(MARKET_MINE_CAT)}
              className={`pos-cat-chip px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${catFilter === MARKET_MINE_CAT ? 'bg-[#059669] text-white' : 'bg-white/90 text-[#64748B] hover:bg-white hover:text-[#0F172A]'}`}>
              My Listings
            </button>
          )}
          {canMarketPost && isMarketView && (
            <button onClick={() => setShowBazaarSnap(true)} type="button"
              className="pos-cat-chip px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 bg-[rgba(245,166,35,0.15)] text-[#8B5E3C] border border-[rgba(139,94,60,0.25)] hover:bg-[rgba(245,166,35,0.25)]">
              <Camera size={14} /> Snap &amp; List
            </button>
          )}
          {!isMarketView && categories.map(c => (
            <button key={c.id} onClick={() => setCatFilter(String(c.id))}
              className={`pos-cat-chip px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${catFilter === String(c.id) ? 'bg-[#071B52] text-white' : 'bg-white/90 text-[#64748B] hover:bg-white hover:text-[#0F172A]'}`}>
              {c.name}
            </button>
          ))}
        </div>

        {/* Product / Marketplace grid */}
        <div className="flex-1 min-h-0">
          {isMarketView ? (
          <div className="h-full overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {marketLoading ? (
              <div className="col-span-full text-center py-12 text-[#64748B] text-sm">Loading DGC Bazaar…</div>
            ) : filteredMarket.map((post) => (
              <motion.div key={`mp-${post.id}`} className="liquid-glass pos-product-card"
                whileHover={{ scale: 1.015, borderColor: 'rgba(11,95,255,0.35)' }}
                whileTap={{ scale: 0.985 }}
                onClick={() => handleMarketplaceTap(post)}
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(232,240,255,0.85))',
                  border: '1px solid rgba(11,95,255,0.18)',
                  borderRadius: 16,
                  padding: '1rem',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                <div style={{ position: 'absolute', top: 6, left: 6, fontSize: '9px', fontWeight: 700, background: 'rgba(11,95,255,0.12)', color: '#0B5FFF', padding: '2px 6px', borderRadius: 6 }}>
                  {post.is_mine ? 'MY LISTING' : (post.store_name || 'Store').slice(0, 12)}
                </div>
                {post.image_url && <PosMarketImage url={post.image_url} alt={post.title} />}
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.35, marginBottom: 6, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.title}</div>
                <div style={{ fontSize: '0.63rem', color: '#64748B', marginBottom: 10 }}>{post.store_location || post.store_name}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#059669' }}>
                    Rs.{Number(post.price || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 600, color: post.is_mine && post.product_id ? '#0B5FFF' : '#64748B', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {post.is_mine && post.product_id ? (
                      <>Tap to sell</>
                    ) : post.is_mine ? (
                      <>Listed</>
                    ) : (
                      <><ShoppingBag size={11} /> Order</>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            {!marketLoading && filteredMarket.length === 0 && (
              <div className="col-span-full text-center py-12" style={{ color: '#64748B' }}>
                {search ? 'No bazaar listings found' : 'No bazaar listings yet'}
                {canMarketPost && !search && (
                  <p className="text-xs mt-2">Tap <strong>List on Bazaar</strong> on any product card to publish here.</p>
                )}
              </div>
            )}
          </div>
          </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 h-full flex items-center justify-center" style={{ color: '#64748B' }}>
              {search ? 'No products found' : 'No products available'}
            </div>
          ) : (
            <POSProductGrid
              products={filtered}
              canMarketPost={canMarketPost}
              onProductTap={openVariantPicker}
              onListBazaar={listOnMarketplace}
            />
          )}
        </div>
      </div>
      {/* ── CART PANEL ──────────────────────────────────────── */}
      <div className={`dgc-pos-cart w-full lg:w-80 xl:w-96 flex flex-col border-t lg:border-t-0 lg:border-l border-[rgba(7,27,82,0.10)] ${mobileTab !== 'cart' ? 'hidden lg:flex' : 'flex'}`}>
        <CartPanel
          cart={cart}
          online={online}
          pendingCount={pendingCount}
          customer={customer}
          customers={customers}
          custSearch={custSearch}
          custDropOpen={custDropOpen}
          showQuickAdd={showQuickAdd}
          quickForm={quickForm}
          quickSaving={quickSaving}
          redeemPoints={redeemPoints}
          customerSearchRef={customerSearchRef}
          cartApi={cartApi}
          onClearCart={clearCart}
          onOpenCheckout={openCheckout}
          onCustSearchChange={(e) => { setCustSearch(e.target.value); setRedeemPoints(0); searchCustomers(e.target.value) }}
          onCustFocus={() => { if (custSearch && customers.length > 0) setCustDropOpen(true) }}
          onCustBlur={() => setTimeout(() => setCustDropOpen(false), 200)}
          onClearCustSearch={() => { setCustSearch(''); setCustomers([]); setShowQuickAdd(false); setCustDropOpen(false) }}
          onUnlinkCustomer={() => { setCustomer(null); setCustSearch(''); setRedeemPoints(0); setCustDropOpen(false) }}
          onLinkCustomer={linkCustomer}
          onShowQuickAdd={() => { setShowQuickAdd(true); setCustDropOpen(false) }}
          onHideQuickAdd={() => setShowQuickAdd(false)}
          onQuickFormChange={setQuickForm}
          onQuickAddSubmit={handleQuickAdd}
          onRedeemPointsChange={setRedeemPoints}
          onClearRedeemPoints={() => setRedeemPoints(0)}
        />
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(7,27,82,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => e.target === e.currentTarget && setShowShortcuts(false)}>
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
              style={{ width: '100%', maxWidth: 520, background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)', border: '1px solid rgba(7,27,82,0.10)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 40px rgba(7,27,82,0.10)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(7,27,82,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#071B52', fontWeight: 800, fontSize: '0.92rem' }}>POS Shortcuts</div>
                <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['F2 / /', 'Focus product search'],
                  ['F3', 'Focus barcode input'],
                  ['Ctrl/Cmd + K', 'Focus customer search'],
                  ['F4', 'Proceed to checkout'],
                  ['F6', 'Toggle products/cart tab'],
                  ['?', 'Show this shortcut panel'],
                  ['Esc', 'Close panel or checkout'],
                ].map(([key, hint]) => (
                  <div key={key} style={{ background: '#ffffff', border: '1px solid rgba(7,27,82,0.08)', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ color: '#071B52', fontWeight: 800, fontSize: '0.74rem' }}>{key}</div>
                    <div style={{ color: '#64748B', fontSize: '0.72rem', marginTop: 2 }}>{hint}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {receipt && (
        <AnimatePresence>
          <Receipt sale={receipt} settings={settings} onClose={() => setReceipt(null)} autoPrint />
        </AnimatePresence>
      )}
      <AnimatePresence>
        {showCalc && <ChangeCalculator total={total} currency={settings.currency} onClose={() => setShowCalc(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showCheckout && (
          <CheckoutModal
            cart={cart} subtotal={subtotal} discAmt={discAmt} taxAmt={taxAmt}
            redeemValue={redeemValue} total={total} discPct={discPct} taxPct={taxPct}
            customer={customer} settings={settings} processing={processing}
            chargeableBookings={chargeableBookings}
            onClose={() => setShowCheckout(false)}
            onConfirm={({ method, amtPaid, folioBookingId: fbId }) => handleCheckout({ method, amtPaid, folioBookingId: fbId })}
          />
        )}
      </AnimatePresence>

      {/* Recall held sales modal */}
      <AnimatePresence>
        {showRecall && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.42)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
            onClick={e => e.target === e.currentTarget && setShowRecall(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: 'rgba(13,17,27,0.92)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 440, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.60)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: '1.1rem', color: '#EDE8DF', margin: 0 }}>Held Sales</h3>
                <button onClick={() => setShowRecall(false)} style={{ background: 'none', border: 'none', color: '#EDE8DF', cursor: 'pointer' }}>✕</button>
              </div>
              {heldSales.map(held => (
                <div key={held.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(101,65,20,0.10)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#EDE8DF' }}>
                      {held.cart.length} item{held.cart.length !== 1 ? 's' : ''}
                      {held.customer && <span style={{ color: '#EDE8DF', marginLeft: 8, fontWeight: 400 }}>· {held.customer.name}</span>}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#EDE8DF', marginTop: 2, opacity: 0.7 }}>
                      Rs. {held.cart.reduce((s, i) => s + i.total, 0).toLocaleString('en-IN')}
                      {' · '}{new Date(held.heldAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleRecallSale(held)} style={{ padding: '5px 14px', fontSize: '0.78rem', background: '#0A84FF', color: '#fff', borderRadius: 8, border: 'none' }}>Recall</button>
                    <button onClick={() => deleteHeldSale(held.id)}
                      style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', color: '#DC2626', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List product on bazaar (camera) ─────────────────────────────────── */}
      <AnimatePresence>
        {listingProduct && (
          <BazaarListModal
            product={listingProduct}
            onClose={() => setListingProduct(null)}
            onListed={onBazaarListed}
          />
        )}
        {showBazaarSnap && (
          <BazaarSnapModal
            shopName={shopName}
            onClose={() => setShowBazaarSnap(false)}
            onListed={onBazaarListed}
          />
        )}
        {showSampleCatalog && (
          <SampleCatalogModal
            onClose={() => setShowSampleCatalog(false)}
            onAdded={onSampleCatalogAdded}
          />
        )}
      </AnimatePresence>

      {/* ── Incoming bazaar orders (seller) ─────────────────────────────────── */}
      <AnimatePresence>
        {showBazaarOrders && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="modal-overlay dgc-modal-layer" onClick={(e) => e.target === e.currentTarget && setShowBazaarOrders(false)}>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="modal-panel dgc-liquid-frosted mx-4 max-w-lg w-full p-6 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="font-display text-lg font-bold text-txt dgc-text-3d flex items-center gap-2">
                  <ShoppingBag size={18} className="text-gold" /> Bazaar Orders
                  {pendingBazaarCount > 0 && (
                    <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">{pendingBazaarCount} new</span>
                  )}
                </h3>
                <button type="button" onClick={() => setShowBazaarOrders(false)} className="p-2 rounded-lg hover:bg-glass text-txt-3"><X size={16} /></button>
              </div>
              <p className="text-xs text-txt-3 mb-3 shrink-0">Online orders from dgcpos.com and the bazaar — accept to create delivery &amp; notify buyer.</p>
              <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
                {incomingBazaarOrders.length === 0 ? (
                  <div className="text-center py-10 text-txt-3 text-sm">No bazaar orders yet. List products with a photo to get online orders.</div>
                ) : incomingBazaarOrders.map((o) => (
                  <div key={o.id} className="glass-card dgc-liquid-frosted p-4 space-y-2">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-txt">{o.order_number}</div>
                        <div className="text-sm text-txt-2 truncate">{o.post_title}</div>
                        <div className="text-xs text-txt-3">From {o.buyer_store_name} · ×{o.quantity} · Rs.{Number(o.total_amount || 0).toLocaleString()}</div>
                      </div>
                      <span className={`text-[0.65rem] font-bold uppercase px-2 py-1 rounded-lg shrink-0 ${o.status === 'pending' ? 'bg-amber-500/15 text-amber-600' : 'bg-glass text-txt-3'}`}>
                        {o.status}
                      </span>
                    </div>
                    {o.delivery_address && (
                      <div className="text-xs text-txt-3">{o.delivery_address} · {o.delivery_phone}</div>
                    )}
                    {o.message && <p className="text-xs text-txt-2 italic">"{o.message}"</p>}
                    {o.status === 'pending' && (
                      <div className="flex gap-2 pt-1">
                        <button type="button" disabled={bazaarOrderUpdating === o.id}
                          onClick={() => updateBazaarOrderStatus(o.id, { status: 'accepted', create_delivery: true })}
                          className="btn-gold flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1">
                          <CheckCircle size={13} /> Accept
                        </button>
                        <button type="button" disabled={bazaarOrderUpdating === o.id}
                          onClick={() => updateBazaarOrderStatus(o.id, { status: 'rejected' })}
                          className="btn-ghost flex-1 py-2 text-xs text-red-500 flex items-center justify-center gap-1">
                          <XCircle size={13} /> Decline
                        </button>
                      </div>
                    )}
                    {o.status === 'accepted' && (
                      <button type="button" disabled={bazaarOrderUpdating === o.id}
                        onClick={() => updateBazaarOrderStatus(o.id, { status: 'dispatched' })}
                        className="btn-ghost w-full py-2 text-xs font-semibold flex items-center justify-center gap-1">
                        <Package size={13} /> Mark dispatched
                      </button>
                    )}
                    {o.status === 'dispatched' && (
                      <button type="button" disabled={bazaarOrderUpdating === o.id}
                        onClick={() => updateBazaarOrderStatus(o.id, { status: 'delivered' })}
                        className="btn-gold w-full py-2 text-xs font-bold flex items-center justify-center gap-1">
                        <CheckCircle size={13} /> Mark delivered
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Marketplace order from POS ─────────────────────────────────────── */}
      <AnimatePresence>
        {marketOrderPost && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="modal-overlay dgc-modal-layer" onClick={(e) => e.target === e.currentTarget && setMarketOrderPost(null)}>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="modal-panel dgc-liquid-frosted mx-4 max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-bold text-txt dgc-text-3d flex items-center gap-2">
                  <ShoppingBag size={18} className="text-gold" /> Order from {marketOrderPost.store_name}
                </h3>
                <button type="button" onClick={() => setMarketOrderPost(null)} className="p-2 rounded-lg hover:bg-glass text-txt-3"><X size={16} /></button>
              </div>
              <p className="text-sm text-txt-2 mb-4">{marketOrderPost.title} — Rs.{Number(marketOrderPost.price || 0).toLocaleString()}</p>
              <form onSubmit={submitMarketOrder} className="space-y-3">
                <div>
                  <label className="input-label">Quantity</label>
                  <input name="qty" type="number" min="1" max="99" defaultValue={1} className="input-field" />
                </div>
                <div>
                  <label className="input-label">Delivery address</label>
                  <textarea name="address" className="input-field min-h-[64px]" required
                    defaultValue={settings.shop_address || user?.account?.business_location || ''} />
                </div>
                <div>
                  <label className="input-label">Phone</label>
                  <input name="phone" className="input-field" required defaultValue={customer?.phone || user?.phone || ''} />
                </div>
                <div>
                  <label className="input-label">Note to seller</label>
                  <textarea name="message" className="input-field min-h-[56px]" placeholder="Ordered from POS counter…" />
                </div>
                <button type="submit" disabled={marketOrderSaving} className="btn-gold w-full py-3 font-bold">
                  {marketOrderSaving ? 'Sending…' : 'Send Order & DM Seller'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Variant Picker (advanced POS) ───────────────────────────────────── */}
      <AnimatePresence>
        {variantPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,27,82,0.18)', zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setVariantPicker(null)}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)', border: '1px solid rgba(7,27,82,0.10)', borderRadius: 16, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 12px 40px rgba(7,27,82,0.10)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(7,27,82,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#071B52' }}>Choose option — {variantPicker.product?.name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Stock per variant</div>
                </div>
                <button onClick={() => setVariantPicker(null)} style={{ color: '#64748B' }}><X size={18} /></button>
              </div>
              <div style={{ maxHeight: '55vh', overflow: 'auto', padding: 8 }}>
                {variantPicker.loading ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#64748B' }}>Loading variants…</div>
                ) : !(variantPicker.variants?.length) ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#64748B' }}>No stock variants</div>
                ) : variantPicker.variants.map(v => (
                  <button key={v.id} onClick={() => addToCart(variantPicker.product, v)}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, margin: '4px 0', background: '#ffffff', border: '1px solid rgba(7,27,82,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{[v.size, v.color].filter(Boolean).join(' / ') || v.sku || 'Option'}</div>
                      <div style={{ fontSize: 10, color: '#64748B', fontFamily: 'monospace' }}>{v.sku || ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#071B52' }}>Rs.{Number(v.effective_price || v.selling_price).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: v.stock_qty < 3 ? '#DC2626' : '#64748B' }}>{v.stock_qty} left</div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ padding: 8, borderTop: '1px solid rgba(7,27,82,0.08)', fontSize: 10, color: '#64748B', textAlign: 'center' }}>Tap an option to add to cart</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
