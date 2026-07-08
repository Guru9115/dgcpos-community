/**
 * DGC Bazaar — social commerce: post, like, order, DM, delivery
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Store, MapPin, Trash2, ImagePlus, X, RefreshCw,
  Megaphone, Tag, Clock, Heart, ShoppingBag, MessageCircle, Phone,
  Truck, CheckCircle, XCircle, Package, Send, Sparkles,
  Search, Zap, TrendingUp, BarChart3, Rocket, LayoutGrid,
  BadgePercent, MonitorPlay, Crown, Upload
} from 'lucide-react'
import toast from 'react-hot-toast'
import { marketplaceAPI, bazaarAdsAPI } from '../api'
import { useAuth } from '../store/AuthContext'
import { useHideAppFooter } from '../hooks/useHideAppFooter'
import { isNativeApp } from '../utils/capacitorInit'
import BazaarAdUploadModal from '../components/bazaar/BazaarAdUploadModal'
import { matchBazaarCategory } from '../utils/bazaarCategory'
import { demoProductImageUrl } from '../utils/demoProductImage'

const fmtPrice = (n) => `रू ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

function BazaarBrand({ onDark = false, className = '' }) {
  return (
    <span className={className}>
      DGC <span className={onDark ? 'dgc-bazaar-brown--on-dark' : 'dgc-bazaar-brown'}>Bazaar</span>
    </span>
  )
}

const timeAgo = (iso) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const STATUS_COLORS = {
  pending: { bg: 'rgba(245,158,11,0.15)', text: '#D97706' },
  accepted: { bg: 'rgba(5,150,105,0.15)', text: '#059669' },
  packed: { bg: 'rgba(11,95,255,0.12)', text: '#0B5FFF' },
  dispatched: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
  delivered: { bg: 'rgba(5,150,105,0.15)', text: '#059669' },
  rejected: { bg: 'rgba(239,68,68,0.12)', text: '#DC2626' },
  cancelled: { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' },
}

const HERO_SLIDES = [
  {
    id: 'bazaar',
    type: 'promo',
    title: 'DGC Bazaar',
    subtitle: 'Nepal\'s local shops — wholesale & retail in one bazaar',
    cta: 'Discover deals',
    gradient: 'linear-gradient(125deg, rgba(7,27,82,0.92) 0%, rgba(11,95,255,0.85) 50%, rgba(99,102,241,0.8) 100%)',
    textLight: true,
  },
  {
    id: 'ad-top-1',
    type: 'ad',
    title: 'Top Banner Ad Space',
    subtitle: '728×90 · Prime visibility · Animate on load',
    cta: 'Advertise here',
    gradient: 'linear-gradient(125deg, rgba(236,72,153,0.25) 0%, rgba(255,255,255,0.55) 45%, rgba(16,185,129,0.2) 100%)',
  },
  {
    id: 'flash',
    type: 'promo',
    title: 'Flash Deals',
    subtitle: 'Limited-time offers from verified DGC stores',
    cta: 'Shop now',
    gradient: 'linear-gradient(125deg, rgba(225,29,72,0.85) 0%, rgba(249,115,22,0.75) 100%)',
    textLight: true,
  },
  {
    id: 'ad-top-2',
    type: 'ad',
    title: 'Sponsored Carousel Slot',
    subtitle: 'Rotating brand campaigns · Side + top bundles',
    cta: 'Book placement',
    gradient: 'linear-gradient(125deg, rgba(245,158,11,0.3) 0%, rgba(255,255,255,0.6) 50%, rgba(11,95,255,0.15) 100%)',
  },
]

const DGC_FASHION_SAMPLES = [
  { id: 'sample-kurta', title: 'Printed Cotton Kurta', store_name: 'DGC POS · Demo Store', price: 1499, image_url: demoProductImageUrl('Printed Cotton Kurta', 'Fashion'), description: 'Fashion sample', like_count: 0, status: 'active', created_at: new Date().toISOString() },
  { id: 'sample-shoes', title: 'Running Shoes', store_name: 'DGC POS · Demo Store', price: 2999, image_url: demoProductImageUrl('Running Shoes', 'Fashion'), description: 'Fashion', like_count: 0, status: 'active', created_at: new Date().toISOString() },
  { id: 'sample-shawl', title: 'Handmade Shawl', store_name: 'DGC POS · Demo Store', price: 1200, image_url: demoProductImageUrl('Handmade Shawl', 'Fashion'), description: 'Local fashion', like_count: 0, status: 'active', created_at: new Date().toISOString() },
  { id: 'sample-jeans', title: 'Denim Jeans', store_name: 'DGC POS · Demo Store', price: 2499, image_url: demoProductImageUrl('Denim Jeans', 'Fashion'), description: 'Fashion', like_count: 0, status: 'active', created_at: new Date().toISOString() },
]

const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '🛍️', icon: LayoutGrid, match: null },
  { id: 'grocery', label: 'Grocery', emoji: '🥬', icon: Store, match: /rice|dal|grocery|food|snack|spice|oil|kirana|honey|tea/i },
  { id: 'fashion', label: 'Fashion', emoji: '👗', icon: Tag, match: /cloth|kurta|sari|dress|shoe|fashion|wear|print|shawl|jeans|sandal/i },
  { id: 'electronics', label: 'Electronics', emoji: '📱', icon: Zap, match: /phone|laptop|tv|electronic|charger|cable|gadget|bulb|led|board/i },
  { id: 'home', label: 'Home', emoji: '🏠', icon: Crown, match: /home|furniture|kitchen|decor|utensil|living/i },
  { id: 'beauty', label: 'Beauty', emoji: '💄', icon: Sparkles, match: /beauty|cosmetic|cream|soap|perfume/i },
  { id: 'kids', label: 'Kids', emoji: '🧸', icon: Package, match: /kid|baby|toy|child/i },
  { id: 'stays', label: 'Stays', emoji: '🏨', icon: Crown, match: /room|lodge|hotel|guesthouse|stay|hostel/i },
]

const BHAU_FALLBACK = [
  { n: 'Tomato Big', p: 'Rs 55/kg', d: 'up' },
  { n: 'Potato Red', p: 'Rs 42/kg', d: 'down' },
  { n: 'Onion Dry', p: 'Rs 68/kg', d: 'up' },
  { n: 'Basmati Rice', p: 'Rs 156/kg', d: 'up' },
  { n: 'Mustard Oil', p: 'Rs 310/L', d: 'flat' },
]

function uniqueStores(items) {
  const s = new Set()
  items.forEach((i) => { if (i.store_name) s.add(i.store_name) })
  return s.size
}

function BhauTicker({ items }) {
  const arrow = { up: '▲', down: '▼', flat: '–' }
  const cls = { up: 'up', down: 'down', flat: '' }
  const tickets = items.slice(0, 12).map((item) => ({
    n: item.title,
    p: fmtPrice(item.price),
    d: 'flat',
  }))
  if (!tickets.length) BHAU_FALLBACK.forEach((r) => tickets.push(r))

  const row = (r, i) => (
    <div key={`${r.n}-${i}`} className="dgc-bz-ticket">
      <span>{r.n}</span>
      <span className="price">{r.p}</span>
      <span className={cls[r.d] || ''}>{arrow[r.d] || '–'}</span>
    </div>
  )

  return (
    <div className="dgc-bz-ticker-wrap">
      <div className="dgc-bz-ticker-band">
        <div className="dgc-bz-ticker-label">Aaja Ko Bhau · Live Rates</div>
        <div className="dgc-bz-ticker-scroll">
          <div className="dgc-bz-ticker-track">
            {tickets.map((r, i) => row(r, i))}
            {tickets.map((r, i) => row(r, `dup-${i}`))}
          </div>
        </div>
      </div>
    </div>
  )
}

function BazaarStallCard({ items, total, onSelect, canOrder }) {
  const stalls = items.slice(0, 4)
  return (
    <div className="dgc-bz-stall-card">
      <div className="dgc-bz-stall-head">
        <span>Nearby Stalls · Nepal</span>
        <span>{uniqueStores(total)} shops · {total.length} listings</span>
      </div>
      {!stalls.length ? (
        <div className="text-center py-6 text-[#c9c2e6] text-sm">No listings yet — be the first seller</div>
      ) : (
        stalls.map((item) => (
          <button
            key={item.id}
            type="button"
            className="dgc-bz-stall-item"
            onClick={() => canOrder && onSelect(item)}
          >
            <div>
              <div className="p-name">{item.title}</div>
              <span className="p-shop">
                {item.store_name || 'Store'}
                {item.store_location ? ` · ${item.store_location}` : ''}
              </span>
            </div>
            <div className="p-price">{fmtPrice(item.price)}</div>
          </button>
        ))
      )}
    </div>
  )
}

function HowBazaarWorks({ canPost, onSell, onTrack }) {
  const steps = [
    {
      num: '01 / Browse',
      icon: Search,
      title: 'Find your stall',
      desc: 'Search products, categories, or browse each retailer\'s stall — like walking a real bazaar aisle.',
    },
    {
      num: '02 / Order',
      icon: ShoppingBag,
      title: 'Pay your way',
      desc: 'Checkout with eSewa, Fonepay, or cash on delivery. Every order is confirmed by the shop selling it.',
    },
    {
      num: '03 / Track',
      icon: Truck,
      title: 'Follow every step',
      desc: 'Live updates as the retailer packs, dispatches, and hands off your package for delivery.',
    },
    {
      num: '04 / Delivered',
      icon: CheckCircle,
      title: 'At your doorstep',
      desc: 'Wholesale bulk or retail singles — fresh from local shops across Nepal, without leaving home.',
    },
  ]

  return (
    <section className="dgc-bz-how">
      <div className="dgc-bz-how-head">
        <span className="dgc-bz-kicker">From click to doorstep</span>
        <h2 className="dgc-bz-display">How DGC Bazaar works</h2>
        <p>One marketplace for every local retailer — browse, order, track, and receive. No middlemen, no mystery fees.</p>
      </div>
      <div className="dgc-bz-steps">
        {steps.map(({ num, icon: Icon, title, desc }) => (
          <div key={num} className="dgc-bz-step">
            <div className="dgc-bz-step-icon"><Icon size={20} strokeWidth={2.2} /></div>
            <div className="num dgc-bz-mono">{num}</div>
            <h3 className="dgc-bz-display">{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>
      <div className="dgc-bz-how-seller">
        <div>
          <h3 className="dgc-bz-display">Run a shop? Bring it to the whole city.</h3>
          <p>List from your DGC POS in minutes, reach buyers beyond your neighbourhood, and manage orders from one dashboard.</p>
        </div>
        <button type="button" className="dgc-bz-how-seller-btn" onClick={onSell}>
          {canPost ? 'List on bazaar →' : 'Register your shop →'}
        </button>
      </div>
      {onTrack && (
        <div className="flex justify-center mt-4">
          <button type="button" className="dgc-bz-hero-chip" onClick={onTrack}>
            <Package size={14} /> Track an existing order
          </button>
        </div>
      )}
    </section>
  )
}

function AdImage({ url, alt }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!url) { setSrc(null); return undefined }
    if (url.startsWith('http')) { setSrc(url); return undefined }
    const publicPath = url.replace('/api/marketplace/files/', '/api/marketplace/public/files/')
    let blobUrl = null
    marketplaceAPI.fetchImage(publicPath).then((res) => {
      blobUrl = URL.createObjectURL(res.data)
      setSrc(blobUrl)
    }).catch(() => marketplaceAPI.fetchImage(url).then((res) => {
      blobUrl = URL.createObjectURL(res.data)
      setSrc(blobUrl)
    }).catch(() => setSrc(null)))
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [url])
  if (!src) return null
  return <img src={src} alt={alt || ''} className="w-full h-full object-cover rounded-lg" />
}

function AdSlot({ variant = 'side', title, subtitle, tall, ad, onBook }) {
  const slotMap = { side: 'side_rail', inline: 'inline', 'top-chip': 'top_chip' }
  const inner = ad ? (
    <a href={ad.link_url || '#'} target={ad.link_url ? '_blank' : undefined} rel="noreferrer"
      className="dgc-ad-slot-inner block h-full" onClick={(e) => !ad.link_url && e.preventDefault()}>
      {ad.image_url ? (
        <div className="absolute inset-0 rounded-[inherit] overflow-hidden opacity-90">
          <AdImage url={ad.image_url} alt={ad.title} />
        </div>
      ) : null}
      <span className="dgc-ad-slot-label relative z-1">Sponsored</span>
      <span className="dgc-ad-slot-title dgc-text-3d relative z-1">{ad.title}</span>
      {ad.subtitle && <span className="text-txt-3 text-[0.6rem] font-semibold relative z-1">{ad.subtitle}</span>}
      <span className="text-[0.5rem] text-txt-3 relative z-1">{ad.store_name}</span>
    </a>
  ) : (
    <button type="button" className="dgc-ad-slot-inner w-full h-full text-left" onClick={onBook}>
      <div className="dgc-ad-slot-pulse" aria-hidden />
      <span className="dgc-ad-slot-label">Ad space</span>
      <span className="dgc-ad-slot-title dgc-text-3d">{title || 'Your brand here'}</span>
      <span className="text-txt-3 text-[0.6rem] font-semibold leading-snug max-w-[8rem]">
        {subtitle || 'Rs 500/wk · Rs 2,000/mo'}
      </span>
    </button>
  )

  return (
    <motion.div
      className={`dgc-ad-slot dgc-liquid-frosted ${variant === 'side' ? `dgc-ad-slot--side${tall ? ' tall' : ''}` : ''} ${variant === 'inline' ? 'dgc-ad-slot--inline' : ''} ${variant === 'top-chip' ? 'dgc-ad-slot--top-chip' : ''}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.35 }}
      data-slot={slotMap[variant] || variant}
    >
      {inner}
    </motion.div>
  )
}

function HeroCarousel({ onCta, slides = HERO_SLIDES }) {
  const [idx, setIdx] = useState(0)
  const items = slides?.length ? slides : HERO_SLIDES

  useEffect(() => {
    setIdx(0)
  }, [items.length])

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 5200)
    return () => clearInterval(t)
  }, [items.length])

  const slide = items[idx]

  return (
    <div className="dgc-bazaar-top-ads">
      <div className="dgc-bazaar-hero-carousel dgc-liquid-frosted">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            className={`dgc-bazaar-hero-slide ${slide.type === 'ad' ? 'dgc-bazaar-hero-slide--ad' : ''}`}
            style={{ background: slide.gradient, position: 'relative' }}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.45 }}
          >
            {slide.image_url && (
              <div className="absolute inset-0 opacity-40">
                <AdImage url={slide.image_url} alt={slide.title} />
              </div>
            )}
            <div className="min-w-0 flex-1 relative z-1">
              {slide.type === 'ad' && (
                <span className="inline-flex items-center gap-1 text-[0.55rem] font-extrabold uppercase tracking-widest text-[#0B5FFF] mb-1">
                  <span className="dgc-ad-slot-pulse" /> Sponsored
                </span>
              )}
              <h2 className={`font-display text-xl sm:text-2xl font-bold dgc-text-3d ${slide.textLight ? 'text-white' : 'text-txt'}`}>
                {slide.title === 'DGC Bazaar' ? <BazaarBrand onDark={slide.textLight} /> : slide.title}
              </h2>
              <p className={`text-sm mt-1 max-w-md ${slide.textLight ? 'text-white/85' : 'text-txt-2'}`}>
                {slide.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCta?.(slide)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold dgc-text-3d transition hover:scale-105 ${
                slide.textLight
                  ? 'bg-white/20 text-white border border-white/40 backdrop-blur'
                  : 'btn-gold'
              }`}
            >
              {slide.cta}
            </button>
          </motion.div>
        </AnimatePresence>
        <div className="dgc-bazaar-hero-dots">
          {items.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`dgc-bazaar-hero-dot ${i === idx ? 'active' : ''}`}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DgCollectionAdBanner() {
  return (
    <motion.div
      className="dgc-dg-collection-ad px-3 sm:px-4 max-w-[1400px] mx-auto mb-2"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
    >
      <a
        href="tel:9700190279"
        className="dgc-dg-collection-ad__link"
        title="D&G Collection — Ladies Fashion & Accessories"
        aria-label="Call D&G Collection at 9700190279"
      >
        <span className="dgc-dg-collection-ad__badge">Sponsored</span>
        <img
          className="dgc-dg-collection-ad__img"
          src="/images/dg-collection-banner.jpg"
          alt="D&G Collection — Ladies Fashion & Accessories. Baba Chowk, Mulpani. Call 9700190279 or 9849585425"
          width={1024}
          height={205}
          loading="eager"
          decoding="async"
        />
      </a>
    </motion.div>
  )
}

function MarketingToolsPanel({ onTool }) {
  const tools = [
    { id: 'boost', label: 'Boost listing', icon: Rocket, wrap: 'blue' },
    { id: 'featured', label: 'Go featured', icon: Crown, wrap: 'gold' },
    { id: 'flash', label: 'Flash deal', icon: Zap, wrap: 'pink' },
    { id: 'banner', label: 'Banner ad', icon: MonitorPlay, wrap: 'emerald' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, wrap: 'blue' },
    { id: 'promo', label: 'Promo code', icon: BadgePercent, wrap: 'gold' },
    { id: 'trending', label: 'Trending', icon: TrendingUp, wrap: 'pink' },
    { id: 'megaphone', label: 'Announce', icon: Megaphone, wrap: 'emerald' },
  ]

  return (
    <div className="dgc-bazaar-mkt-tools">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-sm dgc-text-3d flex items-center gap-2">
          <Sparkles size={16} className="text-gold" /> Marketing tools
        </h3>
        <span className="text-[0.55rem] font-bold uppercase tracking-wider text-txt-3">Seller suite</span>
      </div>
      <p className="text-txt-3 text-xs mt-1">Promote listings, book ad slots, and grow your pasal online.</p>
      <div className="dgc-bazaar-mkt-grid">
        {tools.map((t) => (
          <button key={t.id} type="button" className="dgc-bazaar-mkt-btn" onClick={() => onTool(t.id)}>
            <span className={`icon-wrap ${t.wrap}`}><t.icon size={14} /></span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MarketplaceImage({ url, alt, className = '' }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!url) {
      setSrc(null)
      return undefined
    }
    if (url.startsWith('data:') || url.startsWith('http')) {
      setSrc(url)
      return undefined
    }
    let blobUrl = null
    marketplaceAPI.fetchImage(url)
      .then((res) => {
        blobUrl = URL.createObjectURL(res.data)
        setSrc(blobUrl)
      })
      .catch(() => setSrc(null))
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [url])

  if (!url) return null
  if (!src) {
    return <div className={`dgc-mp-image-skeleton ${className}`} />
  }
  return (
    <div className={`dgc-mp-image-wrap ${className}`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      <div className="dgc-mp-image-shine" aria-hidden />
    </div>
  )
}

function StoreBadge({ name, location }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="dgc-mp-store-avatar">
        {(name || 'S')[0].toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="text-txt font-bold text-sm dgc-text-3d truncate">{name || 'Store'}</div>
        {location && (
          <div className="text-txt-3 text-xs flex items-center gap-1 truncate">
            <MapPin size={10} /> {location}
          </div>
        )}
      </div>
    </div>
  )
}

function OrderModal({ post, onClose, onOrdered }) {
  const { user } = useAuth()
  const [qty, setQty] = useState(1)
  const [message, setMessage] = useState('')
  const [address, setAddress] = useState(user?.account?.business_location || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!address.trim()) return toast.error('Delivery address is required')
    if (!phone.trim()) return toast.error('Phone number is required')
    setSaving(true)
    try {
      const res = await marketplaceAPI.placeOrder(post.id, {
        quantity: Number(qty) || 1,
        message: message.trim(),
        delivery_address: address.trim(),
        delivery_phone: phone.trim(),
      })
      toast.success('Order sent — seller notified via DM')
      onOrdered(res.data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not place order')
    } finally {
      setSaving(false)
    }
  }

  const total = Number(post.price || 0) * (Number(qty) || 1)

  return (
    <div className="modal-overlay dgc-modal-layer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="modal-panel dgc-mp-order-modal mx-4 max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-txt dgc-text-3d flex items-center gap-2">
            <ShoppingBag size={20} className="text-gold" /> Place Order
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-glass text-txt-3">
            <X size={18} />
          </button>
        </div>

        <div className="dgc-mp-order-preview mb-4 p-3 rounded-2xl flex gap-3">
          {post.image_url && (
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
              <MarketplaceImage url={post.image_url} alt={post.title} className="!aspect-square !max-h-16" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-txt dgc-text-3d truncate">{post.title}</div>
            <div className="text-sm text-txt-2">{post.store_name}</div>
            <div className="text-gold font-bold text-sm mt-0.5">{fmtPrice(post.price)} each</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Quantity</label>
              <input type="number" min="1" max="99" className="input-field" value={qty}
                onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <label className="input-label">Total</label>
              <div className="input-field bg-glass font-bold text-gold">{fmtPrice(total)}</div>
            </div>
          </div>
          <div>
            <label className="input-label">DM to seller (optional)</label>
            <textarea className="input-field min-h-[72px]" value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Size, colour, pickup time, special notes…" />
          </div>
          <div>
            <label className="input-label">Delivery address</label>
            <textarea className="input-field min-h-[64px]" value={address}
              onChange={(e) => setAddress(e.target.value)} required />
          </div>
          <div>
            <label className="input-label">Phone</label>
            <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="98XXXXXXXX" required />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-3">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex-[1.4] py-3 font-bold flex items-center justify-center gap-2">
              <Send size={16} /> {saving ? 'Sending…' : 'Send Order & DM'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function ProductGridCard({ post, index, canManage, canOrder, onDelete, deleting, onLike, liking, onOrder, onMessage, onCall }) {
  const liked = post.liked_by_me
  const likeCount = post.like_count || 0
  const isHot = (post.like_count || 0) >= 3

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.35) }}
      className="dgc-bazaar-product dgc-bz-deal-card"
    >
      <div className="dgc-bz-deal-img">
        {(isHot || String(post.id).startsWith('sample')) && (
          <span className="dgc-bazaar-product-badge dgc-bz-deal-tag">{String(post.id).startsWith('sample') ? 'DGC POS' : 'LIVE'}</span>
        )}
        {post.image_url ? (
          <MarketplaceImage url={post.image_url} alt={post.title} className="!h-full !max-h-none !rounded-none" />
        ) : (
          <span>🛍️</span>
        )}
      </div>
      <div className="dgc-bazaar-product-actions dgc-bazaar-product-actions--social">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onLike(post) }}
          disabled={liking === post.id}
          className="dgc-bazaar-quick-btn dgc-bazaar-quick-btn--heart"
          title="Like this product"
        >
          <Heart size={14} className={liked ? 'fill-red-500 text-red-500' : ''} />
          <span>{likeCount > 0 ? likeCount : ''}</span>
        </button>
        {canOrder && !post.is_mine && post.status === 'active' && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMessage?.(post) }}
              className="dgc-bazaar-quick-btn dgc-bazaar-quick-btn--msg"
              title="Message seller — order & DM"
            >
              <MessageCircle size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCall?.(post) }}
              className="dgc-bazaar-quick-btn dgc-bazaar-quick-btn--call"
              title="Call seller"
            >
              <Phone size={14} />
            </button>
            <button type="button" onClick={() => onOrder(post)} className="dgc-bazaar-quick-btn primary">
              <ShoppingBag size={12} /> Buy
            </button>
          </>
        )}
        {canManage && post.is_mine && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(post) }}
            disabled={deleting === post.id}
            className="dgc-bazaar-quick-btn"
            style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,0.35)' }}
            title="Remove from DGC Bazaar"
          >
            <Trash2 size={12} /> {deleting === post.id ? '…' : 'Remove'}
          </button>
        )}
      </div>
      <div className="dgc-bazaar-product-body dgc-bz-deal-body">
        <span className="dgc-bazaar-product-store dgc-bz-deal-shop truncate">
          {post.store_name}{post.store_location ? ` · ${post.store_location}` : ''}
        </span>
        <h3 className="dgc-bazaar-product-title dgc-bz-deal-name">{post.title}</h3>
        {post.listing_type === 'stay' && (
          <div className="text-[0.62rem] font-bold text-[#0B5FFF] uppercase tracking-wide">
            {post.location_city ? `${post.location_city} · ` : ''}
            {post.availability_badge === 'sold_out' ? 'Sold out' : post.availability_badge === 'limited' ? 'Limited dates' : 'Stays'}
          </div>
        )}
        <div className="dgc-bazaar-product-footer dgc-bz-deal-prices">
          <span className="dgc-bazaar-product-price dgc-bz-deal-price">
            {post.listing_type === 'stay'
              ? `${fmtPrice(post.from_price || post.price)}/night`
              : fmtPrice(post.price)}
          </span>
          <span className="text-[0.55rem] text-txt-3 flex items-center gap-0.5">
            <Clock size={9} /> {timeAgo(post.created_at)}
          </span>
        </div>
      </div>
    </motion.article>
  )
}

function PostCard({ post, canManage, canOrder, onDelete, deleting, onLike, liking, onOrder, onMessage, onCall }) {
  return (
    <ProductGridCard
      post={post}
      index={0}
      canManage={canManage}
      canOrder={canOrder}
      onDelete={onDelete}
      deleting={deleting}
      onLike={onLike}
      liking={liking}
      onOrder={onOrder}
      onMessage={onMessage}
      onCall={onCall}
    />
  )
}

function OrderRow({ order, accountId, onStatusUpdate, updating }) {
  const isSeller = order.seller_account_id === accountId
  const isBuyer = order.buyer_account_id === accountId
  const colors = STATUS_COLORS[order.status] || STATUS_COLORS.pending

  const setStatus = (status, extra = {}) => {
    onStatusUpdate(order.id, { status, ...extra })
  }

  return (
    <div className="dgc-mp-order-row glass-card dgc-liquid-frosted p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-txt dgc-text-3d text-sm">{order.order_number}</div>
          <div className="text-txt-2 text-sm mt-0.5 truncate">{order.post_title}</div>
          <div className="text-txt-3 text-xs mt-1">
            {isSeller ? `From ${order.buyer_store_name}` : `To ${order.seller_store_name}`}
            {' · '}×{order.quantity} · {fmtPrice(order.total_amount)}
          </div>
        </div>
        <span className="dgc-mp-status-pill" style={{ background: colors.bg, color: colors.text }}>
          {order.status}
        </span>
      </div>

      {order.message && (
        <p className="text-txt-2 text-sm bg-glass rounded-xl p-2.5 italic">"{order.message}"</p>
      )}
      {order.delivery_address && (
        <div className="text-txt-3 text-xs flex items-start gap-1.5">
          <Truck size={12} className="shrink-0 mt-0.5" />
          <span>{order.delivery_address} · {order.delivery_phone}</span>
        </div>
      )}

      {isSeller && order.status === 'pending' && (
        <div className="flex gap-2">
          <button type="button" disabled={updating === order.id}
            onClick={() => setStatus('accepted', { create_delivery: true })}
            className="btn-gold flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1">
            <CheckCircle size={14} /> Accept & Deliver
          </button>
          <button type="button" disabled={updating === order.id}
            onClick={() => setStatus('rejected')}
            className="btn-ghost flex-1 py-2 text-xs text-red-500 flex items-center justify-center gap-1">
            <XCircle size={14} /> Decline
          </button>
        </div>
      )}
      {isSeller && order.status === 'accepted' && (
        <button type="button" disabled={updating === order.id}
          onClick={() => setStatus('dispatched')}
          className="btn-ghost w-full py-2 text-xs font-semibold flex items-center justify-center gap-1">
          <Package size={14} /> Mark Dispatched
        </button>
      )}
      {isSeller && order.status === 'dispatched' && (
        <button type="button" disabled={updating === order.id}
          onClick={() => setStatus('delivered')}
          className="btn-gold w-full py-2 text-xs font-bold flex items-center justify-center gap-1">
          <CheckCircle size={14} /> Mark Delivered
        </button>
      )}
      {isBuyer && order.status === 'pending' && (
        <button type="button" disabled={updating === order.id}
          onClick={() => setStatus('cancelled')}
          className="btn-ghost w-full py-2 text-xs text-txt-3">
          Cancel order
        </button>
      )}
      {order.delivery_order_id && (
        <a href="/deliveries" className="text-xs text-gold hover:underline flex items-center gap-1">
          <Truck size={12} /> View delivery #{order.delivery_order_id}
        </a>
      )}
    </div>
  )
}

function CreatePostModal({ onClose, onCreated, shopName }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const onPick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Please choose an image file')
    if (f.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const clearImage = () => {
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Product name is required')
    setSaving(true)
    try {
      let res
      if (file) {
        res = await marketplaceAPI.createWithImage(file, {
          title: title.trim(),
          description: description.trim(),
          price: Number(price) || 0,
        })
      } else {
        res = await marketplaceAPI.create({
          title: title.trim(),
          description: description.trim(),
          price: Number(price) || 0,
          visibility: 'public',
        })
      }
      toast.success('Listed on DGC Bazaar')
      onCreated(res.data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not publish post')
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <div className="modal-overlay dgc-modal-layer dgc-upload-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="modal-panel dgc-upload-modal dgc-mp-create-modal dgc-liquid-frosted mx-4 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h2 className="font-display text-xl font-semibold text-txt dgc-text-3d flex items-center gap-2">
            <Sparkles size={20} className="text-gold" /> New listing
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-glass text-txt-3">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="dgc-upload-modal-body px-6 pb-4 space-y-4">
            <p className="text-txt-3 text-sm">
              Sell online from <strong className="text-txt">{shopName}</strong> — buyers can like, order & DM you.
            </p>
            <div>
              <label className="input-label">Product name</label>
              <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Cotton Kurta — Blue, Size M" autoFocus />
            </div>
            <div>
              <label className="input-label">Price (रू)</label>
              <input type="number" min="0" step="1" className="input-field" value={price}
                onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="input-label">Description</label>
              <textarea className="input-field min-h-[88px]" value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Condition, sizes, delivery options…" />
            </div>
            <div>
              <label className="input-label">Product photo</label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
              {preview ? (
                <div className="relative rounded-2xl overflow-hidden border border-glass-border">
                  <img src={preview} alt="Preview" className="w-full max-h-52 object-cover" />
                  <button type="button" onClick={clearImage}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 text-txt-3 shadow">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="dgc-mp-upload-zone w-full py-10 rounded-2xl flex flex-col items-center gap-2 text-txt-3">
                  <ImagePlus size={32} className="text-gold opacity-70" />
                  <span className="text-sm font-semibold dgc-text-3d">Upload product photo</span>
                  <span className="text-xs">High-quality images sell faster</span>
                </button>
              )}
            </div>
          </div>
          <div className="dgc-modal-actions flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-3">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex-[1.4] py-3 font-bold">
              {saving ? 'Publishing…' : 'Publish & Sell Online'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )

  return createPortal(modal, document.body)
}

function matchCategory(post, catId) {
  return matchBazaarCategory(post, catId)
}

export default function Marketplace() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [adModalOpen, setAdModalOpen] = useState(false)
  const [orderPost, setOrderPost] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [liking, setLiking] = useState(null)
  const [updating, setUpdating] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('fashion')
  const initialTab = searchParams.get('tab') || 'feed'
  const [tab, setTab] = useState(initialTab)

  const canPost = ['owner', 'superadmin', 'manager'].includes(user?.role)
  const canOrder = !!user?.account_id
  const shopName = user?.account?.name || user?.full_name || 'Your Store'
  const accountId = user?.account_id

  useHideAppFooter(modalOpen || adModalOpen || !!orderPost)

  useEffect(() => {
    if (searchParams.get('tab') === 'ads' && canPost) setAdModalOpen(false)
  }, [searchParams, canPost])

  const { data: publicAds = [] } = useQuery({
    queryKey: ['bazaar-ads-public'],
    queryFn: () => bazaarAdsAPI.public().then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const { data: myAds = [], refetch: refetchMyAds } = useQuery({
    queryKey: ['bazaar-ads-mine'],
    queryFn: () => bazaarAdsAPI.mine().then((r) => (Array.isArray(r.data) ? r.data : [])),
    enabled: canPost && tab === 'ads',
    staleTime: 30_000,
  })

  const adsBySlot = useMemo(() => {
    const m = { top_carousel: [], side_rail: [], inline: [], top_chip: [] }
    publicAds.forEach((a) => {
      if (m[a.slot_type]) m[a.slot_type].push(a)
    })
    return m
  }, [publicAds])

  const pickAd = (slot, index = 0) => {
    const list = adsBySlot[slot]
    if (!list?.length) return undefined
    return list[index % list.length]
  }

  const heroSlides = useMemo(() => {
    const adSlides = []
    ;(adsBySlot.top_carousel || []).forEach((ad) => {
      const imgs = ad.images?.length ? ad.images : (ad.image_url ? [ad.image_url] : [null])
      imgs.forEach((image_url, i) => {
        adSlides.push({
          id: `ad-${ad.id}-${i}`,
          type: 'ad',
          title: ad.title,
          subtitle: ad.subtitle || ad.store_name || 'Sponsored promotion',
          cta: ad.link_url ? 'Shop now →' : 'Learn more',
          gradient: 'linear-gradient(125deg, rgba(26,58,92,0.88) 0%, rgba(230,126,34,0.35) 100%)',
          textLight: true,
          image_url,
          link_url: ad.link_url,
        })
      })
    })
    return adSlides.length ? [...adSlides, ...HERO_SLIDES] : HERO_SLIDES
  }, [adsBySlot])

  const switchTab = (t) => {
    setTab(t)
    setSearchParams(t === 'feed' ? {} : { tab: t }, { replace: true })
  }

  const { data: posts = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['marketplace', tab === 'mine' ? 'mine' : 'feed'],
    queryFn: () => marketplaceAPI
      .list({ scope: tab === 'mine' ? 'mine' : 'feed' })
      .then((r) => (Array.isArray(r.data) ? r.data : [])),
    enabled: tab !== 'orders' && tab !== 'ads',
    staleTime: 20_000,
  })

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['marketplace-orders'],
    queryFn: () => marketplaceAPI.listOrders({ scope: 'all' }).then((r) => (Array.isArray(r.data) ? r.data : [])),
    enabled: tab === 'orders',
    staleTime: 15_000,
  })

  const incomingCount = orders.filter((o) => o.seller_account_id === accountId && o.status === 'pending').length

  const onCreated = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['marketplace'] })
    switchTab('feed')
  }, [qc])

  const onLike = async (post) => {
    if (String(post.id).startsWith('sample')) {
      toast('Sign in and browse live listings to like products', { icon: '❤️' })
      return
    }
    setLiking(post.id)
    try {
      const res = await marketplaceAPI.toggleLike(post.id)
      qc.setQueryData(['marketplace', tab === 'mine' ? 'mine' : 'feed'], (old) =>
        (old || []).map((p) => p.id === post.id
          ? { ...p, liked_by_me: res.data.liked, like_count: res.data.like_count }
          : p))
    } catch {
      toast.error('Could not update like')
    } finally {
      setLiking(null)
    }
  }

  const onMessageSeller = (post) => {
    if (post.is_mine) return
    if (isNativeApp()) {
      setOrderPost(post)
      toast('Add a message — seller gets instant DM when you order', { icon: '💬' })
      return
    }
    setOrderPost(post)
  }

  const onCallSeller = (post) => {
    const phone = (post.store_phone || '').replace(/[^\d+]/g, '')
    if (!phone) {
      toast.error('Seller phone not listed — use Message to order & DM')
      return
    }
    window.location.href = `tel:${phone}`
  }

  const onStatusUpdate = async (orderId, data) => {
    setUpdating(orderId)
    try {
      await marketplaceAPI.updateOrderStatus(orderId, data)
      toast.success(`Order ${data.status}`)
      refetchOrders()
      qc.invalidateQueries({ queryKey: ['notifications'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update order')
    } finally {
      setUpdating(null)
    }
  }

  const onDelete = async (post) => {
    if (String(post.id).startsWith('sample')) {
      toast.error('Demo listings cannot be removed')
      return
    }
    if (!window.confirm(`Remove "${post.title}" from DGC Bazaar?`)) return
    setDeleting(post.id)
    try {
      await marketplaceAPI.remove(post.id)
      toast.success('Removed from DGC Bazaar')
      qc.invalidateQueries({ queryKey: ['marketplace'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['pos-marketplace'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove listing')
    } finally {
      setDeleting(null)
    }
  }

  const visiblePosts = useMemo(() => {
    const q = search.trim().toLowerCase()
    let pool = posts
    if (category === 'fashion') {
      const liveFashion = posts.filter((p) => matchCategory(p, 'fashion'))
      const titles = new Set(liveFashion.map((p) => p.title))
      pool = [...liveFashion, ...DGC_FASHION_SAMPLES.filter((s) => !titles.has(s.title))]
    }
    return pool.filter((p) => {
      if (p.status && p.status !== 'active') return false
      if (category !== 'all' && category !== 'fashion' && !matchCategory(p, category)) return false
      if (category === 'fashion' && !matchCategory(p, 'fashion') && !String(p.id).startsWith('sample')) return false
      if (!q) return true
      return (
        (p.title || '').toLowerCase().includes(q)
        || (p.store_name || '').toLowerCase().includes(q)
        || (p.description || '').toLowerCase().includes(q)
      )
    })
  }, [posts, search, category])
  const flashDeals = [...posts].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 8)

  const onMarketingTool = (toolId) => {
    if (['banner', 'boost', 'featured', 'flash', 'megaphone'].includes(toolId)) {
      if (!canPost) return toast.error('Only store owners and managers can upload ads')
      setAdModalOpen(true)
      return
    }
    toast('Coming soon — analytics & promo codes', { icon: 'ℹ️' })
  }

  const onHeroCta = (slide) => {
    if (slide.type === 'ad') {
      if (slide.link_url) {
        window.open(slide.link_url, '_blank', 'noopener,noreferrer')
        return
      }
      if (canPost) setAdModalOpen(true)
      else toast('Browse sponsored listings from DGC Bazaar retailers', { icon: '📢' })
      return
    }
    if (slide.id === 'flash') {
      document.getElementById('dgc-bazaar-flash')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }
    switchTab('feed')
  }

  const gridWithAds = []
  visiblePosts.forEach((post, i) => {
    gridWithAds.push({ type: 'product', post, index: i })
    if ((i + 1) % 8 === 0 && i < visiblePosts.length - 1) {
      gridWithAds.push({ type: 'ad', key: `inline-ad-${i}` })
    }
  })

  return (
    <div className="dgc-bazaar-world dgc-bazaar--final dgc-marketplace-page">
      {tab !== 'orders' && tab !== 'ads' && <BhauTicker items={visiblePosts} />}

      {tab !== 'orders' && tab !== 'ads' && (
        <section className="dgc-bz-hero">
          <div className="dgc-bz-hero-inner">
            <div>
              <div className="dgc-bz-eyebrow">सजिलो किनमेल · घरमै डेलिभरी</div>
              <h1 className="dgc-bz-display">Nepal&apos;s local shops.<br />One <span className="dgc-bz-hero-accent">bazaar</span> at your door.</h1>
              <p className="sub">Wholesale bulk or retail singles from verified DGC POS retailers — same-day delivery, eSewa, Fonepay, and cash on delivery.</p>
              <div className="dgc-bz-hero-stats">
                <div className="dgc-bz-hero-stat">
                  <strong>{uniqueStores(posts)}</strong>
                  <span>Active shops</span>
                </div>
                <div className="dgc-bz-hero-stat">
                  <strong>{posts.length}</strong>
                  <span>Live listings</span>
                </div>
                <div className="dgc-bz-hero-stat">
                  <strong>COD</strong>
                  <span>Cash on delivery</span>
                </div>
              </div>
              <form className="dgc-bazaar-search-wrap flex" onSubmit={(e) => e.preventDefault()}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products, shops, categories…"
                  aria-label="Search bazaar"
                />
                <button type="submit" className="dgc-bazaar-search-btn shrink-0">Search</button>
              </form>
              <div className="dgc-bz-hero-actions">
                <button
                  type="button"
                  className="dgc-bz-hero-chip dgc-bz-hero-chip--primary"
                  onClick={() => document.getElementById('dgc-bazaar-deals')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  <ShoppingBag size={14} /> Shop today&apos;s deals
                </button>
                <button
                  type="button"
                  className="dgc-bz-hero-chip"
                  onClick={() => switchTab('orders')}
                >
                  <Truck size={14} /> Track order
                </button>
                <button
                  type="button"
                  className="dgc-bz-hero-chip"
                  onClick={() => (canPost ? setModalOpen(true) : window.location.href = '/login')}
                >
                  <Store size={14} /> {canPost ? 'List a product' : 'Become a seller'}
                </button>
              </div>
              <div className="dgc-bz-trust-bar">
                <div className="dgc-bz-badges">
                  <div className="dgc-bz-badge"><span className="icon">✓</span> Verified sellers only</div>
                  <div className="dgc-bz-badge"><span className="icon">🚚</span> Same-day delivery</div>
                  <div className="dgc-bz-badge"><span className="icon">🔒</span> Secure payments</div>
                  <div className="dgc-bz-badge"><span className="icon">↩</span> Easy returns</div>
                </div>
              </div>
            </div>
            <BazaarStallCard
              items={visiblePosts}
              total={posts}
              canOrder={canOrder}
              onSelect={setOrderPost}
            />
          </div>
        </section>
      )}

      {tab !== 'orders' && tab !== 'ads' && <DgCollectionAdBanner />}

      {tab !== 'orders' && tab !== 'ads' && (
        <div className="px-3 sm:px-4 max-w-[1400px] mx-auto -mt-2 mb-2">
          <HeroCarousel slides={heroSlides} onCta={onHeroCta} />
        </div>
      )}

      {tab !== 'orders' && tab !== 'ads' && (
        <HowBazaarWorks
          canPost={canPost}
          onSell={() => (canPost ? setModalOpen(true) : window.location.href = '/login')}
          onTrack={() => switchTab('orders')}
        />
      )}

      <div className="dgc-bazaar-shell">
        <aside className="dgc-bazaar-rail dgc-bazaar-rail--left">
          <AdSlot variant="side" tall ad={pickAd('side_rail', 0)} onBook={() => setAdModalOpen(true)} />
          <AdSlot variant="side" ad={pickAd('side_rail', 1)} onBook={() => setAdModalOpen(true)} />
        </aside>

        <div className="dgc-bazaar-main dgc-marketplace-scroll">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
            <h2 className="section-title dgc-bz-type-3d-light flex items-center gap-2 text-xl sm:text-2xl">
              <Store size={22} className="text-[var(--bz-marigold-2)]" /> <BazaarBrand onDark />
            </h2>
            <button type="button" onClick={() => { refetch(); refetchOrders() }}
              disabled={isFetching} className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5">
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          <div className="dgc-bazaar-mobile-ads">
            <AdSlot variant="top-chip" ad={pickAd('top_chip', 0)} onBook={() => setAdModalOpen(true)} />
            <AdSlot variant="top-chip" ad={pickAd('top_chip', 1)} onBook={() => setAdModalOpen(true)} />
            <AdSlot variant="top-chip" ad={pickAd('top_chip', 2)} onBook={() => setAdModalOpen(true)} />
          </div>

          <div className="dgc-bazaar-stats">
            <div className="dgc-bazaar-stat glass-card dgc-liquid-frosted">
              <div className="dgc-bazaar-stat-val dgc-text-3d text-[#0B5FFF]">{posts.length}</div>
              <div className="dgc-bazaar-stat-lbl">Live listings</div>
            </div>
            <div className="dgc-bazaar-stat glass-card dgc-liquid-frosted">
              <div className="dgc-bazaar-stat-val dgc-text-3d text-[#059669]">{orders.length}</div>
              <div className="dgc-bazaar-stat-lbl">Orders</div>
            </div>
            <div className="dgc-bazaar-stat glass-card dgc-liquid-frosted">
              <div className="dgc-bazaar-stat-val dgc-text-3d text-[#EC4899]">{incomingCount}</div>
              <div className="dgc-bazaar-stat-lbl">Pending</div>
            </div>
          </div>

          {canPost && tab !== 'orders' && (
            <>
              <MarketingToolsPanel onTool={onMarketingTool} />
              <button type="button" onClick={() => setModalOpen(true)}
                className="dgc-mp-composer glass-card dgc-liquid-frosted w-full p-4 text-left flex items-center gap-3 mb-3">
                <div className="dgc-mp-composer-icon">
                  <Megaphone size={18} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-txt-3 text-xs font-bold uppercase tracking-wider">Sell online</div>
                  <div className="text-txt-2 text-sm truncate">List a product from {shopName}…</div>
                </div>
                <Plus size={20} className="text-gold shrink-0" />
              </button>
            </>
          )}

          <div className="dgc-submenu-bar dgc-mp-tabs">
            <button type="button" className={`dgc-submenu-tab dgc-text-3d ${tab === 'feed' ? 'active' : ''}`}
              onClick={() => switchTab('feed')}>Discover</button>
            <button type="button" className={`dgc-submenu-tab dgc-text-3d ${tab === 'orders' ? 'active' : ''}`}
              onClick={() => switchTab('orders')}>
              Orders{incomingCount > 0 && <span className="dgc-mp-tab-badge">{incomingCount}</span>}
            </button>
            {canPost && (
              <button type="button" className={`dgc-submenu-tab dgc-text-3d ${tab === 'mine' ? 'active' : ''}`}
                onClick={() => switchTab('mine')}>My listings</button>
            )}
            {canPost && (
              <button type="button" className={`dgc-submenu-tab dgc-text-3d ${tab === 'ads' ? 'active' : ''}`}
                onClick={() => switchTab('ads')}>My ads</button>
            )}
          </div>

          {tab === 'ads' && canPost && (
            <div className="space-y-3 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-txt-3">Weekly Rs 500 · Monthly Rs 2,000 — pay then superadmin approves.</p>
                <button type="button" onClick={() => setAdModalOpen(true)} className="btn-gold px-4 py-2 text-xs font-bold flex items-center gap-1.5">
                  <Upload size={14} /> Upload ad
                </button>
              </div>
              {myAds.length === 0 ? (
                <div className="glass-card dgc-liquid-frosted p-8 text-center text-txt-3 text-sm">No ads yet. Upload a banner to promote your pasal.</div>
              ) : (
                <div className="space-y-2">
                  {myAds.map((a) => (
                    <div key={a.id} className="glass-card dgc-liquid-frosted p-4 flex justify-between gap-3 items-start">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-txt">{a.title}</div>
                        <div className="text-xs text-txt-3">{a.slot_type} · {a.package} · Rs {Number(a.amount).toLocaleString()}</div>
                        <div className="text-xs mt-1 capitalize"><span className={`font-semibold ${a.status === 'active' ? 'text-emerald-500' : a.status === 'pending_approval' ? 'text-amber-500' : 'text-txt-3'}`}>{a.status.replace('_', ' ')}</span></div>
                      </div>
                      {a.ends_at && a.status === 'active' && (
                        <div className="text-[0.65rem] text-txt-3 shrink-0">Until {new Date(a.ends_at).toLocaleDateString()}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab !== 'orders' && (
            <div className="dgc-bz-section">
              <div className="dgc-bz-section-head">
                <div>
                  <span className="dgc-bz-kicker">Browse the bazaar</span>
                  <h2 className="dgc-bz-display text-2xl sm:text-3xl">Shop by category</h2>
                </div>
                <button type="button" className="dgc-bz-view-all" onClick={() => document.getElementById('dgc-bazaar-deals')?.scrollIntoView({ behavior: 'smooth' })}>
                  View all →
                </button>
              </div>
              <div className="dgc-bz-cat-grid">
                {CATEGORIES.map((c) => {
                  const count = c.id === 'all'
                    ? posts.length
                    : c.id === 'fashion'
                      ? posts.filter((p) => matchCategory(p, 'fashion')).length + DGC_FASHION_SAMPLES.length
                      : posts.filter((p) => matchCategory(p, c.id)).length
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`dgc-bz-cat-card ${category === c.id ? 'active' : ''}`}
                      onClick={() => setCategory(c.id)}
                    >
                      <div className="emoji">{c.emoji}</div>
                      <div className="cname">{c.label}</div>
                      <span className="ccount">{count} from DGC POS</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {tab !== 'orders' && flashDeals.length > 0 && (
            <div id="dgc-bazaar-flash" className="dgc-bazaar-flash glass-card dgc-liquid-frosted">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display font-bold text-sm dgc-text-3d flex items-center gap-1.5 text-[#E11D48]">
                  <Zap size={14} /> Flash deals
                </h3>
                <span className="text-[0.55rem] font-bold uppercase tracking-wider text-txt-3">Ends soon</span>
              </div>
              <div className="dgc-bazaar-flash-track">
                {flashDeals.map((p) => (
                  <button
                    key={`flash-${p.id}`}
                    type="button"
                    className="dgc-bazaar-flash-card"
                    onClick={() => canOrder && !p.is_mine && setOrderPost(p)}
                  >
                    {p.image_url ? (
                      <MarketplaceImage url={p.image_url} alt={p.title} className="!aspect-square !max-h-none" />
                    ) : (
                      <div className="flash-placeholder">⚡</div>
                    )}
                    <div className="flash-meta dgc-text-3d truncate">{p.title}</div>
                    <div className="flash-meta flash-price">{fmtPrice(p.price)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'orders' ? (
            ordersLoading ? (
              <div className="glass-card dgc-liquid-frosted p-10 text-center text-txt-3 text-sm">Loading orders…</div>
            ) : orders.length === 0 ? (
              <div className="glass-card dgc-liquid-frosted p-10 text-center space-y-3">
                <ShoppingBag size={36} className="mx-auto text-txt-3 opacity-40" />
                <p className="text-txt-2 font-semibold dgc-text-3d">No orders yet</p>
                <p className="text-txt-3 text-sm">Browse Discover and place an order — sellers get instant DM notification.</p>
              </div>
            ) : (
              <div className="space-y-3 max-w-2xl">
                {orders.map((o) => (
                  <OrderRow key={o.id} order={o} accountId={accountId}
                    onStatusUpdate={onStatusUpdate} updating={updating} />
                ))}
              </div>
            )
          ) : isLoading ? (
            <div className="dgc-bazaar-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="dgc-mp-image-skeleton rounded-2xl min-h-[12rem]" />
              ))}
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className="glass-card dgc-liquid-frosted p-10 text-center space-y-3">
              <Tag size={36} className="mx-auto text-txt-3 opacity-40" />
              <p className="text-txt-2 font-semibold dgc-bz-type-3d-light">No listings found</p>
              <p className="text-txt-3 text-sm">
                {canPost ? 'Try another category or list your first product.' : 'Check back soon for new products.'}
              </p>
            </div>
          ) : (
            <>
              <div id="dgc-bazaar-deals" className="dgc-bz-deals-strip">
              <div className="dgc-bz-section-head">
                <div>
                  <span className="dgc-bz-kicker">Fresh off the shelf</span>
                  <h2 className="dgc-bz-display text-2xl sm:text-3xl">Today&apos;s best deals</h2>
                </div>
                <button type="button" className="dgc-bz-view-all" onClick={() => canPost && setModalOpen(true)}>
                  {canPost ? 'List product →' : 'Browse all →'}
                </button>
              </div>
            <div className="dgc-bazaar-grid dgc-bz-deal-grid">
              {gridWithAds.map((item) => (
                item.type === 'ad' ? (
                  <div key={item.key} className="col-span-full">
                    <AdSlot variant="inline" ad={pickAd('inline', item.index || 0)} onBook={() => setAdModalOpen(true)} />
                  </div>
                ) : (
                  <ProductGridCard
                    key={item.post.id}
                    post={item.post}
                    index={item.index}
                    canManage={canPost}
                    canOrder={canOrder}
                    onDelete={onDelete}
                    deleting={deleting}
                    onLike={onLike}
                    liking={liking}
                    onOrder={setOrderPost}
                    onMessage={onMessageSeller}
                    onCall={onCallSeller}
                  />
                )
              ))}
            </div>
              </div>
            </>
          )}

          {tab === 'feed' && (
            <>
              <div className="dgc-bz-sell-cta">
                <div className="dgc-bz-sell-inner">
                  <div>
                    <h2 className="dgc-bz-display">Run a shop? Bring it to the whole city.</h2>
                    <p>List your products, reach buyers beyond your neighbourhood, and manage every order from one simple dashboard — no monthly fees to start.</p>
                  </div>
                  <button type="button" className="dgc-bz-sell-btn" onClick={() => (canPost ? setModalOpen(true) : window.location.href = '/login')}>
                    {canPost ? 'List on bazaar →' : 'Register your shop →'}
                  </button>
                </div>
              </div>

              <footer className="dgc-bz-foot">
                <div className="dgc-bz-foot-grid">
                  <div>
                    <div className="dgc-bz-foot-logo">DGC <span>Bazaar</span></div>
                    <p className="dgc-bz-foot-desc">Nepal&apos;s multi-retailer marketplace — every local shop, one bazaar, delivered to your door.</p>
                    <div className="dgc-bz-pay-icons">
                      <span>eSewa</span><span>Fonepay</span><span>Cash on Delivery</span>
                    </div>
                  </div>
                  <div>
                    <h4>Shop</h4>
                    <ul>
                      <li><button type="button" className="dgc-bz-view-all" style={{ border: 'none', padding: 0 }} onClick={() => document.getElementById('dgc-bazaar-deals')?.scrollIntoView({ behavior: 'smooth' })}>Today&apos;s Deals</button></li>
                      <li><button type="button" className="dgc-bz-view-all" style={{ border: 'none', padding: 0 }} onClick={() => switchTab('orders')}>Track Order</button></li>
                    </ul>
                  </div>
                  <div>
                    <h4>Sell</h4>
                    <ul>
                      <li><button type="button" className="dgc-bz-view-all" style={{ border: 'none', padding: 0 }} onClick={() => (canPost ? setModalOpen(true) : window.location.href = '/login')}>Register your shop</button></li>
                      <li><a href="https://dgcpos.net/dgcbazaar.html" target="_blank" rel="noreferrer">Public bazaar</a></li>
                    </ul>
                  </div>
                  <div>
                    <h4>Company</h4>
                    <ul>
                      <li><a href="https://dgcpos.net" target="_blank" rel="noreferrer">DGC POS</a></li>
                      <li><a href="/settings">Settings</a></li>
                    </ul>
                  </div>
                </div>
                <div className="dgc-bz-foot-bottom">
                  <span>© 2026 DGC Bazaar. Built on DGC RetailOS.</span>
                  <span>dgcpos.net</span>
                </div>
              </footer>
            </>
          )}
        </div>

        <aside className="dgc-bazaar-rail dgc-bazaar-rail--right">
          <AdSlot variant="side" tall ad={pickAd('side_rail', 2)} onBook={() => setAdModalOpen(true)} />
          {canPost && (
            <div className="glass-card dgc-liquid-frosted p-3 space-y-2">
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-txt-3">Promote your pasal</p>
              <button type="button" className="btn-gold w-full py-2 text-[0.65rem] font-bold flex items-center justify-center gap-1" onClick={() => setAdModalOpen(true)}>
                <Upload size={12} /> Upload ad
              </button>
              <p className="text-[0.55rem] text-txt-3 text-center">Rs 500/wk · Rs 2,000/mo</p>
            </div>
          )}
          <AdSlot variant="side" ad={pickAd('side_rail', 3)} onBook={() => setAdModalOpen(true)} />
        </aside>
      </div>

      {canPost && !modalOpen && !adModalOpen && (
        <div className="dgc-marketplace-fab">
          <button type="button" onClick={() => setModalOpen(true)}
            className="btn-gold w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold dgc-text-3d">
            <Plus size={16} /> List Product
          </button>
        </div>
      )}

      <AnimatePresence>
        {adModalOpen && (
          <BazaarAdUploadModal
            onClose={() => setAdModalOpen(false)}
            onSubmitted={() => { refetchMyAds(); qc.invalidateQueries({ queryKey: ['bazaar-ads-public'] }) }}
          />
        )}
        {modalOpen && (
          <CreatePostModal onClose={() => setModalOpen(false)} onCreated={onCreated} shopName={shopName} />
        )}
        {orderPost && (
          <OrderModal post={orderPost} onClose={() => setOrderPost(null)}
            onOrdered={() => { qc.invalidateQueries({ queryKey: ['marketplace-orders'] }); switchTab('orders') }} />
        )}
      </AnimatePresence>
    </div>
  )
}