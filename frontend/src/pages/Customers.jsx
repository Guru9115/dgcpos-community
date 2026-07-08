import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { customersAPI } from '../api'
import { useDebounce } from '../hooks/useDebounce'
import toast from 'react-hot-toast'
import {
  Plus, Search, Edit2, Trash2, Star, X, Check, Phone, Mail,
  Award, Gift, TrendingUp, Users, ChevronRight, History,
  PlusCircle, MinusCircle, CreditCard, Crown, ChevronLeft
} from 'lucide-react'

const TIER_STYLES = {
  bronze:   { label: 'Bronze',   color: '#cd7f32', bg: 'bg-amber-900/20',   border: 'border-amber-700/40',  text: 'text-amber-600',  icon: '🥉' },
  silver:   { label: 'Silver',   color: '#C0C0C0', bg: 'bg-slate-400/10',   border: 'border-slate-400/30',  text: 'text-slate-300',  icon: '🥈' },
  gold:     { label: 'Gold',     color: '#0B5FFF', bg: 'bg-gold/10',        border: 'border-gold/30',       text: 'text-gold',       icon: '🥇' },
  platinum: { label: 'Platinum', color: '#E5E4E2', bg: 'bg-purple-400/10',  border: 'border-purple-400/30', text: 'text-purple-300', icon: '💎' },
}

function TierBadge({ tier, size = 'sm' }) {
  const s = TIER_STYLES[tier] || TIER_STYLES.bronze
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border font-bold uppercase tracking-wider ${s.bg} ${s.border} ${s.text} ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>
      {s.icon} {s.label}
    </span>
  )
}

function MemberCard({ customer, onEdit, onAdjust, onHistory }) {
  const s = TIER_STYLES[customer.membership_tier] || TIER_STYLES.bronze
  const progress = customer.next_tier_min
    ? Math.min(100, ((customer.total_spent / customer.next_tier_min) * 100))
    : 100
  const cur = v => `Rs. ${Number(v || 0).toLocaleString('en-IN')}`

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`glass-card overflow-hidden border ${s.border} hover:shadow-lg transition-all`}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${s.color}88, ${s.color})` }}/>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold border"
              style={{ background: `${s.color}22`, borderColor: `${s.color}44` }}>
              {customer.name[0].toUpperCase()}
            </div>
            <div>
              <div className="text-txt font-semibold text-sm flex items-center gap-2">
                {customer.name}
                {customer.is_vip && <Crown size={12} className="text-gold fill-gold"/>}
              </div>
              <div className="text-txt-3 text-xs">{customer.phone || customer.email || '—'}</div>
            </div>
          </div>
          <TierBadge tier={customer.membership_tier}/>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 bg-white/[0.03] rounded-xl border border-glass-border">
            <div className="text-gold font-bold text-sm font-display">{Number(customer.loyalty_points).toLocaleString()}</div>
            <div className="text-txt-3 text-[9px] uppercase tracking-wider mt-0.5">Points</div>
          </div>
          <div className="text-center p-2 bg-white/[0.03] rounded-xl border border-glass-border">
            <div className="text-txt font-bold text-xs">{cur(customer.total_spent)}</div>
            <div className="text-txt-3 text-[9px] uppercase tracking-wider mt-0.5">Spent</div>
          </div>
          <div className="text-center p-2 bg-white/[0.03] rounded-xl border border-glass-border">
            <div className="text-txt font-bold text-sm">{customer.visit_count}</div>
            <div className="text-txt-3 text-[9px] uppercase tracking-wider mt-0.5">Visits</div>
          </div>
        </div>

        {customer.next_tier && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-txt-3 mb-1">
              <span>Progress to {TIER_STYLES[customer.next_tier]?.label}</span>
              <span>{cur(customer.next_tier_gap)} more</span>
            </div>
            <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${s.color}88, ${s.color})` }}/>
            </div>
          </div>
        )}
        {!customer.next_tier && (
          <div className="mb-3 text-center text-[10px] text-purple-300 font-semibold">
            💎 Maximum tier reached!
          </div>
        )}

        {customer.tier_info && customer.tier_info.discount_pct > 0 && (
          <div className="mb-3 px-2 py-1.5 bg-white/[0.02] border border-glass-border rounded-lg flex items-center gap-2">
            <Gift size={10} className={s.text}/>
            <span className="text-xs text-txt-2">{customer.tier_info.discount_pct}% member discount · {customer.tier_info.points_multiplier}x points</span>
          </div>
        )}

        <div className="flex gap-1.5">
          <button onClick={() => onEdit(customer)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold btn-ghost">
            <Edit2 size={10}/> Edit
          </button>
          <button onClick={() => onAdjust(customer)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold bg-gold/10 border border-gold/20 text-gold hover:bg-gold/20 transition-all">
            <Award size={10}/> Points
          </button>
          <button onClick={() => onHistory(customer)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold btn-ghost">
            <History size={10}/> History
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function CustomerModal({ customer, onClose, onSaved }) {
  const editing = !!customer?.id
  const [form, setForm] = useState({ name:'', phone:'', email:'', address:'', notes:'', membership_tier:'bronze', ...(customer||{}) })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f => ({...f, [k]:v}))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) await customersAPI.update(customer.id, form)
      else await customersAPI.create(form)
      toast.success(editing ? 'Customer updated' : 'Customer added')
      onSaved()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} className="modal-panel mx-4 max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold text-txt">{editing ? 'Edit Customer' : 'Add Customer'}</h3>
          <button onClick={onClose} className="text-txt-3 hover:text-txt p-2 rounded-xl hover:bg-glass transition-colors"><X size={16}/></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="input-label">Full Name *</label>
            <input className="input-field" value={form.name} onChange={e=>set('name',e.target.value)} required/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">Phone</label>
              <input className="input-field" value={form.phone||''} onChange={e=>set('phone',e.target.value)} inputMode="tel"/></div>
            <div><label className="input-label">Email</label>
              <input type="email" className="input-field" value={form.email||''} onChange={e=>set('email',e.target.value)}/></div>
          </div>
          <div><label className="input-label">Address</label>
            <textarea className="input-field h-16 resize-none" value={form.address||''} onChange={e=>set('address',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Membership Tier</label>
              <select className="input-field" value={form.membership_tier||'bronze'} onChange={e=>set('membership_tier',e.target.value)}>
                {Object.entries(TIER_STYLES).map(([k,v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div><label className="input-label">Notes</label>
              <input className="input-field" value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/> : <Check size={14}/>}
              {editing ? 'Update' : 'Add Member'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function AdjustPointsModal({ customer, onClose, onSaved }) {
  const [pts, setPts] = useState('')
  const [note, setNote] = useState('')
  const [type, setType] = useState('add')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!pts || parseInt(pts) <= 0) { toast.error('Enter valid points'); return }
    setSaving(true)
    try {
      const amount = type === 'add' ? parseInt(pts) : -parseInt(pts)
      await customersAPI.adjustPoints(customer.id, { points: amount, note: note || (type === 'add' ? 'Points added by admin' : 'Points deducted by admin') })
      toast.success(`${type === 'add' ? 'Added' : 'Deducted'} ${pts} points`)
      onSaved()
    } catch (err) { toast.error(err.response?.data?.error || 'Failed') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{opacity:0,scale:0.96,y:16}} animate={{opacity:1,scale:1,y:0}} className="modal-panel mx-4 max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-txt">Adjust Points</h3>
            <p className="text-txt-3 text-xs mt-0.5">{customer.name} · Current: <span className="text-gold font-bold">{customer.loyalty_points} pts</span></p>
          </div>
          <button onClick={onClose} className="text-txt-3 hover:text-txt p-2 rounded-xl hover:bg-glass transition-colors"><X size={15}/></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType('add')}
              className={`py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${type==='add' ? 'bg-green-500/15 border-green-500/40 text-green-400' : 'btn-ghost'}`}>
              <PlusCircle size={13}/> Add Points
            </button>
            <button type="button" onClick={() => setType('deduct')}
              className={`py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${type==='deduct' ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'btn-ghost'}`}>
              <MinusCircle size={13}/> Deduct Points
            </button>
          </div>
          <div>
            <label className="input-label">Points Amount</label>
            <input type="number" className="input-field text-xl font-bold text-center" value={pts}
              onChange={e => setPts(e.target.value)} placeholder="0" min="1" autoFocus/>
          </div>
          <div>
            <label className="input-label">Reason / Note</label>
            <input className="input-field" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Birthday bonus, correction…"/>
          </div>
          {pts && (
            <div className={`p-3 rounded-xl border text-center text-sm font-semibold ${type==='add' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              New balance: {Math.max(0, customer.loyalty_points + (type === 'add' ? parseInt(pts||0) : -parseInt(pts||0)))} pts
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl font-semibold text-sm transition-all ${type==='add' ? 'bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25' : 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25'}`}>
              {saving ? <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin"/> : <Award size={14}/>}
              Confirm
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function PointHistoryModal({ customer, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    customersAPI.getPointHistory(customer.id)
      .then(r => setHistory(r.data))
      .finally(() => setLoading(false))
  }, [customer.id])

  const typeStyle = (t) => ({
    earned:   'text-green-400 bg-green-500/10 border-green-500/20',
    redeemed: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    adjusted: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    expired:  'text-red-400 bg-red-500/10 border-red-500/20',
  }[t] || 'text-txt-3 bg-glass border-glass-border')

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{opacity:0,scale:0.96,y:16}} animate={{opacity:1,scale:1,y:0}} className="modal-panel mx-4 max-w-md w-full p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h3 className="font-display text-lg font-semibold text-txt">Points History</h3>
            <p className="text-txt-3 text-xs mt-0.5">{customer.name} · <span className="text-gold font-bold">{customer.loyalty_points} pts</span> current balance</p>
          </div>
          <button onClick={onClose} className="text-txt-3 hover:text-txt p-2 rounded-xl hover:bg-glass transition-colors"><X size={15}/></button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {loading ? (
            [...Array(4)].map((_,i) => <div key={i} className="h-12 bg-white/[0.03] rounded-xl animate-pulse"/>)
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-txt-3 text-sm">No points transactions yet</div>
          ) : history.map(txn => (
            <div key={txn.id} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-glass-border rounded-xl">
              <div className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase flex-shrink-0 ${typeStyle(txn.txn_type)}`}>
                {txn.txn_type}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-txt-2 text-xs truncate">{txn.note || txn.reference || '—'}</div>
                <div className="text-txt-3 text-[10px]">{txn.created_at ? new Date(txn.created_at).toLocaleString() : ''}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-sm font-bold ${txn.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {txn.points > 0 ? '+' : ''}{txn.points}
                </div>
                <div className="text-txt-3 text-[10px]">bal: {txn.balance}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

export default function Customers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [adjustModal, setAdjustModal] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [viewMode, setViewMode] = useState('cards')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)

  // Reset page when search/filter changes
  useEffect(() => { setPage(1) }, [debouncedSearch, tierFilter])

  const { data: custData, isLoading: loading, refetch } = useQuery({
    queryKey: ['customers', debouncedSearch, tierFilter, page],
    queryFn: async () => {
      const params = { q: debouncedSearch, page }
      if (tierFilter) params.tier = tierFilter
      const [res, st] = await Promise.all([
        customersAPI.getAll(params),
        customersAPI.getMemberStats(),
      ])
      const data = res.data
      return {
        customers: data.customers ?? data,
        totalPages: data.pages ?? 1,
        total: data.total ?? (data.customers ?? data).length,
        stats: st.data,
      }
    },
    keepPreviousData: true,
  })

  const customers  = custData?.customers  ?? []
  const totalPages = custData?.totalPages ?? 1
  const total      = custData?.total      ?? 0
  const stats      = custData?.stats      ?? null

  const invalidate = () => qc.invalidateQueries({ queryKey: ['customers'] })

  const handleDelete = async (c) => {
    if (!confirm(`Delete ${c.name}?`)) return
    try { await customersAPI.delete(c.id); toast.success('Deleted'); invalidate() } catch { toast.error('Failed') }
  }

  const cur = v => `Rs. ${Number(v||0).toLocaleString('en-IN')}`

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Members</h2>
          <p className="section-subtitle">{total || customers.length} members · {stats?.total_points_outstanding?.toLocaleString() || 0} points outstanding</p>
        </div>
        <button onClick={() => setModal({})} className="btn-gold flex items-center gap-2"><Plus size={14}/> Add Member</button>
      </div>

      {/* Membership tier summary cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(TIER_STYLES).map(([tier, s]) => (
            <button key={tier} onClick={() => setTierFilter(tierFilter === tier ? '' : tier)}
              className={`glass-card p-3 text-left border transition-all hover:border-opacity-60 ${tierFilter === tier ? s.border + ' ' + s.bg : 'border-glass-border hover:border-white/20'}`}>
              <div className="text-lg mb-1">{s.icon}</div>
              <div className={`text-xl font-bold font-display ${s.text}`}>{stats.tier_counts?.[tier] || 0}</div>
              <div className="text-txt-3 text-xs mt-0.5">{s.label} Members</div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-3"/>
          <input className="input-field pl-9" placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {tierFilter && (
          <button onClick={() => setTierFilter('')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-glass border border-glass-border text-xs text-txt-2 hover:text-txt transition-colors">
            <X size={11}/> Clear filter
          </button>
        )}
        <div className="flex border border-glass-border rounded-xl overflow-hidden">
          <button onClick={() => setViewMode('cards')} className={`px-3 py-2 text-xs font-semibold transition-all ${viewMode==='cards' ? 'bg-gold/15 text-gold' : 'text-txt-3 hover:text-txt'}`}>Cards</button>
          <button onClick={() => setViewMode('table')} className={`px-3 py-2 text-xs font-semibold transition-all ${viewMode==='table' ? 'bg-gold/15 text-gold' : 'text-txt-3 hover:text-txt'}`}>Table</button>
        </div>
      </div>

      {/* Cards view */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? [...Array(6)].map((_,i) => <div key={i} className="h-48 glass-card animate-pulse rounded-2xl"/>)
          : customers.length === 0 ? (
            <div className="col-span-full text-center py-16 text-txt-3">
              <Users size={32} className="mx-auto mb-3 opacity-30"/>
              <p>No members found</p>
            </div>
          ) : customers.map(c => (
            <MemberCard key={c.id} customer={c}
              onEdit={setModal}
              onAdjust={setAdjustModal}
              onHistory={setHistoryModal}
            />
          ))}
        </div>
      )}

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead><tr>
                <th className="table-header">Member</th>
                <th className="table-header">Tier</th>
                <th className="table-header text-right">Total Spent</th>
                <th className="table-header text-center">Visits</th>
                <th className="table-header text-center">Points</th>
                <th className="table-header"></th>
              </tr></thead>
              <tbody>
                {loading ? [...Array(4)].map((_,i) => (
                  <tr key={i}><td colSpan={6} className="table-cell"><div className="h-4 bg-white/[0.04] rounded animate-pulse"/></td></tr>
                )) : customers.length === 0 ? (
                  <tr><td colSpan={6} className="table-cell text-center py-10 text-txt-3">No members found</td></tr>
                ) : customers.map(c => (
                  <motion.tr key={c.id} initial={{opacity:0}} animate={{opacity:1}} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold text-xs font-bold flex-shrink-0">{c.name[0]}</div>
                        <div>
                          <div className="text-txt text-sm font-medium flex items-center gap-1">
                            {c.name}
                            {c.is_vip && <Crown size={10} className="text-gold fill-gold"/>}
                          </div>
                          <div className="text-txt-3 text-xs">{c.phone || c.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell"><TierBadge tier={c.membership_tier}/></td>
                    <td className="table-cell text-right font-semibold text-gold text-sm">{cur(c.total_spent)}</td>
                    <td className="table-cell text-center text-txt-2 text-xs">{c.visit_count}</td>
                    <td className="table-cell text-center">
                      <span className="px-2 py-0.5 rounded-lg bg-gold/10 border border-gold/20 text-gold text-[10px] font-bold">
                        {Number(c.loyalty_points).toLocaleString()} pts
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setAdjustModal(c)} className="p-1.5 rounded-lg hover:bg-glass text-txt-3 hover:text-gold transition-colors" title="Adjust Points"><Award size={12}/></button>
                        <button onClick={() => setHistoryModal(c)} className="p-1.5 rounded-lg hover:bg-glass text-txt-3 hover:text-blue-400 transition-colors" title="Points History"><History size={12}/></button>
                        <button onClick={() => setModal(c)} className="p-1.5 rounded-lg hover:bg-glass text-txt-3 hover:text-gold transition-colors" title="Edit"><Edit2 size={12}/></button>
                        <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-txt-3 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={12}/></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-glass-border bg-white/[0.03] text-xs font-semibold text-txt-2 hover:text-txt hover:bg-white/[0.06] hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all backdrop-blur-sm"
          >
            <ChevronLeft size={13}/> Previous
          </button>

          <div className="flex items-center gap-2 px-5 py-2 rounded-xl border border-gold/20 bg-gold/[0.06] backdrop-blur-sm">
            <span className="text-gold font-bold font-display text-sm">{page}</span>
            <span className="text-txt-3 text-xs">of</span>
            <span className="text-txt-2 font-semibold text-sm">{totalPages}</span>
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-glass-border bg-white/[0.03] text-xs font-semibold text-txt-2 hover:text-txt hover:bg-white/[0.06] hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all backdrop-blur-sm"
          >
            Next <ChevronRight size={13}/>
          </button>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {modal !== null && (
          <CustomerModal customer={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); invalidate() }}/>
        )}
        {adjustModal && (
          <AdjustPointsModal customer={adjustModal} onClose={() => setAdjustModal(null)} onSaved={() => { setAdjustModal(null); invalidate() }}/>
        )}
        {historyModal && (
          <PointHistoryModal customer={historyModal} onClose={() => setHistoryModal(null)}/>
        )}
      </AnimatePresence>
    </div>
  )
}