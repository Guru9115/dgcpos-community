/**
 * DSR — Daily Sales Register (Scientific Workspace)
 * Frosted glass UI · side analytics panel · P&L science
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, TrendingUp, TrendingDown, ShoppingBag,
  BarChart3, DollarSign, Building2, Users, X, ChevronDown,
  CalendarDays, RefreshCw, AlertCircle, CheckCircle2,
  PanelRight, Download, ChevronLeft, ChevronRight, FlaskConical,
  Target, Activity, PieChart, FileSpreadsheet, Lightbulb
} from 'lucide-react'
import { dsrAPI } from '../api'
import toast from 'react-hot-toast'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import '../theme/dsr.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const FIXED_COST_CATS = [
  { value: 'rent', label: 'Room Rent', icon: Building2, color: '#D97706' },
  { value: 'salary', label: 'Staff Salary', icon: Users, color: '#7C3AED' },
  { value: 'utility', label: 'Utility / Bills', icon: DollarSign, color: '#0891B2' },
  { value: 'other', label: 'Other', icon: BarChart3, color: '#64748B' },
]

const PAYMENT_METHODS = ['cash', 'card', 'online', 'other']
const PAY_COLORS = { cash: '#059669', card: '#0B5FFF', online: '#7C3AED', other: '#64748B' }

const fmt = (n) => `रू ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
const pct = (v, total) => total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

const SALE_FIELDS = ['cash_sales', 'card_sales', 'online_sales', 'other_sales']

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalizePurchasePayload(form) {
  const amount = toNum(form.amount)
  if (amount <= 0) return { error: 'Enter purchase amount' }
  return {
    payload: {
      purchase_date: form.purchase_date,
      supplier_name: (form.supplier_name || '').trim(),
      category: (form.category || '').trim(),
      amount,
      payment_method: (form.payment_method || 'cash').toLowerCase(),
      invoice_ref: (form.invoice_ref || '').trim(),
      notes: (form.notes || '').trim(),
    },
  }
}

function normalizeFixedCostPayload(form) {
  const amount = toNum(form.amount)
  const name = (form.name || '').trim()
  if (!name) return { error: 'Description is required' }
  if (amount <= 0) return { error: 'Enter amount' }
  return {
    payload: {
      month: Number(form.month),
      year: Number(form.year),
      name,
      category: form.category || 'other',
      amount,
      notes: (form.notes || '').trim(),
    },
  }
}

function normalizeSalePayload(form) {
  const payload = {
    entry_date: form.entry_date,
    notes: (form.notes || '').trim(),
  }
  SALE_FIELDS.forEach(k => { payload[k] = toNum(form[k]) })
  const total = SALE_FIELDS.reduce((s, k) => s + payload[k], 0)
  if (total <= 0) return { error: 'Enter at least one sales amount (cash, card, online, or other)' }
  return { payload }
}

function apiErrorMessage(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback
}

const chartTooltip = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  titleColor: '#071B52',
  bodyColor: '#475569',
  borderColor: 'rgba(7,27,82,0.10)',
  borderWidth: 1,
  padding: 12,
}

const chartAxis = {
  grid: { color: 'rgba(7,27,82,0.08)' },
  ticks: { color: '#64748B', font: { size: 10, family: 'Inter, system-ui, sans-serif' } },
  border: { display: false },
}

function computeInsights(pl, sales, month, year) {
  const daily = pl?.daily || []
  const daysInMonth = new Date(year, month, 0).getDate()
  const revenue = pl?.revenue || 0
  const avgDaily = daily.length ? revenue / daily.length : 0
  const bestDay = daily.reduce((b, d) => (!b || d.sales > b.sales) ? d : b, null)
  const bestProfitDay = daily.reduce((b, d) => (!b || d.profit > b.profit) ? d : b, null)
  const worstProfitDay = daily.reduce((w, d) => (!w || d.profit < w.profit) ? d : w, null)
  const coverage = daysInMonth ? ((daily.length / daysInMonth) * 100) : 0
  const expenseRatio = revenue > 0 ? ((pl?.total_expenses || 0) / revenue) * 100 : 0
  const cogsRatio = revenue > 0 ? ((pl?.cogs || 0) / revenue) * 100 : 0
  const posVariance = pl?.total_dsr_sales > 0 && pl?.pos_sales > 0
    ? ((pl.total_dsr_sales - pl.pos_sales) / pl.pos_sales) * 100 : null
  const breakEvenDaily = daysInMonth > daily.length
    ? Math.max(0, (pl?.total_expenses || 0) - (pl?.gross_profit || 0)) / Math.max(1, daysInMonth - daily.length)
    : 0

  let health = 45
  if ((pl?.net_margin || 0) > 15) health += 28
  else if ((pl?.net_margin || 0) > 5) health += 16
  else if ((pl?.net_margin || 0) < 0) health -= 28
  health += Math.min(22, daily.length * 1.8)
  if (coverage >= 80) health += 10
  health = Math.max(0, Math.min(100, Math.round(health)))

  const payMix = {
    cash: sales.reduce((s, r) => s + Number(r.cash_sales || 0), 0),
    card: sales.reduce((s, r) => s + Number(r.card_sales || 0), 0),
    online: sales.reduce((s, r) => s + Number(r.online_sales || 0), 0),
    other: sales.reduce((s, r) => s + Number(r.other_sales || 0), 0),
  }

  return {
    avgDaily, bestDay, bestProfitDay, worstProfitDay, coverage, expenseRatio, cogsRatio,
    posVariance, breakEvenDaily, health, daysInMonth, payMix,
  }
}

function exportDSRCsv({ tab, sales, purchases, fixedCosts, pl, month, year }) {
  const label = `${MONTHS[month - 1]}_${year}`
  let rows = []
  if (tab === 'sales') {
    rows = [['Date', 'Cash', 'Card', 'Online', 'Other', 'Total', 'Notes'],
      ...sales.map(r => [r.entry_date, r.cash_sales, r.card_sales, r.online_sales, r.other_sales, r.total_sales, r.notes || ''])]
  } else if (tab === 'purchases') {
    rows = [['Date', 'Supplier', 'Category', 'Amount', 'Payment', 'Invoice'],
      ...purchases.map(r => [r.purchase_date, r.supplier_name, r.category, r.amount, r.payment_method, r.invoice_ref || ''])]
  } else if (tab === 'fixed') {
    rows = [['Name', 'Category', 'Amount', 'Notes'],
      ...fixedCosts.map(r => [r.name, r.category, r.amount, r.notes || ''])]
  } else {
    rows = [
      ['Metric', 'Value'],
      ['Revenue', pl?.revenue], ['COGS', pl?.cogs], ['Gross Profit', pl?.gross_profit],
      ['Gross Margin %', pl?.gross_margin], ['Total Expenses', pl?.total_expenses],
      ['Net Profit', pl?.net_profit], ['Net Margin %', pl?.net_margin],
    ]
  }
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dsr_${tab}_${label}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('DSR exported')
}

// ── Modals ────────────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, footer, accent = '#0B5FFF' }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(7,27,82,0.18)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 12 }}
        className="dgc-dsr-glass-strong w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div style={{ width: 4, height: 28, borderRadius: 4, background: accent }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#071B52', margin: 0 }}>{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="dgc-dsr-btn" style={{ padding: 8 }}><X size={18} /></button>
        </div>
        {children}
        {footer}
      </motion.div>
    </div>
  )
}

function AddSaleModal({ onClose, onSaved, month, year }) {
  const today = new Date()
  const [form, setForm] = useState({
    entry_date: `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    cash_sales: '', card_sales: '', online_sales: '', other_sales: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const total = ['cash_sales', 'card_sales', 'online_sales', 'other_sales'].reduce((s, k) => s + Number(form[k] || 0), 0)

  const save = async () => {
    const { payload, error } = normalizeSalePayload(form)
    if (error) {
      toast.error(error)
      return
    }
    setSaving(true)
    try {
      await dsrAPI.addSale(payload)
      toast.success('Daily sales entry saved')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save entry'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Add Daily Sales" onClose={onClose} accent="#0B5FFF"
      footer={
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="dgc-dsr-btn flex-1">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="dgc-dsr-btn dgc-dsr-btn-primary flex-1">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Save Entry
          </button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>Date</label>
          <input type="date" className="dgc-dsr-input" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['cash_sales', 'Cash'], ['card_sales', 'Card'], ['online_sales', 'Online'], ['other_sales', 'Other']].map(([key, lbl]) => (
            <div key={key}>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>{lbl}</label>
              <input type="number" min="0" placeholder="0" className="dgc-dsr-input dgc-dsr-mono" value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="dgc-dsr-metric flex justify-between items-center" style={{ background: 'rgba(11,95,255,0.06)', borderColor: 'rgba(11,95,255,0.18)' }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>Day Total</span>
          <span className="dgc-dsr-mono text-lg font-black" style={{ color: '#0B5FFF' }}>{fmt(total)}</span>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Notes</label>
          <input type="text" placeholder="Optional remarks…" className="dgc-dsr-input" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
    </ModalShell>
  )
}

function AddPurchaseModal({ onClose, onSaved, month, year }) {
  const today = new Date()
  const [form, setForm] = useState({
    purchase_date: `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    supplier_name: '', category: '', amount: '', payment_method: 'cash', invoice_ref: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const { payload, error } = normalizePurchasePayload(form)
    if (error) { toast.error(error); return }
    setSaving(true)
    try {
      await dsrAPI.addPurchase(payload)
      toast.success('Purchase recorded')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save purchase'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Wholesale Purchase" onClose={onClose} accent="#D97706"
      footer={
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="dgc-dsr-btn flex-1">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="dgc-dsr-btn flex-1" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)', color: '#fff', border: 'none' }}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Save Purchase
          </button>
        </div>
      }>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Date</label>
            <input type="date" className="dgc-dsr-input" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Amount (NPR) *</label>
            <input type="number" min="0" className="dgc-dsr-input dgc-dsr-mono" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Supplier</label>
          <input type="text" className="dgc-dsr-input" placeholder="e.g. Pooja Traders" value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Category</label>
            <input type="text" className="dgc-dsr-input" placeholder="Saree, Dress…" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Payment</label>
            <select className="dgc-dsr-input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Invoice Ref</label>
          <input type="text" className="dgc-dsr-input" value={form.invoice_ref} onChange={e => setForm(f => ({ ...f, invoice_ref: e.target.value }))} />
        </div>
      </div>
    </ModalShell>
  )
}

function AddFixedCostModal({ onClose, onSaved, month, year }) {
  const [form, setForm] = useState({ name: '', category: 'rent', amount: '', notes: '', month, year })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const { payload, error } = normalizeFixedCostPayload(form)
    if (error) { toast.error(error); return }
    setSaving(true)
    try {
      await dsrAPI.addFixedCost(payload)
      toast.success('Fixed cost added')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to add cost'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Fixed Monthly Cost" onClose={onClose} accent="#7C3AED"
      footer={
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="dgc-dsr-btn flex-1">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="dgc-dsr-btn flex-1" style={{ background: 'linear-gradient(135deg,#6D28D9,#7C3AED)', color: '#fff', border: 'none' }}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Cost
          </button>
        </div>
      }>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {FIXED_COST_CATS.map(c => (
            <button key={c.value} type="button" onClick={() => setForm(f => ({ ...f, category: c.value }))}
              className="dgc-dsr-btn text-xs justify-center"
              style={{
                borderColor: form.category === c.value ? c.color : undefined,
                background: form.category === c.value ? `${c.color}14` : undefined,
                color: form.category === c.value ? c.color : undefined,
              }}>
              <c.icon size={12} />{c.label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Description *</label>
          <input type="text" className="dgc-dsr-input" placeholder="Shop rent, staff salary…" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>Amount (NPR) *</label>
          <input type="number" min="0" className="dgc-dsr-input dgc-dsr-mono" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>
      </div>
    </ModalShell>
  )
}

// ── Side Panel ────────────────────────────────────────────────────────────────

function SidePanel({ insights, pl, month, year, onAction, onExport, onClose, mobile }) {
  const healthColor = insights.health >= 70 ? '#059669' : insights.health >= 45 ? '#D97706' : '#DC2626'
  const payTotal = Object.values(insights.payMix).reduce((a, b) => a + b, 0)
  const donutData = {
    labels: ['Cash', 'Card', 'Online', 'Other'],
    datasets: [{
      data: [insights.payMix.cash, insights.payMix.card, insights.payMix.online, insights.payMix.other],
      backgroundColor: ['#05966999', '#0B5FFF99', '#7C3AED99', '#64748B99'],
      borderColor: ['#059669', '#0B5FFF', '#7C3AED', '#64748B'],
      borderWidth: 2,
    }],
  }

  const content = (
    <div className={`dgc-dsr-glass-strong p-4 dgc-dsr-side ${mobile ? 'open' : ''}`} style={{ paddingBottom: mobile ? 'calc(16px + env(safe-area-inset-bottom))' : undefined }}>
      {mobile && (
        <div className="flex justify-between items-center mb-4">
          <span style={{ fontWeight: 800, color: '#071B52' }}>DSR Lab</span>
          <button type="button" onClick={onClose} className="dgc-dsr-btn" style={{ padding: 8 }}><X size={18} /></button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl" style={{ background: 'rgba(11,95,255,0.06)', border: '1px solid rgba(11,95,255,0.14)' }}>
        <div className="dgc-dsr-health-ring dgc-dsr-mono" style={{ borderColor: `${healthColor}44`, color: healthColor }}>
          {insights.health}
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>Business Health</div>
          <div className="text-sm font-semibold" style={{ color: '#071B52' }}>
            {insights.health >= 70 ? 'Strong month' : insights.health >= 45 ? 'Needs attention' : 'At risk'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Net margin {pl?.net_margin ?? 0}%</div>
        </div>
      </div>

      <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: '#64748B' }}>
        <Plus size={12} /> Quick Actions
      </div>
      <div className="grid grid-cols-1 gap-2 mb-4">
        {[
          { id: 'sale', label: 'Add Daily Sales', icon: CalendarDays, color: '#0B5FFF' },
          { id: 'purchase', label: 'Add Purchase', icon: ShoppingBag, color: '#D97706' },
          { id: 'fixedcost', label: 'Add Fixed Cost', icon: Building2, color: '#7C3AED' },
        ].map(a => (
          <button key={a.id} type="button" onClick={() => onAction(a.id)} className="dgc-dsr-btn justify-start"
            style={{ borderColor: `${a.color}28`, background: `${a.color}08`, color: '#071B52' }}>
            <a.icon size={15} style={{ color: a.color }} />{a.label}
          </button>
        ))}
        <button type="button" onClick={onExport} className="dgc-dsr-btn justify-start">
          <FileSpreadsheet size={15} /> Export Current Tab
        </button>
      </div>

      <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: '#64748B' }}>
        <FlaskConical size={12} /> Scientific Metrics
      </div>
      <div className="space-y-2 mb-4">
        {[
          { label: 'Avg Daily Sales', value: fmt(insights.avgDaily), icon: Activity },
          { label: 'Data Coverage', value: `${insights.coverage.toFixed(0)}% of month`, icon: Target },
          { label: 'COGS Ratio', value: `${insights.cogsRatio.toFixed(1)}% of revenue`, icon: TrendingDown },
          { label: 'OPEX Ratio', value: `${insights.expenseRatio.toFixed(1)}% of revenue`, icon: DollarSign },
          { label: 'Gross Margin', value: `${pl?.gross_margin ?? 0}%`, icon: BarChart3 },
        ].map(m => (
          <div key={m.label} className="dgc-dsr-metric flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <m.icon size={13} style={{ color: '#0B5FFF', flexShrink: 0 }} />
              <span className="text-xs font-semibold truncate" style={{ color: '#64748B' }}>{m.label}</span>
            </div>
            <span className="dgc-dsr-mono text-xs font-bold shrink-0" style={{ color: '#071B52' }}>{m.value}</span>
          </div>
        ))}
      </div>

      {insights.bestDay && (
        <div className="dgc-dsr-metric mb-2">
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>Peak Sales Day</div>
          <div className="text-sm font-semibold" style={{ color: '#071B52' }}>{fmtDate(insights.bestDay.date)}</div>
          <div className="dgc-dsr-mono text-sm font-bold" style={{ color: '#0B5FFF' }}>{fmt(insights.bestDay.sales)}</div>
        </div>
      )}

      {pl?.pos_sales > 0 && (
        <div className="dgc-dsr-metric mb-4">
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>POS Cross-check</div>
          <div className="text-xs" style={{ color: '#64748B' }}>POS system: <strong style={{ color: '#071B52' }}>{fmt(pl.pos_sales)}</strong></div>
          {insights.posVariance != null && (
            <div className="text-xs mt-1" style={{ color: insights.posVariance >= 0 ? '#059669' : '#DC2626' }}>
              DSR vs POS: {insights.posVariance >= 0 ? '+' : ''}{insights.posVariance.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      {payTotal > 0 && (
        <>
          <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: '#64748B' }}>
            <PieChart size={12} /> Payment Mix
          </div>
          <div style={{ height: 120, marginBottom: 8 }}>
            <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false } } }} />
          </div>
        </>
      )}

      <div className="dgc-dsr-metric flex gap-2 items-start mt-2">
        <Lightbulb size={14} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
        <p className="text-xs leading-relaxed m-0" style={{ color: '#64748B' }}>
          Record sales daily for accurate margin science. Link purchases to supplier invoices for COGS tracking.
        </p>
      </div>
    </div>
  )

  if (mobile) {
    return (
      <>
        <div className="dgc-dsr-side-backdrop" onClick={onClose} />
        {content}
      </>
    )
  }
  return content
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, trend }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="dgc-dsr-glass p-4">
      <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>{label}</div>
      <div className="dgc-dsr-mono text-xl font-black" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: '#94A3B8' }}>{sub}</div>}
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-1 text-xs font-semibold" style={{ color: trend >= 0 ? '#059669' : '#DC2626' }}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(trend).toFixed(1)}% margin
        </div>
      )}
    </motion.div>
  )
}

function SectionHead({ icon: Icon, title, sub, color = '#0B5FFF', action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: `${color}14` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#071B52', margin: 0 }}>{title}</h3>
          {sub && <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0' }}>{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DSR() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [tab, setTab] = useState('sales')
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])
  const [fixedCosts, setFixedCosts] = useState([])
  const [plReport, setPLReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [sideOpen, setSideOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, p, f, pl] = await Promise.all([
        dsrAPI.getSales(month, year),
        dsrAPI.getPurchases(month, year),
        dsrAPI.getFixedCosts(month, year),
        dsrAPI.getPLReport(month, year),
      ])
      setSales(s.data)
      setPurchases(p.data)
      setFixedCosts(f.data)
      setPLReport(pl.data)
    } catch {
      toast.error('Failed to load DSR data')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const pl = plReport || {}
  const isProfit = (pl.net_profit || 0) >= 0
  const insights = useMemo(() => computeInsights(pl, sales, month, year), [pl, sales, month, year])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const daily = pl.daily || []
  const chartData = {
    labels: daily.map(d => d.date.slice(5)),
    datasets: [
      { label: 'Sales', data: daily.map(d => d.sales), backgroundColor: 'rgba(11,95,255,0.65)', borderRadius: 6 },
      { label: 'Purchases', data: daily.map(d => d.purchases), backgroundColor: 'rgba(217,119,6,0.65)', borderRadius: 6 },
      { label: 'Profit', data: daily.map(d => d.profit), backgroundColor: daily.map(d => d.profit >= 0 ? 'rgba(5,150,105,0.65)' : 'rgba(220,38,38,0.65)'), borderRadius: 6 },
    ],
  }
  const lineData = {
    labels: daily.map(d => d.date.slice(5)),
    datasets: [{
      label: 'Daily Profit',
      data: daily.map(d => d.profit),
      borderColor: '#0B5FFF',
      backgroundColor: 'rgba(11,95,255,0.12)',
      fill: true,
      tension: 0.35,
      pointRadius: 3,
    }],
  }
  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#64748B', font: { size: 11 } } }, tooltip: chartTooltip },
    scales: {
      x: chartAxis,
      y: { ...chartAxis, ticks: { ...chartAxis.ticks, callback: v => `रू${(v / 1000).toFixed(0)}k` } },
    },
  }

  const years = []
  for (let y = now.getFullYear() + 1; y >= 2023; y--) years.push(y)

  const openModal = (m) => { setModal(m); setSideOpen(false) }

  const deleteSale = async (id) => {
    try { await dsrAPI.deleteSale(id); toast.success('Entry removed'); load() } catch { toast.error('Delete failed') }
  }
  const deletePurchase = async (id) => {
    try { await dsrAPI.deletePurchase(id); toast.success('Purchase removed'); load() } catch { toast.error('Delete failed') }
  }
  const deleteFixedCost = async (id) => {
    try { await dsrAPI.deleteFixedCost(id); toast.success('Cost removed'); load() } catch { toast.error('Delete failed') }
  }

  return (
    <div className="dgc-dsr-root page-content pb-6">

      {/* Header */}
      <div className="dgc-dsr-glass p-4 md:p-5 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 m-0" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#071B52', letterSpacing: '-0.02em' }}>
              <BarChart3 size={24} style={{ color: '#0B5FFF' }} />
              DSR Register
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(11,95,255,0.10)', color: '#0B5FFF' }}>Scientific</span>
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0' }}>
              Daily sales · wholesale purchases · fixed costs · monthly P&amp;L intelligence
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={prevMonth} className="dgc-dsr-btn" style={{ padding: '8px 10px' }}><ChevronLeft size={16} /></button>
            <div className="relative">
              <select className="dgc-dsr-input pr-8" style={{ width: 'auto', minWidth: 130 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#94A3B8' }} />
            </div>
            <div className="relative">
              <select className="dgc-dsr-input pr-8" style={{ width: 'auto', minWidth: 88 }} value={year} onChange={e => setYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#94A3B8' }} />
            </div>
            <button type="button" onClick={nextMonth} className="dgc-dsr-btn" style={{ padding: '8px 10px' }}><ChevronRight size={16} /></button>
            <button type="button" onClick={load} disabled={loading} className="dgc-dsr-btn" style={{ padding: '8px 12px' }}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total Sales" value={fmt(pl.revenue)} accent="#0B5FFF" sub={`${daily.length} day entries`} />
        <KpiCard label="Purchases (COGS)" value={fmt(pl.cogs)} accent="#D97706" sub="Wholesale cost" />
        <KpiCard label="Fixed Costs" value={fmt(pl.total_fixed)} accent="#7C3AED" sub="Rent + salary + more" />
        <KpiCard label={isProfit ? 'Net Profit' : 'Net Loss'} value={fmt(Math.abs(pl.net_profit || 0))}
          accent={isProfit ? '#059669' : '#DC2626'} sub="After all deductions" trend={pl.net_margin} />
      </div>

      <div className="dgc-dsr-layout">
        {/* Main column */}
        <div>
          {/* Tabs */}
          <div className="dgc-submenu-bar mb-4">
            {[
              { id: 'sales', label: 'Daily Sales', count: sales.length },
              { id: 'purchases', label: 'Purchases', count: purchases.length },
              { id: 'fixed', label: 'Fixed Costs', count: fixedCosts.length },
              { id: 'pl', label: 'P&L Report', count: null },
            ].map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`dgc-submenu-tab dgc-dsr-tab ${tab === t.id ? 'active' : ''}`}>
                {t.label}
                {t.count !== null && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs" style={{ background: 'rgba(7,27,82,0.06)' }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === 'sales' && (
              <motion.div key="sales" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="dgc-dsr-glass p-5">
                <SectionHead icon={CalendarDays} title="Day-wise Sales Entries" sub={`${MONTHS[month - 1]} ${year}`} color="#0B5FFF"
                  action={<button type="button" onClick={() => openModal('sale')} className="dgc-dsr-btn dgc-dsr-btn-primary text-xs"><Plus size={14} /> Add Entry</button>} />
                {sales.length === 0 ? (
                  <div className="text-center py-14" style={{ color: '#94A3B8' }}>
                    <CalendarDays size={40} className="mx-auto mb-3 opacity-40" />
                    <p>No sales entries this month</p>
                    <button type="button" onClick={() => openModal('sale')} className="dgc-dsr-btn dgc-dsr-btn-primary mt-3 text-xs">Add first entry</button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="dgc-dsr-table w-full">
                      <thead><tr>{['Date', 'Cash', 'Card', 'Online', 'Other', 'Total', 'Notes', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {sales.map(row => (
                          <tr key={row.id}>
                            <td className="font-semibold" style={{ color: '#0B5FFF' }}>{fmtDate(row.entry_date)}</td>
                            <td className="dgc-dsr-mono" style={{ color: '#059669' }}>{fmt(row.cash_sales)}</td>
                            <td className="dgc-dsr-mono" style={{ color: '#0B5FFF' }}>{fmt(row.card_sales)}</td>
                            <td className="dgc-dsr-mono" style={{ color: '#7C3AED' }}>{fmt(row.online_sales)}</td>
                            <td className="dgc-dsr-mono" style={{ color: '#64748B' }}>{fmt(row.other_sales)}</td>
                            <td className="dgc-dsr-mono font-bold">{fmt(row.total_sales)}</td>
                            <td className="max-w-[120px] truncate" style={{ color: '#94A3B8' }}>{row.notes || '—'}</td>
                            <td><button type="button" onClick={() => deleteSale(row.id)} style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid rgba(7,27,82,0.10)' }}>
                          <td className="text-xs font-bold uppercase" style={{ color: '#64748B' }}>Total</td>
                          {['cash_sales', 'card_sales', 'online_sales', 'other_sales'].map(k => (
                            <td key={k} className="dgc-dsr-mono text-xs font-semibold">{fmt(sales.reduce((s, r) => s + Number(r[k] || 0), 0))}</td>
                          ))}
                          <td className="dgc-dsr-mono font-black" style={{ color: '#0B5FFF' }}>{fmt(sales.reduce((s, r) => s + Number(r.total_sales || 0), 0))}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'purchases' && (
              <motion.div key="purchases" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="dgc-dsr-glass p-5">
                <SectionHead icon={ShoppingBag} title="Wholesale Purchases" sub="Cost of goods acquired" color="#D97706"
                  action={<button type="button" onClick={() => openModal('purchase')} className="dgc-dsr-btn text-xs" style={{ background: 'linear-gradient(135deg,#B45309,#D97706)', color: '#fff', border: 'none' }}><Plus size={14} /> Add Purchase</button>} />
                {purchases.length === 0 ? (
                  <div className="text-center py-14" style={{ color: '#94A3B8' }}>
                    <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
                    <p>No purchases recorded</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="dgc-dsr-table w-full">
                      <thead><tr>{['Date', 'Supplier', 'Category', 'Amount', 'Payment', 'Invoice', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {purchases.map(row => (
                          <tr key={row.id}>
                            <td className="font-semibold" style={{ color: '#0B5FFF' }}>{fmtDate(row.purchase_date)}</td>
                            <td>{row.supplier_name || '—'}</td>
                            <td><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.10)', color: '#B45309' }}>{row.category || 'General'}</span></td>
                            <td className="dgc-dsr-mono font-bold" style={{ color: '#D97706' }}>{fmt(row.amount)}</td>
                            <td className="capitalize" style={{ color: '#64748B' }}>{row.payment_method}</td>
                            <td style={{ color: '#94A3B8' }}>{row.invoice_ref || '—'}</td>
                            <td><button type="button" onClick={() => deletePurchase(row.id)} style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'fixed' && (
              <motion.div key="fixed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="dgc-dsr-glass p-5">
                <SectionHead icon={Building2} title={`Fixed Costs — ${MONTHS[month - 1]} ${year}`} color="#7C3AED"
                  action={<button type="button" onClick={() => openModal('fixedcost')} className="dgc-dsr-btn text-xs" style={{ background: 'linear-gradient(135deg,#6D28D9,#7C3AED)', color: '#fff', border: 'none' }}><Plus size={14} /> Add Cost</button>} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {FIXED_COST_CATS.map(cat => {
                    const total = fixedCosts.filter(r => r.category === cat.value).reduce((s, r) => s + Number(r.amount || 0), 0)
                    return (
                      <div key={cat.value} className="dgc-dsr-metric">
                        <div className="flex items-center gap-2 mb-1">
                          <cat.icon size={13} style={{ color: cat.color }} />
                          <span className="text-xs font-semibold" style={{ color: cat.color }}>{cat.label}</span>
                        </div>
                        <div className="dgc-dsr-mono font-bold text-sm" style={{ color: '#071B52' }}>{fmt(total)}</div>
                      </div>
                    )
                  })}
                </div>
                {fixedCosts.length === 0 ? (
                  <div className="text-center py-10" style={{ color: '#94A3B8' }}>No fixed costs yet</div>
                ) : (
                  <div className="space-y-2">
                    {fixedCosts.map(row => {
                      const cat = FIXED_COST_CATS.find(c => c.value === row.category) || FIXED_COST_CATS[3]
                      return (
                        <div key={row.id} className="dgc-dsr-metric flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg" style={{ background: `${cat.color}18` }}><cat.icon size={13} style={{ color: cat.color }} /></div>
                            <div>
                              <div className="text-sm font-semibold" style={{ color: '#071B52' }}>{row.name}</div>
                              <div className="text-xs capitalize" style={{ color: '#94A3B8' }}>{cat.label}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="dgc-dsr-mono font-bold text-sm" style={{ color: cat.color }}>{fmt(row.amount)}</span>
                            <button type="button" onClick={() => deleteFixedCost(row.id)} style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'pl' && (
              <motion.div key="pl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="dgc-dsr-glass p-5">
                  <SectionHead icon={TrendingUp} title={`Monthly P&L — ${MONTHS[month - 1]} ${year}`} sub="Scientific profit & loss statement" color="#059669" />
                  <div className="space-y-0">
                    {[
                      { label: 'Total Revenue', sub: `${daily.length} days · ${pl.pos_sales > 0 && pl.total_dsr_sales === 0 ? 'from POS' : 'manual DSR'}`, val: pl.revenue, color: '#0B5FFF', sign: '' },
                      { label: 'Cost of Purchases', sub: `${purchases.length} entries`, val: pl.cogs, color: '#D97706', sign: '−' },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between py-3" style={{ borderBottom: '1px solid rgba(7,27,82,0.06)' }}>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: '#071B52' }}>{row.label}</div>
                          <div className="text-xs" style={{ color: '#94A3B8' }}>{row.sub}</div>
                        </div>
                        <div className="dgc-dsr-mono font-bold text-base" style={{ color: row.color }}>{row.sign}{fmt(row.val)}</div>
                      </div>
                    ))}
                    <div className="flex justify-between py-3 px-3 -mx-3 my-1 rounded-xl" style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.14)' }}>
                      <div>
                        <div className="text-sm font-bold" style={{ color: '#071B52' }}>Gross Profit</div>
                        <div className="text-xs" style={{ color: '#64748B' }}>Margin: {pl.gross_margin}%</div>
                      </div>
                      <div className="dgc-dsr-mono font-black text-lg" style={{ color: (pl.gross_profit || 0) >= 0 ? '#059669' : '#DC2626' }}>{fmt(pl.gross_profit)}</div>
                    </div>
                    <div className="py-3">
                      <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#64748B' }}>Fixed Expenses</div>
                      {FIXED_COST_CATS.map(cat => {
                        const amt = (pl.fixed_by_cat || {})[cat.value] || 0
                        if (!amt) return null
                        return (
                          <div key={cat.value} className="flex justify-between py-1.5 text-sm">
                            <span className="flex items-center gap-2" style={{ color: '#64748B' }}><cat.icon size={12} style={{ color: cat.color }} />{cat.label}</span>
                            <span className="dgc-dsr-mono" style={{ color: '#64748B' }}>− {fmt(amt)}</span>
                          </div>
                        )
                      })}
                      {(pl.fin_expenses || 0) > 0 && (
                        <div className="flex justify-between py-1.5 text-sm">
                          <span style={{ color: '#64748B' }}>Finance module expenses</span>
                          <span className="dgc-dsr-mono" style={{ color: '#64748B' }}>− {fmt(pl.fin_expenses)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between py-3" style={{ borderBottom: '1px solid rgba(7,27,82,0.06)' }}>
                      <span className="text-sm font-semibold" style={{ color: '#64748B' }}>Total Expenses</span>
                      <span className="dgc-dsr-mono font-bold" style={{ color: '#DC2626' }}>− {fmt(pl.total_expenses)}</span>
                    </div>
                    <div className={`flex justify-between mt-4 p-4 rounded-2xl ${isProfit ? '' : ''}`}
                      style={{ background: isProfit ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${isProfit ? 'rgba(5,150,105,0.22)' : 'rgba(220,38,38,0.22)'}` }}>
                      <div className="flex items-center gap-3">
                        {isProfit ? <CheckCircle2 size={22} style={{ color: '#059669' }} /> : <AlertCircle size={22} style={{ color: '#DC2626' }} />}
                        <div>
                          <div className="font-black text-base" style={{ color: isProfit ? '#059669' : '#DC2626' }}>{isProfit ? 'Net Profit' : 'Net Loss'}</div>
                          <div className="text-xs" style={{ color: '#64748B' }}>Net margin: {pl.net_margin}%</div>
                        </div>
                      </div>
                      <div className="dgc-dsr-mono text-2xl font-black" style={{ color: isProfit ? '#059669' : '#DC2626' }}>
                        {isProfit ? '+' : '−'}{fmt(Math.abs(pl.net_profit || 0))}
                      </div>
                    </div>
                  </div>
                </div>

                {daily.length > 0 && (
                  <>
                    <div className="dgc-dsr-glass p-5">
                      <SectionHead icon={BarChart3} title="Sales vs Purchases vs Profit" sub="Daily bar analysis" color="#0B5FFF" />
                      <div style={{ height: 260 }}><Bar data={chartData} options={chartOpts} /></div>
                    </div>
                    <div className="dgc-dsr-glass p-5">
                      <SectionHead icon={Activity} title="Profit Trend Line" sub="Day-over-day margin movement" color="#059669" />
                      <div style={{ height: 220 }}><Line data={lineData} options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: false } } }} /></div>
                    </div>
                  </>
                )}

                {sales.length > 0 && (
                  <div className="dgc-dsr-glass p-5">
                    <SectionHead icon={DollarSign} title="Payment Method Split" color="#7C3AED" />
                    <div className="space-y-3">
                      {[
                        { key: 'cash_sales', label: 'Cash', color: PAY_COLORS.cash },
                        { key: 'card_sales', label: 'Card', color: PAY_COLORS.card },
                        { key: 'online_sales', label: 'Online', color: PAY_COLORS.online },
                        { key: 'other_sales', label: 'Other', color: PAY_COLORS.other },
                      ].map(item => {
                        const total = sales.reduce((s, r) => s + Number(r[item.key] || 0), 0)
                        const p = pct(total, pl.revenue || 0)
                        return (
                          <div key={item.key}>
                            <div className="flex justify-between mb-1 text-sm">
                              <span style={{ color: '#64748B' }}>{item.label}</span>
                              <div className="flex gap-3 items-center">
                                <span className="text-xs" style={{ color: '#94A3B8' }}>{p}%</span>
                                <span className="dgc-dsr-mono font-semibold" style={{ color: item.color }}>{fmt(total)}</span>
                              </div>
                            </div>
                            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(7,27,82,0.06)' }}>
                              <motion.div initial={{ width: 0 }} animate={{ width: `${p}%` }} className="h-full rounded-full" style={{ background: item.color }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop side panel */}
        <div className="hidden lg:block">
          <SidePanel insights={insights} pl={pl} month={month} year={year}
            onAction={openModal}
            onExport={() => exportDSRCsv({ tab, sales, purchases, fixedCosts, pl, month, year })}
            onClose={() => setSideOpen(false)} mobile={false} />
        </div>
      </div>

      {/* Mobile FAB + drawer */}
      <button type="button" className="dgc-dsr-fab" onClick={() => setSideOpen(true)} aria-label="Open DSR lab panel">
        <PanelRight size={22} />
      </button>
      {sideOpen && (
        <div className="lg:hidden">
          <SidePanel insights={insights} pl={pl} month={month} year={year}
            onAction={openModal}
            onExport={() => exportDSRCsv({ tab, sales, purchases, fixedCosts, pl, month, year })}
            onClose={() => setSideOpen(false)} mobile />
        </div>
      )}

      <AnimatePresence>
        {modal === 'sale' && <AddSaleModal month={month} year={year} onClose={() => setModal(null)} onSaved={load} />}
        {modal === 'purchase' && <AddPurchaseModal month={month} year={year} onClose={() => setModal(null)} onSaved={load} />}
        {modal === 'fixedcost' && <AddFixedCostModal month={month} year={year} onClose={() => setModal(null)} onSaved={load} />}
      </AnimatePresence>
    </div>
  )
}