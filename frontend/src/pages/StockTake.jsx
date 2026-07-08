import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { stockTakeAPI } from '../api'
import toast from 'react-hot-toast'
import { Search, CheckCircle, AlertTriangle, ClipboardList } from 'lucide-react'

export default function StockTake() {
  const [counts, setCounts]     = useState({})  // { product_id: counted_qty }
  const [search, setSearch]     = useState('')
  const [notes,  setNotes]      = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult]     = useState(null)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['stock-take-products'],
    queryFn:  () => stockTakeAPI.getProducts().then(r => r.data),
    staleTime: 0,
  })

  const mutation = useMutation({
    mutationFn: (d) => stockTakeAPI.submit(d),
    onSuccess: (res) => {
      setResult(res.data)
      setSubmitted(true)
      toast.success(`Stock take complete — ${res.data.adjustments} adjustments`)
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to submit'),
  })

  const setCount = (id, val) => setCounts(prev => ({ ...prev, [id]: val === '' ? '' : parseInt(val) }))

  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    )
  }, [products, search])

  const stats = useMemo(() => {
    let filled = 0, variances = 0
    for (const p of products) {
      const c = counts[p.id]
      if (c !== '' && c !== undefined) {
        filled++
        if (parseInt(c) !== p.system_qty) variances++
      }
    }
    return { filled, variances, total: products.length }
  }, [products, counts])

  const handleSubmit = () => {
    if (!window.confirm(`Submit stock take? This will adjust ${stats.variances} product(s) with discrepancies.`)) return
    const items = products
      .filter(p => counts[p.id] !== '' && counts[p.id] !== undefined)
      .map(p => ({ product_id: p.id, counted_qty: parseInt(counts[p.id]) }))
    if (!items.length) return toast.error('No counts entered')
    mutation.mutate({ items, notes })
  }

  if (submitted && result) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: 500, margin: '4rem auto', textAlign: 'center' }}>
        <CheckCircle size={56} style={{ color: '#34D399', marginBottom: 16 }}/>
        <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.4rem', color: '#000000', marginBottom: 8 }}>Stock Take Complete</h2>
        <p style={{ color: 'rgba(0,0,0,0.55)', marginBottom: 24 }}>
          {result.adjustments} product{result.adjustments !== 1 ? 's' : ''} adjusted based on your counts.
        </p>
        <button onClick={() => { setSubmitted(false); setResult(null); setCounts({}); setNotes('') }} className="btn-gold">
          Start New Count
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.5rem', color: '#000000', margin: 0 }}>
            Stock Take
          </h1>
          <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.80rem', margin: '4px 0 0' }}>
            Enter physical count for each product — only entered items will be reconciled
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.50)' }}>
            {stats.filled}/{stats.total} counted · {stats.variances} variances
          </span>
          <button onClick={handleSubmit} disabled={mutation.isPending || stats.filled === 0} className="btn-gold">
            {mutation.isPending ? 'Submitting…' : 'Submit Count'}
          </button>
        </div>
      </div>

      {/* Search + notes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 10, marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,0,0,0.42)' }}/>
          <input className="input-field" style={{ paddingLeft: 32, width: '100%' }} placeholder="Filter products…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input className="input-field" placeholder="Notes (e.g. end-of-month count)"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {/* Product list */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 50px', gap: 8, padding: '10px 16px', background: 'rgba(0,0,0,0.04)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)' }}>
          <span>Product</span><span>Category</span><span style={{ textAlign: 'center' }}>System</span><span style={{ textAlign: 'center' }}>Counted</span><span/>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
        ) : filtered.map(p => {
          const counted = counts[p.id]
          const hasDiff = counted !== '' && counted !== undefined && parseInt(counted) !== p.system_qty
          const diff    = hasDiff ? parseInt(counted) - p.system_qty : null
          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 50px', gap: 8, padding: '9px 16px',
              borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center',
              background: hasDiff ? 'rgba(251,191,36,0.04)' : 'transparent',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#000000' }}>{p.name}</div>
                {p.sku && <div style={{ fontSize: '0.70rem', fontFamily: 'monospace', color: 'rgba(0,0,0,0.42)', marginTop: 1 }}>{p.sku}</div>}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.50)' }}>{p.category_name || '—'}</span>
              <span style={{ textAlign: 'center', fontSize: '0.88rem', fontWeight: 600, color: 'rgba(0,0,0,0.60)' }}>{p.system_qty}</span>
              <input
                type="number" className="input-field" min="0"
                style={{ padding: '5px 8px', fontSize: '0.85rem', textAlign: 'center', borderColor: hasDiff ? 'rgba(251,191,36,0.40)' : undefined }}
                placeholder="—"
                value={counted ?? ''}
                onChange={e => setCount(p.id, e.target.value)}
              />
              <div style={{ textAlign: 'center' }}>
                {diff !== null && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: diff > 0 ? '#34D399' : '#F87171' }}>
                    {diff > 0 ? '+' : ''}{diff}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {stats.variances > 0 && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.80rem', color: '#FBBF24' }}>
          <AlertTriangle size={14}/>
          {stats.variances} variance{stats.variances !== 1 ? 's' : ''} detected — submitting will adjust these in inventory
        </div>
      )}
    </div>
  )
}
