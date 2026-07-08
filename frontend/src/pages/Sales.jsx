import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { salesAPI, settingsAPI } from '../api'
import { format, isValid } from 'date-fns'
import toast from 'react-hot-toast'
import { Search, Printer, RotateCcw, XCircle, Eye, ChevronLeft, ChevronRight, X } from 'lucide-react'
import Receipt from '../components/pos/Receipt'
import { printHtml } from '../utils/printHtml'

const safeFmt = (val, fmt) => {
  try { const d = new Date(val); return isValid(d) ? format(d, fmt) : '—' }
  catch { return '—' }
}
const cur = v => `Rs. ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}` // TODO: use shop.currency when available

// ── Receipt Print Modal ──────────────────────────────────────────────────
function ReceiptModal({ sale, shop, onClose }) {
  const [printing, setPrinting] = useState(false)
  const handlePrint = () => {
    const el = document.getElementById('receipt-print')
    if (!el || printing) return
    setPrinting(true)
    printHtml({
      title: `Receipt – ${sale.invoice_number}`,
      bodyHtml: el.innerHTML,
      immediate: true,
    })
      .catch(() => toast.error('Print unavailable — connect an AirPrint printer'))
      .finally(() => setPrinting(false))
  }
  if (!sale) return null

  const hasPAN = shop.pan && shop.pan.trim()
  const footer = shop.footer || 'Thank you for shopping with us!'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="modal-panel" style={{ maxWidth: 440 }}
        onClick={e => e.stopPropagation()}>

        {/* Print styles — 80mm thermal width */}
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #receipt-print, #receipt-print * { visibility: visible !important; }
            #receipt-print {
              position: fixed; top: 0; left: 0;
              width: 80mm; margin: 0; padding: 6mm;
              font-family: "Courier New", Courier, monospace;
              font-size: 12px; line-height: 1.55; color: #000;
            }
          }
        `}</style>

        {/* Modal header */}
        <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, color: '#0A0C12' }}>
            {hasPAN ? '🧾 TAX Invoice' : '🧾 Receipt'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.42)' }}><X size={18} /></button>
        </div>

        {/* Printable receipt */}
        <div id="receipt-print" style={{
          background: '#fff', color: '#000', padding: '1.25rem',
          fontFamily: '"Courier New", Courier, monospace', fontSize: '12px', lineHeight: 1.55,
        }}>

          {/* ── Shop Header ── */}
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase' }}>{shop.name}</div>
            {shop.address && <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{shop.address}</div>}
            {shop.phone && shop.phone !== '+977-XXXXXXXXXX' && (
              <div style={{ fontSize: 10, color: '#444' }}>Tel: {shop.phone}</div>
            )}
            {shop.email && <div style={{ fontSize: 10, color: '#444' }}>{shop.email}</div>}
            {hasPAN && (
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, padding: '2px 0', borderTop: '1px solid #ccc', borderBottom: '1px solid #ccc' }}>
                PAN No: {shop.pan} &nbsp;|&nbsp; TAX INVOICE
              </div>
            )}
            {!hasPAN && <div style={{ borderTop: '1px dashed #aaa', marginTop: 6 }} />}
          </div>

          {/* ── Invoice Meta ── */}
          <div style={{ fontSize: 11, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Invoice:</span><strong>{sale.invoice_number}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Date:</span><span>{safeFmt(sale.sale_date, 'dd/MM/yyyy hh:mm a')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Customer:</span><span>{sale.customer_name || 'Walk-in'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Cashier:</span><span>{sale.cashier_name || '—'}</span>
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #aaa', margin: '6px 0' }} />

          {/* ── Items ── */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>
              <span>Item</span><span>Qty × Price = Total</span>
            </div>
            {(sale.items || []).map((item, i) => (
              <div key={i} style={{ marginBottom: 3 }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{item.product_name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#333', paddingLeft: 8 }}>
                  <span></span>
                  <span>{item.qty} × {cur(item.unit_price)} = {cur(item.total)}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px dashed #aaa', margin: '6px 0' }} />

          {/* ── Totals ── */}
          <div style={{ fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal</span><span>{cur(sale.subtotal)}</span>
            </div>
            {sale.discount_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c00' }}>
                <span>Discount ({sale.discount_pct}%)</span><span>- {cur(sale.discount_amount)}</span>
              </div>
            )}
            {sale.tax_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555' }}>
                <span>VAT / Tax ({sale.tax_pct}%)</span><span>{cur(sale.tax_amount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 14, marginTop: 5, borderTop: '2px solid #000', paddingTop: 4 }}>
              <span>TOTAL</span><span>{cur(sale.total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 3, color: '#555' }}>
              <span>Payment</span>
              <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{sale.payment_method}</span>
            </div>
            {sale.amount_paid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}>
                <span>Cash Paid</span><span>{cur(sale.amount_paid)}</span>
              </div>
            )}
            {sale.change_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}>
                <span>Change</span><span>{cur(sale.change_amount)}</span>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px dashed #aaa', margin: '10px 0 6px' }} />

          {/* ── Terms & Conditions ── */}
          <div style={{ fontSize: 10, color: '#333', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 3, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>⚖ Terms of Exchange</div>
            <div>• Exchange within <strong>7 days</strong> with receipt</div>
            <div>• Item must be unused &amp; tags attached</div>
            <div style={{ fontWeight: 700, color: '#c00' }}>• REFUND IS NOT AVAILABLE</div>
            <div>• Price diff NOT returned if exchange item is lower</div>
          </div>

          <div style={{ borderTop: '1px dashed #aaa', margin: '6px 0' }} />

          {/* ── Footer ── */}
          <div style={{ textAlign: 'center', fontSize: 10, color: '#555', marginTop: 6 }}>
            {footer.split('\n').map((line, i) => <div key={i}>{line}</div>)}
            <div style={{ marginTop: 4, fontSize: 9, color: '#999' }}>Powered by DGC POS</div>
          </div>
        </div>

        <div className="p-4 flex gap-2 justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onClose} className="btn-ghost">Close</button>
          <button type="button" onClick={handlePrint} disabled={printing} className="btn-gold flex items-center gap-2" style={{ touchAction: 'manipulation' }}>
            <Printer size={14} /> {printing ? 'Printing…' : 'Print Receipt'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Refund Modal ─────────────────────────────────────────────────────────
function RefundModal({ sale, onClose, onDone }) {
  const [amount, setAmount] = useState(sale?.total || '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleRefund = async () => {
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter valid refund amount')
    if (!reason.trim()) return toast.error('Please enter a reason')
    setSaving(true)
    try {
      await salesAPI.refund(sale.id, { amount: parseFloat(amount), reason })
      toast.success(`Refund of ${cur(amount)} processed`)
      onDone()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Refund failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="modal-panel p-6" style={{ maxWidth: 420 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#0A0C12', marginBottom: 6 }}>
          Process Refund
        </div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.50)', marginBottom: 20 }}>
          Invoice: {sale.invoice_number} · Sale total: {cur(sale.total)}
        </div>
        <div className="space-y-4">
          <div>
            <label className="input-label">Refund Amount (Rs.)</label>
            <input className="input-field" type="number" value={amount}
              onChange={e => setAmount(e.target.value)} max={sale.total} min={1} step="0.01" />
            <div style={{ fontSize: '0.72rem', color: 'rgba(79,195,247,0.5)', marginTop: 4 }}>
              Max: {cur(sale.total)}
            </div>
          </div>
          <div>
            <label className="input-label">Reason *</label>
            <textarea className="input-field" rows={3} value={reason}
              onChange={e => setReason(e.target.value)} placeholder="Reason for refund..." />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={handleRefund} disabled={saving} className="btn-danger flex items-center gap-2" style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)' }}>
              {saving ? 'Processing…' : <><RotateCcw size={14} /> Confirm Refund</>}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Sale Detail Modal ────────────────────────────────────────────────────
function SaleDetailModal({ saleId, onClose, onReprint, onRefund }) {
  const [sale, setSale] = useState(null)
  useEffect(() => {
    salesAPI.getById(saleId).then(r => setSale(r.data)).catch(() => toast.error('Failed to load'))
  }, [saleId])

  if (!sale) return (
    <div className="modal-overlay"><div className="modal-panel p-8 text-center" style={{ maxWidth: 400 }}>
      <div style={{ color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
    </div></div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="modal-panel" style={{ maxWidth: 500 }}
        onClick={e => e.stopPropagation()}>
        <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, color: '#0A0C12' }}>{sale.invoice_number}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(79,195,247,0.55)', marginTop: 2 }}>{safeFmt(sale.sale_date, 'dd MMM yyyy, hh:mm a')}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.42)' }}><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Items */}
          <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr><th className="table-header">Item</th><th className="table-header text-right">Qty</th><th className="table-header text-right">Price</th><th className="table-header text-right">Total</th></tr>
              </thead>
              <tbody>
                {(sale.items || []).map((item, i) => (
                  <tr key={i} className="table-row">
                    <td className="table-cell text-sm" style={{ color: '#0A0C12' }}>{item.product_name}</td>
                    <td className="table-cell text-right">{item.qty}</td>
                    <td className="table-cell text-right">{cur(item.unit_price)}</td>
                    <td className="table-cell text-right" style={{ color: '#0B5FFF' }}>{cur(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '1rem' }}>
            {[
              { label: 'Subtotal', value: cur(sale.subtotal) },
              sale.discount_amount > 0 && { label: 'Discount', value: `- ${cur(sale.discount_amount)}`, red: true },
              sale.tax_amount > 0 && { label: 'Tax', value: cur(sale.tax_amount) },
            ].filter(Boolean).map(({ label, value, red }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem', color: red ? '#c00' : '#555' }}>
                <span>{label}</span><span>{value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', color: '#0A0C12', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 8, marginTop: 4 }}>
              <span>Total</span>
              <span style={{ color: '#8B6914' }}>{cur(sale.total)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            {sale.status !== 'voided' && (
              <button onClick={() => onRefund(sale)} className="btn-ghost flex items-center gap-2" style={{ fontSize: '0.82rem' }}>
                <RotateCcw size={13} /> Refund
              </button>
            )}
            <button onClick={() => onReprint(sale)} className="btn-gold flex items-center gap-2" style={{ fontSize: '0.82rem' }}>
              <Printer size={13} /> Print Receipt
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Main Sales Page ──────────────────────────────────────────────────────
export default function Sales() {
  const [sales, setSales] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [shop, setShop] = useState({ name: 'Your Store', address: '', phone: '', email: '', pan: '', footer: '', logo: null, currency: 'Rs.' })
  const [receiptSale, setReceiptSale] = useState(null)
  const [refundSale, setRefundSale] = useState(null)
  const [detailId, setDetailId] = useState(null)

  useEffect(() => {
    settingsAPI.getAll().then(r => {
      const d = r.data
      setShop({
        name:      d.shop_name      || 'Your Store',
        address:   d.shop_address   || '',
        phone:     d.shop_phone     || '',
        email:     d.shop_email     || '',
        pan:       d.shop_pan       || '',
        footer:    d.receipt_footer || 'Thank you for shopping with us!',
        logo:      d.shop_logo      || null,
        currency:  d.currency       || 'Rs.',
        // Receipt.jsx field names
        shop_name:     d.shop_name      || 'Your Store',
        shop_address:  d.shop_address   || '',
        shop_phone:    d.shop_phone     || '',
        shop_logo:     d.shop_logo      || null,
        receipt_footer:d.receipt_footer || 'Thank you for shopping with us!',
      })
    }).catch(() => {})
  }, [])

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const r = await salesAPI.getAll({ page: p, per_page: 20, q: search, date_from: dateFrom, date_to: dateTo })
      const data = r.data
      if (Array.isArray(data)) {
        setSales(data); setTotal(data.length); setPages(1)
      } else {
        const totalItems = data.total || 0
        const perPage = data.per_page || 20
        setSales(data.sales || [])
        setTotal(totalItems)
        setPages(Math.ceil(totalItems / perPage) || 1)
      }
    } catch { toast.error('Failed to load sales') }
    finally { setLoading(false) }
  }, [page, search, dateFrom, dateTo])

  useEffect(() => { load(1); setPage(1) }, [search, dateFrom, dateTo, load])
  useEffect(() => { load(page) }, [page, load])

  const handleVoid = async (sale) => {
    if (!confirm(`Void sale ${sale.invoice_number}? This cannot be undone.`)) return
    try {
      await salesAPI.void(sale.id)
      toast.success('Sale voided — stock restored, points reversed')
      load(page)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to void') }
  }

  const statusColor = s => s === 'completed' ? { color: '#166534', background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.20)' }
    : s === 'voided' ? { color: '#991b1b', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.20)' }
    : { color: '#1e40af', background: 'rgba(79,195,247,0.10)', border: '1px solid rgba(79,195,247,0.20)' }

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.4rem', fontWeight: 700, color: '#0A0C12' }}>Sales History</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(79,195,247,0.55)', marginTop: 2 }}>{total} transactions total</div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,0,0,0.42)' }} />
          <input className="input-field" style={{ paddingLeft: 36 }} placeholder="Search invoice…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input type="date" className="input-field" style={{ width: 160 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="input-field" style={{ width: 160 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {(dateFrom || dateTo || search) && (
          <button className="btn-ghost" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table style={{ width: '100%', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(79,195,247,0.08)' }}>
                {['Invoice', 'Date', 'Customer', 'Items', 'Total', 'Payment', 'Status', ''].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'rgba(0,0,0,0.42)' }}>Loading…</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'rgba(0,0,0,0.42)' }}>No sales found</td></tr>
              ) : sales.map(s => (
                <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="table-row">
                  <td className="table-cell">
                    <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.78rem', fontWeight: 700, color: '#0A0C12' }}>{s.invoice_number}</span>
                  </td>
                  <td className="table-cell" style={{ fontSize: '0.78rem' }}>{safeFmt(s.sale_date, 'dd MMM yy, hh:mm a')}</td>
                  <td className="table-cell" style={{ fontSize: '0.82rem' }}>{s.customer_name || <span style={{ color: 'rgba(0,0,0,0.38)' }}>Walk-in</span>}</td>
                  <td className="table-cell text-center">{s.item_count ?? '—'}</td>
                  <td className="table-cell text-right" style={{ fontWeight: 700, color: '#8B6914' }}>{cur(s.total)}</td>
                  <td className="table-cell" style={{ fontSize: '0.78rem', textTransform: 'capitalize' }}>{s.payment_method}</td>
                  <td className="table-cell">
                    <span style={{ ...statusColor(s.status), padding: '2px 10px', borderRadius: 99, fontSize: '0.70rem', fontWeight: 700 }}>{s.status}</span>
                  </td>
                  <td className="table-cell">
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setDetailId(s.id)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', color: 'rgba(0,0,0,0.50)' }} title="View">
                        <Eye size={13} />
                      </button>
                      <button onClick={() => {
                        salesAPI.getById(s.id).then(r => setReceiptSale(r.data)).catch(() => toast.error('Failed'))
                      }} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(79,195,247,0.15)', background: 'transparent', cursor: 'pointer', color: '#4FC3F7' }} title="Print">
                        <Printer size={13} />
                      </button>
                      {s.status === 'completed' && (
                        <>
                          <button onClick={() => {
                            salesAPI.getById(s.id).then(r => setRefundSale(r.data)).catch(() => toast.error('Failed'))
                          }} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(251,191,36,0.15)', background: 'transparent', cursor: 'pointer', color: '#FBBF24' }} title="Refund">
                            <RotateCcw size={13} />
                          </button>
                          <button onClick={() => handleVoid(s)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.15)', background: 'transparent', cursor: 'pointer', color: '#F87171' }} title="Void">
                            <XCircle size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost" style={{ padding: '6px 12px' }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.60)' }}>Page {page} of {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost" style={{ padding: '6px 12px' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {detailId && (
          <SaleDetailModal saleId={detailId} shopName={shop.name}
            onClose={() => setDetailId(null)}
            onReprint={sale => { setDetailId(null); setReceiptSale(sale) }}
            onRefund={sale => { setDetailId(null); setRefundSale(sale) }} />
        )}
        {receiptSale && <Receipt sale={receiptSale} settings={shop} onClose={() => setReceiptSale(null)} />}
        {refundSale && <RefundModal sale={refundSale} onClose={() => setRefundSale(null)} onDone={() => { setRefundSale(null); load(page) }} />}
      </AnimatePresence>
    </div>
  )
}
