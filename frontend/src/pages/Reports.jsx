/**
 * Phase 4 — Analytics / Reports
 * Tabs: P&L Summary · Product Performance · Staff Performance · Inventory
 * Exports: CSV · Excel (multi-sheet)
 */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { reportsAPI } from '../api'
import { format, startOfMonth, endOfMonth, subDays, startOfYear } from 'date-fns'
import { Download, TrendingUp, Package, BarChart3, Calendar, RefreshCw, Users, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import { glass } from '../theme/tokens'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, LineElement, PointElement, Title, Tooltip, Legend
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  LineElement, PointElement, Title, Tooltip, Legend
)

const TODAY = format(new Date(), 'yyyy-MM-dd')

const DATE_PRESETS = [
  { label: 'Today',       from: TODAY,                                                              to: TODAY },
  { label: 'Last 7 Days', from: format(subDays(new Date(), 6), 'yyyy-MM-dd'),                       to: TODAY },
  { label: 'This Month',  from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),                     to: TODAY },
  { label: 'Last Month',  from: format(startOfMonth(subDays(startOfMonth(new Date()), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subDays(startOfMonth(new Date()), 1)), 'yyyy-MM-dd') },
  { label: 'YTD',         from: format(startOfYear(new Date()), 'yyyy-MM-dd'),                      to: TODAY },
]

const tooltipStyle = {
  backgroundColor: 'rgba(255,253,246,0.96)',
  titleColor: '#000000', bodyColor: 'rgba(0,0,0,0.55)',
  borderColor: 'rgba(0,0,0,0.10)', borderWidth: 1, padding: 12,
  titleFont: { family: 'Inter, system-ui, sans-serif', size: 12, weight: '600' },
  bodyFont:  { family: 'Inter, system-ui, sans-serif', size: 11 },
  callbacks: { label: ctx => ` Rs. ${Number(ctx.raw || 0).toLocaleString('en-IN')}` },
}

const axisStyle = {
  grid:   { color: '#8E8E93', drawBorder: false },
  ticks:  { color: '#8E8E93', font: { size: 10, family: 'Inter, system-ui, sans-serif' } },
  border: { display: false },
}

const cur = (v) => `Rs. ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

const TABS = [
  { k: 'summary',   label: 'P&L Summary',        icon: TrendingUp },
  { k: 'products',  label: 'Top Products',        icon: Package },
  { k: 'staff',     label: 'Staff Performance',   icon: Users },
  { k: 'inventory', label: 'Inventory Report',    icon: BarChart3 },
]

export default function Reports() {
  const [tab,      setTab]      = useState('summary')
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo,   setDateTo]   = useState(TODAY)
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [preset,   setPreset]   = useState('This Month')

  const applyPreset = (p) => { setPreset(p.label); setDateFrom(p.from); setDateTo(p.to) }

  const load = async () => {
    setLoading(true)
    try {
      const params = { date_from: dateFrom, date_to: dateTo }
      let r
      if      (tab === 'summary')   r = await reportsAPI.summary(params)
      else if (tab === 'products')  r = await reportsAPI.products(params)
      else if (tab === 'staff')     r = await reportsAPI.staff(params)
      else if (tab === 'inventory') r = await reportsAPI.inventory()
      setData(r.data)
    } catch (e) {
      if (e?.response?.status === 403) toast.error('Insufficient permissions')
      else toast.error('Failed to load report')
    } finally { setLoading(false) }
  }

  useEffect(() => { setData(null); load() }, [tab, dateFrom, dateTo])

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(new Blob([blob]))
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = async (type) => {
    try {
      const r = await reportsAPI.exportCSV({ type, date_from: dateFrom, date_to: dateTo })
      downloadBlob(r.data, `${type}_report_${dateFrom}.csv`)
      toast.success('CSV exported!')
    } catch { toast.error('Export failed') }
  }

  const handleExportXLSX = async () => {
    try {
      const r = await reportsAPI.exportXLSX({ date_from: dateFrom, date_to: dateTo })
      downloadBlob(r.data, `retailos_report_${dateFrom}_to_${dateTo}.xlsx`)
      toast.success('Excel report downloaded!')
    } catch { toast.error('Excel export failed') }
  }

  const showDateBar = tab !== 'inventory'

  return (
    <div className="page-content">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.45rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>Reports</h2>
          <p style={{ fontSize: '0.72rem', color: '#8E8E93', margin: '4px 0 0' }}>Analytics & business intelligence</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleExportXLSX} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#34D399', borderColor: 'rgba(52,211,153,0.28)' }}>
            <FileSpreadsheet size={13}/> Excel
          </button>
          <button onClick={() => handleExportCSV('sales')} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
            <Download size={13}/> Sales CSV
          </button>
          <button onClick={() => handleExportCSV('inventory')} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
            <Download size={13}/> Stock CSV
          </button>
          <button onClick={load} disabled={loading} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }}/> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="dgc-submenu-bar" style={{ marginBottom: '1rem' }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.k} type="button" onClick={() => setTab(t.k)}
              className={`dgc-submenu-tab ${tab === t.k ? 'active' : ''}`}>
              <Icon size={12}/><span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Date controls */}
      {showDateBar && (
        <div style={{ ...glass.card, borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#8E8E93', marginBottom: 8 }}>Quick Select</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DATE_PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)} style={{
                  padding: '0.30rem 0.75rem', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                  background: preset === p.label ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                  color:      preset === p.label ? '#93C5FD' : 'rgba(255,255,255,0.40)',
                  border:     preset === p.label ? '1px solid rgba(59,130,246,0.28)' : '1px solid rgba(255,255,255,0.07)',
                  transition: 'all 0.16s', fontFamily: 'inherit',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#8E8E93', marginBottom: 6 }}>From</label>
              <input type="date" className="input-field" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('') }} style={{ minWidth: 140 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#8E8E93', marginBottom: 6 }}>To</label>
              <input type="date" className="input-field" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('') }} style={{ minWidth: 140 }} />
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ ...glass.card, borderRadius: 14, padding: '3rem', textAlign: 'center', color: '#8E8E93', fontSize: '0.82rem' }}>
          Loading report…
        </div>
      )}

      {/* ── P&L Summary ── */}
      {!loading && tab === 'summary' && data && <SummaryTab data={data} cur={cur} axisStyle={axisStyle} tooltipStyle={tooltipStyle} />}

      {/* ── Product Performance ── */}
      {!loading && tab === 'products' && data && <ProductsTab data={data} cur={cur} />}

      {/* ── Staff Performance ── */}
      {!loading && tab === 'staff' && data && <StaffTab data={data} cur={cur} />}

      {/* ── Inventory ── */}
      {!loading && tab === 'inventory' && data && <InventoryTab data={data} cur={cur} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}


/* ── Summary Tab ─────────────────────────────────────────────────────────── */
function SummaryTab({ data, cur, axisStyle, tooltipStyle }) {
  const paymentEntries = data?.payment_breakdown ? Object.entries(data.payment_breakdown) : []
  const paymentChart = {
    labels: paymentEntries.map(([m]) => m.charAt(0).toUpperCase() + m.slice(1)),
    datasets: [{
      data: paymentEntries.map(([, v]) => v),
      backgroundColor: ['rgba(11,95,255,0.70)', 'rgba(59,130,246,0.65)', 'rgba(16,185,129,0.65)', 'rgba(139,92,246,0.65)'],
      borderColor:     ['rgba(11,95,255,0.90)', 'rgba(59,130,246,0.90)', 'rgba(16,185,129,0.90)', 'rgba(139,92,246,0.90)'],
      borderWidth: 1, borderRadius: 6,
    }],
  }

  const plChart = {
    labels: ['Revenue', 'Cost', 'Gross Profit', 'Expenses', 'Net Profit'],
    datasets: [{
      data: [data.total_revenue, data.total_cost, data.gross_profit, data.total_expenses, data.net_profit].map(v => Math.abs(v || 0)),
      backgroundColor: ['rgba(11,95,255,0.70)', 'rgba(59,130,246,0.65)', 'rgba(16,185,129,0.65)', 'rgba(239,68,68,0.60)', data?.net_profit >= 0 ? 'rgba(16,185,129,0.65)' : 'rgba(239,68,68,0.65)'],
      borderColor:     ['rgba(11,95,255,0.90)', 'rgba(59,130,246,0.90)', 'rgba(16,185,129,0.90)', 'rgba(239,68,68,0.90)', data?.net_profit >= 0 ? 'rgba(16,185,129,0.90)' : 'rgba(239,68,68,0.90)'],
      borderWidth: 1, borderRadius: 8,
    }],
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: tooltipStyle },
    scales: { x: axisStyle, y: { ...axisStyle, ticks: { ...axisStyle.ticks, callback: v => `Rs. ${Number(v).toLocaleString('en-IN')}` } } },
  }

  // Daily trend line chart
  const trendChart = data.daily_trend?.length > 1 ? {
    labels: data.daily_trend.map(d => d.date),
    datasets: [{
      label: 'Revenue',
      data: data.daily_trend.map(d => d.revenue),
      borderColor: 'rgba(11,95,255,0.9)',
      backgroundColor: 'rgba(11,95,255,0.10)',
      borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3,
    }],
  } : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Revenue',  value: cur(data.total_revenue),  color: '#E8C547' },
          { label: 'Cost of Goods',  value: cur(data.total_cost),     color: '#93C5FD' },
          { label: 'Gross Profit',   value: cur(data.gross_profit),   color: '#34D399' },
          { label: 'Total Expenses', value: cur(data.total_expenses), color: '#F87171' },
          { label: 'Net Profit',     value: cur(data.net_profit),     color: data.net_profit >= 0 ? '#34D399' : '#F87171' },
          { label: 'Gross Margin',   value: `${data.gross_margin_pct || 0}%`, color: '#34D399' },
          { label: 'Transactions',   value: data.transactions ?? '—', color: 'rgba(0,0,0,0.60)' },
        ].map((k, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            style={{ ...glass.card, borderRadius: 14, padding: '1rem 1.15rem' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8E8E93', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1rem' }}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}
          style={{ ...glass.card, borderRadius: 18, padding: '1.25rem' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 14 }}>P&L Overview</div>
          <div style={{ height: 220 }}>
            <Bar data={plChart} options={{ ...chartOpts, scales: { ...chartOpts.scales, x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxRotation: 0 } } } }} />
          </div>
        </motion.div>

        {paymentEntries.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}
            style={{ ...glass.card, borderRadius: 18, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 14 }}>Payment Methods</div>
            <div style={{ height: 220 }}>
              <Bar data={paymentChart} options={chartOpts} />
            </div>
          </motion.div>
        )}

        {trendChart && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}
            style={{ ...glass.card, borderRadius: 18, padding: '1.25rem', gridColumn: 'span 2' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 14 }}>Daily Revenue Trend</div>
            <div style={{ height: 180 }}>
              <Line data={trendChart} options={{ ...chartOpts,
                plugins: { ...chartOpts.plugins, tooltip: { ...tooltipStyle, callbacks: { label: ctx => ` Rs. ${Number(ctx.raw || 0).toLocaleString('en-IN')}` } } },
              }} />
            </div>
          </motion.div>
        )}
      </div>

      {/* Payment breakdown bar */}
      {paymentEntries.length > 0 && (
        <div style={{ ...glass.card, borderRadius: 14, padding: '1.25rem' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 12 }}>Payment Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paymentEntries.map(([method, amount]) => {
              const pct = data.total_revenue > 0 ? ((amount / data.total_revenue) * 100).toFixed(1) : 0
              return (
                <div key={method} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 90, fontSize: '0.80rem', color: 'rgba(0,0,0,0.60)', fontWeight: 600, textTransform: 'capitalize' }}>{method}</div>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: 'linear-gradient(90deg,#0B5FFF,#60A5FA)' }} />
                  </div>
                  <div style={{ width: 110, textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: '#E8C547' }}>{cur(amount)}</div>
                  <div style={{ width: 40, textAlign: 'right', fontSize: '0.70rem', color: '#8E8E93' }}>{pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


/* ── Products Tab ────────────────────────────────────────────────────────── */
function ProductsTab({ data, cur }) {
  const products = data?.products || []
  if (!products.length) return <EmptyState text="No sales data for this period" />

  const topN = products.slice(0, 10)
  const revenueChart = {
    labels: topN.map(p => p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name),
    datasets: [
      { label: 'Revenue',      data: topN.map(p => p.revenue),      backgroundColor: 'rgba(11,95,255,0.70)', borderColor: 'rgba(11,95,255,0.90)', borderWidth: 1, borderRadius: 6 },
      { label: 'Gross Profit', data: topN.map(p => p.gross_profit), backgroundColor: 'rgba(16,185,129,0.55)', borderColor: 'rgba(16,185,129,0.85)', borderWidth: 1, borderRadius: 6 },
    ],
  }
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(0,0,0,0.60)', font: { size: 10 } } },
               tooltip: { backgroundColor: 'rgba(255,253,246,0.96)', titleColor: '#000000', bodyColor: 'rgba(0,0,0,0.55)',
                          callbacks: { label: ctx => ` Rs. ${Number(ctx.raw || 0).toLocaleString('en-IN')}` } } },
    scales: {
      x: { grid: { color: '#8E8E93' }, ticks: { color: '#8E8E93', font: { size: 9 }, maxRotation: 30 }, border: { display: false } },
      y: { grid: { color: '#8E8E93' }, ticks: { color: '#8E8E93', font: { size: 10 }, callback: v => `Rs. ${Number(v).toLocaleString('en-IN')}` }, border: { display: false } },
    },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Revenue',   value: cur(products.reduce((s, p) => s + p.revenue, 0)),      color: '#E8C547' },
          { label: 'Total Units Sold', value: products.reduce((s, p) => s + p.units_sold, 0).toLocaleString(), color: '#93C5FD' },
          { label: 'Total Profit',    value: cur(products.reduce((s, p) => s + p.gross_profit, 0)),  color: '#34D399' },
          { label: 'Products Sold',   value: products.length,                                         color: 'rgba(0,0,0,0.60)' },
        ].map((k, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            style={{ ...glass.card, borderRadius: 14, padding: '1rem 1.15rem' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8E8E93', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ ...glass.card, borderRadius: 18, padding: '1.25rem' }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 14 }}>Top 10 Products by Revenue</div>
        <div style={{ height: 260 }}>
          <Bar data={revenueChart} options={chartOpts} />
        </div>
      </div>

      {/* Table */}
      <div style={{ ...glass.card, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                {['#', 'Product', 'Category', 'Units', 'Revenue', 'Cost', 'Gross Profit', 'Margin'].map(h => (
                  <th key={h} className="table-header" style={{ textAlign: ['Units','Revenue','Cost','Gross Profit','Margin'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.product_id} className="table-row">
                  <td className="table-cell" style={{ color: '#8E8E93', fontSize: '0.75rem', width: 36 }}>{i + 1}</td>
                  <td className="table-cell" style={{ fontWeight: 500, fontSize: '0.82rem', color: '#FFFFFF' }}>
                    {p.name}
                    {p.sku && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: '#8E8E93' }}>{p.sku}</span>}
                  </td>
                  <td className="table-cell"><span className="badge-blue" style={{ fontSize: '0.68rem' }}>{p.category}</span></td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.80rem', color: '#93C5FD' }}>{p.units_sold.toLocaleString()}</td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: '#E8C547' }}>{cur(p.revenue)}</td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.80rem', color: 'rgba(0,0,0,0.50)' }}>{cur(p.cost)}</td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 600, color: '#34D399' }}>{cur(p.gross_profit)}</td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.80rem', color: p.margin_pct >= 30 ? '#34D399' : p.margin_pct >= 15 ? '#E8C547' : '#F87171' }}>
                    {p.margin_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}


/* ── Staff Tab ───────────────────────────────────────────────────────────── */
function StaffTab({ data, cur }) {
  const staff = data?.staff || []
  if (!staff.length) return <EmptyState text="No sales data for this period" />

  const chart = {
    labels: staff.map(s => s.cashier_name),
    datasets: [
      { label: 'Revenue',      data: staff.map(s => s.revenue),      backgroundColor: 'rgba(11,95,255,0.70)', borderColor: 'rgba(11,95,255,0.90)', borderWidth: 1, borderRadius: 6 },
      { label: 'Transactions', data: staff.map(s => s.transactions), backgroundColor: 'rgba(59,130,246,0.55)', borderColor: 'rgba(59,130,246,0.90)', borderWidth: 1, borderRadius: 6, yAxisID: 'y2' },
    ],
  }
  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(0,0,0,0.60)', font: { size: 10 } } } },
    scales: {
      x:  { grid: { color: '#8E8E93' }, ticks: { color: '#8E8E93', font: { size: 10 } }, border: { display: false } },
      y:  { grid: { color: '#8E8E93' }, ticks: { color: '#8E8E93', font: { size: 10 }, callback: v => `Rs. ${Number(v).toLocaleString('en-IN')}` }, border: { display: false }, position: 'left' },
      y2: { grid: { display: false }, ticks: { color: '#8E8E93', font: { size: 10 } }, border: { display: false }, position: 'right' },
    },
  }

  const totalRevenue = staff.reduce((s, r) => s + r.revenue, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ ...glass.card, borderRadius: 18, padding: '1.25rem' }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 14 }}>Sales by Cashier</div>
        <div style={{ height: 240 }}>
          <Bar data={chart} options={opts} />
        </div>
      </div>

      <div style={{ ...glass.card, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 540, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                {['Cashier', 'Role', 'Transactions', 'Revenue', 'Avg Sale', 'Share'].map(h => (
                  <th key={h} className="table-header" style={{ textAlign: ['Transactions','Revenue','Avg Sale','Share'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s, i) => {
                const share = totalRevenue > 0 ? ((s.revenue / totalRevenue) * 100).toFixed(1) : 0
                return (
                  <tr key={s.cashier_id} className="table-row">
                    <td className="table-cell" style={{ fontWeight: 600, fontSize: '0.82rem', color: '#FFFFFF' }}>{s.cashier_name}</td>
                    <td className="table-cell"><span className="badge-blue" style={{ fontSize: '0.68rem', textTransform: 'capitalize' }}>{s.role}</span></td>
                    <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.80rem', color: '#93C5FD' }}>{s.transactions.toLocaleString()}</td>
                    <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: '#E8C547' }}>{cur(s.revenue)}</td>
                    <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.80rem', color: 'rgba(0,0,0,0.60)' }}>{cur(s.avg_sale)}</td>
                    <td className="table-cell" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ width: 60, height: 4, borderRadius: 99, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${share}%`, background: 'linear-gradient(90deg,#0B5FFF,#60A5FA)', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.50)', width: 36, textAlign: 'right' }}>{share}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}


/* ── Inventory Tab ───────────────────────────────────────────────────────── */
function InventoryTab({ data, cur }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Retail Value', value: cur(data.total_retail_value), color: '#E8C547' },
          { label: 'Total Cost Value',   value: cur(data.total_cost_value),   color: '#93C5FD' },
          { label: 'Potential Profit',   value: cur(data.potential_profit),   color: '#34D399' },
          { label: 'Low Stock Items',    value: data.low_stock_count ?? 0,    color: data.low_stock_count > 0 ? '#F87171' : '#34D399' },
        ].map((k, i) => (
          <div key={i} style={{ ...glass.card, borderRadius: 14, padding: '1rem 1.15rem' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8E8E93', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...glass.card, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                {['Product', 'Category', 'Stock', 'Cost Value', 'Retail Value'].map(h => (
                  <th key={h} className="table-header" style={{ textAlign: ['Stock', 'Cost Value', 'Retail Value'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.items || []).slice(0, 100).map(p => (
                <tr key={p.id} className="table-row">
                  <td className="table-cell" style={{ fontWeight: 500, fontSize: '0.82rem', color: '#FFFFFF' }}>{p.name}</td>
                  <td className="table-cell"><span className="badge-blue" style={{ fontSize: '0.68rem' }}>{p.category || '—'}</span></td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.80rem', color: p.is_low_stock ? '#FCA5A5' : '#CBD5E1', fontWeight: p.is_low_stock ? 700 : 400 }}>
                    {p.stock_qty}{p.is_low_stock && <span style={{ marginLeft: 6, fontSize: '0.65rem', background: 'rgba(239,68,68,0.15)', color: '#F87171', padding: '1px 6px', borderRadius: 4 }}>LOW</span>}
                  </td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.80rem', color: 'rgba(0,0,0,0.60)' }}>{cur(p.cost_value)}</td>
                  <td className="table-cell" style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: '#E8C547' }}>{cur(p.retail_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ ...glass.card, borderRadius: 14, padding: '3rem', textAlign: 'center', color: '#8E8E93', fontSize: '0.82rem' }}>
      {text}
    </div>
  )
}
