import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { returnsAPI, salesAPI } from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Search, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'

// ── Return Modal ──────────────────────────────────────────────────────────────
function ReturnModal({ onClose }) {
  const qc = useQueryClient()
  const [step,        setStep]        = useState(1)   // 1=lookup, 2=select items
  const [invoiceQ,    setInvoiceQ]    = useState('')
  const [saleData,    setSaleData]    = useState(null)
  const [selections,  setSelections]  = useState({})  // { sale_item_id: return_qty }
  const [refundMethod,setRefundMethod]= useState('cash')
  const [notes,       setNotes]       = useState('')
  const [searching,   setSearching]   = useState(false)

  const lookupSale = async () => {
    if (!invoiceQ.trim()) return
    setSearching(true)
    try {
      const res = await salesAPI.getAll({ q: invoiceQ.trim(), per_page: 5 })
      const sales = res.data.sales || []
      const match = sales.find(s => s.invoice_number.toLowerCase() === invoiceQ.trim().toLowerCase())
        || sales[0]
      if (!match) { toast.error('Invoice not found'); return }
      if (match.status === 'refunded') { toast.error('This sale is already refunded'); return }
      const eligible = await returnsAPI.eligible(match.id)
      setSaleData(eligible.data)
      setSelections(Object.fromEntries(eligible.data.items.map(i => [i.id, 0])))
      setStep(2)
    } catch { toast.error('Sale not found') }
    finally { setSearching(false) }
  }

  const mutation = useMutation({
    mutationFn: (d) => returnsAPI.create(d),
    onSuccess: (res) => {
      toast.success(`Return ${res.data.invoice_number} processed`)
      qc.invalidateQueries({ queryKey: ['returns'] })
      qc.invalidateQueries({ queryKey: ['sales'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const handleSubmit = () => {
    const items = Object.entries(selections)
      .filter(([, qty]) => qty > 0)
      .map(([sid, qty]) => ({ sale_item_id: parseInt(sid), return_qty: qty }))
    if (!items.length) { toast.error('Select at least one item to return'); return }
    mutation.mutate({
      original_sale_id: saleData.sale.id,
      items, refund_method: refundMethod, notes,
    })
  }

  const totalRefund = saleData
    ? saleData.items.reduce((s, i) => s + (float(i.unit_price) * (selections[i.id] || 0)), 0)
    : 0

  function float(v) { return parseFloat(v) || 0 }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#EDE8DF', margin: 0 }}>
            {step === 1 ? 'Process Return' : `Return — ${saleData?.sale?.invoice_number}`}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        {step === 1 && (
          <div>
            <label className="label-sm">Invoice Number</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input className="input-field" style={{ flex: 1 }} placeholder="e.g. INV-00042"
                value={invoiceQ} onChange={e => setInvoiceQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookupSale()} autoFocus />
              <button onClick={lookupSale} disabled={searching} className="btn-gold">
                {searching ? 'Searching…' : 'Lookup'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && saleData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)' }}>
              Customer: <strong style={{ color: '#EDE8DF' }}>{saleData.sale.customer_name}</strong>
              &nbsp;·&nbsp; Total: <strong style={{ color: '#E8C547' }}>Rs. {float(saleData.sale.total).toFixed(2)}</strong>
              &nbsp;·&nbsp; {format(new Date(saleData.sale.sale_date), 'dd MMM yyyy')}
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.45)', marginBottom: 8 }}>
                Select Items to Return
              </div>
              {saleData.items.map(item => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#EDE8DF', fontWeight: 600 }}>{item.product_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.45)' }}>
                      Rs. {float(item.unit_price).toFixed(2)} × {item.qty} sold
                    </div>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'rgba(0,0,0,0.50)', textAlign: 'center' }}>
                    Return qty:
                  </div>
                  <input type="number" className="input-field" min="0" max={item.qty}
                    style={{ padding: '5px 8px', fontSize: '0.85rem', textAlign: 'center' }}
                    value={selections[item.id] || 0}
                    onChange={e => setSelections(p => ({ ...p, [item.id]: Math.min(parseInt(e.target.value)||0, item.qty) }))}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label-sm">Refund Method</label>
                <select className="input-field" style={{ width: '100%' }} value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                  {['cash','card','qr','store_credit'].map(m => <option key={m} value={m}>{m.replace('_',' ').toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Notes</label>
                <input className="input-field" style={{ width: '100%' }} placeholder="Reason…"
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            {totalRefund > 0 && (
              <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.62)' }}>Refund Amount</span>
                <span style={{ fontWeight: 800, color: '#34D399', fontSize: '1.1rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Rs. {totalRefund.toFixed(2)}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(1)} className="btn-ghost">Back</button>
              <button onClick={handleSubmit} disabled={mutation.isPending || totalRefund === 0} className="btn-gold">
                {mutation.isPending ? 'Processing…' : 'Process Return'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Expandable row ────────────────────────────────────────────────────────────
function ReturnRow({ ret }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 90px 120px 36px', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: '#F87171' }}>{ret.invoice_number}</span>
        <span style={{ fontSize: '0.82rem', color: '#EDE8DF' }}>{ret.customer_name}</span>
        <span style={{ fontWeight: 700, color: '#F87171', fontSize: '0.88rem' }}>Rs. {Math.abs(ret.total).toFixed(2)}</span>
        <span style={{ fontSize: '0.74rem', color: 'rgba(0,0,0,0.50)', textTransform: 'capitalize' }}>{ret.payment_method}</span>
        <span style={{ fontSize: '0.74rem', color: 'rgba(0,0,0,0.45)' }}>
          {ret.sale_date ? format(new Date(ret.sale_date), 'dd MMM yyyy') : '—'}
        </span>
        {open ? <ChevronUp size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/> : <ChevronDown size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/>}
      </div>
      {open && (
        <div style={{ padding: '8px 16px 14px 32px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {(ret.items || []).map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(0,0,0,0.60)', padding: '4px 0' }}>
              <span>{i.product_name}</span>
              <span>{Math.abs(i.qty)} × Rs. {parseFloat(i.unit_price).toFixed(2)}</span>
            </div>
          ))}
          {ret.notes && <div style={{ marginTop: 6, fontSize: '0.74rem', color: 'rgba(0,0,0,0.42)', fontStyle: 'italic' }}>{ret.notes}</div>}
        </div>
      )}
    </>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Returns() {
  const [showModal, setShowModal] = useState(false)
  const [q, setQ]                 = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['returns', q],
    queryFn:  () => returnsAPI.getAll({ q: q || undefined, per_page: 50 }).then(r => r.data),
    staleTime: 30_000,
  })

  const returns = data?.returns || []

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.5rem', color: '#EDE8DF', margin: 0 }}>Returns</h1>
          <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.80rem', margin: '4px 0 0' }}>{returns.length} return{returns.length !== 1 ? 's' : ''} on record</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RotateCcw size={15}/> Process Return
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,0,0,0.42)' }}/>
        <input className="input-field" style={{ paddingLeft: 32, width: '100%' }} placeholder="Search invoice…"
          value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 90px 120px 36px', gap: 8, padding: '10px 16px', background: 'rgba(0,0,0,0.04)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)' }}>
          <span>Return #</span><span>Customer</span><span>Refunded</span><span>Method</span><span>Date</span><span/>
        </div>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
        ) : returns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(0,0,0,0.38)', fontSize: '0.88rem' }}>No returns yet</div>
        ) : returns.map(r => <ReturnRow key={r.id} ret={r}/>)}
      </div>

      <AnimatePresence>
        {showModal && <ReturnModal onClose={() => setShowModal(false)}/>}
      </AnimatePresence>
    </div>
  )
}
