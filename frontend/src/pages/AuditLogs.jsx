import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { ShieldCheck, RefreshCw, Search } from 'lucide-react'
import { auditAPI } from '../api'

const QUICK_FILTERS = [
  { key: '', label: 'All', category: '' },
  { key: 'security', label: 'Security', category: 'security' },
  { key: 'payables', label: 'Payables', category: 'payables' },
  { key: 'payables.mark_paid', label: 'Payments', category: '' },
  { key: 'payables.auto_generate', label: 'Auto', category: '' },
]

function formatDetail(detail) {
  if (detail == null) return '—'
  if (typeof detail === 'object') return JSON.stringify(detail)
  return String(detail)
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [username, setUsername] = useState('')
  const [category, setCategory] = useState('')
  const [privacy, setPrivacy] = useState(null)

  const load = (overrides = {}) => {
    const p = overrides.page ?? page
    const act = overrides.action !== undefined ? overrides.action : action
    const user = overrides.username !== undefined ? overrides.username : username
    const cat = overrides.category !== undefined ? overrides.category : category
    setLoading(true)
    auditAPI.getLogs({
      page: p,
      per_page: 50,
      action: act || undefined,
      username: user || undefined,
      category: cat || undefined,
    })
      .then(r => {
        setLogs(r.data?.logs || [])
        setTotal(r.data?.total || 0)
        setPrivacy(r.data?.privacy || null)
      })
      .catch(() => toast.error('Failed to load audit logs'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page])

  const onSearch = (e) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  return (
    <div className="page-content space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <ShieldCheck size={18} className="text-gold" /> Audit Logs
          </h2>
          <p className="text-txt-3 text-xs mt-1">
            Auto-audited security &amp; privacy trail — your store only, IPs masked, passwords redacted
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-xs flex items-center gap-2">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {privacy && (
        <div className="glass-card dgc-liquid-frosted p-3 text-xs text-txt-3 flex flex-wrap gap-3">
          <span>🔒 Tenant-scoped: {privacy.tenant_scoped ? 'yes' : 'platform'}</span>
          <span>IP masked: {privacy.ip_masked ? 'yes' : 'no'}</span>
          <span>PII redacted: {privacy.pii_redacted ? 'yes' : 'no'}</span>
        </div>
      )}

      <div className="dgc-submenu-bar flex-wrap">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.key || 'all'}
            type="button"
            onClick={() => {
              setAction(f.key)
              setCategory(f.category)
              setPage(1)
              load({ page: 1, action: f.key, category: f.category })
            }}
            className={`dgc-submenu-tab text-xs ${action === f.key && category === f.category ? 'active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSearch} className="glass-card p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs text-txt-3">
          Action
          <input
            value={action}
            onChange={e => setAction(e.target.value)}
            placeholder="e.g. sale.create"
            className="input-field min-w-[180px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-txt-3">
          Username
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="staff username"
            className="input-field min-w-[180px]"
          />
        </label>
        <button type="submit" className="btn-gold flex items-center gap-2">
          <Search size={14} /> Search
        </button>
      </form>

      {loading ? (
        <div className="glass-card p-8 text-center text-txt-3 text-sm">Loading audit logs...</div>
      ) : logs.length === 0 ? (
        <div className="glass-card p-8 text-center text-txt-3 text-sm">No audit entries found.</div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border text-left text-txt-3 text-xs uppercase tracking-wider">
                  <th className="p-3">Time</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Resource</th>
                  <th className="p-3">IP</th>
                  <th className="p-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <motion.tr
                    key={log.id || i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-glass-border/50 hover:bg-white/5"
                  >
                    <td className="p-3 text-txt-2 whitespace-nowrap">{log.created_at || '—'}</td>
                    <td className="p-3 font-medium text-txt">{log.username || '—'}</td>
                    <td className="p-3"><span className="badge-gold">{log.action || '—'}</span></td>
                    <td className="p-3 text-txt-2">{log.resource || '—'}{log.resource_id ? ` #${log.resource_id}` : ''}</td>
                    <td className="p-3 text-txt-3 text-xs whitespace-nowrap">{log.ip_address || '—'}</td>
                    <td className="p-3 text-txt-3 text-xs max-w-xs truncate" title={formatDetail(log.detail)}>
                      {formatDetail(log.detail)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 flex items-center justify-between text-xs text-txt-3 border-t border-glass-border">
            <span>{total} total entries</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-ghost text-xs">Prev</button>
              <span className="px-2 py-1">Page {page}</span>
              <button disabled={logs.length < 50} onClick={() => setPage(p => p + 1)} className="btn-ghost text-xs">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}