import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useHideAppFooter } from '../hooks/useHideAppFooter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productsAPI, variantsAPI, bulkImportAPI } from '../api'
import { useAuth } from '../store/AuthContext'
import { useDebounce } from '../hooks/useDebounce'
import toast from 'react-hot-toast'
import { Plus, Search, Edit2, Trash2, Filter, AlertTriangle, X, Check, Barcode, RefreshCw,
         Zap, Lock, Unlock, TrendingUp, TrendingDown, Tag, Percent, Calculator, Printer, Layers, Upload, Store } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import JsBarcode from 'jsbarcode'
import { buildLabelPrintDocument, printDocument } from '../utils/printHtml'

// ── Pricing Engine constants ───────────────────────────────────────────────────
const DEFAULT_MARKUP_PCT    = 100  // 100% markup → selling = cost × 2  (50% gross margin)
const DEFAULT_LIABILITY_PCT = 45   // 45% of gross profit → overhead (rent + salary + expenses)
const DEFAULT_MAX_DISC_PCT  = 30   // max allowed discount = 30% off selling price
const MIN_NET_PROFIT_PCT    = 60   // net profit must be ≥ 60% of gross profit at all times
const MIN_GROSS_MARGIN_PCT  = 50   // gross margin floor — selling must always give ≥50% margin

/**
 * Given a cost price + rates, return the full pricing breakdown.
 *   grossProfit   = cost × (markup/100)          → e.g. 100% markup → +cost
 *   sellingPrice  = cost + grossProfit            → cost × 2
 *   liability     = grossProfit × (liability/100) → 45% of gross profit
 *   netProfit     = grossProfit − liability
 *   minPrice      = sellingPrice × (1 − maxDisc/100)
 *   minProfit     = minPrice − cost − liability
 */
function calcPricing(cost, markupPct, liabilityPct, maxDiscPct) {
  const c    = parseFloat(cost) || 0
  const gp   = c * (markupPct / 100)
  const sp   = c + gp
  const liab = gp * (liabilityPct / 100)
  const net  = gp - liab

  // Min price enforcing max discount
  const min    = sp * (1 - maxDiscPct / 100)
  const minGP  = min - c
  const minNet = minGP - liab

  // Margin checks
  const grossMarginPct = sp > 0 ? (gp / sp * 100) : 0
  const netProfitOnGP  = gp > 0 ? (net / gp * 100) : 0       // net as % of gross
  const netMarginPct   = sp > 0 ? (net / sp * 100) : 0        // net as % of selling

  // Min price needed for 50% gross margin: sp ≥ 2×cost
  const minPriceFor50Margin = c * 2

  // Absolute min for 60% net-of-gross: net ≥ 0.60 × gp
  // net = gp - liab = gp(1 - liab%) ; needs (1-liab%) ≥ 0.60 → liab% ≤ 40%
  const meets60NetRule = netProfitOnGP >= MIN_NET_PROFIT_PCT

  return {
    cost:              c,
    grossProfit:       gp,
    selling:           sp,
    liability:         liab,
    netProfit:         net,
    grossMarginPct,
    netProfitOnGP,                // net as % of gross (rule: ≥60%)
    netMarginPct,                 // net as % of selling
    minPrice:          min,
    minNetProfit:      minNet,
    minPriceFor50Margin,
    meets60NetRule,
    viable:            min >= c && minGP >= 0,
  }
}

// ── Pricing Engine Panel v2 — DSR Pro UI ─────────────────────────────────────
function PricingEngine({ costPrice, sellingPrice, onApply, markupPct, liabilityPct, maxDiscPct }) {
  const p        = calcPricing(costPrice, markupPct, liabilityPct, maxDiscPct)
  const hasData  = p.cost > 0
  const currentSP   = parseFloat(sellingPrice) || 0
  const isAutoPrice = hasData && Math.abs(currentSP - p.selling) < 0.01

  // Manual price analysis
  const curGP       = currentSP - p.cost
  const curLiab     = curGP > 0 ? curGP * (liabilityPct / 100) : 0
  const curNet      = curGP - curLiab
  const curGrossMargin = currentSP > 0 ? (curGP / currentSP * 100) : 0
  const curNetOnGP     = curGP > 0  ? (curNet / curGP * 100)    : 0
  const curMin         = currentSP  * (1 - maxDiscPct / 100)

  const isBelowCost     = currentSP > 0 && currentSP < p.cost
  const below50Margin   = currentSP > 0 && curGrossMargin < MIN_GROSS_MARGIN_PCT
  const below60Net      = currentSP > 0 && curNetOnGP < MIN_NET_PROFIT_PCT && curGP > 0

  // Rule status indicator
  const Pill = ({ ok, label }) => (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      border: `1px solid ${ok ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
      borderRadius: 20, padding: '2px 8px',
      color: ok ? '#6EE7B7' : '#FCA5A5',
      fontSize: '0.68rem', fontWeight: 700,
    }}>
      {ok ? '✓' : '✕'} {label}
    </div>
  )

  const Row = ({ label, value, color, neg }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color:'#000000', fontSize:'0.73rem' }}>{label}</span>
      <span style={{ color, fontWeight:700, fontSize:'0.78rem', fontFamily:'"JetBrains Mono",monospace' }}>
        {neg ? '−' : ''}रू {Math.abs(Number(value)).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
      </span>
    </div>
  )

  if (!hasData) return (
    <div style={{ background:'rgba(27,47,94,0.05)', border:'1px dashed rgba(27,47,94,0.20)', borderRadius:14, padding:'14px 16px', marginTop:4 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, color:'#2C3650', fontSize:'0.78rem' }}>
        <Calculator size={14}/> Enter cost price above to activate the Pricing Engine
      </div>
      <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:6 }}>
        <Pill ok={false} label={`≥${MIN_GROSS_MARGIN_PCT}% Gross Margin`}/>
        <Pill ok={false} label={`≥${MIN_NET_PROFIT_PCT}% Net-of-Gross`}/>
        <Pill ok={false} label={`Max ${maxDiscPct}% Discount`}/>
      </div>
    </div>
  )

  return (
    <div style={{ background:'rgba(255,255,255,0.94)', border:'1px solid rgba(99,102,241,0.28)', borderRadius:16, padding:'16px 18px', marginTop:4 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ background:'linear-gradient(135deg,rgba(27,47,94,0.3),rgba(139,92,246,0.2))', borderRadius:10, padding:6 }}>
            <Calculator size={14} style={{ color:'#8B6914' }}/>
          </div>
          <span style={{ color:'#0A0C12', fontWeight:800, fontSize:'0.82rem', letterSpacing:'0.10em', textTransform:'uppercase' }}>
            Pricing Engine
          </span>
          <span style={{ background:'rgba(27,47,94,0.12)', border:'1px solid rgba(27,47,94,0.22)', borderRadius:20, padding:'2px 8px', color:'#2C3650', fontSize:'0.65rem', fontWeight:700 }}>
            v2.0
          </span>
        </div>
        <button type="button" onClick={() => onApply(p.selling)}
          style={{
            display:'flex', alignItems:'center', gap:5, cursor:'pointer', transition:'all 0.2s',
            background: isAutoPrice ? 'rgba(16,185,129,0.15)' : 'linear-gradient(135deg,rgba(27,47,94,0.25),rgba(139,92,246,0.20))',
            border: `1px solid ${isAutoPrice ? 'rgba(16,185,129,0.40)' : 'rgba(27,47,94,0.45)'}`,
            borderRadius:10, padding:'5px 12px',
            color: isAutoPrice ? '#34D399' : '#8B6914',
            fontSize:'0.75rem', fontWeight:800,
          }}>
          <Zap size={12}/>
          {isAutoPrice ? '✓ Auto Price Applied' : 'Apply Suggested Price'}
        </button>
      </div>

      {/* ── Policy Rules Status ── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
        <Pill ok={!below50Margin && currentSP > 0}   label={`≥${MIN_GROSS_MARGIN_PCT}% Gross Margin`}/>
        <Pill ok={!below60Net && !isBelowCost && currentSP > 0} label={`≥${MIN_NET_PROFIT_PCT}% Net-of-Gross`}/>
        <Pill ok={!isBelowCost && currentSP > 0}     label="Above Cost"/>
        <Pill ok={p.viable}                           label={`Min Price after ${maxDiscPct}% disc`}/>
      </div>

      {/* ── 3 Key Cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
        {/* Suggested Selling Price */}
        <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.22)', borderRadius:12, padding:'10px 12px' }}>
          <div style={{ color:'#2C3650', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
            ✦ Suggested Price
          </div>
          <div style={{ color:'#34D399', fontWeight:900, fontSize:'1rem', fontFamily:'"JetBrains Mono",monospace' }}>
            रू {p.selling.toLocaleString('en-IN',{maximumFractionDigits:0})}
          </div>
          <div style={{ color:'#2C3650', fontSize:'0.68rem', marginTop:3 }}>
            Net: रू {p.netProfit.toFixed(0)} · {p.netMarginPct.toFixed(1)}%
          </div>
        </div>

        {/* Net Profit per Item */}
        <div style={{
          background: p.meets60NetRule ? 'rgba(27,47,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${p.meets60NetRule ? 'rgba(27,47,94,0.22)' : 'rgba(239,68,68,0.25)'}`,
          borderRadius:12, padding:'10px 12px',
        }}>
          <div style={{ color:'#2C3650', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
            Net Profit
          </div>
          <div style={{ color: p.meets60NetRule ? '#8B6914' : '#C0392B', fontWeight:900, fontSize:'1rem', fontFamily:'"JetBrains Mono",monospace' }}>
            रू {p.netProfit.toFixed(0)}
          </div>
          <div style={{ color:'#000000', fontSize:'0.68rem', marginTop:3 }}>
            {p.netProfitOnGP.toFixed(1)}% of gross · {p.meets60NetRule ? '✓ ≥60%' : '✕ <60%'}
          </div>
        </div>

        {/* Min Price at Max Discount */}
        <div style={{
          background: p.viable ? 'rgba(245,158,11,0.07)' : 'rgba(239,68,68,0.07)',
          border: `1px solid ${p.viable ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.25)'}`,
          borderRadius:12, padding:'10px 12px',
        }}>
          <div style={{ color:'#2C3650', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
            🏷 Min @ −{maxDiscPct}%
          </div>
          <div style={{ color: p.viable ? '#FCD34D' : '#F87171', fontWeight:900, fontSize:'1rem', fontFamily:'"JetBrains Mono",monospace' }}>
            रू {p.minPrice.toLocaleString('en-IN',{maximumFractionDigits:0})}
          </div>
          <div style={{ color:'#000000', fontSize:'0.68rem', marginTop:3 }}>
            {p.viable ? `Net: रू ${p.minNetProfit.toFixed(0)}` : '⚠ Violates margin floor'}
          </div>
        </div>
      </div>

      {/* ── Full P&L Breakdown ── */}
      <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:12 }}>
        <div style={{ color:'#2C3650', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:8 }}>
          Pricing Breakdown — Suggested Price
        </div>
        <Row label="Cost Price (Wholesale / Purchase)" value={p.cost}        color="#94A3B8"/>
        <Row label={`+ Gross Profit (${markupPct}% markup)`}   value={p.grossProfit} color="#60A5FA"/>
        <Row label="= Selling Price"                            value={p.selling}     color="#0A0C12"/>
        <Row label={`− Overhead / Liability (${liabilityPct}% of gross)`}    value={p.liability}   color="#F87171" neg/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:8, marginTop:4, borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <span style={{ color:'#8B6914', fontSize:'0.78rem', fontWeight:800 }}>Net Profit per Item</span>
            <span style={{ marginLeft:8, background: p.meets60NetRule ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              border:`1px solid ${p.meets60NetRule ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
              borderRadius:20, padding:'1px 7px', color: p.meets60NetRule ? '#6EE7B7' : '#FCA5A5', fontSize:'0.65rem', fontWeight:700 }}>
              {p.netProfitOnGP.toFixed(1)}% of gross · {p.grossMarginPct.toFixed(1)}% margin
            </span>
          </div>
          <span style={{ color:'#34D399', fontWeight:900, fontSize:'0.95rem', fontFamily:'"JetBrains Mono",monospace' }}>
            रू {p.netProfit.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Manual Price Analysis ── */}
      {currentSP > 0 && !isAutoPrice && (
        <div style={{ marginTop:14, borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:12 }}>
          <div style={{ color:'#2C3650', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:8 }}>
            Your Manual Price Analysis
          </div>

          {/* Critical warnings */}
          {isBelowCost && (
            <div style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:10, padding:'8px 12px', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
              <TrendingDown size={14} style={{ color:'#F87171', flexShrink:0 }}/>
              <span style={{ color:'#FCA5A5', fontSize:'0.76rem', fontWeight:700 }}>
                🚫 Selling price is BELOW cost price — this will result in a direct loss! Increase to at least रू {p.cost.toLocaleString('en-IN')}.
              </span>
            </div>
          )}
          {!isBelowCost && below50Margin && (
            <div style={{ background:'rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.28)', borderRadius:10, padding:'8px 12px', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
              <AlertTriangle size={14} style={{ color:'#F87171', flexShrink:0 }}/>
              <span style={{ color:'#FCA5A5', fontSize:'0.76rem', fontWeight:700 }}>
                🚫 Gross margin {curGrossMargin.toFixed(1)}% is BELOW the 50% minimum floor. Raise price to at least रू {p.minPriceFor50Margin.toLocaleString('en-IN')}.
              </span>
            </div>
          )}
          {!isBelowCost && !below50Margin && below60Net && (
            <div style={{ background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.28)', borderRadius:10, padding:'8px 12px', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
              <AlertTriangle size={14} style={{ color:'#FCD34D', flexShrink:0 }}/>
              <span style={{ color:'#FDE68A', fontSize:'0.76rem', fontWeight:700 }}>
                ⚠ Net profit {curNetOnGP.toFixed(1)}% of gross is below 60% target. Consider reducing overhead or raising price.
              </span>
            </div>
          )}

          <Row label="Your Selling Price"           value={currentSP}       color="#0A0C12"/>
          <Row label="Gross Profit"                 value={curGP}           color={curGP > 0 ? '#60A5FA' : '#F87171'}/>
          <Row label={`Overhead (${liabilityPct}% of gross)`} value={curLiab} color="#F87171" neg/>
          <Row label="Net Profit"                   value={curNet}          color={curNet > 0 ? '#34D399' : '#F87171'}/>
          <Row label={`Floor Price (−${maxDiscPct}% max discount)`} value={curMin} color="#FCD34D"/>

          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>
            <Pill ok={!isBelowCost && curGrossMargin >= MIN_GROSS_MARGIN_PCT} label={`${curGrossMargin.toFixed(1)}% Gross Margin`}/>
            <Pill ok={!below60Net && !isBelowCost} label={`${curNetOnGP.toFixed(1)}% Net-of-Gross`}/>
            <Pill ok={curNet > 0} label={curNet > 0 ? `+रू${curNet.toFixed(0)} net` : 'Net loss!'}/>
          </div>
        </div>
      )}
    </div>
  )
}

// Generate a random EAN-13 style barcode (12 digits + check digit)
function generateBarcode() {
  const digits = Array.from({ length: 12 }, (_, i) => i === 0 ? String(Math.floor(Math.random() * 8) + 1) : String(Math.floor(Math.random() * 10))).join('')
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3)
  const check = (10 - (sum % 10)) % 10
  return digits + check
}

// Barcode SVG preview component
function BarcodePreview({ value }) {
  const svgRef = useRef(null)
  useEffect(() => {
    if (!svgRef.current || !value) return
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128', width: 2, height: 50,
        displayValue: true, fontSize: 11, margin: 6,
        background: '#ffffff', lineColor: '#000000',
      })
    } catch {}
  }, [value])
  if (!value) return null
  return (
    <div style={{ background: 'rgba(255,255,255,0.94)', borderRadius: 8, padding: '8px 12px', display: 'inline-flex', marginTop: 8, border: '1px solid rgba(11,95,255,0.20)' }}>
      <svg ref={svgRef} />
    </div>
  )
}

function ProductModal({ product, categories, onClose, onSaved, canSeeCost }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canListOnBazaar = ['owner', 'superadmin', 'manager'].includes(user?.role)
  const editing = !!product?.id
  const [form, setForm] = useState({
    name:'', sku:'', barcode:'', category_id:'', cost_price:'', selling_price:'',
    stock_qty:'0', reorder_level:'10', unit:'pcs', description:'', status:'active',
    image_url: '',
    ...(product || {})
  })
  const [listOnBazaar, setListOnBazaar] = useState(product?.bazaar_listed !== false)
  const [removingBazaar, setRemovingBazaar] = useState(false)
  const [imgPreview, setImgPreview] = useState(product?.image_url || null)
  const [saving,      setSaving]      = useState(false)
  const [autoPrice,   setAutoPrice]   = useState(!product?.id && canSeeCost)  // auto only for cost users on new products
  const [markupPct,   setMarkupPct]   = useState(DEFAULT_MARKUP_PCT)
  const [liabilityPct,setLiabilityPct]= useState(DEFAULT_LIABILITY_PCT)
  const [maxDiscPct,  setMaxDiscPct]  = useState(DEFAULT_MAX_DISC_PCT)
  const [showRates,   setShowRates]   = useState(false)

  useEffect(() => {
    if (form.image_url) {
      setImgPreview(form.image_url)
      return
    }
    const name = form.name?.trim()
    if (!name || name.length < 2) {
      setImgPreview(null)
      return
    }
    let cancelled = false
    productsAPI.placeholderImage(name)
      .then((r) => { if (!cancelled) setImgPreview(r.data?.image_url || null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [form.name, form.image_url])

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // When cost changes in auto mode → recalculate selling price
      if (k === 'cost_price' && autoPrice) {
        const p = calcPricing(v, markupPct, liabilityPct, maxDiscPct)
        next.selling_price = p.selling > 0 ? p.selling.toFixed(2) : ''
      }
      return next
    })
  }

  // When auto mode toggled ON → re-apply calculated price
  const toggleAutoPrice = () => {
    if (!autoPrice) {
      const p = calcPricing(form.cost_price, markupPct, liabilityPct, maxDiscPct)
      if (p.selling > 0) setForm(f => ({ ...f, selling_price: p.selling.toFixed(2) }))
    }
    setAutoPrice(v => !v)
  }

  // Apply a specific selling price from the engine
  const applyPrice = (price) => {
    setForm(f => ({ ...f, selling_price: price.toFixed(2) }))
    setAutoPrice(true)
  }

  // When rate sliders change in auto mode, recalc
  const updateRate = (setter, key, val) => {
    setter(val)
    if (autoPrice && form.cost_price) {
      const rates = { markup: markupPct, liability: liabilityPct, maxDisc: maxDiscPct, [key]: val }
      const p = calcPricing(form.cost_price, rates.markup, rates.liability, rates.maxDisc)
      if (p.selling > 0) setForm(f => ({ ...f, selling_price: p.selling.toFixed(2) }))
    }
  }

  const handleGenerateBarcode = () => {
    const bc = generateBarcode()
    set('barcode', bc)
    toast.success('Barcode generated!')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name?.trim()) { toast.error('Product name is required'); return }
    if (!form.selling_price && form.selling_price !== 0) { toast.error('Selling price is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        selling_price: parseFloat(form.selling_price) || 0,
        cost_price:    parseFloat(form.cost_price)    || 0,
        stock_qty:     parseInt(form.stock_qty)       || 0,
        reorder_level: parseInt(form.reorder_level)   || 10,
        category_id:   form.category_id ? parseInt(form.category_id) : null,
        image_url:     form.image_url || imgPreview || undefined,
        list_on_bazaar: canListOnBazaar && listOnBazaar && form.status === 'active',
      }
      if (editing) {
        const res = await productsAPI.update(product.id, payload)
        toast.success(res.data?.bazaar_listed ? 'Product updated & live on DGC Bazaar' : 'Product updated!')
        onSaved(null)
      } else {
        const res = await productsAPI.create(payload)
        toast.success(res.data?.bazaar_listed ? 'Product added & listed on DGC Bazaar' : 'Product added!')
        onSaved(res.data)
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to save product'
      toast.error(msg)
    } finally { setSaving(false) }
  }

  const modal = (
    <div className="modal-overlay dgc-modal-layer" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="modal-panel dgc-product-modal dgc-liquid-frosted w-full sm:mx-4 sm:max-w-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="dgc-product-modal-header flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
          <h2 className="font-display text-xl font-semibold text-txt dgc-text-3d">{editing ? 'Edit Product' : 'Add Product'}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-glass text-txt-3 hover:text-txt transition-colors"><X size={16}/></button>
        </div>
        <form onSubmit={submit} className="dgc-product-modal-form flex flex-col flex-1 min-h-0">
          <div className="dgc-product-modal-body flex-1 overflow-y-auto px-4 sm:px-6 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="input-label">Product Name *</label>
              <input className="input-field" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Silk Saree - Blue" required /></div>
            <div><label className="input-label">SKU</label>
              <input className="input-field" value={form.sku||''} onChange={e=>set('sku',e.target.value)} placeholder="Auto-generated" /></div>
            <div className="sm:col-span-2">
              <label className="input-label">Barcode</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input-field" style={{ flex: 1 }}
                  value={form.barcode||''} onChange={e=>set('barcode',e.target.value)}
                  placeholder="Scan, type, or click Generate →" />
                <button type="button" onClick={handleGenerateBarcode}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px',
                    borderRadius: 10, border: '1px solid rgba(11,95,255,0.28)',
                    background: 'rgba(11,95,255,0.08)', color: '#E8C547',
                    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap', transition: 'all 0.2s', height: '100%',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(11,95,255,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(11,95,255,0.08)'}
                >
                  <RefreshCw size={13} /> Generate
                </button>
              </div>
              {form.barcode && <BarcodePreview value={form.barcode} />}
            </div>
            <div><label className="input-label">Category</label>
              <select className="input-field" value={form.category_id||''} onChange={e=>set('category_id',e.target.value)}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="input-label">Unit</label>
              <select className="input-field" value={form.unit} onChange={e=>set('unit',e.target.value)}>
                {['pcs','pairs','sets','kg','gm','m','l'].map(u => <option key={u}>{u}</option>)}
              </select></div>
            {/* ── Pricing Section ─────────────────────────────── */}
            {canSeeCost && (
              <div className="sm:col-span-2">
                {/* Rate customiser toggle */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
                  <span className="input-label" style={{ marginBottom:0 }}>Pricing &amp; Profit Engine</span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button type="button"
                      onClick={() => setShowRates(v => !v)}
                      style={{
                        display:'flex', alignItems:'center', gap:5,
                        background:'rgba(27,47,94,0.10)', border:'1px solid rgba(27,47,94,0.25)',
                        borderRadius:8, padding:'3px 10px', color:'#8B6914', fontSize:'0.72rem', fontWeight:700, cursor:'pointer',
                      }}>
                      <Percent size={11}/> {showRates ? 'Hide Rates' : 'Edit Rates'}
                    </button>
                    <button type="button"
                      onClick={toggleAutoPrice}
                      style={{
                        display:'flex', alignItems:'center', gap:5,
                        background: autoPrice ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                        border:`1px solid ${autoPrice ? 'rgba(16,185,129,0.35)' : 'rgba(27,47,94,0.12)'}`,
                        borderRadius:8, padding:'3px 10px',
                        color: autoPrice ? '#6EE7B7' : '#2C3650',
                        fontSize:'0.72rem', fontWeight:700, cursor:'pointer', transition:'all 0.2s',
                      }}>
                      {autoPrice ? <><Zap size={11}/> Auto Price ON</> : <><Lock size={11}/> Manual Mode</>}
                    </button>
                  </div>
                </div>

                {/* Adjustable rates */}
                {showRates && (
                  <div style={{
                    background:'rgba(27,47,94,0.05)', border:'1px solid rgba(27,47,94,0.15)',
                    borderRadius:12, padding:'12px 14px', marginBottom:10,
                    display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12,
                  }}>
                    {[
                      { label:'Markup %',        val:markupPct,    setter:setMarkupPct,    key:'markup',    color:'#8B6914', min:10,  max:500 },
                      { label:'Overhead %',       val:liabilityPct, setter:setLiabilityPct, key:'liability', color:'#F87171', min:0,   max:100 },
                      { label:'Max Discount %',   val:maxDiscPct,   setter:setMaxDiscPct,   key:'maxDisc',   color:'#FCD34D', min:0,   max:50  },
                    ].map(r => (
                      <div key={r.key}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ color:'#000000', fontSize:'0.72rem' }}>{r.label}</span>
                          <span style={{ color:r.color, fontWeight:800, fontSize:'0.78rem' }}>{r.val}%</span>
                        </div>
                        <input type="range" min={r.min} max={r.max} step={1} value={r.val}
                          style={{ width:'100%', accentColor:r.color }}
                          onChange={e => updateRate(r.setter, r.key, Number(e.target.value))}/>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cost + Selling side by side */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:8 }}>
                  <div>
                    <label className="input-label">Cost Price (रू) — Purchase</label>
                    <input type="number" className="input-field"
                      value={form.cost_price||''} onChange={e=>set('cost_price',e.target.value)}
                      placeholder="Wholesale cost" step="0.01" min="0"/>
                  </div>
                  <div>
                    <label className="input-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                      Selling Price (रू) *
                      {autoPrice
                        ? <span style={{ background:'rgba(27,47,94,0.08)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:5, padding:'1px 6px', color:'#6EE7B7', fontSize:'0.65rem', fontWeight:700 }}>AUTO</span>
                        : <span style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:5, padding:'1px 6px', color:'#FCD34D', fontSize:'0.65rem', fontWeight:700 }}>MANUAL</span>
                      }
                    </label>
                    <input type="number" className="input-field"
                      value={form.selling_price||''} step="0.01" min="0" required
                      readOnly={autoPrice}
                      style={ autoPrice ? { opacity:0.7, cursor:'default', background:'rgba(16,185,129,0.05)', borderColor:'rgba(16,185,129,0.2)' } : {} }
                      onChange={e => { if (!autoPrice) set('selling_price', e.target.value) }}
                      placeholder={autoPrice ? 'Auto-calculated' : 'Enter manually'}/>
                  </div>
                </div>

                {/* Pricing Engine breakdown */}
                <PricingEngine
                  costPrice={form.cost_price}
                  sellingPrice={form.selling_price}
                  onApply={applyPrice}
                  markupPct={markupPct}
                  liabilityPct={liabilityPct}
                  maxDiscPct={maxDiscPct}
                />
              </div>
            )}
            {!canSeeCost && (
              <div><label className="input-label">Selling Price (Rs.) *</label>
                <input type="number" className="input-field" value={form.selling_price||''} onChange={e=>set('selling_price',e.target.value)} placeholder="0.00" step="0.01" min="0" required /></div>
            )}
            <div><label className="input-label">Opening Stock</label>
              <input type="number" className="input-field" value={form.stock_qty||0} onChange={e=>set('stock_qty',e.target.value)} min="0" /></div>
            <div><label className="input-label">Reorder Level</label>
              <input type="number" className="input-field" value={form.reorder_level||10} onChange={e=>set('reorder_level',e.target.value)} min="0" /></div>
            <div className="sm:col-span-2"><label className="input-label">Description</label>
              <textarea className="input-field h-20 resize-none" value={form.description||''} onChange={e=>set('description',e.target.value)} placeholder="Optional product description" /></div>
            <div className="sm:col-span-2">
              <label className="input-label">Product photo</label>
              <div className="flex gap-4 items-start flex-wrap">
                {imgPreview && (
                  <img src={imgPreview} alt="" className="w-24 h-24 rounded-xl object-cover border border-glass-border" />
                )}
                <div className="flex-1 min-w-[200px]">
                  <input className="input-field" value={form.image_url || ''} onChange={e => set('image_url', e.target.value)}
                    placeholder="Image URL (optional — auto-matched from name)" />
                  <p className="text-xs text-txt-3 mt-1">Placeholder image is generated from the product name if you skip upload.</p>
                </div>
              </div>
            </div>
            {canListOnBazaar && (
              <div className="sm:col-span-2 space-y-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-glass-border bg-glass/40">
                  <input type="checkbox" checked={listOnBazaar} onChange={e => setListOnBazaar(e.target.checked)}
                    className="w-4 h-4 accent-gold" />
                  <span>
                    <span className="font-semibold text-txt text-sm">List on DGC Bazaar</span>
                    <span className="block text-xs text-txt-3">Shows on dgcpos.com/bazaar and in-app marketplace when saved</span>
                  </span>
                </label>
                {editing && product?.bazaar_listed && (
                  <button
                    type="button"
                    disabled={removingBazaar}
                    onClick={async () => {
                      if (!window.confirm(`Remove "${form.name}" from DGC Bazaar?`)) return
                      setRemovingBazaar(true)
                      try {
                        await productsAPI.unlistFromBazaar(product.id)
                        setListOnBazaar(false)
                        toast.success('Removed from DGC Bazaar')
                        qc.invalidateQueries({ queryKey: ['marketplace'] })
                        qc.invalidateQueries({ queryKey: ['pos-marketplace'] })
                        onSaved(null)
                      } catch (err) {
                        toast.error(err.response?.data?.error || 'Could not remove from bazaar')
                      } finally {
                        setRemovingBazaar(false)
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 text-sm font-bold hover:bg-red-500/15 transition-colors"
                  >
                    <X size={14} />
                    {removingBazaar ? 'Removing…' : 'Remove from DGC Bazaar'}
                  </button>
                )}
              </div>
            )}
            <div><label className="input-label">Status</label>
              <select className="input-field" value={form.status} onChange={e=>set('status',e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select></div>
          </div>
          </div>
          <div className="dgc-modal-actions flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 sm:flex-none">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex-[2] sm:flex-none flex items-center justify-center gap-2 py-3 font-bold">
              {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/> : <Check size={14}/>}
              {editing ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
  return createPortal(modal, document.body)
}


/* ── Barcode Label Print Modal ──────────────────────────────────────────── */
/* ── Variants Modal ─────────────────────────────────────────────── */
function VariantsModal({ product, onClose }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ size: '', color: '', sku: '', barcode: '', stock_qty: 0, selling_price: '' })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['variants', product.id],
    queryFn: () => variantsAPI.list(product.id).then(r => r.data),
    staleTime: 10_000,
  })
  const variants = data?.variants || []

  const createMutation = useMutation({
    mutationFn: (d) => variantsAPI.create(product.id, d),
    onSuccess: () => { toast.success('Variant added'); refetch(); setAdding(false); setForm({ size: '', color: '', sku: '', barcode: '', stock_qty: 0, selling_price: '' }) },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (vid) => variantsAPI.remove(vid),
    onSuccess: () => { toast.success('Variant removed'); refetch() },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ vid, is_active }) => variantsAPI.update(vid, { is_active }),
    onSuccess: () => refetch(),
  })

  const inp = (key, rest = {}) => ({
    className: 'input-field',
    style: { padding: '6px 10px', fontSize: '0.80rem', width: '100%' },
    value: form[key],
    onChange: e => setForm(prev => ({ ...prev, [key]: e.target.value })),
    ...rest,
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid #D8D2C4', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#0A0C12', margin: 0 }}>Variants — {product.name}</h2>
            <p style={{ fontSize: '0.74rem', color: 'rgba(0,0,0,0.45)', margin: '3px 0 0' }}>Manage size/colour variants with individual stock</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        {/* Existing variants */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#000000', fontSize: '0.82rem' }}>Loading…</div>
        ) : variants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#000000', fontSize: '0.82rem', border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 10, marginBottom: '1rem' }}>
            No variants yet — add size/colour combinations below
          </div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 80px 80px 1fr 70px 28px', gap: 8, fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#000000', padding: '0 0 6px' }}>
              <span>Size</span><span>Color</span><span>Stock</span><span>SKU/Barcode</span><span>Price</span><span/>
            </div>
            {variants.map(v => (
              <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '60px 80px 80px 1fr 70px 28px', gap: 8, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', opacity: v.is_active ? 1 : 0.45 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#000000' }}>{v.size || '—'}</span>
                <span style={{ fontSize: '0.82rem', color: '#000000' }}>{v.color || '—'}</span>
                <span style={{ fontSize: '0.82rem', color: v.is_low_stock ? '#FBBF24' : '#34D399', fontWeight: 600 }}>{v.stock_qty}</span>
                <div>
                  {v.sku && <div style={{ fontSize: '0.74rem', fontFamily: 'monospace', color: 'rgba(0,0,0,0.55)' }}>{v.sku}</div>}
                  {v.barcode && <div style={{ fontSize: '0.70rem', fontFamily: 'monospace', color: '#000000' }}>{v.barcode}</div>}
                </div>
                <span style={{ fontSize: '0.78rem', color: '#E8C547' }}>Rs. {v.effective_price.toLocaleString('en-IN')}</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => toggleMutation.mutate({ vid: v.id, is_active: !v.is_active })} style={{ background: 'none', border: 'none', color: v.is_active ? '#34D399' : '#64748B', cursor: 'pointer', padding: 2, lineHeight: 1 }} title={v.is_active ? 'Deactivate' : 'Activate'}>●</button>
                  <button onClick={() => { if (confirm('Delete this variant?')) deleteMutation.mutate(v.id) }} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: 2 }}><Trash2 size={12}/></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add form */}
        {adding ? (
          <div style={{ border: '1px solid rgba(232,197,71,0.15)', borderRadius: 12, padding: '1rem', background: 'rgba(232,197,71,0.04)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.50)', marginBottom: 10 }}>New Variant</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label className="label-sm">Size</label><input type="text" {...inp('size')} placeholder="S, M, L, XL…" /></div>
              <div><label className="label-sm">Color</label><input type="text" {...inp('color')} placeholder="Red, Black…" /></div>
              <div><label className="label-sm">SKU</label><input type="text" {...inp('sku')} placeholder="Optional" /></div>
              <div><label className="label-sm">Barcode</label><input type="text" {...inp('barcode')} placeholder="Optional" /></div>
              <div><label className="label-sm">Stock Qty</label><input type="number" {...inp('stock_qty')} min="0" /></div>
              <div><label className="label-sm">Price (blank = parent)</label><input type="number" {...inp('selling_price')} min="0" step="0.01" placeholder={product.selling_price} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAdding(false)} className="btn-ghost" style={{ fontSize: '0.80rem' }}>Cancel</button>
              <button onClick={() => createMutation.mutate({ ...form, stock_qty: parseInt(form.stock_qty) || 0, selling_price: form.selling_price ? parseFloat(form.selling_price) : null })} disabled={createMutation.isPending} className="btn-gold" style={{ fontSize: '0.80rem' }}>
                {createMutation.isPending ? 'Adding…' : 'Add Variant'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="btn-ghost" style={{ width: '100%', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Plus size={14}/> Add Variant
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Label size presets ────────────────────────────────────────────────────────
const LABEL_SIZES = [
  { key: 'thermal_57',  label: '57mm Thermal Roll',  w: 200, h: 100, cols: 1,  bh: 40, bw: 1.5, fontSize: { store: 7,  name: 10, sku: 8,  price: 13 } },
  { key: 'thermal_80',  label: '80mm Thermal Roll',  w: 280, h: 100, cols: 1,  bh: 44, bw: 2,   fontSize: { store: 8,  name: 11, sku: 8,  price: 14 } },
  { key: 'sticker_sm',  label: '40×25mm Sticker',    w: 150, h: 94,  cols: 1,  bh: 32, bw: 1.2, fontSize: { store: 6,  name: 8,  sku: 7,  price: 11 } },
  { key: 'sticker_med', label: '60×40mm Sticker',    w: 226, h: 150, cols: 1,  bh: 48, bw: 1.8, fontSize: { store: 7,  name: 10, sku: 8,  price: 13 } },
  { key: 'a4_sheet',    label: 'A4 Sheet (3 cols)',  w: 189, h: 120, cols: 3,  bh: 48, bw: 1.8, fontSize: { store: 7,  name: 10, sku: 8,  price: 12 } },
]

function BarcodeLabelModal({ product, onClose }) {
  const svgRef     = useRef(null)
  const [qty,      setQty]      = useState(1)
  const [sizeKey,  setSizeKey]  = useState('thermal_57')
  const [storeName,setStoreName]= useState(() => localStorage.getItem('dg_store_name') || 'Your Store')
  const [showPrice,setShowPrice]= useState(true)
  const [showSku,  setShowSku]  = useState(true)
  const [showStore,setShowStore]= useState(true)
  const [printing, setPrinting] = useState(false)

  const size = LABEL_SIZES.find(s => s.key === sizeKey) || LABEL_SIZES[0]

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      try {
        JsBarcode(svgRef.current, product.barcode, {
          format: 'CODE128', width: size.bw, height: size.bh,
          displayValue: true, fontSize: size.fontSize.sku,
          margin: 4, background: '#ffffff', lineColor: '#000000',
        })
      } catch (e) { console.warn('Barcode render error:', e) }
    }
  }, [product.barcode, sizeKey])

  const handlePrint = async () => {
    if (printing) return
    localStorage.setItem('dg_store_name', storeName)
    setPrinting(true)

    try {
      const barcodeHTML = svgRef.current?.outerHTML
        || `<div style="font-size:11px;font-family:monospace;padding:4px 0">${product.barcode || ''}</div>`
      const price = Number(product.selling_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
      const fs = size.fontSize
      const safeName = String(product.name || '').replace(/[<>&"]/g, '')
      const safeStore = String(storeName || '').replace(/[<>&"]/g, '')
      const safeSku = String(product.sku || '').replace(/[<>&"]/g, '')

      const oneLabel = `
        <div style="
          display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
          width:${size.w}px; min-height:${size.h}px;
          border:1px solid #ccc; padding:5px 8px; box-sizing:border-box;
          font-family:Arial,Helvetica,sans-serif; text-align:center; page-break-inside:avoid;
          ${size.cols > 1 ? 'margin:2px;' : 'margin:4px auto;'}
        ">
          ${showStore && safeStore ? `<div style="font-size:${fs.store}px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#333;margin-bottom:2px">${safeStore}</div>` : ''}
          <div style="font-size:${fs.name}px;font-weight:700;color:#000;margin-bottom:2px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${safeName}</div>
          ${showSku && safeSku ? `<div style="font-size:${fs.sku}px;color:#666;margin-bottom:2px">SKU: ${safeSku}</div>` : ''}
          ${product.barcode ? barcodeHTML : `<div style="font-size:${fs.sku}px;font-family:monospace;padding:4px 0;color:#555">No barcode</div>`}
          ${showPrice ? `<div style="font-size:${fs.price}px;font-weight:800;color:#000;margin-top:2px;border-top:1px solid #ddd;padding-top:3px;width:100%">Rs. ${price}</div>` : ''}
        </div>`

      const labels = Array.from({ length: Math.max(1, qty) }).map(() => oneLabel).join('')
      const colStyle = size.cols > 1
        ? 'display:flex; flex-wrap:wrap; justify-content:flex-start;'
        : 'display:block;'

      const pageSize = size.key === 'thermal_57'
        ? '57mm auto'
        : size.key === 'thermal_80'
          ? '80mm auto'
          : size.cols > 1
            ? 'A4'
            : 'auto'

      const doc = buildLabelPrintDocument({
        title: `Barcode Labels — ${safeName}`,
        bodyHtml: `<div style="${colStyle}">${labels}</div>`,
        pageSize,
        pageMargin: size.cols > 1 ? '6mm' : '2mm',
      })

      await printDocument(doc, {
        title: `Barcode Labels — ${safeName}`,
        immediate: true,
      })
      toast.success(`Sent ${qty} label${qty !== 1 ? 's' : ''} to printer`)
    } catch (err) {
      console.error('[label print]', err)
      toast.error('Print failed — connect an AirPrint or label printer')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid #D8D2C4', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 480 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#0A0C12', margin: 0 }}>
            Print Barcode Label
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer', padding: 4 }}><X size={18}/></button>
        </div>

        {/* Live preview */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px', textAlign: 'center', marginBottom: '1.25rem', display: 'inline-block', width: '100%' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', border: '1px dashed #ccc', padding: '8px 16px', borderRadius: 6, minWidth: 180 }}>
            {showStore && storeName && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555', marginBottom: 2 }}>{storeName}</div>}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 2, maxWidth: 220, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{product.name}</div>
            {showSku && product.sku && <div style={{ fontSize: 9, color: '#666', marginBottom: 3 }}>SKU: {product.sku}</div>}
            {product.barcode
              ? <svg ref={svgRef} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }}/>
              : <div style={{ fontSize: 10, color: '#999', padding: '8px 0', fontStyle: 'italic' }}>No barcode set — add one to enable scanning</div>
            }
            {showPrice && <div style={{ fontSize: 14, fontWeight: 800, color: '#000', marginTop: 3, borderTop: '1px solid #ddd', paddingTop: 3, width: '100%' }}>Rs. {Number(product.selling_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>}
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.25rem' }}>

          {/* Label size */}
          <div>
            <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.50)', marginBottom: 6 }}>
              Label Size
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LABEL_SIZES.map(s => (
                <button key={s.key} onClick={() => setSizeKey(s.key)}
                  style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: sizeKey === s.key ? 'rgba(232,197,71,0.15)' : 'rgba(255,255,255,0.04)',
                    color:      sizeKey === s.key ? '#E8C547' : '#2C3650',
                    border:     sizeKey === s.key ? '1px solid rgba(232,197,71,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Store name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.50)', marginBottom: 6 }}>
              Store Name on Label
            </label>
            <input className="input-field" style={{ width: '100%' }} placeholder="Your Store"
              value={storeName} onChange={e => setStoreName(e.target.value)} />
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Show Store', val: showStore, set: setShowStore },
              { label: 'Show Price', val: showPrice, set: setShowPrice },
              { label: 'Show SKU',   val: showSku,   set: setShowSku   },
            ].map(t => (
              <label key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.78rem', color: 'rgba(0,0,0,0.62)' }}>
                <div onClick={() => t.set(v => !v)}
                  style={{ width: 28, height: 16, borderRadius: 20, background: t.val ? 'rgba(232,197,71,0.60)' : 'rgba(255,255,255,0.10)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 2, left: t.val ? 12 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }}/>
                </div>
                {t.label}
              </label>
            ))}
          </div>

          {/* Quantity */}
          <div>
            <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.50)', marginBottom: 6 }}>
              Number of Labels
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.06)', color: '#0A0C12', cursor: 'pointer', fontSize: 16 }}>−</button>
              <input type="number" min="1" max="200"
                style={{ width: 60, textAlign: 'center', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#0A0C12', fontSize: '1rem', fontWeight: 700, padding: '4px 0', fontFamily: 'inherit' }}
                value={qty} onChange={e => setQty(Math.min(200, Math.max(1, parseInt(e.target.value)||1)))} />
              <button onClick={() => setQty(q => Math.min(200, q + 1))} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.06)', color: '#0A0C12', cursor: 'pointer', fontSize: 16 }}>+</button>
              <span style={{ fontSize: '0.75rem', color: '#000000' }}>max 200</span>
            </div>
          </div>
        </div>

        {!product.barcode && (
          <div style={{ marginBottom: '1rem', padding: '8px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)', borderRadius: 8, fontSize: '0.76rem', color: '#FBBF24', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13}/> No barcode set — labels will print without a scannable code. Edit the product to add a barcode.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Close</button>
          <button onClick={handlePrint} disabled={printing} className="btn-gold" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Printer size={14}/> {printing ? 'Printing…' : `Print ${qty} Label${qty !== 1 ? 's' : ''}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}


export default function Products() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const canSeeCost = ['owner','superadmin','manager'].includes(user?.role)
  const canListOnBazaar = ['owner', 'superadmin', 'manager'].includes(user?.role)
  const canDeleteProduct = ['owner', 'superadmin', 'manager'].includes(user?.role)
  const [unlistingId, setUnlistingId] = useState(null)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [modal, setModal]           = useState(null)
  const [printProduct,    setPrintProduct]    = useState(null)
  const [variantsProduct, setVariantsProduct] = useState(null)

  const anyModalOpen = modal !== null || !!printProduct || !!variantsProduct
  useHideAppFooter(anyModalOpen)

  const debouncedSearch = useDebounce(search, 300)

  const { data: products = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['products', debouncedSearch, catFilter, statusFilter],
    queryFn: () => productsAPI.getAll({ q: debouncedSearch, category: catFilter, status: statusFilter }).then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    onError: () => toast.error('Failed to load products'),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => productsAPI.getCategories().then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 300_000,
  })

  const handleUnlistBazaar = async (p) => {
    if (!window.confirm(`Remove "${p.name}" from DGC Bazaar?`)) return
    setUnlistingId(p.id)
    try {
      await productsAPI.unlistFromBazaar(p.id)
      toast.success('Removed from DGC Bazaar')
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove from bazaar')
    } finally {
      setUnlistingId(null)
    }
  }

  const handleDelete = async (p) => {
    if (!canDeleteProduct) {
      toast.error('Only store owners and managers can delete products')
      return
    }
    if (!confirm(`Deactivate "${p.name}"?`)) return
    try {
      await productsAPI.delete(p.id)
      toast.success('Product deactivated')
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete product')
    }
  }

  const cur = v => `Rs. ${Number(v||0).toLocaleString('en-IN')}`

  return (
    <div className="dgc-products-page">
      <div className="dgc-products-scroll p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="section-title dgc-text-3d">Products</h2>
          <p className="section-subtitle">{products.length} items</p>
        </div>
        <div className="hidden md:flex" style={{ gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(0,0,0,0.70)', cursor: 'pointer', fontSize: '0.80rem', fontFamily: 'inherit', fontWeight: 600 }}>
            <Upload size={13}/> Import CSV
            <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={async e => {
              const file = e.target.files[0]
              if (!file) return
              try {
                const res = await bulkImportAPI.importProducts(file)
                const d   = res.data
                toast.success(`Imported: ${d.created} created, ${d.updated} updated${d.errors.length ? `, ${d.errors.length} errors` : ''}`)
                qc.invalidateQueries({ queryKey: ['products'] })
              } catch { toast.error('Import failed') }
              e.target.value = ''
            }}/>
          </label>
          <button type="button" onClick={() => setModal({})} className="btn-gold flex items-center gap-2">
            <Plus size={14}/> Add Product
          </button>
        </div>
      </div>

      {/* Filters - light style with real black font to match POS */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-3"/>
          <input className="input-field pl-9" style={{ color: '#000000' }} placeholder="Search name, SKU, barcode…"
            value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className="input-field w-auto min-w-36" style={{ color: '#000000' }} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input-field w-auto min-w-28" style={{ color: '#000000' }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All Status</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-glass-border bg-white/[0.02]">
                <th className="table-header">Product</th>
                <th className="table-header">SKU</th>
                <th className="table-header">Category</th>
                {canSeeCost && <th className="table-header text-right">Cost</th>}
                <th className="table-header text-right">Price</th>
                {canSeeCost && <th className="table-header text-right">Margin</th>}
                <th className="table-header text-center">Stock</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_,i) => (
                  <tr key={i}><td colSpan={7 + (canSeeCost ? 2 : 0)} className="table-cell">
                    <div className="h-4 bg-white/[0.04] rounded animate-pulse" />
                  </td></tr>
                ))
              ) : products.length === 0 ? (
                <tr><td colSpan={7 + (canSeeCost ? 2 : 0)} className="table-cell text-center py-12 text-txt-3">
                  No products found. <button onClick={()=>setModal({})} className="text-[#071B52] hover:underline">Add one →</button>
                </td></tr>
              ) : products.map(p => (
                <motion.tr key={p.id} initial={{opacity:0}} animate={{opacity:1}} className="table-row">
                  <td className="table-cell">
                    <div className="font-medium text-txt text-sm flex items-center gap-2 flex-wrap">
                      {p.name}
                      {p.bazaar_listed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 border border-amber-500/25">
                          <Store size={10} /> Bazaar
                        </span>
                      )}
                    </div>
                    {p.description && <div className="text-txt-3 text-xs truncate max-w-40">{p.description}</div>}
                  </td>
                  <td className="table-cell">
                    <div className="font-mono text-xs text-txt-2">{p.sku||'—'}</div>
                    {p.barcode && <div className="font-mono text-[10px] text-txt-3 mt-0.5" style={{letterSpacing:'0.04em'}}>{p.barcode}</div>}
                  </td>
                  <td className="table-cell"><span className="badge-blue text-[10px]">{p.category_name||'—'}</span>{p.has_variants && <span className="ml-1 text-[9px] px-1 py-0 rounded bg-purple-100 text-purple-700">V</span>}</td>
                  {canSeeCost && <td className="table-cell text-right text-txt-2">{cur(p.cost_price)}</td>}
                  <td className="table-cell text-right font-semibold text-txt">{cur(p.selling_price)}</td>
                  {canSeeCost && <td className="table-cell text-right"><span className={p.profit_margin > 0 ? 'text-success text-xs font-semibold' : 'text-txt-3 text-xs'}>{p.profit_margin}%</span></td>}
                  <td className="table-cell text-center">
                    <span className={`badge ${p.is_low_stock ? 'badge-red' : 'badge-green'}`}>
                      {p.stock_qty} {p.is_low_stock && <AlertTriangle size={10} className="ml-1"/>}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    <span className={`badge ${p.status==='active'?'badge-green':'badge-gray'}`}>{p.status}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1 justify-end">
                      {canListOnBazaar && p.bazaar_listed && (
                        <button
                          onClick={() => handleUnlistBazaar(p)}
                          disabled={unlistingId === p.id}
                          title="Remove from DGC Bazaar"
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-colors"
                        >
                          <X size={13}/>
                        </button>
                      )}
                      <button onClick={()=>setPrintProduct(p)} title="Print barcode label" className="p-1.5 rounded-lg hover:bg-glass text-txt-3 hover:text-green-400 transition-colors"><Printer size={13}/></button>
                      <button onClick={()=>setVariantsProduct(p)} title="Manage variants" className="p-1.5 rounded-lg hover:bg-glass text-txt-3 hover:text-purple-400 transition-colors"><Layers size={13}/></button>
                      <button onClick={()=>setModal(p)} className="p-1.5 rounded-lg hover:bg-glass text-txt-3 hover:text-[#071B52] transition-colors"><Edit2 size={13}/></button>
                      {canDeleteProduct && (
                        <button onClick={()=>handleDelete(p)} title="Deactivate product" className="p-1.5 rounded-lg hover:bg-red-500/10 text-txt-3 hover:text-red-400 transition-colors"><Trash2 size={13}/></button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modal !== null && (
          <ProductModal product={modal} categories={categories} canSeeCost={canSeeCost}
            onClose={() => setModal(null)} onSaved={(newProduct) => { setModal(null); qc.invalidateQueries({ queryKey: ['products'] }); if (newProduct) setPrintProduct(newProduct) }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {printProduct && (
          <BarcodeLabelModal product={printProduct} onClose={() => setPrintProduct(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {variantsProduct && (
          <VariantsModal product={variantsProduct} onClose={() => { setVariantsProduct(null); qc.invalidateQueries({ queryKey: ['products'] }) }} />
        )}
      </AnimatePresence>
      </div>

      {/* Fixed bottom bar — always above footer / safe area */}
      <div className="dgc-products-fab flex gap-2">
        <label className="btn-ghost flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold cursor-pointer">
          <Upload size={16} /> Import
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async e => {
            const file = e.target.files[0]
            if (!file) return
            try {
              const res = await bulkImportAPI.importProducts(file)
              const d = res.data
              toast.success(`Imported: ${d.created} created, ${d.updated} updated`)
              qc.invalidateQueries({ queryKey: ['products'] })
            } catch { toast.error('Import failed') }
            e.target.value = ''
          }} />
        </label>
        <button type="button" onClick={() => setModal({})}
          className="btn-gold flex-[1.6] flex items-center justify-center gap-2 py-3.5 text-sm font-bold">
          <Plus size={16} /> Add Product
        </button>
      </div>
    </div>
  )
}
