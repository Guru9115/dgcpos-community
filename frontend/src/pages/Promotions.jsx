import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { promotionsAPI, productsAPI } from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Plus, X, Trash2, Percent, Tag, Gift, DollarSign, ToggleLeft, ToggleRight } from 'lucide-react'

const TYPE_CONFIG = {
  pct_off:   { label: '% Off',      color: '#34D399', icon: Percent   },
  flat_off:  { label: 'Flat Off',   color: '#60A5FA', icon: DollarSign},
  bogo:      { label: 'BOGO',       color: '#A78BFA', icon: Gift      },
  min_spend: { label: 'Min Spend',  color: '#FBBF24', icon: Tag       },
}

function TypeBadge({ type }) {
  const c = TYPE_CONFIG[type] || { label: type, color: 'rgba(0,0,0,0.45)', icon: Tag }
  const Icon = c.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 20, fontSize: '0.70rem', fontWeight: 700, color: c.color, background: `${c.color}18`, border: `1px solid ${c.color}35` }}>
      <Icon size={10}/>{c.label}
    </span>
  )
}

/* ── Promo Form ─────────────────────────────────────────────────── */
function PromoModal({ promo, onClose }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productsAPI.getAll({ status: 'active', per_page: 500 }).then(r => r.data?.products || r.data),
  })

  const isEdit = !!promo
  const [form, setForm] = useState({
    name:        promo?.name        || '',
    description: promo?.description || '',
    promo_type:  promo?.promo_type  || 'pct_off',
    value:       promo?.value       ?? '',
    min_purchase:promo?.min_purchase ?? '',
    buy_qty:     promo?.buy_qty     || 2,
    get_qty:     promo?.get_qty     || 1,
    code:        promo?.code        || '',
    applies_to:  promo?.applies_to  || 'all',
    product_id:  promo?.product_id  || '',
    start_date:  promo?.start_date  || '',
    end_date:    promo?.end_date    || '',
    max_uses:    promo?.max_uses    || '',
    is_active:   promo?.is_active   ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? promotionsAPI.update(promo.id, data) : promotionsAPI.create(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Promotion updated' : 'Promotion created')
      qc.invalidateQueries({ queryKey: ['promotions'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const inp = (key, rest = {}) => ({
    className: 'input-field',
    style: { width: '100%' },
    value: form[key],
    onChange: e => set(key, e.target.value),
    ...rest,
  })

  const submit = () => {
    if (!form.name) return toast.error('Name required')
    mutation.mutate({
      ...form,
      value:        parseFloat(form.value) || 0,
      min_purchase: parseFloat(form.min_purchase) || 0,
      max_uses:     form.max_uses ? parseInt(form.max_uses) : null,
      product_id:   form.applies_to === 'product' && form.product_id ? parseInt(form.product_id) : null,
    })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.2rem', color: '#EDE8DF', margin: 0 }}>
            {isEdit ? 'Edit Promotion' : 'New Promotion'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label-sm">Name *</label>
            <input type="text" {...inp('name')} placeholder="e.g. Summer Sale 20% Off" />
          </div>
          <div>
            <label className="label-sm">Description</label>
            <input type="text" {...inp('description')} placeholder="Optional…" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label-sm">Promo Type *</label>
              <select {...inp('promo_type')}>
                <option value="pct_off">Percentage Off</option>
                <option value="flat_off">Flat Discount (Rs.)</option>
                <option value="bogo">Buy X Get Y Free</option>
                <option value="min_spend">Min Spend Reward</option>
              </select>
            </div>
            <div>
              {form.promo_type === 'bogo' ? (
                <>
                  <label className="label-sm">Buy / Get</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" className="input-field" min="1" style={{ width: '50%' }} value={form.buy_qty} onChange={e => set('buy_qty', e.target.value)} placeholder="Buy" />
                    <input type="number" className="input-field" min="1" style={{ width: '50%' }} value={form.get_qty} onChange={e => set('get_qty', e.target.value)} placeholder="Get Free" />
                  </div>
                </>
              ) : (
                <>
                  <label className="label-sm">{form.promo_type === 'pct_off' ? 'Discount %' : 'Discount Rs.'}</label>
                  <input type="number" {...inp('value')} min="0" step="0.01" placeholder="0" />
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label-sm">Min Purchase (Rs.)</label>
              <input type="number" {...inp('min_purchase')} min="0" step="0.01" placeholder="0" />
            </div>
            <div>
              <label className="label-sm">Promo Code (optional)</label>
              <input type="text" {...inp('code')} placeholder="e.g. SUMMER20" style={{ textTransform: 'uppercase', width: '100%' }} />
            </div>
          </div>

          <div>
            <label className="label-sm">Applies To</label>
            <select {...inp('applies_to')}>
              <option value="all">All Products</option>
              <option value="product">Specific Product</option>
            </select>
          </div>

          {form.applies_to === 'product' && (
            <div>
              <label className="label-sm">Product</label>
              <select {...inp('product_id')}>
                <option value="">Select product…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label-sm">Start Date</label>
              <input type="date" {...inp('start_date')} />
            </div>
            <div>
              <label className="label-sm">End Date</label>
              <input type="date" {...inp('end_date')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label-sm">Max Uses (blank = unlimited)</label>
              <input type="number" {...inp('max_uses')} min="1" placeholder="Unlimited" />
            </div>
            <div>
              <label className="label-sm">Status</label>
              <button type="button" onClick={() => set('is_active', !form.is_active)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.05)', cursor: 'pointer', color: form.is_active ? '#34D399' : '#94A3B8', fontWeight: 600, fontSize: '0.82rem', fontFamily: 'inherit', width: '100%' }}>
                {form.is_active ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                {form.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={submit} disabled={mutation.isPending} className="btn-gold">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function Promotions() {
  const qc = useQueryClient()
  const [modalPromo, setModalPromo] = useState(undefined) // undefined=closed, null=new, obj=edit
  const [filter, setFilter] = useState('all') // all|active|inactive

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ['promotions'],
    queryFn:  () => promotionsAPI.getAll().then(r => r.data),
    staleTime: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => promotionsAPI.remove(id),
    onSuccess: () => { toast.success('Promotion deleted'); qc.invalidateQueries({ queryKey: ['promotions'] }) },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => promotionsAPI.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const visible = promos.filter(p => {
    if (filter === 'active')   return p.is_active && p.is_valid_today
    if (filter === 'inactive') return !p.is_active || !p.is_valid_today
    return true
  })

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.5rem', color: '#EDE8DF', margin: 0 }}>
            Promotions
          </h1>
          <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.80rem', margin: '4px 0 0' }}>
            {promos.filter(p => p.is_active && p.is_valid_today).length} active now · {promos.length} total
          </p>
        </div>
        <button onClick={() => setModalPromo(null)} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16}/> New Promotion
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem' }}>
        {['all','active','inactive'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '4px 16px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
              background: filter === f ? 'rgba(232,197,71,0.15)' : 'rgba(255,255,255,0.04)',
              color:      filter === f ? '#E8C547' : 'rgba(255,255,255,0.50)',
              border:     filter === f ? '1px solid rgba(232,197,71,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Promo cards */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(0,0,0,0.38)' }}>
          <Tag size={40} style={{ marginBottom: 12, opacity: 0.3 }}/>
          <p style={{ margin: 0 }}>No promotions found</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {visible.map(p => {
            const valid = p.is_active && p.is_valid_today
            return (
              <motion.div key={p.id} layout
                style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid ${valid ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 14, padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.90rem', color: '#EDE8DF', marginBottom: 4 }}>{p.name}</div>
                    <TypeBadge type={p.promo_type} />
                  </div>
                  <button onClick={() => toggleMutation.mutate({ id: p.id, is_active: !p.is_active })}
                    style={{ background: 'none', border: 'none', color: p.is_active ? '#34D399' : '#94A3B8', cursor: 'pointer', padding: 2 }}>
                    {p.is_active ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                  </button>
                </div>

                {p.description && (
                  <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.50)', margin: '0 0 10px' }}>{p.description}</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)', marginBottom: 12 }}>
                  {p.promo_type === 'pct_off'   && <span>Discount: <b style={{ color: '#34D399' }}>{p.value}%</b></span>}
                  {p.promo_type === 'flat_off'  && <span>Discount: <b style={{ color: '#60A5FA' }}>Rs. {p.value}</b></span>}
                  {p.promo_type === 'bogo'      && <span>Buy <b style={{ color: '#A78BFA' }}>{p.buy_qty}</b> get <b style={{ color: '#A78BFA' }}>{p.get_qty}</b> free</span>}
                  {p.promo_type === 'min_spend' && <span>Reward: <b style={{ color: '#FBBF24' }}>Rs. {p.value}</b> off on min Rs. {p.min_purchase}</span>}
                  {p.min_purchase > 0 && p.promo_type !== 'min_spend' && <span>Min purchase: Rs. {p.min_purchase}</span>}
                  {p.code && <span>Code: <b style={{ color: '#E8C547', fontFamily: 'monospace' }}>{p.code}</b></span>}
                  {p.applies_to === 'product' && p.product_name && <span>Product: {p.product_name}</span>}
                  {(p.start_date || p.end_date) && (
                    <span>
                      {p.start_date ? format(new Date(p.start_date), 'dd MMM') : '—'} →{' '}
                      {p.end_date   ? format(new Date(p.end_date),   'dd MMM yyyy') : '∞'}
                    </span>
                  )}
                  {p.max_uses && <span>Used: {p.used_count}/{p.max_uses}</span>}
                </div>

                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => setModalPromo(p)} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>Edit</button>
                  <button onClick={() => { if (window.confirm('Delete this promotion?')) deleteMutation.mutate(p.id) }}
                    style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.20)', color: '#F87171', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {modalPromo !== undefined && (
          <PromoModal promo={modalPromo || null} onClose={() => setModalPromo(undefined)}/>
        )}
      </AnimatePresence>
    </div>
  )
}
