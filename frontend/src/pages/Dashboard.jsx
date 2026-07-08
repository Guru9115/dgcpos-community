/**
 * Phase 3 + 9 — Dashboard
 * Greeting · KPI cards · Sales trend · Top products · Monthly revenue
 * Recent transactions · Hourly heatmap · Payment breakdown · Top customers
 */
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { dashboardAPI, bazaarAdsAPI } from '../api'
import { useHospitalityEnabled } from '../hooks/useHospitalityEnabled'
import { useAuth } from '../store/AuthContext'
import OnboardingChecklist from '../components/OnboardingChecklist'
import DashboardBannerCarousel from '../components/dashboard/DashboardBannerCarousel'
import { format, startOfMonth, endOfMonth, subDays, startOfYear } from 'date-fns'
import toast from 'react-hot-toast'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Users, Package, RefreshCw, Circle, CreditCard, Crown, Download, FileSpreadsheet
} from 'lucide-react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler)

const TODAY = format(new Date(), 'yyyy-MM-dd')

const DATE_PRESETS = [
  { label: 'Today', from: TODAY, to: TODAY },
  { label: 'Last 7 Days', from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: TODAY },
  { label: 'This Month', from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: TODAY },
  { label: 'Last Month', from: format(startOfMonth(subDays(startOfMonth(new Date()), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subDays(startOfMonth(new Date()), 1)), 'yyyy-MM-dd') },
  { label: 'YTD', from: format(startOfYear(new Date()), 'yyyy-MM-dd'), to: TODAY },
]

/* ── helpers ───────────────────────────────────────────────────────── */
const fmt = (v) => `Rs. ${Number(v || 0).toLocaleString('en-IN')}`
const pct = (v) => `${Number(v || 0) >= 0 ? '+' : ''}${Number(v || 0).toFixed(1)}%`
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`)
const METHOD_COLORS = {
  cash: '#34D399', card: '#60A5FA', esewa: '#F59E0B',
  khalti: '#8B5CF6', credit: '#F87171', other: '#94A3B8',
}

function getGreeting(name) {
  const h = new Date().getHours()
  const salute = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
  return { salute, name: (name || '').split(' ')[0] || 'there' }
}

/* ── Light theme palette — readable on white cards ─────────────────────── */
const C = {
  title: '#071B52',
  body: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  accent: '#0B5FFF',
  positive: '#059669',
  negative: '#DC2626',
  border: 'rgba(7,27,82,0.08)',
  rowBg: '#f8fafc',
}

const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  titleColor: '#071B52', bodyColor: '#475569',
  borderColor: 'rgba(7,27,82,0.10)', borderWidth: 1, padding: 12,
  titleFont: { family: 'Inter, system-ui, sans-serif', size: 12, weight: '600' },
  bodyFont: { family: 'Inter, system-ui, sans-serif', size: 11 },
  callbacks: { label: ctx => ` Rs. ${Number(ctx.raw || 0).toLocaleString('en-IN')}` },
}

const axisStyle = {
  grid: { color: 'rgba(7,27,82,0.08)', drawBorder: false },
  ticks: { color: '#64748B', font: { size: 10, family: 'Inter, system-ui, sans-serif' } },
  border: { display: false },
}

const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: false }, tooltip: tooltipStyle },
  scales: { x: axisStyle, y: { ...axisStyle, ticks: { ...axisStyle.ticks, callback: v => `Rs. ${Number(v).toLocaleString('en-IN')}` } } },
}

const lightPanel = {
  background: '#ffffff',
  border: `1px solid ${C.border}`,
  boxShadow: '0 4px 16px rgba(7,27,82,0.06), 0 2px 6px rgba(7,27,82,0.04)',
}

const lightKpi = {
  background: '#ffffff',
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 2px rgba(7,27,82,0.04), 0 2px 8px rgba(7,27,82,0.03)',
}

const sectionTitle = { fontSize: '0.92rem', fontWeight: 700, color: C.title, letterSpacing: '-0.01em' }
const sectionSub = { fontSize: '0.68rem', color: C.muted, marginTop: 2 }

/* ── KPI Card - match Reports simple glass style ───────────────────────────────── */
function KpiCard({ label, value, change, loading }) {
  const positive = Number(change || 0) >= 0
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(7,27,82,0.08)' }}
      className="kpi-card" style={{ ...lightKpi, borderRadius: 14, padding: '1rem 1.15rem' }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>{label}</div>
      {loading
        ? <div style={{ height: 28, width: '60%', borderRadius: 6, background: 'rgba(7,27,82,0.06)' }} className="animate-pulse" />
        : <div className="dgc-text-3d-kpi" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: C.body }}>{value}</div>
      }
      {change !== undefined && !loading && (
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: positive ? C.positive : C.negative, marginTop: 4 }}>
          {pct(change)}
        </div>
      )}
    </motion.div>
  )
}

/* ── Hourly Heatmap ────────────────────────────────────────────────── */
function HourlyHeatmap({ data, loading }) {
  if (loading) return <div style={{ height: 80, borderRadius: 10, background: 'rgba(7,27,82,0.06)' }} className="animate-pulse" />
  const max = Math.max(1, ...(data || []).map(h => h.revenue || 0))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 3, paddingTop: 4 }}>
      {(data || []).map(h => {
        const intensity = (h.revenue || 0) / max
        const alpha = Math.max(0.06, intensity * 0.85)
        return (
          <div key={h.hour} title={`${HOUR_LABELS[h.hour]}: Rs. ${(h.revenue || 0).toLocaleString('en-IN')} (${h.count || 0} txn)`}
            style={{ height: 44, borderRadius: 5, background: `rgba(11,95,255,${alpha})`, border: intensity > 0.05 ? '1px solid rgba(11,95,255,0.28)' : `1px solid ${C.border}`, cursor: 'default', transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          />
        )
      })}
      <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 3, marginTop: 3 }}>
        {(data || []).map((h, i) => (
          i % 3 === 0
            ? <div key={h.hour} style={{ gridColumn: `${i + 1}/${i + 2}`, fontSize: '0.58rem', color: C.faint, textAlign: 'center' }}>{HOUR_LABELS[h.hour]}</div>
            : <div key={h.hour} />
        ))}
      </div>
    </div>
  )
}

/* ── Payment Doughnut ──────────────────────────────────────────────── */
function PaymentDonut({ data, loading }) {
  if (loading) return <div style={{ height: 160, borderRadius: 10, background: 'rgba(7,27,82,0.06)' }} className="animate-pulse" />
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', color: C.muted, fontSize: '0.80rem', paddingTop: '2rem' }}>No data yet</div>
  const labels = data.map(d => d.method.charAt(0).toUpperCase() + d.method.slice(1))
  const values = data.map(d => d.total)
  const bgs = data.map(d => METHOD_COLORS[d.method] || '#94A3B8')
  const total = values.reduce((a, b) => a + b, 0)
  const donut = {
    labels,
    datasets: [{ data: values, backgroundColor: bgs.map(c => c + '99'), borderColor: bgs, borderWidth: 2, hoverOffset: 6 }],
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 130, height: 130, flexShrink: 0 }}>
        <Doughnut data={donut} options={{
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` Rs. ${Number(ctx.raw).toLocaleString('en-IN')} (${((ctx.raw / total) * 100).toFixed(1)}%)` } },
          },
        }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {data.map(d => (
          <div key={d.method} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: METHOD_COLORS[d.method] || '#94A3B8', flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: C.muted, textTransform: 'capitalize' }}>{d.method}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: C.body }}>Rs. {Number(d.total).toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.60rem', color: C.faint }}>{((d.total / total) * 100).toFixed(1)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Top Customers ─────────────────────────────────────────────────── */
function TopCustomers({ data, loading }) {
  if (loading) return [...Array(4)].map((_, i) => <div key={i} style={{ height: 42, borderRadius: 10, background: 'rgba(7,27,82,0.06)', marginBottom: 6 }} className="animate-pulse" />)
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', color: C.muted, fontSize: '0.80rem', padding: '2rem 0' }}>No customer data this month</div>
  const max = data[0]?.revenue || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((c, i) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.45rem 0.70rem', borderRadius: 10, background: C.rowBg, border: `1px solid ${C.border}` }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: i === 0 ? 'linear-gradient(135deg,#0B5FFF,#60A5FA)' : 'rgba(7,27,82,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {i === 0 ? <Crown size={11} style={{ color: '#FFFFFF' }} /> : <span style={{ fontSize: '0.62rem', fontWeight: 800, color: C.muted }}>{i + 1}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
            <div style={{ marginTop: 3, height: 3, borderRadius: 3, background: 'rgba(7,27,82,0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(c.revenue / max) * 100}%`, background: i === 0 ? 'linear-gradient(90deg,#0B5FFF,#60A5FA)' : 'rgba(11,95,255,0.45)', borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: i === 0 ? C.accent : C.body }}>Rs. {Number(c.revenue).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '0.60rem', color: C.faint }}>{c.visits} visit{c.visits !== 1 ? 's' : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth()
  const { salute, name } = getGreeting(user?.full_name || user?.username)

  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(TODAY)
  const [preset, setPreset] = useState('This Month')

  const applyPreset = (p) => { setPreset(p.label); setDateFrom(p.from); setDateTo(p.to) }

  const { enabled: hospitalityEnabled, isLoading: hospLoading } = useHospitalityEnabled()

  const { data, isLoading: loading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['dashboard', dateFrom, dateTo],
    queryFn: async () => {
      const params = { date_from: dateFrom, date_to: dateTo }
      const res = await dashboardAPI.getBundle(params)
      const b = res.data || {}
      return {
        kpi: b.kpi || {},
        trend: b.trend || [],
        topProd: b.top_products || [],
        monthly: b.monthly || [],
        recent: b.recent || [],
        hourly: b.hourly || [],
        payment: b.payment || [],
        topCust: b.top_customers || [],
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 300_000,
  })
  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  const kpi = data?.kpi || {}

  const periodLabel = (dateFrom === dateTo) ? "Today's" : "Period"
  const kpis = [
    { label: `${periodLabel} Revenue`, value: fmt(kpi.today_sales), change: kpi.revenue_change },
    { label: `${periodLabel} Sales`, value: kpi.today_transactions ?? '—', change: kpi.sales_change },
    { label: 'Total Customers', value: kpi.customer_count ?? '—', change: kpi.customer_change },
    { label: 'Low Stock Items', value: kpi.low_stock_count ?? '—' },
  ]

  const trendLabels = (data?.trend || []).map(d => new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
  const trendValues = (data?.trend || []).map(d => d.revenue || 0)
  const lineData = {
    labels: trendLabels,
    datasets: [{ data: trendValues, borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.10)', borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#3B82F6', tension: 0.4, fill: true }],
  }

  const topLabels = (data?.topProd || []).map(p => p.name?.length > 14 ? p.name.slice(0, 13) + '…' : (p.name || ''))
  const topValues = (data?.topProd || []).map(p => p.revenue || p.total_revenue || 0)
  const COLORS = ['rgba(11,95,255,0.70)', 'rgba(59,130,246,0.65)', 'rgba(16,185,129,0.65)', 'rgba(139,92,246,0.65)', 'rgba(249,115,22,0.65)']
  const barData = {
    labels: topLabels,
    datasets: [{ data: topValues, backgroundColor: topValues.map((_, i) => COLORS[i % 5]), borderColor: topValues.map((_, i) => COLORS[i % 5].replace('0.65', '0.90').replace('0.70', '0.95')), borderWidth: 1, borderRadius: 6 }],
  }

  const monthLabels = (data?.monthly || []).map(m => m.month || m.label || '')
  const monthValues = (data?.monthly || []).map(m => m.revenue || 0)
  const monthData = {
    labels: monthLabels,
    datasets: [{ data: monthValues, backgroundColor: 'rgba(16,185,129,0.55)', borderColor: 'rgba(52,211,153,0.85)', borderWidth: 1, borderRadius: 5 }],
  }

  const EmptyChart = ({ loading: l }) => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {l ? <div style={{ width: '100%', height: 160, borderRadius: 10, background: 'rgba(7,27,82,0.06)' }} className="animate-pulse" />
        : <span style={{ color: C.muted, fontSize: '0.80rem' }}>No data yet</span>}
    </div>
  )

  const showOnboarding = ['owner', 'superadmin'].includes(user?.role) && !user?.account?.onboarding_completed

  const { data: dashBanners = [] } = useQuery({
    queryKey: ['dashboard-banners'],
    queryFn: () => bazaarAdsAPI.public().then((r) => {
      const list = Array.isArray(r.data) ? r.data : []
      return list.filter((a) => a.slot_type === 'dashboard_banner')
    }),
    staleTime: 120_000,
  })

  if (!hospLoading && hospitalityEnabled) {
    return <Navigate to="/hotel" replace />
  }

  return (
    <div className="page-content">

      <DashboardBannerCarousel banners={dashBanners} />

      {showOnboarding && (
        <div style={{ marginBottom: '1rem' }}>
          <OnboardingChecklist />
        </div>
      )}

      {/* Header - exact match to Reports */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.45rem', fontWeight: 700, color: C.title, margin: 0 }}>Dashboard</h2>
          <p style={{ fontSize: '0.72rem', color: C.muted, margin: '4px 0 0' }}>Overview &amp; key metrics</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => {
            const rows = [
              ['Metric', 'Value'],
              ['Revenue', kpi.today_sales],
              ['Sales (txns)', kpi.today_transactions],
              ['Total Customers', kpi.customer_count],
              ['Low Stock Items', kpi.low_stock_count],
            ]
            const csv = rows.map(r => r.join(',')).join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `dashboard_${dateFrom}_to_${dateTo}.csv`; a.click()
            URL.revokeObjectURL(url)
            toast.success('Dashboard CSV exported!')
          }} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#34D399', borderColor: 'rgba(52,211,153,0.28)' }}>
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button onClick={() => {
            const csv = `Metric,Value\nRevenue,${kpi.today_sales}\nSales,${kpi.today_transactions}\nTotal Customers,${kpi.customer_count}\nLow Stock,${kpi.low_stock_count}`
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `dashboard_${dateFrom}_to_${dateTo}.csv`; a.click()
            URL.revokeObjectURL(url)
            toast.success('CSV exported!')
          }} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
            <Download size={13} /> Sales CSV
          </button>
          <button onClick={refetch} disabled={loading} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      {/* Date controls - same as Reports */}
      <div className="glass-card" style={{ ...lightPanel, borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>Quick Select</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DATE_PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)} style={{
                padding: '0.30rem 0.75rem', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                background: preset === p.label ? 'rgba(11,95,255,0.10)' : '#ffffff',
                color: preset === p.label ? C.accent : C.muted,
                border: preset === p.label ? '1px solid rgba(11,95,255,0.28)' : `1px solid ${C.border}`,
                transition: 'all 0.16s', fontFamily: 'inherit',
              }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>From</label>
            <input type="date" className="input-field" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('') }} style={{ minWidth: 140 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>To</label>
            <input type="date" className="input-field" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('') }} style={{ minWidth: 140 }} />
          </div>
        </div>
      </div>

      {/* KPI row - match Reports */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {kpis.map((k, i) => <KpiCard key={i} {...k} loading={loading} />)}
      </div>

      {/* Row 1: Trend + Top Products */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(320px,100%),1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass-card" style={{ ...lightPanel, borderRadius: 18, padding: '1.25rem' }}>
          <div style={{ ...sectionTitle, marginBottom: 14 }}>Sales Trend</div>
          <div style={{ height: 200 }}>
            {!loading && trendValues.length > 0 ? <Line data={lineData} options={chartBase} /> : <EmptyChart loading={loading} />}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
          className="glass-card" style={{ ...lightPanel, borderRadius: 18, padding: '1.25rem' }}>
          <div style={{ ...sectionTitle, marginBottom: 14 }}>Top Products</div>
          <div style={{ height: 200 }}>
            {!loading && topValues.length > 0
              ? <Bar data={barData} options={{ ...chartBase, scales: { ...chartBase.scales, x: { ...chartBase.scales.x, ticks: { ...axisStyle.ticks, maxRotation: 35 } } } }} />
              : <EmptyChart loading={loading} />}
          </div>
        </motion.div>
      </div>

      {/* Row 2: Hourly Heatmap (full width) - match Reports card style */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
        className="glass-card" style={{ ...lightPanel, borderRadius: 18, padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ ...sectionTitle, marginBottom: 14 }}>Sales by Hour (selected day)</div>
        <HourlyHeatmap data={data?.hourly} loading={loading} />
      </motion.div>

      {/* Row 3: Monthly Revenue + Payment Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(280px,100%),1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33 }}
          className="glass-card" style={{ ...lightPanel, borderRadius: 18, padding: '1.25rem' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={sectionTitle}>Monthly Revenue</div>
            <div style={sectionSub}>Year to date</div>
          </div>
          <div style={{ height: 200 }}>
            {!loading && monthValues.length > 0 ? <Bar data={monthData} options={chartBase} /> : <EmptyChart loading={loading} />}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.37 }}
          className="glass-card" style={{ ...lightPanel, borderRadius: 18, padding: '1.25rem' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={14} style={{ color: C.accent }} />
              <div style={sectionTitle}>Payment Methods</div>
            </div>
            <div style={sectionSub}>Revenue split this month</div>
          </div>
          <PaymentDonut data={data?.payment} loading={loading} />
        </motion.div>
      </div>

      {/* Row 4: Top Customers + Recent Transactions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(320px,100%),1fr))', gap: '1rem' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.40 }}
          className="glass-card" style={{ ...lightPanel, borderRadius: 18, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Crown size={14} style={{ color: '#B45309' }} />
            <div>
              <div style={sectionTitle}>Top Customers</div>
              <div style={sectionSub}>By revenue this month</div>
            </div>
          </div>
          <TopCustomers data={data?.topCust} loading={loading} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}
          className="glass-card" style={{ ...lightPanel, borderRadius: 18, padding: '1.25rem' }}>
          <div style={{ ...sectionTitle, marginBottom: 14 }}>Recent Transactions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 300, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(7,27,82,0.12) transparent' }}>
            {loading
              ? [...Array(4)].map((_, i) => <div key={i} style={{ height: 44, borderRadius: 10, background: 'rgba(7,27,82,0.06)' }} className="animate-pulse" />)
              : (data?.recent || []).length === 0
                ? <div style={{ textAlign: 'center', color: C.muted, fontSize: '0.80rem', padding: '2rem 0' }}>No transactions today</div>
                : (data?.recent || []).map((tx, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.75rem', borderRadius: 10, background: C.rowBg, border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(11,95,255,0.08)', border: '1px solid rgba(11,95,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ShoppingCart size={12} style={{ color: C.accent }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.80rem', fontWeight: 600, color: C.body }}>{tx.invoice_number || `#${tx.id}`}</div>
                        <div style={{ fontSize: '0.63rem', color: C.muted }}>{tx.customer_name || 'Walk-in'} · {tx.payment_method || 'cash'}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.83rem', fontWeight: 700, color: C.positive }}>Rs. {Number(tx.total || 0).toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: '0.60rem', color: C.faint }}>
                        {tx.created_at ? new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>
        </motion.div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}
