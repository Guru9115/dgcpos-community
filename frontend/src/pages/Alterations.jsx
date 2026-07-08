import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { alterationsAPI } from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Plus, X, Scissors, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

const STATUSES = [
  { key: 'received',    label: 'Received',    color: '#60A5FA', bg: 'rgba(96,165,250,0.10)'  },
  { key: 'in_progress', label: 'In Progress', color: '#FBBF24', bg: 'rgba(251,191,36,0.10)'  },
  { key: 'ready',       label: 'Ready',       color: '#34D399', bg: 'rgba(52,211,153,0.10)'  },
  { key: 'delivered',   label: 'Delivered',   color: 'rgba(0,0,0,0.45)', bg: 'rgba(148,163,184,0.10)' },
  { key: 'cancelled',   label: 'Cancelled',   color: '#F87171', bg: 'rgba(248,113,113,0.10)' },
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

const MEASUREMENTS_FIELDS = ['Chest','Waist','Hip','Shoulder','Sleeve','Length','Neck','Inseam']

// ── Create / Edit Modal ───────────────────────────────────────────────────────
function AlterationModal({ job, onClose }) {
  const qc      = useQueryClient()
  const editing = !!job?.id
  const [form, setForm] = useState({
    customer_name:    job?.customer_name   || '',
    customer_phone:   job?.customer_phone  || '',
    garment_desc:     job?.garment_desc    || '',
    work_description: job?.work_description|| '',
    charge:           job?.charge          || '',
    paid_amount:      job?.paid_amount     || '',
    payment_method:   job?.payment_method  || 'cash',
    priority:         job?.priority        || 'normal',
    due_date:         job?.due_date        || '',
    notes:            job?.notes           || '',
  })
  const [measurements, setMeasurements] = useState(() => {
    try { return JSON.parse(job?.measurements || '{}') } catch { return {} }
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const mutation = useMutation({
    mutationFn: (d) => editing ? alterationsAPI.update(job.id, d) : alterationsAPI.create(d),
    onSuccess: () => {
      toast.success(editing ? 'Job updated' : 'Job created')
      qc.invalidateQueries({ queryKey: ['alterations'] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const handleSubmit = () => {
    if (!form.garment_desc.trim()) { toast.error('Garment description required'); return }
    mutation.mutate({
      ...form,
      charge:       parseFloat(form.charge)      || 0,
      paid_amount:  parseFloat(form.paid_amount) || 0,
      measurements: JSON.stringify(measurements),
    })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 60, padding: '16px', overflowY: 'auto' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid #D8D2C4', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 560, marginTop: 16, marginBottom: 16, boxShadow: '0 25px 80px rgba(10,18,40,0.22)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', color: '#0A0C12', margin: 0 }}>
            {editing ? `Edit ${job.job_number}` : 'New Alteration Job'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer' }}><X size={18}/></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Customer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Customer Name</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="Walk-in or name"
                value={form.customer_name} onChange={e => set('customer_name', e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Phone</label>
              <input className="input-field" style={{ width: '100%' }} placeholder="For pickup notification"
                value={form.customer_phone} onChange={e => set('customer_phone', e.target.value)} />
            </div>
          </div>

          {/* Garment */}
          <div>
            <label className="label-sm">Garment Description *</label>
            <input className="input-field" style={{ width: '100%' }} placeholder="e.g. Blue Kurta – size M, white tag"
              value={form.garment_desc} onChange={e => set('garment_desc', e.target.value)} autoFocus={!editing} />
          </div>

          {/* Work */}
          <div>
            <label className="label-sm">Work to be Done</label>
            <textarea className="input-field" style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
              placeholder="e.g. Shorten length by 2 inches, take in waist…"
              value={form.work_description} onChange={e => set('work_description', e.target.value)} />
          </div>

          {/* Measurements */}
          <div>
            <label className="label-sm">Measurements (inches)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 6 }}>
              {MEASUREMENTS_FIELDS.map(f => (
                <div key={f}>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(0,0,0,0.45)', marginBottom: 3 }}>{f}</div>
                  <input type="number" className="input-field" style={{ padding: '5px 8px', fontSize: '0.82rem', width: '100%' }}
                    placeholder="—" step="0.5"
                    value={measurements[f] || ''} onChange={e => setMeasurements(p => ({ ...p, [f]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Charge + payment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Charge (Rs.)</label>
              <input type="number" className="input-field" style={{ width: '100%' }} placeholder="0.00" min="0"
                value={form.charge} onChange={e => set('charge', e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Advance Paid</label>
              <input type="number" className="input-field" style={{ width: '100%' }} placeholder="0.00" min="0"
                value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Method</label>
              <select className="input-field" style={{ width: '100%' }} value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
                {['cash','card','qr'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          {/* Priority + due date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label-sm">Priority</label>
              <select className="input-field" style={{ width: '100%' }} value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="label-sm">Due Date</label>
              <input type="date" className="input-field" style={{ width: '100%' }}
                value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label-sm">Notes</label>
            <input className="input-field" style={{ width: '100%' }} placeholder="Internal notes…"
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-gold">
            {mutation.isPending ? 'Saving…' : editing ? 'Update Job' : 'Create Job'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Job Row ───────────────────────────────────────────────────────────────────
const STATUS_FLOW = ['received','in_progress','ready','delivered']

function JobRow({ job, onEdit }) {
  const qc   = useQueryClient()
  const [open, setOpen] = useState(false)

  const statusMutation = useMutation({
    mutationFn: (s) => alterationsAPI.updateStatus(job.id, s),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['alterations'] }) },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  })

  const measurements = (() => { try { return JSON.parse(job.measurements || '{}') } catch { return {} } })()
  const hasMeasures  = Object.values(measurements).some(v => v)
  const balance      = parseFloat(job.balance || 0)
  const curIdx       = STATUS_FLOW.indexOf(job.status)

  return (
    <>
      <div onClick={() => setOpen(v => !v)} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 90px 90px 32px', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', cursor: 'pointer' }}>
        <div>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.80rem', color: '#E8C547' }}>{job.job_number}</span>
          {job.priority === 'urgent' && <span style={{ marginLeft: 6, fontSize: '0.60rem', fontWeight: 800, color: '#F87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 4, padding: '1px 5px' }}>URGENT</span>}
        </div>
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0A0C12', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.garment_desc}</div>
          <div style={{ fontSize: '0.71rem', color: 'rgba(0,0,0,0.50)', marginTop: 1 }}>{job.customer_name} {job.customer_phone ? `· ${job.customer_phone}` : ''}</div>
        </div>
        <StatusBadge status={job.status}/>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E8C547' }}>Rs. {parseFloat(job.charge).toFixed(2)}</span>
        <span style={{ fontSize: '0.82rem', color: balance > 0 ? '#F87171' : '#34D399', fontWeight: 700 }}>
          {balance > 0 ? `-Rs. ${balance.toFixed(2)}` : 'Paid'}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.45)' }}>
          {job.due_date ? format(new Date(job.due_date), 'dd MMM') : '—'}
        </span>
        {open ? <ChevronUp size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/> : <ChevronDown size={13} style={{ color: 'rgba(0,0,0,0.45)' }}/>}
      </div>

      {open && (
        <div style={{ padding: '12px 16px 16px 24px', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Status stepper */}
          {job.status !== 'cancelled' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {STATUS_FLOW.map((s, i) => {
                const done    = i <= curIdx
                const current = i === curIdx
                const next    = i === curIdx + 1
                const sLabel  = STATUSES.find(x => x.key === s)
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      disabled={!next || statusMutation.isPending}
                      onClick={() => next && statusMutation.mutate(s)}
                      style={{
                        padding: '4px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit',
                        background: done ? sLabel?.bg : 'rgba(255,255,255,0.04)',
                        color:      done ? sLabel?.color : '#2C3650',
                        border:     done ? `1px solid ${sLabel?.color}40` : '1px solid rgba(255,255,255,0.08)',
                        cursor:     next ? 'pointer' : 'default',
                        outline:    current ? `2px solid ${sLabel?.color}` : 'none',
                        outlineOffset: 2,
                      }}>
                      {sLabel?.label}
                    </button>
                    {i < STATUS_FLOW.length - 1 && <span style={{ color: 'rgba(0,0,0,0.24)', fontSize: '0.75rem' }}>›</span>}
                  </div>
                )
              })}
              <button onClick={() => { if (window.confirm('Cancel this job?')) statusMutation.mutate('cancelled') }}
                style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.70rem', fontWeight: 700, background: 'none', border: '1px solid rgba(248,113,113,0.20)', color: '#F87171', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 8 }}>
                Cancel
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: hasMeasures ? '1fr 1fr' : '1fr', gap: 14 }}>
            <div>
              {job.work_description && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)', marginBottom: 4 }}>Work</div>
                  <div style={{ fontSize: '0.80rem', color: 'rgba(0,0,0,0.70)', whiteSpace: 'pre-wrap' }}>{job.work_description}</div>
                </div>
              )}
              {job.notes && (
                <div style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', fontStyle: 'italic' }}>{job.notes}</div>
              )}
              {job.tailor_name && (
                <div style={{ fontSize: '0.74rem', color: 'rgba(0,0,0,0.50)', marginTop: 6 }}>Tailor: <strong style={{ color: '#0A0C12' }}>{job.tailor_name}</strong></div>
              )}
            </div>

            {hasMeasures && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)', marginBottom: 6 }}>Measurements</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {MEASUREMENTS_FIELDS.filter(f => measurements[f]).map(f => (
                    <div key={f} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', padding: '2px 0' }}>
                      <span style={{ color: 'rgba(0,0,0,0.50)' }}>{f}</span>
                      <span style={{ color: '#0A0C12', fontWeight: 600 }}>{measurements[f]}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button onClick={() => onEdit(job)}
              style={{ padding: '5px 14px', borderRadius: 8, background: 'rgba(232,197,71,0.10)', border: '1px solid rgba(232,197,71,0.25)', color: '#E8C547', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>
              Edit Job
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Alterations() {
  const [showModal, setShowModal] = useState(false)
  const [editJob,   setEditJob]   = useState(null)
  const [statusFilter, setStatus] = useState('')
  const [q, setQ]                 = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['alterations', statusFilter, q],
    queryFn:  () => alterationsAPI.getAll({ status: statusFilter || undefined, q: q || undefined, per_page: 60 }).then(r => r.data),
    staleTime: 20_000,
  })

  const jobs = data?.alterations || []

  const kpis = {
    received:    jobs.filter(j => j.status === 'received').length,
    in_progress: jobs.filter(j => j.status === 'in_progress').length,
    ready:       jobs.filter(j => j.status === 'ready').length,
    delivered:   jobs.filter(j => j.status === 'delivered').length,
    urgent:      jobs.filter(j => j.priority === 'urgent' && !['delivered','cancelled'].includes(j.status)).length,
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.5rem', color: '#0A0C12', margin: 0 }}>Alterations</h1>
          <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.80rem', margin: '4px 0 0' }}>Track garment alterations and repair jobs</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={15}/> New Job
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'Received',    value: kpis.received,    color: '#60A5FA' },
          { label: 'In Progress', value: kpis.in_progress, color: '#FBBF24' },
          { label: 'Ready',       value: kpis.ready,       color: '#34D399' },
          { label: 'Delivered',   value: kpis.delivered,   color: 'rgba(0,0,0,0.45)' },
          { label: 'Urgent',      value: kpis.urgent,      color: '#F87171' },
        ].map(k => (
          <div key={k.label} style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: k.color, fontFamily: 'Inter, system-ui, sans-serif' }}>{k.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(0,0,0,0.50)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input className="input-field" style={{ flex: 1, minWidth: 180 }} placeholder="Search job, customer, garment…"
          value={q} onChange={e => setQ(e.target.value)} />
        {[{ k: '', l: 'All' }, ...STATUSES.map(s => ({ k: s.key, l: s.label }))].map(s => (
          <button key={s.k} onClick={() => setStatus(s.k)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: statusFilter === s.k ? 'rgba(232,197,71,0.15)' : 'rgba(255,255,255,0.04)',
              color:      statusFilter === s.k ? '#E8C547' : '#2C3650',
              border:     statusFilter === s.k ? '1px solid rgba(232,197,71,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
            {s.l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 90px 90px 32px', gap: 8, padding: '10px 16px', background: 'rgba(0,0,0,0.04)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.42)' }}>
          <span>Job #</span><span>Garment / Customer</span><span>Status</span><span>Charge</span><span>Balance</span><span>Due</span><span/>
        </div>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(0,0,0,0.42)' }}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(0,0,0,0.38)' }}>
            <Scissors size={36} style={{ opacity: 0.3, marginBottom: 12 }}/>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>No alteration jobs yet</p>
          </div>
        ) : jobs.map(j => <JobRow key={j.id} job={j} onEdit={setEditJob}/>)}
      </div>

      <AnimatePresence>
        {(showModal || editJob) && (
          <AlterationModal job={editJob} onClose={() => { setShowModal(false); setEditJob(null) }}/>
        )}
      </AnimatePresence>
    </div>
  )
}
