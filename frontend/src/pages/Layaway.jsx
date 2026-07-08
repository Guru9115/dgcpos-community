import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { layawayAPI, productsAPI, customersAPI } from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Plus, X, ChevronDown, ChevronUp, CreditCard, Ban, Check } from 'lucide-react'

const STATUS_STYLE = {
  active:    { color: '#34D399', bg: 'rgba(52,211,153,0.10)'  },
  completed: { color: '#E8C547', bg: 'rgba(232,197,71,0.10)'  },
  cancelled: { color: 'rgba(0,0,0,0.45)', bg: 'rgba(148,163,184,0.10)' },
  forfeited: { color: '#F87171', bg: 'rgba(248,113,113,0.10)' },
}

function StatusBadge({ status }) {
  const c = STATUS_STYLE[status] || STATUS_STYLE.cancelled
  return (
    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.70rem', fontWeight: 700, color: c.color, background: c.bg, border: `1px solid ${c.color}30`, textTransform: 'capitalize' }}>
      {status}
    </span>
  )
}

// ── Create Layaway Modal ──────────────────────────────────────────────────────
function CreateModal({ onClose }) {
  const qc = useQueryClient()
  const [custQ,    setCustQ]    = useState('')
  const [customer, setCustomer] = useState(null)
  const [custName, setCustName] = useState('')
  const [custPhone,setCustPhone]= useState('')
  const [dueDate,  setDueDate]  = useState('')
  const [deposit,  setDeposit]  = useState('')
  const [payMethod,setPayMethod]= useState('cash')
  const [notes,    setNotes]    = useState('')
  const [items,    setItems]    = useState([{ product_id: '', product_name: '', unit_price: '', qty: 1 }])
  const [prodQ,    setProdQ]    = useState('')
  const [prodList, setProdList] = useState([])

  const total = items.reduce((s, i) => s + (parseFloat(i.unit_price)||0) * (parseInt(i.qty)||0), 0)

  const searchProducts = async (q) => {
    if (!q.trim()) { setProdList([]); return }
    const res = await productsAPI.getAll({ q, per_page: 8 })
    setProdList(res.data.products || [])
  }

  const pickProduct = (p, idx) => {
    const updated = [...items]
    updated[idx] = { product_id: p.id, product_name: p.name, unit_price: p.selling_price, qty: 1 }
    setItems(updated)
    setProdList([])
    setProdQ('')
  }

  const mutation = useMutation({
    mutationFn: (d) => layawayAPI.create(d),
    onSuccess: (res) => {
      toast.success(`Layaway ${res.data.layaway_number} created`)
      qc.invalidateQueries({ queryKey: ['layaways'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const handleSubmit = () => {
    const validItems = items.filter(i => i.product_id && parseFloat(i.unit_price) > 0 && parseInt(i.qty) > 0)
    if (!validItems.length) { toast.error('Add at least one item'); return }
    const dep = parseFloat(deposit) || 0
    if (dep > total) { toast.error('Deposit cannot exceed total'); return }
    mutation.mutate({
      customer_id:    customer?.id || null,
      customer_name:  customer?.name || custName,
      customer_phone: customer?.phone || custPhone,
      items:          validItems,
      deposit_amount: dep,
      payment_method: payMethod,
      due_date:       dueDate || null,
      notes,
    })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16, overflowY: 'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#EDE8DF', margin: 0 }}>New Layaway</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Customer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Customer Name</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="Walk-in or name"
                value={custName} onChange={e => setCustName(e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Phone</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="Optional"
                value={custPhone} onChange={e => setCustPhone(e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.45)', marginBottom: 8 }}>
              Items
            </div>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 60px 32px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <input className="input-field" style={{ width: '100%' }}
                    placeholder="Search product…"
                    value={item.product_name || prodQ}
                    onChange={e => { setProdQ(e.target.value); searchProducts(e.target.value); setItems(p => { const u=[...p]; u[idx].product_name=e.target.value; u[idx].product_id=''; return u }) }}
                  />
                  {prodList.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0F1923', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, zIndex: 10, maxHeight: 160, overflowY: 'auto' }}>
                      {prodList.map(p => (
                        <div key={p.id} onClick={() => pickProduct(p, idx)}
                          style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.82rem', color: '#EDE8DF' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          {p.name} — Rs. {parseFloat(p.selling_price).toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" className="input-field" placeholder="Price" min="0"
                  value={item.unit_price} onChange={e => setItems(p => { const u=[...p]; u[idx].unit_price=e.target.value; return u })} />
                <input type="number" className="input-field" placeholder="Qty" min="1"
                  value={item.qty} onChange={e => setItems(p => { const u=[...p]; u[idx].qty=e.target.value; return u })} />
                <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                  style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: 4 }}><X size={14}/></button>
              </div>
            ))}
            <button onClick={() => setItems(p => [...p, { product_id: '', product_name: '', unit_price: '', qty: 1 }])}
              style={{ fontSize: '0.78rem', color: '#E8C547', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              + Add item
            </button>
          </div>

          {/* Total + deposit */}
          <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)' }}>Total</span>
            <span style={{ fontWeight: 800, color: '#E8C547', fontFamily: 'Inter, system-ui, sans-serif' }}>Rs. {total.toFixed(2)}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Deposit Amount</label>
              <input type="number" className="input-field" style={{ width: '100%' }} placeholder="0.00" min="0"
                value={deposit} onChange={e => setDeposit(e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Payment Method</label>
              <select className="input-field" style={{ width: '100%' }} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {['cash','card','qr'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Due Date (optional)</label>
              <input type="date" className="input-field" style={{ width: '100%' }}
                value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Notes</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="Optional…"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-gold">
            {mutation.isPending ? 'Creating…' : 'Create Layaway'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ layaway, onClose }) {
  const qc = useQueryClient()
  const [amount,  setAmount]  = useState('')
  const [method,  setMethod]  = useState('cash')
  const [notes,   setNotes]   = useState('')

  const mutation = useMutation({
    mutationFn: (d) => layawayAPI.addPayment(layaway.id, d),
    onSuccess: () => { toast.success('Payment recorded'); qc.invalidateQueries({ queryKey: ['layaways'] }); onClose() },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#EDE8DF', margin: 0 }}>Record Payment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>
        <div style={{ marginBottom: 14, fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)' }}>
          Balance due: <strong style={{ color: '#F87171', fontSize: '1rem' }}>Rs. {parseFloat(layaway.balance_due).toFixed(2)}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label-sm">Amount</label>
            <input type="number" className="input-field" style={{ width: '100%' }} autoFocus
              placeholder={parseFloat(layaway.balance_due).toFixed(2)} min="0.01"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Method</label>
            <select className="input-field" style={{ width: '100%' }} value={method} onChange={e => setMethod(e.target.value)}>
              {['cash','card','qr'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Notes</label>
            <input className="input-field" style={{ width: '100%' }} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => mutation.mutate({ amount: parseFloat(amount) || parseFloat(layaway.balance_due), payment_method: method, notes })}
            disabled={mutation.isPending} className="btn-gold">
            {mutation.isPending ? 'Saving…' : 'Record'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Layaway Row ───────────────────────────────────────────────────────────────
function LayawayRow({ lay, onPay }) {
  const qc   = useQueryClient()
  const [open, setOpen] = useState(false)
  const pct  = lay.total_amount > 0 ? Math.min(100, Math.round(lay.paid_amount / lay.total_amount * 100)) : 0

  const cancelMutation = useMutation({
    mutationFn: (forfeit) => layawayAPI.cancel(lay.id, { forfeit_deposit: forfeit }),
    onSuccess: () => { toast.success('Layaway cancelled'); qc.invalidateQueries({ queryKey: ['layaways'] }) },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px 100px 100px 90px 60px', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.80rem', color: '#E8C547' }}>{lay.layaway_number}</span>
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#EDE8DF' }}>{lay.customer_name}</div>
          {lay.customer_phone && <div style={{ fontSize: '0.70rem', color: 'rgba(0,0,0,0.45)', marginTop: 1 }}>{lay.customer_phone}</div>}
        </div>
        <span style={{ fontWeight: 700, color: '#EDE8DF', fontSize: '0.85rem' }}>Rs. {parseFloat(lay.total_amount).toFixed(2)}</span>
        <span style={{ fontWeight: 700, color: '#34D399', fontSize: '0.85rem' }}>Rs. {parseFloat(lay.paid_amount).toFixed(2)}</span>
        <span style={{ fontWeight: 700, color: '#F87171', fontSize: '0.85rem' }}>Rs. {parseFloat(lay.balance_due).toFixed(2)}</span>
        <StatusBadge status={lay.status}/>
        {open ? <ChevronUp size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/> : <ChevronDown size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/>}
      </div>

      {open && (
        <div style={{ padding: '10px 16px 14px 24px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Progress bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'rgba(0,0,0,0.50)', marginBottom: 4 }}>
              <span>Payment progress</span><span>{pct}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#34D399' : '#E8C547', borderRadius: 4, transition: 'width 0.6s' }}/>
            </div>
          </div>

          {/* Items */}
          {(lay.items || []).map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(0,0,0,0.60)', padding: '3px 0' }}>
              <span>{i.product_name} × {i.qty}</span>
              <span>Rs. {parseFloat(i.total).toFixed(2)}</span>
            </div>
          ))}

          {/* Actions */}
          {lay.status === 'active' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => onPay(lay)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.30)', color: '#E8C547', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                <CreditCard size={12}/> Add Payment
              </button>
              <button onClick={() => { if (window.confirm('Cancel layaway? Deposit will be returned.')) cancelMutation.mutate(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.20)', color: 'rgba(0,0,0,0.45)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                <Ban size={12}/> Cancel
              </button>
              <button onClick={() => { if (window.confirm('Forfeit deposit?')) cancelMutation.mutate(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.20)', color: '#F87171', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                <X size={12}/> Forfeit
              </button>
            </div>
          )}
          {lay.due_date && <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'rgba(0,0,0,0.42)' }}>Due: {format(new Date(lay.due_date), 'dd MMM yyyy')}</div>}
          {lay.notes && <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'rgba(0,0,0,0.42)', fontStyle: 'italic' }}>{lay.notes}</div>}
        </div>
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Layaway() {
  const [showCreate, setShowCreate] = useState(false)
  const [payingLay,  setPayingLay]  = useState(null)
  const [statusFilter, setStatus]   = useState('')
  const [q, setQ]                   = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['layaways', statusFilter, q],
    queryFn:  () => layawayAPI.getAll({ status: statusFilter || undefined, q: q || undefined, per_page: 50 }).then(r => r.data),
    staleTime: 30_000,
  })

  const layaways = data?.layaways || []
  const activeBalance = layaways.filter(l => l.status === 'active').reduce((s, l) => s + parseFloat(l.balance_due), 0)

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.5rem', color: '#EDE8DF', margin: 0 }}>Layaway</h1>
          <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.80rem', margin: '4px 0 0' }}>
            {layaways.filter(l=>l.status==='active').length} active · Rs. {activeBalance.toLocaleString('en-IN')} outstanding
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16}/> New Layaway
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'Active',    value: layaways.filter(l=>l.status==='active').length,    color: '#34D399' },
          { label: 'Completed', value: layaways.filter(l=>l.status==='completed').length, color: '#E8C547' },
          { label: 'Cancelled', value: layaways.filter(l=>l.status==='cancelled').length, color: 'rgba(0,0,0,0.45)' },
          { label: 'Forfeited', value: layaways.filter(l=>l.status==='forfeited').length, color: '#F87171' },
        ].map(k => (
          <div key={k.label} style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.75rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: k.color, fontFamily: 'Inter, system-ui, sans-serif' }}>{k.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.50)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input className="input-field" style={{ flex: 1, minWidth: 180 }} placeholder="Search name or LAY-#…"
          value={q} onChange={e => setQ(e.target.value)} />
        {['', 'active', 'completed', 'cancelled', 'forfeited'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: s ? 'capitalize' : 'none',
              background: statusFilter === s ? 'rgba(232,197,71,0.15)' : 'rgba(255,255,255,0.04)',
              color:      statusFilter === s ? '#E8C547' : 'rgba(255,255,255,0.50)',
              border:     statusFilter === s ? '1px solid rgba(232,197,71,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px 100px 100px 90px 60px', gap: 8, padding: '10px 16px', background: 'rgba(0,0,0,0.04)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)' }}>
          <span>LAY #</span><span>Customer</span><span>Total</span><span>Paid</span><span>Balance</span><span>Status</span><span/>
        </div>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
        ) : layaways.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(0,0,0,0.38)', fontSize: '0.88rem' }}>No layaways yet</div>
        ) : layaways.map(l => (
          <LayawayRow key={l.id} lay={l} onPay={setPayingLay}/>
        ))}
      </div>

      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)}/>}
        {payingLay  && <PaymentModal layaway={payingLay} onClose={() => setPayingLay(null)}/>}
      </AnimatePresence>
    </div>
  )
}
