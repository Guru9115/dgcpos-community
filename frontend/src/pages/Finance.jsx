import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { financeAPI } from '../api'
import toast from 'react-hot-toast'
import { Plus, X, Check, Trash2, Search } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'

function ExpenseModal({ expense, onClose, onSaved }) {
  const editing = !!expense?.id
  const [form, setForm] = useState({title:'',category:'',amount:'',payment_method:'cash',description:'',expense_date:format(new Date(),'yyyy-MM-dd'),...(expense||{})})
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const submit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await financeAPI.updateExpense(expense.id, form)
      else await financeAPI.createExpense(form)
      toast.success(editing?'Updated':'Expense added'); onSaved()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }
  const cats = ['Rent','Utilities','Salaries','Marketing','Packaging','Maintenance','Transport','Miscellaneous']
  return (
    <div className="modal-overlay">
      <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} className="modal-panel mx-4 max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold text-txt">{editing?'Edit Expense':'Add Expense'}</h3>
          <button onClick={onClose} className="text-txt-3 hover:text-txt"><X size={16}/></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="input-label">Title *</label><input className="input-field" value={form.title} onChange={e=>set('title',e.target.value)} required/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">Category</label>
              <select className="input-field" value={form.category||''} onChange={e=>set('category',e.target.value)}>
                <option value="">Select</option>{cats.map(c=><option key={c}>{c}</option>)}
              </select></div>
            <div><label className="input-label">Amount (Rs.) *</label><input type="number" className="input-field" value={form.amount} onChange={e=>set('amount',e.target.value)} required step="0.01"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">Payment Method</label>
              <select className="input-field" value={form.payment_method} onChange={e=>set('payment_method',e.target.value)}>
                <option value="cash">Cash</option><option value="bank">Bank</option><option value="card">Card</option>
              </select></div>
            <div><label className="input-label">Date</label><input type="date" className="input-field" value={form.expense_date} onChange={e=>set('expense_date',e.target.value)}/></div>
          </div>
          <div><label className="input-label">Description</label><textarea className="input-field h-16 resize-none" value={form.description||''} onChange={e=>set('description',e.target.value)}/></div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2">
              {saving?<div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/>:<Check size={14}/>}
              {editing?'Update':'Add'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default function Finance() {
  const now = new Date()
  const defaultFrom = format(startOfMonth(now), 'yyyy-MM-dd')
  const defaultTo = format(endOfMonth(now), 'yyyy-MM-dd')

  const [expenses, setExpenses] = useState([])
  const [summary, setSummary] = useState(null)
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)

  const loadSummary = async (from, to) => {
    try {
      const s = await financeAPI.getSummary({ date_from: from, date_to: to })
      setSummary(s.data)
    } catch { toast.error('Failed to load summary') }
  }

  const load = async () => {
    setLoading(true)
    try {
      const [e] = await Promise.all([financeAPI.getExpenses()])
      setExpenses(e.data)
      await loadSummary(dateFrom, dateTo)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleApply = async () => {
    if (!dateFrom || !dateTo) { toast.error('Please select both dates'); return }
    if (dateFrom > dateTo) { toast.error('From date must be before To date'); return }
    await loadSummary(dateFrom, dateTo)
  }

  const handleDelete = async (e) => {
    if (!confirm(`Delete "${e.title}"?`)) return
    try { await financeAPI.deleteExpense(e.id); toast.success('Deleted'); load() } catch { toast.error('Failed') }
  }
  const cur = v => `Rs. ${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2})}`
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="section-title">Finance</h2></div>
        <button onClick={()=>setModal({})} className="btn-gold flex items-center gap-2"><Plus size={14}/> Add Expense</button>
      </div>

      {/* Date Range Filter */}
      <div className="glass-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="input-label">From</label>
          <input
            type="date"
            className="input-field"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="input-label">To</label>
          <input
            type="date"
            className="input-field"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>
        <button onClick={handleApply} className="btn-gold flex items-center gap-2">
          <Search size={14}/> Apply
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="kpi-card"><div className="text-txt-3 text-xs uppercase tracking-widest mb-2">Revenue</div><div className="font-display text-2xl font-bold text-success">{cur(summary.monthly_revenue)}</div></div>
          <div className="kpi-card"><div className="text-txt-3 text-xs uppercase tracking-widest mb-2">Expenses</div><div className="font-display text-2xl font-bold text-red-400">{cur(summary.monthly_expenses)}</div></div>
          <div className="kpi-card"><div className="text-txt-3 text-xs uppercase tracking-widest mb-2">Net Profit</div><div className={`font-display text-2xl font-bold ${summary.net_profit>=0?'text-gold':'text-red-400'}`}>{cur(summary.net_profit)}</div></div>
        </div>
      )}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-glass-border flex items-center justify-between">
          <span className="text-txt font-semibold text-sm">Expense Records</span>
          <span className="text-txt-3 text-xs">{expenses.length} records</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead><tr>
            <th className="table-header">Title</th><th className="table-header">Category</th>
            <th className="table-header text-right">Amount</th><th className="table-header">Payment</th>
            <th className="table-header">Date</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {loading ? [...Array(4)].map((_,i)=>(<tr key={i}><td colSpan={6} className="table-cell"><div className="h-4 bg-white/[0.04] rounded animate-pulse"/></td></tr>))
            : expenses.length === 0 ? <tr><td colSpan={6} className="table-cell text-center py-10 text-txt-3">No expenses recorded</td></tr>
            : expenses.map(e => (
              <tr key={e.id} className="table-row">
                <td className="table-cell text-txt text-sm font-medium">{e.title}</td>
                <td className="table-cell"><span className="badge-gray text-[10px]">{e.category||'—'}</span></td>
                <td className="table-cell text-right font-semibold text-red-400">{cur(e.amount)}</td>
                <td className="table-cell text-txt-2 text-xs capitalize">{e.payment_method}</td>
                <td className="table-cell text-txt-3 text-xs">{e.expense_date}</td>
                <td className="table-cell">
                  <button onClick={()=>handleDelete(e)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-txt-3 hover:text-red-400 transition-colors"><Trash2 size={13}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <AnimatePresence>{modal !== null && <ExpenseModal expense={modal} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load()}}/>}</AnimatePresence>
    </div>
  )
}