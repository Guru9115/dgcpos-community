import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { purchaseOrdersAPI, suppliersAPI, productsAPI } from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  Plus, X, ChevronDown, ChevronUp, Package, Truck, CheckCircle,
  Clock, XCircle, Send, ReceiptText, Trash2, Eye
} from 'lucide-react'

const STATUS_CONFIG = {
  draft:      { label: 'Draft',      color: 'rgba(0,0,0,0.45)', bg: 'rgba(148,163,184,0.10)' },
  sent:       { label: 'Sent',       color: '#60A5FA', bg: 'rgba(96,165,250,0.10)'  },
  partial:    { label: 'Partial',    color: '#FBBF24', bg: 'rgba(251,191,36,0.10)'  },
  received:   { label: 'Received',   color: '#34D399', bg: 'rgba(52,211,153,0.10)'  },
  cancelled:  { label: 'Cancelled',  color: '#F87171', bg: 'rgba(248,113,113,0.10)' },
}

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 20, fontSize: '0.70rem', fontWeight: 700,
      color: c.color, background: c.bg, border: `1px solid ${c.color}40`,
    }}>{c.label}</span>
  )
}

/* ── Create PO Modal ─────────────────────────────────────────────── */
function CreatePOModal({ onClose }) {
  const qc = useQueryClient()
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersAPI.getAll().then(r => r.data) })
  const { data: products  = [] } = useQuery({ queryKey: ['products-all'], queryFn: () => productsAPI.getAll({ status: 'active', per_page: 500 }).then(r => r.data?.products || r.data) })

  const [supplierId,   setSupplierId]   = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes,        setNotes]        = useState('')
  const [items,        setItems]        = useState([{ product_id: '', qty_ordered: 1, unit_cost: '' }])

  const mutation = useMutation({
    mutationFn: (data) => purchaseOrdersAPI.create(data),
    onSuccess: () => {
      toast.success('Purchase order created')
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to create PO'),
  })

  const addItem = () => setItems(prev => [...prev, { product_id: '', qty_ordered: 1, unit_cost: '' }])
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const handleProductChange = (i, pid) => {
    const p = products.find(x => x.id === parseInt(pid))
    updateItem(i, 'product_id', pid)
    if (p) updateItem(i, 'unit_cost', p.cost_price || '')
  }

  const total = items.reduce((s, it) => s + (parseFloat(it.unit_cost) || 0) * (parseInt(it.qty_ordered) || 0), 0)

  const submit = () => {
    if (!supplierId) return toast.error('Select a supplier')
    const valid = items.filter(i => i.product_id && i.qty_ordered > 0 && i.unit_cost)
    if (!valid.length) return toast.error('Add at least one valid item')
    mutation.mutate({
      supplier_id: parseInt(supplierId),
      expected_date: expectedDate || null,
      notes,
      items: valid.map(i => ({ product_id: parseInt(i.product_id), qty_ordered: parseInt(i.qty_ordered), unit_cost: parseFloat(i.unit_cost) })),
    })
  }

  const inp = { className: 'input-field', style: { width: '100%' } }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,40,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16, backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.2rem', color: '#0A0C12', margin: 0 }}>New Purchase Order</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.25rem' }}>
          <div>
            <label className="label-sm">Supplier *</label>
            <select {...inp} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Expected Delivery</label>
            <input type="date" {...inp} value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label className="label-sm">Notes</label>
          <input type="text" {...inp} placeholder="Optional notes…" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Items */}
        <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.50)' }}>Order Items</span>
          <button onClick={addItem} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>+ Add Row</button>
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 28px', gap: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.05)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.45)' }}>
            <span>Product</span><span>Qty</span><span>Unit Cost</span><span/>
          </div>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 28px', gap: 8, padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
              <select className="input-field" style={{ padding: '6px 8px', fontSize: '0.80rem' }} value={item.product_id} onChange={e => handleProductChange(i, e.target.value)}>
                <option value="">Select product…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" className="input-field" style={{ padding: '6px 8px', fontSize: '0.80rem' }} min="1" value={item.qty_ordered} onChange={e => updateItem(i, 'qty_ordered', e.target.value)} />
              <input type="number" className="input-field" style={{ padding: '6px 8px', fontSize: '0.80rem' }} min="0" step="0.01" placeholder="0.00" value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} />
              <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: 2 }}><Trash2 size={13}/></button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: '#E8C547', fontWeight: 700 }}>
            Total: Rs. {total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={submit} disabled={mutation.isPending} className="btn-gold">
              {mutation.isPending ? 'Creating…' : 'Create PO'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Receive Items Modal ──────────────────────────────────────────── */
function ReceiveModal({ po, onClose }) {
  const qc = useQueryClient()
  const [received, setReceived] = useState(() =>
    Object.fromEntries(po.items.map(i => [i.id, i.qty_ordered - i.qty_received]))
  )

  const mutation = useMutation({
    mutationFn: (data) => purchaseOrdersAPI.receive(po.id, data),
    onSuccess: () => {
      toast.success('Stock received and updated')
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to receive'),
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,40,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16, backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#0A0C12', margin: 0 }}>
            Receive — {po.po_number}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', gap: 8, padding: '8px 0', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
          <span>Product</span><span>Ordered</span><span>Receiving</span>
        </div>
        {po.items.map(item => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', gap: 8, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.60)' }}>
              {item.product_name}{item.variant_label ? ` — ${item.variant_label}` : ''}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.50)', textAlign: 'center' }}>
              {item.qty_ordered} <span style={{ fontSize: '0.70rem', color: 'rgba(0,0,0,0.38)' }}>/{item.qty_received} rcvd</span>
            </span>
            <input
              type="number" className="input-field" min="0" max={item.qty_ordered - item.qty_received}
              style={{ padding: '5px 8px', fontSize: '0.82rem' }}
              value={received[item.id] ?? 0}
              onChange={e => setReceived(prev => ({ ...prev, [item.id]: parseInt(e.target.value) || 0 }))}
            />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => mutation.mutate({ received })} disabled={mutation.isPending} className="btn-gold">
            {mutation.isPending ? 'Saving…' : 'Confirm Receipt'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── PO Row ───────────────────────────────────────────────────────── */
function PORow({ po }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [receiving, setReceiving] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['po-detail', po.id],
    queryFn:  () => purchaseOrdersAPI.getById(po.id).then(r => r.data),
    enabled:  expanded,
  })

  const sendMutation = useMutation({
    mutationFn: () => purchaseOrdersAPI.send(po.id),
    onSuccess: () => { toast.success('PO marked as sent'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) },
    onError:   (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => purchaseOrdersAPI.cancel(po.id),
    onSuccess: () => { toast.success('PO cancelled'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) },
    onError:   (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  return (
    <>
      <motion.div layout style={{
        background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, marginBottom: 8, overflow: 'hidden',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px 120px auto', gap: 12, padding: '12px 16px', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpanded(e => !e)}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#EDE8DF' }}>{po.po_number}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
              {po.supplier_name || 'No supplier'} · {po.item_count} item{po.item_count !== 1 ? 's' : ''}
            </div>
          </div>
          <StatusBadge status={po.status} />
          <span style={{ fontSize: '0.82rem', color: '#E8C547', fontWeight: 600 }}>
            Rs. {po.total_amount.toLocaleString('en-IN')}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)' }}>
            {po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '—'}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {po.status === 'draft' && (
              <button onClick={e => { e.stopPropagation(); sendMutation.mutate() }}
                style={{ background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.25)', color: '#60A5FA', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                <Send size={11}/>Send
              </button>
            )}
            {(po.status === 'sent' || po.status === 'partial') && (
              <button onClick={e => { e.stopPropagation(); setExpanded(true); setReceiving(true) }}
                style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)', color: '#34D399', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                <Package size={11}/>Receive
              </button>
            )}
            {['draft','sent'].includes(po.status) && (
              <button onClick={e => { e.stopPropagation(); if (window.confirm('Cancel this PO?')) cancelMutation.mutate() }}
                style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: 4 }}>
                <XCircle size={14}/>
              </button>
            )}
            {expanded ? <ChevronUp size={14} color="rgba(255,255,255,0.30)"/> : <ChevronDown size={14} color="rgba(255,255,255,0.30)"/>}
          </div>
        </div>

        <AnimatePresence>
          {expanded && detail && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 90px', gap: 8, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)', marginBottom: 6 }}>
                <span>Product</span><span>Ordered</span><span>Received</span><span>Unit Cost</span><span>Total</span>
              </div>
              {detail.items?.map(item => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 90px', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem', color: 'rgba(0,0,0,0.60)' }}>
                  <span>{item.product_name}{item.variant_label ? ` — ${item.variant_label}` : ''}</span>
                  <span style={{ textAlign: 'center' }}>{item.qty_ordered}</span>
                  <span style={{ textAlign: 'center', color: item.qty_received >= item.qty_ordered ? '#34D399' : '#FBBF24' }}>{item.qty_received}</span>
                  <span>Rs. {item.unit_cost.toLocaleString('en-IN')}</span>
                  <span style={{ color: '#E8C547' }}>Rs. {item.line_total.toLocaleString('en-IN')}</span>
                </div>
              ))}
              {po.notes && <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: 'rgba(0,0,0,0.45)' }}>Note: {po.notes}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {receiving && detail && (
          <ReceiveModal po={detail} onClose={() => setReceiving(false)} />
        )}
      </AnimatePresence>
    </>
  )
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function PurchaseOrders() {
  const [creating, setCreating] = useState(false)
  const [status,   setStatus]   = useState('')
  const [page,     setPage]     = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', status, page],
    queryFn:  () => purchaseOrdersAPI.getAll({ status: status || undefined, page, per_page: 20 }).then(r => r.data),
    staleTime: 30_000,
  })

  const pos   = data?.pos || []
  const total = data?.total || 0
  const pages = data?.pages || 1

  const STATUSES = ['', 'draft', 'sent', 'partial', 'received', 'cancelled']

  return (
    <div style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.5rem', color: '#0A0C12', margin: 0 }}>
            Purchase Orders
          </h1>
          <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.80rem', margin: '4px 0 0' }}>
            {total} order{total !== 1 ? 's' : ''} total
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16}/> New PO
        </button>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1) }}
            style={{
              padding: '4px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: status === s ? 'rgba(232,197,71,0.15)' : 'rgba(255,255,255,0.04)',
              color:      status === s ? '#E8C547' : 'rgba(255,255,255,0.50)',
              border:     status === s ? '1px solid rgba(232,197,71,0.35)' : '1px solid rgba(255,255,255,0.08)',
            }}>
            {s ? STATUS_CONFIG[s]?.label : 'All'}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
      ) : pos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(0,0,0,0.38)' }}>
          <Truck size={40} style={{ marginBottom: 12, opacity: 0.3 }}/>
          <p style={{ margin: 0 }}>No purchase orders yet</p>
        </div>
      ) : (
        pos.map(po => <PORow key={po.id} po={po}/>)
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: '1.5rem' }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{ padding: '4px 12px', borderRadius: 8, fontSize: '0.80rem', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.12)',
                background: page === p ? 'rgba(232,197,71,0.15)' : 'transparent',
                color: page === p ? '#E8C547' : 'rgba(255,255,255,0.50)' }}>
              {p}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {creating && <CreatePOModal onClose={() => setCreating(false)}/>}
      </AnimatePresence>
    </div>
  )
}
