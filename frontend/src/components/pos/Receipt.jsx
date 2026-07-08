import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Printer, X, Mail, Loader, Download } from 'lucide-react'
import { format, isValid } from 'date-fns'

const safeFmt = (val, fmt) => {
  try { const d = new Date(val); return isValid(d) ? format(d, fmt) : '—' }
  catch { return '—' }
}
import { salesAPI } from '../../api'
import toast from 'react-hot-toast'
import { printHtml } from '../../utils/printHtml'

export default function Receipt({ sale = {}, settings = {}, onClose, autoPrint = false }) {
  const cur = v => `${settings.currency || 'Rs.'} ${Number(v || 0).toFixed(2)}`
  const [emailModal, setEmailModal] = useState(false)
  const [printing, setPrinting] = useState(false)

  const shopName    = settings.shop_name    || settings.name || 'Your Store'
  const shopAddress = settings.shop_address || settings.address || ''
  const shopPhone   = settings.shop_phone   || settings.phone || ''
  const shopLogo    = settings.shop_logo    || settings.logo || null
  const panNumber   = settings.shop_pan || settings.pan_number || settings.pan || ''
  const footer      = settings.receipt_footer || settings.footer || 'Thank you for shopping with us!'

  const sendWhatsApp = () => {
    const text = [
      `Receipt from ${shopName}`,
      `Invoice: ${sale.invoice_number}`,
      `Total: Rs. ${Number(sale.total || 0).toFixed(2)}`,
      'Thank you!',
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const autoPrintDone = useRef(false)

  const handlePrint = useCallback(() => {
    const el = document.getElementById('receipt-print-area')
    if (!el || printing) return
    setPrinting(true)
    printHtml({
      title: `Receipt – ${sale.invoice_number}`,
      bodyHtml: el.innerHTML,
      immediate: true,
    })
      .catch(() => toast.error('Print unavailable — connect an AirPrint printer'))
      .finally(() => setPrinting(false))
  }, [sale.invoice_number, printing])

  useEffect(() => {
    if (!autoPrint || autoPrintDone.current) return
    autoPrintDone.current = true
    const el = document.getElementById('receipt-print-area')
    if (!el) return
    const t = setTimeout(() => {
      printHtml({
        title: `Receipt – ${sale.invoice_number}`,
        bodyHtml: el.innerHTML,
        immediate: false,
      }).catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [autoPrint, sale.invoice_number])

  const modal = (
    <div className="modal-overlay dgc-modal-layer">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="modal-panel mx-4 dgc-receipt-panel"
        style={{ maxWidth: 420, width: '100%' }}
      >
        {/* Toolbar — sticky so Email/Print stay visible above footer/header */}
        <div className="no-print dgc-receipt-toolbar">
          <h3 className="font-display text-lg font-semibold text-txt">Receipt</h3>
          <div className="dgc-receipt-toolbar-actions">
            {!sale.offline && sale.id && (
              <button type="button" onClick={() => setEmailModal(true)} className="btn-ghost flex items-center gap-2 text-xs py-2 px-3">
                <Mail size={13} /> Email
              </button>
            )}
            <button type="button" onClick={sendWhatsApp} className="btn-ghost flex items-center gap-2 text-xs py-2 px-3" style={{ color: '#25D366', borderColor: 'rgba(37,211,102,0.35)' }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing}
              style={{ background: '#0A84FF', color: '#fff', borderRadius: 8, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className="flex items-center gap-2 text-xs py-2 px-3"
            >
              <Printer size={13} /> {printing ? 'Printing…' : 'Print'}
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-glass text-txt-3"><X size={14} /></button>
          </div>
        </div>

        {/* ── PRINTABLE RECEIPT ── */}
        <div id="receipt-print-area" style={{ padding: '1.5rem 1.25rem', background: '#fff', color: '#111', fontFamily: "'Courier New', Courier, monospace", fontSize: 12, position: 'relative', overflow: 'hidden' }}>

          {/* Watermark — diagonal shop name behind content */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 0,
            overflow: 'hidden',
          }}>
            {shopLogo ? (
              <img src={shopLogo} alt=""
                style={{ width: '78%', maxWidth: 260, opacity: 0.10, filter: 'grayscale(100%)', userSelect: 'none', transform: 'rotate(-28deg)' }}
              />
            ) : (
              <span style={{
                fontSize: 46, fontWeight: 900, color: '#000', opacity: 0.07,
                whiteSpace: 'nowrap', transform: 'rotate(-28deg)',
                letterSpacing: '-0.02em', userSelect: 'none',
                fontFamily: 'serif',
              }}>{shopName}</span>
            )}
          </div>

          {/* All content sits above watermark */}
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              {shopLogo && (
                <img src={shopLogo} alt={shopName}
                  style={{ height: 52, maxWidth: 160, objectFit: 'contain', margin: '0 auto 6px', display: 'block' }}
                />
              )}
              <div style={{ fontFamily: 'serif', fontSize: 17, fontWeight: 900, letterSpacing: '0.04em', marginBottom: 2 }}>{shopName}</div>
              {shopAddress && <div style={{ fontSize: 10, color: '#555', marginBottom: 1 }}>{shopAddress}</div>}
              {shopPhone   && <div style={{ fontSize: 10, color: '#555', marginBottom: 1 }}>Tel: {shopPhone}</div>}
              {panNumber   && <div style={{ fontSize: 10, color: '#555', fontWeight: 700 }}>PAN: {panNumber}</div>}
            </div>

            <Dash />

            <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, letterSpacing: '0.18em', marginBottom: 8 }}>CASH RECEIPT</div>

            {/* Meta */}
            <Row l="Invoice" r={<strong style={{ color: '#000' }}>{sale.invoice_number}</strong>} />
            <Row l="Date"    r={safeFmt(sale.sale_date, 'dd/MM/yyyy  HH:mm')} />
            <Row l="Customer" r={sale.customer_name || 'Walk-in'} />
            {sale.cashier_name && <Row l="Cashier" r={sale.cashier_name} />}

            <Dash />

            {/* Items */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 10, borderBottom: '1px solid #ccc', paddingBottom: 3, marginBottom: 4 }}>
                <span style={{ flex: 3 }}>ITEM</span>
                <span style={{ flex: 1, textAlign: 'right' }}>QTY</span>
                <span style={{ flex: 1.5, textAlign: 'right' }}>PRICE</span>
                <span style={{ flex: 1.5, textAlign: 'right' }}>TOTAL</span>
              </div>
              {sale.items?.map((item, i) => (
                <div key={i} style={{ marginBottom: 5 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 1 }}>{item.product_name}</div>
                  {item.sku && <div style={{ fontSize: 9, color: '#888' }}>SKU: {item.sku}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333' }}>
                    <span style={{ flex: 3 }}></span>
                    <span style={{ flex: 1, textAlign: 'right' }}>{item.qty}</span>
                    <span style={{ flex: 1.5, textAlign: 'right' }}>{cur(item.unit_price)}</span>
                    <span style={{ flex: 1.5, textAlign: 'right', fontWeight: 600 }}>{cur(item.total)}</span>
                  </div>
                  {item.discount > 0 && (
                    <div style={{ fontSize: 9, color: '#666', textAlign: 'right' }}>Discount: -{cur(item.discount)}</div>
                  )}
                </div>
              ))}
            </div>

            <Dash />

            {/* Totals */}
            <div style={{ fontSize: 11 }}>
              <Row l="Subtotal"    r={cur(sale.subtotal)} />
              {sale.discount_amount > 0 && <Row l={`Discount${sale.discount_pct > 0 ? ` (${sale.discount_pct}%)` : ''}`} r={`-${cur(sale.discount_amount)}`} bold rColor="#c00" />}
              {sale.tax_amount > 0      && <Row l={`Tax (${sale.tax_pct}%)`} r={cur(sale.tax_amount)} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 13, borderTop: '2px solid #000', marginTop: 6, paddingTop: 6 }}>
                <span>TOTAL</span><span>{cur(sale.total)}</span>
              </div>
              <Row l={`Paid (${(sale.payment_method || 'cash').toUpperCase()})`} r={cur(sale.amount_paid)} />
              {sale.change_amount > 0 && <Row l="Change" r={cur(sale.change_amount)} bold rColor="#007a00" />}
              {Number(sale.loyalty_points_earned) > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: '#444', textAlign: 'right' }}>
                  +{Number(sale.loyalty_points_earned)} loyalty pts earned
                </div>
              )}
            </div>

            <Dash />

            {/* Exchange policy */}
            <div style={{ fontSize: 9, color: '#555', lineHeight: 1.55, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: '#000', marginBottom: 3 }}>⚖ Exchange Policy</div>
              <div>• Exchange within 7 days with original receipt</div>
              <div>• Item must be unused with tags attached</div>
              <div style={{ fontWeight: 700, color: '#b00' }}>• NO CASH REFUND</div>
              <div>• Price difference not returned if exchange item is of lower value</div>
            </div>

            <Dash />

            {/* Footer */}
            <div style={{ textAlign: 'center', fontSize: 10, color: '#555', marginTop: 6 }}>{footer}</div>

            {/* Watermark stamp at bottom */}
            <div style={{ textAlign: 'center', marginTop: 12, opacity: 0.18 }}>
              <div style={{ display: 'inline-block', border: '2px solid #000', borderRadius: 4, padding: '2px 10px', fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', transform: 'rotate(-3deg)' }}>
                {shopName.toUpperCase()} ✓ PAID
              </div>
            </div>

            {/* Tiny system note */}
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 8, color: '#bbb' }}>
              Powered by RetailOS · {safeFmt(sale.sale_date, 'dd/MM/yyyy HH:mm')}
            </div>

          </div>{/* /relative z-1 */}
        </div>{/* /receipt-print-area */}

        <div className="no-print p-4 border-t border-glass-border">
          <button type="button" onClick={onClose} className="btn-gold w-full py-3 text-sm font-bold">
            Done — New Sale
          </button>
        </div>
      </motion.div>

      {emailModal && sale.id && (
        <EmailReceiptModal
          sale={sale}
          defaultEmail={sale.customer_email || ''}
          onClose={() => setEmailModal(false)}
        />
      )}
    </div>
  )

  return createPortal(modal, document.body)
}

/* ── Small helpers ──────────────────────────────────────────────────────── */
function Dash() {
  return <div style={{ borderTop: '1px dashed #aaa', margin: '8px 0' }} />
}

function Row({ l, r, bold, rColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11 }}>
      <span style={{ color: '#555' }}>{l}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: rColor || '#000' }}>{r}</span>
    </div>
  )
}


/* ── Email modal ─────────────────────────────────────────────────────────── */
function EmailReceiptModal({ sale, defaultEmail, onClose }) {
  const [email,   setEmail]   = useState(defaultEmail)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!email.trim()) { toast.error('Enter an email address'); return }
    setSending(true)
    try {
      await salesAPI.emailReceipt(sale.id, { email: email.trim() })
      toast.success(`Receipt sent to ${email.trim()}`)
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send email')
    } finally { setSending(false) }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        style={{ background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 360, margin: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>Email Receipt</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8E8E93', cursor: 'pointer', padding: 4 }}><X size={16}/></button>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#8E8E93', marginBottom: '1rem' }}>
          Invoice {sale.invoice_number} — {sale.customer_name || 'Walk-in'}
        </p>
        <input type="email" className="input-field" placeholder="customer@example.com"
          value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          style={{ marginBottom: '1rem' }} autoFocus />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handleSend} disabled={sending} 
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#0A84FF', color: '#fff', borderRadius: 8, padding: '8px 0', border: 'none', fontWeight: 600 }}>
            {sending ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Mail size={13} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
