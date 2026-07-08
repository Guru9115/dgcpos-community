import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { deliveriesAPI, productsAPI } from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Plus, X, Truck, ChevronDown, ChevronUp, MapPin } from 'lucide-react'

const STATUSES = [
  { key: 'pending',    label: 'Pending',    color: 'rgba(0,0,0,0.45)', bg: 'rgba(148,163,184,0.10)' },
  { key: 'packed',     label: 'Packed',     color: '#60A5FA', bg: 'rgba(96,165,250,0.10)'  },
  { key: 'dispatched', label: 'Dispatched', color: '#FBBF24', bg: 'rgba(251,191,36,0.10)'  },
  { key: 'delivered',  label: 'Delivered',  color: '#34D399', bg: 'rgba(52,211,153,0.10)'  },
  { key: 'failed',     label: 'Failed',     color: '#F87171', bg: 'rgba(248,113,113,0.10)' },
  { key: 'cancelled',  label: 'Cancelled',  color: '#475569', bg: 'rgba(71,85,105,0.10)'   },
]

function StatusBadge({ status }) {
  const s = STATUSES.find(x => x.key === status) || STATUSES[0]
  return (
    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.70rem', fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.color}30`, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

const STATUS_FLOW = ['pending','packed','dispatched','delivered']

// ── Create Modal ──────────────────────────────────────────────────────────────
function CreateModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', delivery_address: '',
    assigned_rider: '', delivery_charge: '', scheduled_date: '', notes: '',
  })
  const [items,    setItems]    = useState([{ description: '', qty: 1 }])
  const [prodQ,    setProdQ]    = useState('')
  const [prodList, setProdList] = useState([])
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const searchProd = async (q, idx) => {
    if (!q.trim()) { setProdList([]); return }
    const res = await productsAPI.getAll({ q, per_page: 6 })
    setProdList((res.data.products || []).map(p => ({ ...p, _idx: idx })))
  }

  const mutation = useMutation({
    mutationFn: (d) => deliveriesAPI.create(d),
    onSuccess: (res) => {
      toast.success(`Delivery ${res.data.delivery_number} created`)
      qc.invalidateQueries({ queryKey: ['deliveries'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const handleSubmit = () => {
    const validItems = items.filter(i => i.description.trim())
    if (!validItems.length) { toast.error('Add at least one item'); return }
    if (!form.customer_name.trim() && !form.delivery_address.trim()) {
      toast.error('Customer name or address required'); return
    }
    mutation.mutate({
      ...form,
      delivery_charge: parseFloat(form.delivery_charge) || 0,
      items: validItems,
    })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 60, padding: 16, overflowY: 'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 540, marginTop: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#EDE8DF', margin: 0 }}>New Delivery Order</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Customer Name</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="Name"
                value={form.customer_name} onChange={e => set('customer_name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label-sm">Phone</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="Contact number"
                value={form.customer_phone} onChange={e => set('customer_phone', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-sm">Delivery Address</label>
            <textarea className="input-field" style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
              placeholder="Full delivery address…"
              value={form.delivery_address} onChange={e => set('delivery_address', e.target.value)} />
          </div>

          {/* Items */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.45)', marginBottom: 8 }}>Items</div>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 32px', gap: 6, marginBottom: 6, alignItems: 'center', position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <input className="input-field" style={{ width: '100%' }} placeholder="Item description or search product…"
                    value={item.description}
                    onChange={e => {
                      const updated = [...items]; updated[idx].description = e.target.value; setItems(updated)
                      searchProd(e.target.value, idx)
                    }}
                  />
                  {prodList.length > 0 && prodList[0]?._idx === idx && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0F1923', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, zIndex: 20, maxHeight: 160, overflowY: 'auto' }}>
                      {prodList.map(p => (
                        <div key={p.id} onClick={() => {
                          const updated = [...items]; updated[idx].description = p.name; updated[idx].product_id = p.id; setItems(updated); setProdList([])
                        }} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.82rem', color: '#EDE8DF' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          {p.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" className="input-field" placeholder="Qty" min="1"
                  value={item.qty} onChange={e => { const u=[...items]; u[idx].qty=parseInt(e.target.value)||1; setItems(u) }} />
                <button onClick={() => setItems(p => p.filter((_,i)=>i!==idx))}
                  style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: 4 }}><X size={14}/></button>
              </div>
            ))}
            <button onClick={() => setItems(p => [...p, { description: '', qty: 1 }])}
              style={{ fontSize: '0.78rem', color: '#E8C547', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              + Add item
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Rider / Driver</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="Name or ID"
                value={form.assigned_rider} onChange={e => set('assigned_rider', e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Delivery Charge</label>
              <input type="number" className="input-field" style={{ width: '100%' }} placeholder="0.00" min="0"
                value={form.delivery_charge} onChange={e => set('delivery_charge', e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Scheduled Date</label>
              <input type="date" className="input-field" style={{ width: '100%' }}
                value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-sm">Notes</label>
            <input className="input-field" style={{ width: '100%' }} placeholder="Special instructions…"
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-gold">
            {mutation.isPending ? 'Creating…' : 'Create Delivery'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Status Update Modal ───────────────────────────────────────────────────────
function StatusModal({ delivery, onClose }) {
  const qc = useQueryClient()
  const [status, setStatus]   = useState(delivery.status)
  const [rider,  setRider]    = useState(delivery.assigned_rider || '')
  const [notes,  setNotes]    = useState('')

  const mutation = useMutation({
    mutationFn: (d) => deliveriesAPI.updateStatus(delivery.id, d),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['deliveries'] }); onClose() },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#EDE8DF', margin: 0 }}>Update Status</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label-sm">Status</label>
            <select className="input-field" style={{ width: '100%' }} value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Rider / Driver</label>
            <input className="input-field" style={{ width: '100%' }} value={rider} onChange={e => setRider(e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Notes</label>
            <input className="input-field" style={{ width: '100%' }} placeholder="e.g. Customer not home" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => mutation.mutate({ status, assigned_rider: rider, notes })} disabled={mutation.isPending} className="btn-gold">
            {mutation.isPending ? 'Saving…' : 'Update'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Delivery Row ──────────────────────────────────────────────────────────────
function DeliveryRow({ del, onUpdateStatus }) {
  const [open, setOpen] = useState(false)
  const curIdx = STATUS_FLOW.indexOf(del.status)

  return (
    <>
      <div onClick={() => setOpen(v => !v)} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px 100px 110px 90px 32px', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.80rem', color: '#60A5FA' }}>{del.delivery_number}</span>
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#EDE8DF' }}>{del.customer_name}</div>
          <div style={{ fontSize: '0.70rem', color: 'rgba(0,0,0,0.45)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {del.delivery_address || del.customer_phone || '—'}
          </div>
        </div>
        <StatusBadge status={del.status}/>
        <span style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)' }}>{del.assigned_rider || '—'}</span>
        <span style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)' }}>
          {del.scheduled_date ? format(new Date(del.scheduled_date), 'dd MMM yyyy') : '—'}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.45)' }}>
          {del.created_at ? format(new Date(del.created_at), 'dd MMM') : '—'}
        </span>
        {open ? <ChevronUp size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/> : <ChevronDown size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/>}
      </div>

      {open && (
        <div style={{ padding: '12px 16px 16px 24px', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Progress stepper */}
          {!['failed','cancelled'].includes(del.status) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {STATUS_FLOW.map((s, i) => {
                const done    = i <= curIdx
                const sLabel  = STATUSES.find(x => x.key === s)
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: '0.70rem', fontWeight: 700,
                      background: done ? sLabel?.bg : 'rgba(255,255,255,0.04)',
                      color:      done ? sLabel?.color : 'rgba(255,255,255,0.25)',
                      border:     done ? `1px solid ${sLabel?.color}40` : '1px solid rgba(255,255,255,0.08)',
                      outline:    i === curIdx ? `2px solid ${sLabel?.color}` : 'none',
                      outlineOffset: 2,
                    }}>
                      {sLabel?.label}
                    </div>
                    {i < STATUS_FLOW.length - 1 && <span style={{ color: 'rgba(0,0,0,0.24)', fontSize: '0.75rem' }}>›</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Items */}
          {(del.items || []).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)', marginBottom: 6 }}>Items</div>
              {del.items.map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.80rem', color: 'rgba(0,0,0,0.62)', padding: '3px 0' }}>
                  <span>{i.description}</span><span>× {i.qty}</span>
                </div>
              ))}
            </div>
          )}

          {del.delivery_address && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8 }}>
              <MapPin size={12} style={{ color: 'rgba(0,0,0,0.42)', marginTop: 2, flexShrink: 0 }}/>
              <span style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)' }}>{del.delivery_address}</span>
            </div>
          )}

          {del.notes && <div style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', fontStyle: 'italic', marginBottom: 10 }}>{del.notes}</div>}

          {!['delivered','cancelled','failed'].includes(del.status) && (
            <button onClick={() => onUpdateStatus(del)}
              style={{ padding: '5px 14px', borderRadius: 8, background: 'rgba(232,197,71,0.10)', border: '1px solid rgba(232,197,71,0.25)', color: '#E8C547', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>
              Update Status
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Deliveries() {
  const [showCreate,    setShowCreate]    = useState(false)
  const [updatingDel,   setUpdatingDel]   = useState(null)
  const [statusFilter,  setStatus]        = useState('')
  const [q, setQ]                         = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', statusFilter, q],
    queryFn:  () => deliveriesAPI.getAll({ status: statusFilter || undefined, q: q || undefined, per_page: 60 }).then(r => r.data),
    staleTime: 20_000,
  })

  const deliveries = data?.deliveries || []

  const kpis = {
    pending:    deliveries.filter(d => d.status === 'pending').length,
    packed:     deliveries.filter(d => d.status === 'packed').length,
    dispatched: deliveries.filter(d => d.status === 'dispatched').length,
    delivered:  deliveries.filter(d => d.status === 'delivered').length,
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1050, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.5rem', color: '#EDE8DF', margin: 0 }}>Deliveries</h1>
          <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.80rem', margin: '4px 0 0' }}>Track customer delivery orders from dispatch to door</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={15}/> New Delivery
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'Pending',    value: kpis.pending,    color: 'rgba(0,0,0,0.45)' },
          { label: 'Packed',     value: kpis.packed,     color: '#60A5FA' },
          { label: 'Dispatched', value: kpis.dispatched, color: '#FBBF24' },
          { label: 'Delivered',  value: kpis.delivered,  color: '#34D399' },
        ].map(k => (
          <div key={k.label} style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: k.color, fontFamily: 'Inter, system-ui, sans-serif' }}>{k.value}</div>
            <div style={{ fontSize: '0.70rem', color: 'rgba(0,0,0,0.50)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input className="input-field" style={{ flex: 1, minWidth: 180 }} placeholder="Search DEL-# or customer…"
          value={q} onChange={e => setQ(e.target.value)} />
        {[{ k: '', l: 'All' }, ...STATUSES.map(s => ({ k: s.key, l: s.label }))].map(s => (
          <button key={s.k} onClick={() => setStatus(s.k)}
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: statusFilter === s.k ? 'rgba(232,197,71,0.15)' : 'rgba(255,255,255,0.04)',
              color:      statusFilter === s.k ? '#E8C547' : 'rgba(255,255,255,0.50)',
              border:     statusFilter === s.k ? '1px solid rgba(232,197,71,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
            {s.l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px 100px 110px 90px 32px', gap: 8, padding: '10px 16px', background: 'rgba(0,0,0,0.04)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)' }}>
          <span>DEL #</span><span>Customer</span><span>Status</span><span>Rider</span><span>Scheduled</span><span>Created</span><span/>
        </div>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
        ) : deliveries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(0,0,0,0.38)' }}>
            <Truck size={36} style={{ opacity: 0.3, marginBottom: 12 }}/>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>No deliveries yet</p>
          </div>
        ) : deliveries.map(d => <DeliveryRow key={d.id} del={d} onUpdateStatus={setUpdatingDel}/>)}
      </div>

      <AnimatePresence>
        {showCreate   && <CreateModal onClose={() => setShowCreate(false)}/>}
        {updatingDel  && <StatusModal delivery={updatingDel} onClose={() => setUpdatingDel(null)}/>}
      </AnimatePresence>
    </div>
  )
}
