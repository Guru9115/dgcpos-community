import { useState, useEffect, useRef, useCallback } from 'react'
import { settingsAPI, authAPI, licenseAPI } from '../api'
import { IS_COMMUNITY } from '../edition'
import { setRuntimeEdition } from '../edition/runtime'
import { useAuth } from '../store/AuthContext'
import { useLock } from '../store/LockContext'
import { getLockSettings, saveLockSettings, getPin, savePin } from '../components/LockScreen'
import { getDeviceInfo } from '../hooks/useWakeLock'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Save, Shield, Building2, Receipt, Database, Users,
  Plus, X, Upload, Image, Eye, EyeOff, Trash2, Edit2, Key, UserCheck,
  RefreshCw, Download, GitBranch, Terminal, CheckCircle, AlertCircle, Sparkles,
  Cloud, CloudOff, HardDrive, Link, Unlink, FileJson, Zap, Rocket, PartyPopper,
  Lock, Timer, MonitorOff, CreditCard, ExternalLink, Crown, Clock, Mail, Smartphone,
  Copy, BadgeCheck, Hash,
} from 'lucide-react'
import { billingAPI } from '../api'
import TeamManageModal from '../components/team/TeamManageModal'

const ALL_ROLES = [
  { value: 'superadmin', label: 'Super Admin',   color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/30', platformOnly: true },
  { value: 'owner',      label: 'Owner',          color: 'text-gold',        bg: 'bg-gold/10 border-gold/30' },
  { value: 'manager',    label: 'Manager',        color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30' },
  { value: 'sales_staff',label: 'Sales Staff',    color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/30' },
  { value: 'staff',      label: 'Staff',          color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/30' },
  { value: 'operations_staff', label: 'Operations', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  { value: 'engineer',   label: 'Engineer',       color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/30' },
]

function assignableRoles(isSuperadmin) {
  return isSuperadmin ? ALL_ROLES : ALL_ROLES.filter(r => !r.platformOnly)
}

function displayUserEmail(email) {
  if (!email || email.endsWith('@staff.dgcpos.internal')) return ''
  return email
}

function RoleBadge({ role }) {
  const r = ALL_ROLES.find(x => x.value === role) || ALL_ROLES[3]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${r.bg} ${r.color}`}>
      {r.label}
    </span>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-glass-border flex items-center gap-3 bg-white/[0.02]">
        <Icon size={16} className="text-gold"/>
        <span className="font-display text-base font-semibold text-txt">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function UserModal({ user, onClose, onSaved }) {
  const { isSuperadmin } = useAuth()
  const roleOptions = assignableRoles(isSuperadmin())
  const editing = !!user?.id
  const [form, setForm] = useState({
    username: '', full_name: '', email: '', role: 'sales_staff',
    password: '', confirm: '', is_active: true,
    ...(user || {})
  })
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!editing && form.password !== form.confirm) { toast.error('Passwords do not match'); return }
    if (!editing && !form.password) { toast.error('Password is required'); return }
    setSaving(true)
    try {
      const email = (form.email || '').trim()
      const payload = {
        username: (form.username || '').trim(),
        full_name: (form.full_name || '').trim(),
        role: form.role,
        is_active: form.is_active,
      }
      if (email) payload.email = email
      else if (editing) payload.email = ''
      if (!editing) payload.password = form.password
      if (editing) await authAPI.updateUser(user.id, payload)
      else await authAPI.createUser(payload)
      toast.success(editing ? 'User updated' : 'Staff account created')
      onSaved()
    } catch (err) {
      const d = err.response?.data
      const fieldMsg = d?.fields && Object.values(d.fields).flat?.()[0]
      toast.error(d?.error || fieldMsg || 'Failed to save staff')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="modal-panel mx-4 max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold text-txt">{editing ? 'Edit User' : 'Add User'}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-glass text-txt-3 hover:text-txt transition-colors"><X size={16}/></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Full Name</label>
              <input className="input-field" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Full name" required />
            </div>
            <div>
              <label className="input-label">Username</label>
              <input className="input-field" value={form.username} onChange={e => set('username', e.target.value)} placeholder="username" required disabled={editing} />
            </div>
          </div>
          <div>
            <label className="input-label">Email <span className="text-txt-3 font-normal">(optional)</span></label>
            <input type="email" className="input-field" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Leave blank — staff signs in with username" />
          </div>
          <div>
            <label className="input-label">Role</label>
            <select className="input-field" value={form.role} onChange={e => set('role', e.target.value)}>
              {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Password</label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} className="input-field pr-9" value={form.password} onChange={e => set('password', e.target.value)} required />
                  <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-3">{showPwd ? <EyeOff size={13}/> : <Eye size={13}/>}</button>
                </div>
              </div>
              <div>
                <label className="input-label">Confirm Password</label>
                <input type={showPwd ? 'text' : 'password'} className="input-field" value={form.confirm} onChange={e => set('confirm', e.target.value)} required />
              </div>
            </div>
          )}
          {editing && (
            <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-glass-border rounded-xl">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-gold" />
              <label htmlFor="is_active" className="text-txt text-sm cursor-pointer">Active Account</label>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex-1 flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/> : <Check size={14}/>}
              {editing ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function ResetPasswordModal({ user, onClose }) {
  const [form, setForm] = useState({ new_password: '', confirm: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (form.new_password !== form.confirm) { toast.error('Passwords do not match'); return }
    setSaving(true)
    try {
      await authAPI.updateUser(user.id, { password: form.new_password })
      toast.success('Password reset!')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="modal-panel mx-4 max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-txt">Reset Password — {user.full_name || user.username}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-glass text-txt-3"><X size={16}/></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="input-label">New Password</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} className="input-field pr-9" value={form.new_password} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} required autoFocus />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-3">{showPwd ? <EyeOff size={13}/> : <Eye size={13}/>}</button>
            </div>
          </div>
          <div>
            <label className="input-label">Confirm Password</label>
            <input type={showPwd ? 'text' : 'password'} className="input-field" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex-1 flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/> : <Key size={14}/>}
              Reset
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Cinematic Update Overlay
   Shown full-screen while update is running / after completion
───────────────────────────────────────────────────────────────────────────── */

const UPDATE_STEPS = [
  { id: 'pull',    emoji: '📡', label: 'Pulling latest changes from server',  keywords: ['Pulling', 'pull', 'fetch', 'clone'] },
  { id: 'deps_be', emoji: '🐍', label: 'Installing backend dependencies',      keywords: ['backend dep', 'pip', 'requirements'] },
  { id: 'deps_fe', emoji: '📦', label: 'Installing frontend dependencies',     keywords: ['frontend dep', 'npm', 'node'] },
  { id: 'build',   emoji: '⚙️', label: 'Building frontend assets',             keywords: ['build', 'vite', 'bundl'] },
  { id: 'restart', emoji: '🔄', label: 'Restarting backend service',           keywords: ['restart', 'Restarting', 'complete'] },
]

function getStepState(stepIndex, log) {
  // Returns 'done' | 'active' | 'pending'
  const fullLog = log.join('\n').toLowerCase()
  // A step is done if any keyword of a LATER step is present
  const laterKeywords = UPDATE_STEPS.slice(stepIndex + 1).flatMap(s => s.keywords.map(k => k.toLowerCase()))
  if (laterKeywords.some(k => fullLog.includes(k))) return 'done'
  // A step is active if any of its keywords appear
  const myKeywords = UPDATE_STEPS[stepIndex].keywords.map(k => k.toLowerCase())
  if (myKeywords.some(k => fullLog.includes(k))) return 'active'
  return 'pending'
}

function UpdateOverlay({ log, isRunning, onClose, newVersion, oldVersion }) {
  const isComplete = log.some(l => l.toLowerCase().includes('complete') || l.toLowerCase().includes('✅ update complete'))
  const isError    = log.some(l => l.includes('❌'))

  /* overall progress 0-100 */
  const doneCount = UPDATE_STEPS.filter((_, i) => getStepState(i, log) === 'done').length
  const activeCount = UPDATE_STEPS.filter((_, i) => getStepState(i, log) === 'active').length
  const progress = isComplete ? 100 : Math.round(((doneCount + activeCount * 0.5) / UPDATE_STEPS.length) * 100)

  return (
    <AnimatePresence>
      {(isRunning || isComplete || isError) && (
        <motion.div
          key="update-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(3,6,12,0.97)',
            backdropFilter: 'blur(32px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
            padding: '1.5rem',
          }}
        >
          {/* Ambient orbs */}
          <div style={{ position: 'absolute', top: '15%', left: '12%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '15%', right: '12%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(11,95,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ width: '100%', maxWidth: 520, position: 'relative', zIndex: 1 }}>

            {/* ── Completion screen ── */}
            {isComplete && !isError ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                style={{ textAlign: 'center' }}
              >
                {/* Burst ring */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0.6] }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  style={{ width: 110, height: 110, borderRadius: '50%', background: 'rgba(52,211,153,0.12)', border: '2px solid rgba(52,211,153,0.35)', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(52,211,153,0.25)' }}
                >
                  <CheckCircle size={48} style={{ color: '#34D399' }} />
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                  <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.20em', color: '#34D399', textTransform: 'uppercase', marginBottom: 10 }}>
                    UPDATE COMPLETE
                  </div>
                  <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 'clamp(1.8rem,5vw,2.6rem)', fontWeight: 700, color: '#000000', lineHeight: 1.1, marginBottom: 14 }}>
                    System Updated<br />Successfully
                  </div>
                  {newVersion && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0.5rem 1.25rem', borderRadius: 999, background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)', marginBottom: 28 }}>
                      {oldVersion && <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.85rem', color: 'rgba(0,0,0,0.45)', textDecoration: 'line-through' }}>v{oldVersion}</span>}
                      {oldVersion && <span style={{ color: 'rgba(0,0,0,0.38)', fontSize: '0.80rem' }}>→</span>}
                      <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.95rem', fontWeight: 800, color: '#34D399' }}>v{newVersion}</span>
                    </div>
                  )}
                  <p style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.42)', marginBottom: 32, lineHeight: 1.6 }}>
                    All components have been updated.<br />The backend is restarting — please refresh the page in a moment.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => window.location.reload()}
                    style={{ padding: '0.75rem 2.5rem', borderRadius: 14, background: 'linear-gradient(135deg,#10B981,#34D399)', border: 'none', color: '#fff', fontSize: '0.90rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 24px rgba(52,211,153,0.35)' }}>
                    Reload App →
                  </motion.button>
                </motion.div>
              </motion.div>

            ) : isError ? (
              /* ── Error screen ── */
              <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center' }}>
                <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.30)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={40} style={{ color: '#F87171' }} />
                </div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.8rem', fontWeight: 700, color: '#000000', marginBottom: 10 }}>Update Failed</div>
                <p style={{ fontSize: '0.80rem', color: 'rgba(0,0,0,0.42)', marginBottom: 24 }}>An error occurred during the update. Check the log below.</p>
                <div style={{ background: 'rgba(0,0,0,0.50)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 12, padding: '0.875rem 1rem', maxHeight: 200, overflowY: 'auto', textAlign: 'left', marginBottom: 24 }}>
                  {log.map((line, i) => (
                    <div key={i} style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.72rem', color: line.includes('❌') ? '#F87171' : line.includes('✅') ? '#34D399' : 'rgba(255,255,255,0.45)', marginBottom: 3 }}>{line}</div>
                  ))}
                </div>
                <button onClick={onClose} style={{ padding: '0.60rem 1.75rem', borderRadius: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(0,0,0,0.70)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Close
                </button>
              </motion.div>

            ) : (
              /* ── Active update screen ── */
              <div>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 36 }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                    style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px', background: 'linear-gradient(135deg,rgba(37,99,235,0.20) 0%,rgba(11,95,255,0.15) 100%)', border: '2px solid rgba(59,130,246,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(37,99,235,0.20)' }}
                  >
                    <Rocket size={28} style={{ color: '#93C5FD' }} />
                  </motion.div>
                  <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.60rem', fontWeight: 700, letterSpacing: '0.22em', color: '#93C5FD', textTransform: 'uppercase', marginBottom: 8 }}>
                    SYSTEM UPDATE IN PROGRESS
                  </div>
                  <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.55rem', fontWeight: 700, color: '#000000' }}>
                    Updating RetailOS…
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.42)', marginTop: 8 }}>
                    Do not close this window or refresh the page.
                  </p>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 28, padding: '0 4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.08em' }}>PROGRESS</span>
                    <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.72rem', fontWeight: 700, color: '#93C5FD' }}>{progress}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                      style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#2563EB,#3B82F6,#60A5FA)', boxShadow: '0 0 12px rgba(59,130,246,0.60)' }}
                    />
                  </div>
                </div>

                {/* Steps */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {UPDATE_STEPS.map((step, i) => {
                    const state = getStepState(i, log)
                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.28 }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '0.75rem 1rem', borderRadius: 14,
                          background: state === 'active' ? 'rgba(59,130,246,0.08)' : state === 'done' ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${state === 'active' ? 'rgba(59,130,246,0.22)' : state === 'done' ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)'}`,
                          transition: 'all 0.35s ease',
                        }}
                      >
                        {/* Icon */}
                        <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                          background: state === 'active' ? 'rgba(59,130,246,0.15)' : state === 'done' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${state === 'active' ? 'rgba(59,130,246,0.28)' : state === 'done' ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.07)'}`,
                        }}>
                          {state === 'done'
                            ? <Check size={15} style={{ color: '#34D399' }} />
                            : state === 'active'
                              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}><RefreshCw size={14} style={{ color: '#93C5FD' }} /></motion.div>
                              : <span style={{ fontSize: '0.85rem', opacity: 0.4 }}>{step.emoji}</span>
                          }
                        </div>

                        {/* Label */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: state === 'done' ? '#34D399' : state === 'active' ? '#F8FAFC' : 'rgba(255,255,255,0.30)', transition: 'color 0.3s' }}>
                            {step.label}
                          </div>
                          {state === 'active' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: '0.68rem', color: '#93C5FD', marginTop: 2 }}>
                              In progress…
                            </motion.div>
                          )}
                          {state === 'done' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: '0.68rem', color: 'rgba(52,211,153,0.60)', marginTop: 2 }}>
                              Done
                            </motion.div>
                          )}
                        </div>

                        {/* Right indicator */}
                        <div style={{ flexShrink: 0 }}>
                          {state === 'active' && (
                            <div style={{ display: 'flex', gap: 3 }}>
                              {[0,1,2].map(j => (
                                <motion.div key={j} animate={{ opacity: [0.2,1,0.2], scale: [0.8,1,0.8] }} transition={{ duration: 1.2, delay: j*0.2, repeat: Infinity }}
                                  style={{ width: 5, height: 5, borderRadius: '50%', background: '#60A5FA' }} />
                              ))}
                            </div>
                          )}
                          {state === 'done' && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                              <CheckCircle size={16} style={{ color: '#34D399' }} />
                            </motion.div>
                          )}
                          {state === 'pending' && (
                            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.12)' }} />
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Live raw log */}
                <div style={{ marginTop: 20, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '0.75rem 1rem', maxHeight: 100, overflowY: 'auto' }}>
                  <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.65rem', color: 'rgba(0,0,0,0.38)', marginBottom: 6, letterSpacing: '0.10em' }}>LIVE LOG</div>
                  {log.map((line, i) => (
                    <div key={i} style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.68rem', marginBottom: 2,
                      color: line.includes('❌') ? '#F87171' : line.includes('✅') ? '#34D399' : line.includes('📦') || line.includes('🐍') || line.includes('🚀') ? '#E8C547' : 'rgba(255,255,255,0.38)'
                    }}>{line}</div>
                  ))}
                  <motion.div animate={{ opacity: [1,0] }} transition={{ duration: 0.7, repeat: Infinity, repeatType: 'reverse' }}
                    style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: '0.68rem', color: '#60A5FA' }}>▋</motion.div>
                </div>
              </div>
            )}
          </div>

          <style>{`
            @keyframes pulse-ring {
              0%,100% { box-shadow: 0 0 20px rgba(59,130,246,0.20); }
              50%      { box-shadow: 0 0 50px rgba(59,130,246,0.50); }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────────────────────────────────────────────────────────────────────── */

/* ── Lock Screen Settings Panel ─────────────────────────────────────── */
const TIMEOUT_OPTIONS = [
  { value: 1,   label: '1 minute'   },
  { value: 2,   label: '2 minutes'  },
  { value: 5,   label: '5 minutes'  },
  { value: 10,  label: '10 minutes' },
  { value: 15,  label: '15 minutes' },
  { value: 30,  label: '30 minutes' },
  { value: 60,  label: '1 hour'     },
  { value: 120, label: '2 hours'    },
]

const PIN_STEPS = { idle: 'idle', current: 'current', new: 'new', confirm: 'confirm' }

function PinChangeFlow({ onDone }) {
  const [step,   setStep]   = useState(PIN_STEPS.current)
  const [input,  setInput]  = useState('')
  const [newPin, setNewPin] = useState('')
  const [error,  setError]  = useState('')
  const PIN_LEN = 4

  const handleDigit = (d) => {
    if (input.length >= PIN_LEN) return
    const next = input + d
    setInput(next)
    setError('')
    if (next.length < PIN_LEN) return

    if (step === PIN_STEPS.current) {
      if (next !== getPin()) { setError('Incorrect current PIN'); setTimeout(() => { setInput(''); setError('') }, 700); return }
      setTimeout(() => { setStep(PIN_STEPS.new); setInput('') }, 200)
    } else if (step === PIN_STEPS.new) {
      setNewPin(next)
      setTimeout(() => { setStep(PIN_STEPS.confirm); setInput('') }, 200)
    } else if (step === PIN_STEPS.confirm) {
      if (next !== newPin) { setError('PINs do not match'); setTimeout(() => { setInput(''); setError('') }, 700); return }
      savePin(next)
      setTimeout(() => onDone('PIN updated successfully'), 300)
    }
  }

  const label = step === PIN_STEPS.current ? 'Enter current PIN'
    : step === PIN_STEPS.new ? 'Enter new PIN'
    : 'Confirm new PIN'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, alignItems:'center', padding:'16px 0 4px' }}>
      <div style={{ fontSize:'0.78rem', color: error ? '#F87171' : 'rgba(255,255,255,0.50)', fontWeight:600, minHeight:20 }}>
        {error || label}
      </div>
      {/* Dots */}
      <div style={{ display:'flex', gap:10 }}>
        {Array.from({ length: PIN_LEN }).map((_, i) => (
          <div key={i} style={{
            width:12, height:12, borderRadius:'50%',
            background: input.length > i ? '#0B5FFF' : 'rgba(255,255,255,0.15)',
            border: `2px solid ${input.length > i ? '#0B5FFF' : 'rgba(255,255,255,0.22)'}`,
            transition:'background 0.12s, border-color 0.12s',
          }}/>
        ))}
      </div>
      {/* Mini numpad */}
      <div style={{ display:'grid', gridTemplateRows:'repeat(4,1fr)', gap:7, width:'100%', maxWidth:220 }}>
        {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']].map((row,ri) => (
          <div key={ri} style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
            {row.map((k,ki) => k === '' ? <div key={ki}/> : (
              <button key={ki} onClick={() => k === '⌫' ? setInput(v => v.slice(0,-1)) : handleDigit(k)}
                style={{ height:48, borderRadius:12, border: k==='⌫' ? '1px solid rgba(239,68,68,0.22)' : '1px solid rgba(255,255,255,0.09)', background: k==='⌫' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)', color: k==='⌫' ? '#F87171' : '#F8FAFC', fontSize:'1.25rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit', touchAction:'manipulation' }}>
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function LockSettingsPanel() {
  const { lock, cfg, updateCfg } = useLock() || {}
  const [localCfg,   setLocalCfg]   = useState(() => cfg || getLockSettings())
  const [changingPin, setChangingPin] = useState(false)
  const [pinMsg,      setPinMsg]      = useState('')

  const handleChange = (patch) => {
    const next = { ...localCfg, ...patch }
    setLocalCfg(next)
    updateCfg?.(patch)
  }

  return (
    <Section icon={Lock} title="Lock Screen & Auto-Lock">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Enable toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MonitorOff size={16} style={{ color: localCfg.enabled ? '#0B5FFF' : 'rgba(255,255,255,0.25)' }} />
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#000000' }}>Auto-Lock Screen</div>
              <div style={{ fontSize: '0.71rem', color: 'rgba(0,0,0,0.42)' }}>Lock after inactivity timeout</div>
            </div>
          </div>
          <button
            onClick={() => handleChange({ enabled: !localCfg.enabled })}
            style={{ width: 44, height: 24, borderRadius: 999, background: localCfg.enabled ? 'linear-gradient(135deg, #071B52, #0B5FFF)' : 'rgba(255,255,255,0.10)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
          >
            <div style={{ position: 'absolute', top: 3, left: localCfg.enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', transition: 'left 0.2s' }} />
          </button>
        </div>

        {/* Timeout selector */}
        {localCfg.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Timer size={14} style={{ color: 'rgba(0,0,0,0.45)' }} />
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(0,0,0,0.60)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Auto-Lock After</label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {TIMEOUT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handleChange({ timeoutMinutes: opt.value })}
                  style={{ padding: '8px 10px', borderRadius: 10, border: localCfg.timeoutMinutes === opt.value ? '1px solid rgba(11,95,255,0.50)' : '1px solid rgba(255,255,255,0.07)', background: localCfg.timeoutMinutes === opt.value ? 'rgba(11,95,255,0.12)' : 'rgba(255,255,255,0.03)', color: localCfg.timeoutMinutes === opt.value ? '#E8C547' : 'rgba(255,255,255,0.45)', fontSize: '0.78rem', fontWeight: localCfg.timeoutMinutes === opt.value ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Change PIN */}
        <div style={{ borderRadius: 12, border: '1px solid rgba(11,95,255,0.18)', background: 'rgba(11,95,255,0.04)', overflow: 'hidden' }}>
          <button
            onClick={() => { setChangingPin(v => !v); setPinMsg('') }}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Lock size={15} style={{ color:'rgba(11,95,255,0.70)' }}/>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontSize:'0.84rem', fontWeight:700, color:'#0A0C12' }}>Change Lock PIN</div>
                <div style={{ fontSize:'0.70rem', color:'#2C3650' }}>Default PIN is 1234 — change it now</div>
              </div>
            </div>
            <span style={{ fontSize:'0.75rem', color:'rgba(11,95,255,0.60)', fontWeight:700 }}>{changingPin ? '▲ Cancel' : '▼ Change'}</span>
          </button>
          {changingPin && (
            <div style={{ borderTop:'1px solid rgba(11,95,255,0.12)', padding:'4px 16px 16px' }}>
              {pinMsg
                ? <div style={{ padding:'12px 0', textAlign:'center', fontSize:'0.82rem', color:'#6EE7B7', fontWeight:700 }}>✓ {pinMsg}</div>
                : <PinChangeFlow onDone={(msg) => { setPinMsg(msg); setTimeout(() => setChangingPin(false), 1500) }} />
              }
            </div>
          )}
        </div>

        {/* Lock Now */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => lock?.()}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'0.55rem 1.1rem', borderRadius:10, border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.08)', color:'#F87171', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            <Lock size={13} />
            Lock Screen Now
          </button>
          <span style={{ fontSize: '0.68rem', color: 'rgba(0,0,0,0.38)' }}>Instantly lock the screen</span>
        </div>

      </div>
    </Section>
  )
}

export default function Settings() {
  const { user, hasRole, isSuperadmin } = useAuth()
  const visibleRoleLegend = assignableRoles(isSuperadmin())
  const [settings, setSettings] = useState({})
  const [users, setUsers] = useState([])
  const [tab, setTab] = useState('store')
  const [saving, setSaving] = useState(false)
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [userModal, setUserModal] = useState(null)   // null | 'new' | user object
  const [resetModal, setResetModal] = useState(null) // null | user object
  const [teamManage, setTeamManage] = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef()
  const [version, setVersion] = useState(null)
  const [billing, setBilling] = useState({
    plans: [],
    account: null,
    stripe_enabled: false,
    business_category: null,
    service_modules: [],
    pending_premium_requests: [],
    billing_mode: 'manual',
  })
  const [billingLoading, setBillingLoading] = useState(false)
  const [requestingModule, setRequestingModule] = useState(null)
  const [license, setLicense] = useState({ licensed: false, edition: 'community', label: 'Community' })
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [updateStatus,  setUpdateStatus]  = useState(null) // null | 'checking' | 'running' | result
  const [updateLog,     setUpdateLog]     = useState([])
  const [showOverlay,   setShowOverlay]   = useState(false)
  const [oldVersion,    setOldVersion]    = useState(null)
  const logIntervalRef = useRef(null)

  const loadUsers = () => authAPI.getUsers().then(r => setUsers(r.data))

  useEffect(() => {
    settingsAPI.getAll().then(r => setSettings(r.data))
    if (hasRole('owner', 'manager', 'superadmin')) loadUsers()
    settingsAPI.getVersion().then(r => setVersion(r.data)).catch(() => {})
    if (IS_COMMUNITY) {
      licenseAPI.getStatus()
        .then((r) => {
          setLicense(r.data || {})
          setRuntimeEdition(r.data || {})
        })
        .catch(() => {})
    }
    if (hasRole('owner', 'superadmin')) {
      Promise.all([billingAPI.getPlans(), billingAPI.getStatus()])
        .then(([plansRes, statusRes]) => {
          setBilling({
            plans: plansRes.data?.plans || [],
            account: statusRes.data?.account || user?.account || null,
            stripe_enabled: !!plansRes.data?.stripe_enabled,
            business_category: statusRes.data?.business_category || null,
            service_modules: statusRes.data?.service_modules || [],
            pending_premium_requests: statusRes.data?.pending_premium_requests || [],
            billing_mode: statusRes.data?.billing_mode || 'manual',
          })
        })
        .catch(() => {})
    }
  }, [])

  const checkUpdate = async () => {
    setUpdateStatus('checking')
    setUpdateLog([])
    try {
      const r = await settingsAPI.checkUpdate()
      setUpdateStatus(r.data)
    } catch { setUpdateStatus({ can_update: false, message: 'Failed to check for updates' }) }
  }

  const applyUpdate = async () => {
    if (!window.confirm('Apply update now? The system will restart automatically.')) return
    // Capture current version before update
    setOldVersion(version?.version || null)
    setUpdateStatus('running')
    setUpdateLog(['🚀 Starting update process...'])
    setShowOverlay(true)
    try {
      await settingsAPI.applyUpdate({ method: 'git' })
      logIntervalRef.current = setInterval(async () => {
        try {
          const r = await settingsAPI.getUpdateLog()
          setUpdateLog(r.data.log || [])
          const done = r.data.log?.some(l =>
            l.toLowerCase().includes('complete') ||
            l.includes('✅ Update complete') ||
            l.includes('❌')
          )
          if (done) {
            clearInterval(logIntervalRef.current)
            setUpdateStatus('done')
            // Fetch new version after update
            try {
              const vr = await settingsAPI.getVersion()
              if (vr.data?.version) setVersion(vr.data)
            } catch {}
          }
        } catch {}
      }, 1000)
    } catch (err) {
      setUpdateLog(l => [...l, '❌ Failed to start update: ' + (err?.message || 'unknown error')])
      setUpdateStatus('error')
    }
  }

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const saveSettings = async () => {
    setSaving(true)
    try {
      await settingsAPI.update(settings)
      toast.success('Settings saved ✓')
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (pwForm.new_password !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    try {
      await authAPI.changePassword({ current_password: pwForm.current_password, new_password: pwForm.new_password })
      toast.success('Password changed!')
      setPwForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
  }

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      setLogoUploading(true)
      try {
        await settingsAPI.uploadLogo(ev.target.result)
        setSettings(s => ({ ...s, shop_logo: ev.target.result }))
        toast.success('Logo uploaded!')
      } catch { toast.error('Failed to upload logo') } finally { setLogoUploading(false) }
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = async () => {
    try {
      await settingsAPI.update({ shop_logo: '' })
      setSettings(s => ({ ...s, shop_logo: '' }))
      toast.success('Logo removed')
    } catch { toast.error('Failed') }
  }

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return
    try {
      await authAPI.deleteUser(u.id)
      toast.success('User deleted')
      loadUsers()
    } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
  }

  const handleBackup = async () => {
    try {
      const r = await settingsAPI.backup()
      toast.success(r.data.message || `Backup created: ${r.data.file}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Backup failed')
    }
  }

  const [backupMeta, setBackupMeta] = useState({
    format: 'account_export',
    icloud_available: false,
    credentials_configured: false,
    owner_email: '',
    gdrive: { connected: false, email: null },
    loading: true,
  })
  const [backupDownloading, setBackupDownloading] = useState(false)
  const [emailBackupTo, setEmailBackupTo] = useState('')
  const [emailBackupSending, setEmailBackupSending] = useState(false)

  const [gdrive, setGdrive] = useState({ connected: false, email: null, credentials_configured: false, loading: true })
  const [gdriveUploading, setGdriveUploading] = useState(false)
  const [showCredsInput, setShowCredsInput] = useState(false)
  const [credsText, setCredsText] = useState('')
  const credsFileRef = useRef()

  const loadBackupStatus = async () => {
    try {
      const r = await settingsAPI.backupStatus()
      setBackupMeta({ ...r.data, loading: false })
      setGdrive({
        ...r.data.gdrive,
        credentials_configured: r.data.credentials_configured,
        loading: false,
      })
      if (!emailBackupTo && r.data.owner_email) {
        setEmailBackupTo(r.data.owner_email)
      }
    } catch {
      setBackupMeta(m => ({ ...m, loading: false }))
      setGdrive({ connected: false, email: null, credentials_configured: false, loading: false })
    }
  }

  useEffect(() => { loadBackupStatus() }, [])

  const downloadBackup = async () => {
    setBackupDownloading(true)
    try {
      const r = await settingsAPI.backupDownload()
      const blob = r.data
      const cd = r.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^";]+)"?/)
      const filename = match?.[1] || `DGRetailOS_backup_${Date.now()}.dgcbackup`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded ${filename} — save to Files or iCloud Drive`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Download failed')
    } finally {
      setBackupDownloading(false)
    }
  }

  const emailBackup = async () => {
    const to = emailBackupTo.trim()
    if (!to) { toast.error('Enter your Gmail or email address'); return }
    setEmailBackupSending(true)
    try {
      const r = await settingsAPI.backupEmail(to)
      toast.success(r.data.message || `Backup sent to ${to}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Email backup failed')
    } finally {
      setEmailBackupSending(false)
    }
  }

  const connectGdrive = async () => {
    try {
      const r = await settingsAPI.gdriveAuth()
      window.open(r.data.auth_url, '_blank', 'width=500,height=600')
      // Poll for connection every 2s for up to 60s
      let tries = 0
      const poll = setInterval(async () => {
        tries++
        const s = await settingsAPI.gdriveStatus()
        if (s.data.connected) {
          clearInterval(poll)
          setGdrive({ ...s.data, loading: false })
          setBackupMeta(m => ({ ...m, gdrive: { connected: true, email: s.data.email } }))
          toast.success('Google Drive connected!')
        }
        if (tries > 30) clearInterval(poll)
      }, 2000)
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed'
      if (err.response?.data?.error === 'credentials_missing') {
        setShowCredsInput(true)
        toast.error('Upload your Google credentials.json first')
      } else {
        toast.error(msg)
      }
    }
  }

  const uploadCreds = async () => {
    if (!credsText.trim()) { toast.error('Paste your credentials JSON'); return }
    try {
      await settingsAPI.gdriveUploadCreds(credsText)
      toast.success('Credentials saved! Now click Connect.')
      setShowCredsInput(false)
      setCredsText('')
    } catch (err) { toast.error(err.response?.data?.error || 'Invalid credentials') }
  }

  const handleCredsFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCredsText(ev.target.result)
    reader.readAsText(file)
  }

  const disconnectGdrive = async () => {
    if (!confirm('Disconnect Google Drive?')) return
    await settingsAPI.gdriveDisconnect()
    setGdrive({ connected: false, email: null, loading: false })
    toast.success('Disconnected')
  }

  const backupToGdrive = async () => {
    setGdriveUploading(true)
    try {
      const r = await settingsAPI.gdriveBackup()
      toast.success(`Uploaded to Google Drive: ${r.data.file}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
    } finally { setGdriveUploading(false) }
  }

  const startCheckout = async (planId) => {
    setBillingLoading(true)
    try {
      const res = await billingAPI.checkout({ plan: planId })
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url
        return
      }
      if (res.data?.account) {
        setBilling(b => ({ ...b, account: res.data.account }))
        toast.success(res.data.message || 'Plan updated')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Checkout failed')
    } finally { setBillingLoading(false) }
  }

  const openPortal = async () => {
    setBillingLoading(true)
    try {
      const res = await billingAPI.portal()
      if (res.data?.portal_url) window.location.href = res.data.portal_url
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not open billing portal')
    } finally { setBillingLoading(false) }
  }

  const refreshBillingStatus = async () => {
    try {
      const statusRes = await billingAPI.getStatus()
      setBilling((b) => ({
        ...b,
        account: statusRes.data?.account || b.account,
        business_category: statusRes.data?.business_category || null,
        service_modules: statusRes.data?.service_modules || [],
        pending_premium_requests: statusRes.data?.pending_premium_requests || [],
        billing_mode: statusRes.data?.billing_mode || 'manual',
      }))
    } catch { /* ignore */ }
  }

  const requestPremiumModule = async (moduleKey, moduleLabel) => {
    const note = window.prompt(`Optional note for superadmin (${moduleLabel}):`) ?? ''
    setRequestingModule(moduleKey)
    try {
      await billingAPI.requestPremiumModule({ module_key: moduleKey, note })
      toast.success('Premium service request sent — superadmin will enable after manual billing')
      await refreshBillingStatus()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Request failed')
    } finally { setRequestingModule(null) }
  }

  const activateLicense = async () => {
    const key = licenseKey.trim()
    if (!key) { toast.error('Enter your Enterprise license key'); return }
    setLicenseLoading(true)
    try {
      const res = await licenseAPI.activate(key)
      setLicense(res.data || {})
      setRuntimeEdition(res.data || {})
      setLicenseKey('')
      toast.success('Enterprise license activated — restart may be required for all modules')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Activation failed')
    } finally { setLicenseLoading(false) }
  }

  const deactivateLicense = async () => {
    if (!window.confirm('Remove the Enterprise license from this installation?')) return
    setLicenseLoading(true)
    try {
      const res = await licenseAPI.deactivate()
      setLicense(res.data || {})
      setRuntimeEdition(res.data || {})
      toast.success('License removed')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove license')
    } finally { setLicenseLoading(false) }
  }

  const tabs = [
    { k: 'store',    label: 'Merchant Profile',  icon: Building2 },
    { k: 'receipt',  label: 'Receipt',     icon: Receipt },
    { k: 'billing',  label: 'Billing',     icon: CreditCard, roles: ['owner', 'superadmin'] },
    ...(IS_COMMUNITY ? [{ k: 'license', label: 'Enterprise License', icon: Crown, roles: ['owner', 'superadmin'] }] : []),
    { k: 'security', label: 'Security',    icon: Shield },
    { k: 'users',    label: 'Team Access', icon: Users, roles: ['owner', 'manager', 'superadmin'] },
    { k: 'backup',   label: 'Backup',      icon: Database },
    { k: 'system',   label: 'System',      icon: RefreshCw },
  ].filter(t => !t.roles || hasRole(...t.roles))

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div><h2 className="section-title">Settings</h2></div>

      {/* Tabs */}
      <div className="dgc-submenu-bar">
        {tabs.map(t => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)}
            className={`dgc-submenu-tab ${tab === t.k ? 'active' : ''}`}>
            <t.icon size={12}/><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── BILLING ── */}
      {tab === 'billing' && (
        <Section icon={CreditCard} title="Subscription & Billing">
          {billing.account && (
            <div className="mb-5 p-4 rounded-xl border border-glass-border bg-white/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-txt-3 text-[10px] uppercase tracking-wider font-bold mb-1">Current plan</p>
                  <p className="text-txt font-semibold text-lg m-0 capitalize">{billing.account.subscription_plan || 'beta'}</p>
                  <p className="text-txt-3 text-xs m-0 mt-1">
                    Status: <span className={billing.account.subscription_active ? 'text-emerald-400' : 'text-red-400'}>{billing.account.subscription_status}</span>
                    {billing.account.trial_ends_at && <> · Trial ends {new Date(billing.account.trial_ends_at).toLocaleDateString()}</>}
                  </p>
                  {(billing.account.subscription_locked || billing.account.subscription_plan === 'beta' || billing.account.subscription_plan === 'beta_guest') && (
                    <p className="text-txt-2 text-xs m-0 mt-2">
                      Public beta — subscriptions locked. Includes 1 store admin and up to {billing.account.max_staff || 10} staff seats.
                    </p>
                  )}
                </div>
                {billing.account.stripe_customer_id && billing.stripe_enabled && !billing.account.subscription_locked && (
                  <button onClick={openPortal} disabled={billingLoading} className="btn-ghost text-xs flex items-center gap-2">
                    <ExternalLink size={12} /> Manage in Stripe
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {billing.plans.filter(p => p.id !== 'beta' && p.id !== 'beta_guest').map(plan => (
              <div key={plan.id} className="p-4 rounded-xl border border-glass-border bg-white/[0.02] flex flex-col">
                <p className="text-txt font-semibold m-0">{plan.name}</p>
                <p className="text-gold text-2xl font-bold m-0 mt-2">${plan.price_monthly}<span className="text-txt-3 text-sm font-normal">/mo</span></p>
                <p className="text-txt-3 text-xs mt-2 mb-3 flex-1">{plan.description}</p>
                <ul className="text-xs text-txt-2 space-y-1 mb-4">
                  {(plan.features || []).map(f => <li key={f}>• {f}</li>)}
                </ul>
                <button
                  onClick={() => startCheckout(plan.id)}
                  disabled={billingLoading || billing.account?.subscription_plan === plan.id || billing.account?.subscription_locked}
                  className="btn-gold text-xs py-2 w-full"
                >
                  {billing.account?.subscription_locked ? 'Locked during beta' : billing.account?.subscription_plan === plan.id ? 'Current Plan' : `Choose ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
          {!billing.stripe_enabled && (
            <p className="text-txt-3 text-xs mt-4">Stripe not configured — plan changes apply in dev mode for testing.</p>
          )}

          {(billing.business_category || billing.service_modules?.length > 0) && (
            <div className="mt-6 pt-6 border-t border-glass-border">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <p className="text-txt font-semibold m-0 flex items-center gap-2">
                    <Crown size={14} className="text-amber-500" /> Premium services
                  </p>
                  <p className="text-txt-3 text-xs m-0 mt-1">
                    {billing.business_category?.label || 'Your category'} · manual billing — request add-ons; superadmin approves in Command Center
                  </p>
                </div>
                {billing.billing_mode === 'manual' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600">
                    Manual billing
                  </span>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {(billing.service_modules || []).map((mod) => {
                  const pending = (billing.pending_premium_requests || []).some(
                    (r) => r.module_key === mod.key && r.status === 'pending',
                  )
                  return (
                    <div
                      key={mod.key}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-glass-border bg-white/[0.02]"
                    >
                      <div className="min-w-0">
                        <p className="text-txt text-sm font-semibold m-0 flex items-center gap-1.5 flex-wrap">
                          {mod.label}
                          {mod.premium && (
                            <span className="text-[9px] font-bold uppercase text-amber-500 flex items-center gap-0.5">
                              <Crown size={9} /> Premium
                            </span>
                          )}
                        </p>
                        <p className="text-txt-3 text-[10px] m-0 mt-0.5">
                          {mod.enabled
                            ? mod.manually_granted
                              ? 'Enabled by superadmin (manual billing)'
                              : 'Included in your plan'
                            : mod.superadmin_only
                              ? 'Superadmin activation only — contact DGC support'
                              : mod.premium
                                ? 'Not enabled — request from superadmin'
                                : 'Not available for your category'}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {mod.enabled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                            <CheckCircle size={12} /> Active
                          </span>
                        ) : mod.superadmin_only ? (
                          <span className="text-[10px] font-bold text-txt-3 uppercase tracking-wide">DGC only</span>
                        ) : mod.premium && !pending ? (
                          <button
                            type="button"
                            onClick={() => requestPremiumModule(mod.key, mod.label)}
                            disabled={requestingModule === mod.key}
                            className="btn-gold text-[10px] py-1.5 px-2.5"
                          >
                            {requestingModule === mod.key ? 'Sending…' : 'Request'}
                          </button>
                        ) : pending ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
                            <Clock size={12} /> Pending
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Section>
      )}

      {tab === 'license' && IS_COMMUNITY && (
        <Section icon={Crown} title="Enterprise License">
          <div className="space-y-4 max-w-xl">
            <div className="p-4 rounded-xl border border-glass-border bg-white/[0.02]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-txt-3 m-0">Current edition</p>
              <p className="text-txt font-semibold text-lg m-0 mt-1">{license.label || 'Community'}</p>
              {license.licensed ? (
                <div className="text-txt-3 text-xs mt-2 space-y-1">
                  {license.customer_id && <p className="m-0">Customer ID: <span className="text-txt">{license.customer_id}</span></p>}
                  {license.expires_at && <p className="m-0">Expires: {new Date(license.expires_at).toLocaleDateString()}</p>}
                  {license.max_staff && <p className="m-0">Staff seats: {license.max_staff}</p>}
                  {license.key_fingerprint && <p className="m-0 font-mono text-[10px]">Key: …{license.key_fingerprint}</p>}
                </div>
              ) : (
                <p className="text-txt-3 text-xs m-0 mt-2">
                  Self-hosted Community Edition. Enter a commercial Enterprise license to unlock advanced modules on your private EE deployment.
                </p>
              )}
            </div>

            {!license.licensed && hasRole('owner', 'superadmin') && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-txt-2">License key</label>
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="DGC-ENT-…"
                  className="input-glass w-full font-mono text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={activateLicense}
                  disabled={licenseLoading}
                  className="btn-gold text-sm"
                >
                  {licenseLoading ? 'Activating…' : 'Activate Enterprise'}
                </button>
              </div>
            )}

            {license.licensed && license.source !== 'env' && hasRole('owner', 'superadmin') && (
              <button type="button" onClick={deactivateLicense} disabled={licenseLoading} className="btn-ghost text-xs text-red-400">
                Remove license
              </button>
            )}

            <p className="text-txt-3 text-[10px] m-0">
              Purchase a self-hosted Enterprise license at{' '}
              <a href="https://dgcpos.net/pricing" target="_blank" rel="noreferrer" className="text-gold hover:underline">dgcpos.net/pricing</a>
              {' '}or contact <a href="mailto:support@dgcpos.net" className="text-gold hover:underline">support@dgcpos.net</a>.
            </p>
          </div>
        </Section>
      )}

      {/* ── STORE INFO ── */}
      {tab === 'store' && (
        <>
        <Section icon={BadgeCheck} title="DGC Merchant Profile">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] items-start">
            <div className="p-4 rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-blue-500/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-txt-3 m-0">Your merchant customer ID</p>
              <p className="text-txt-3 text-xs m-0 mt-1 mb-3">
                Use this ID for billing, support, and admin reference. Assigned automatically — contact DGC if you need help.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-lg md:text-xl font-bold text-gold tracking-wide px-3 py-2 rounded-xl bg-black/20 border border-gold/20">
                  {user?.merchant_customer_id || billing.account?.merchant_customer_id || 'Assigning…'}
                </code>
                {(user?.merchant_customer_id || billing.account?.merchant_customer_id) && (
                  <button
                    type="button"
                    className="btn-ghost text-xs flex items-center gap-1.5"
                    onClick={() => {
                      const id = user?.merchant_customer_id || billing.account?.merchant_customer_id
                      navigator.clipboard.writeText(id)
                      toast.success('Merchant ID copied')
                    }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2 text-xs min-w-[200px]">
              <div className="p-3 rounded-xl border border-glass-border bg-white/[0.02]">
                <p className="text-[10px] uppercase tracking-wide text-txt-3 m-0">Store</p>
                <p className="text-txt font-semibold m-0 mt-1">{billing.account?.name || settings.shop_name || '—'}</p>
              </div>
              <div className="p-3 rounded-xl border border-glass-border bg-white/[0.02]">
                <p className="text-[10px] uppercase tracking-wide text-txt-3 m-0">Category</p>
                <p className="text-txt font-semibold m-0 mt-1">{billing.business_category?.label || billing.account?.business_type || '—'}</p>
              </div>
              <div className="p-3 rounded-xl border border-glass-border bg-white/[0.02]">
                <p className="text-[10px] uppercase tracking-wide text-txt-3 m-0 flex items-center gap-1"><Hash size={10} /> Account #</p>
                <p className="text-txt font-semibold m-0 mt-1">{billing.account?.id || user?.account_id || '—'}</p>
              </div>
              {billing.account?.created_at && (
                <div className="p-3 rounded-xl border border-glass-border bg-white/[0.02]">
                  <p className="text-[10px] uppercase tracking-wide text-txt-3 m-0">Member since</p>
                  <p className="text-txt font-semibold m-0 mt-1">{new Date(billing.account.created_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        </Section>
        <Section icon={Building2} title="Store Information">
          {/* Logo Upload */}
          <div className="mb-6 pb-6 border-b border-glass-border">
            <label className="input-label mb-3 block">Shop Logo</label>
            <div className="flex items-center gap-5">
              {/* Preview */}
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-glass-border bg-white/[0.02] flex items-center justify-center overflow-hidden flex-shrink-0">
                {settings.shop_logo ? (
                  <img src={settings.shop_logo} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="text-center">
                    <Image size={20} className="text-txt-3 mx-auto mb-1"/>
                    <div className="text-txt-3 text-[9px] uppercase tracking-wide">No Logo</div>
                  </div>
                )}
              </div>
              {/* Actions */}
              <div className="space-y-2">
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                  className="btn-gold flex items-center gap-2 text-xs px-4 py-2">
                  {logoUploading
                    ? <div className="w-3 h-3 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/>
                    : <Upload size={12}/>}
                  {settings.shop_logo ? 'Change Logo' : 'Upload Logo'}
                </button>
                {settings.shop_logo && (
                  <button onClick={removeLogo} className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 px-4 py-2 rounded-xl hover:bg-red-500/5 transition-all">
                    <Trash2 size={12}/> Remove Logo
                  </button>
                )}
                <p className="text-txt-3 text-[10px]">PNG, JPG, SVG · Max 2MB</p>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { k: 'shop_name', label: 'Shop Name' }, { k: 'shop_pan', label: 'PAN Number (VAT)' },
              { k: 'shop_address', label: 'Address' }, { k: 'shop_phone', label: 'Phone' },
              { k: 'shop_email', label: 'Email' },
              { k: 'currency', label: 'Currency Symbol' }, { k: 'tax_rate', label: 'Default Tax Rate (%)' },
              { k: 'loyalty_points_rate', label: 'Points earned per Rs.' }, { k: 'points_redemption_rate', label: 'Rs. value per point' },
              { k: 'vip_threshold', label: 'VIP Threshold (Rs.)' },
            ].map(({ k, label }) => (
              <div key={k}>
                <label className="input-label">{label}</label>
                <input className="input-field" value={settings[k] || ''} onChange={e => set(k, e.target.value)}/>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <button onClick={saveSettings} disabled={saving} className="btn-gold flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/> : <Save size={14}/>}
              Save Changes
            </button>
          </div>
        </Section>
        </>
      )}

      {/* ── RECEIPT ── */}
      {tab === 'receipt' && (
        <Section icon={Receipt} title="Receipt Settings">
          <div className="space-y-4">
            <div><label className="input-label">Receipt Footer Message</label>
              <textarea className="input-field h-24 resize-none" value={settings.receipt_footer || ''} onChange={e => set('receipt_footer', e.target.value)} placeholder="Thank you for shopping!"/></div>
            <div className="p-4 bg-white/[0.02] border border-glass-border rounded-xl">
              <div className="text-txt-3 text-xs mb-3 uppercase tracking-widest font-semibold">Exchange & Refund Policy</div>
              <div className="text-txt-2 text-xs space-y-1.5">
                <div>• Exchange allowed within <strong className="text-txt">7 days</strong> with original receipt</div>
                <div>• Item must be unused, unwashed, with tags attached</div>
                <div className="text-red-400 font-semibold">• REFUND IS NOT AVAILABLE — Exchange only</div>
                <div className="text-red-400 font-semibold">• Price difference will NOT be returned if exchange item is lower in value</div>
              </div>
            </div>
            <button onClick={saveSettings} disabled={saving} className="btn-gold flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/> : <Save size={14}/>}
              Save
            </button>
          </div>
        </Section>
      )}

      {/* ── SECURITY ── */}
      {tab === 'security' && (
        <Section icon={Shield} title="Change Password">
          <form onSubmit={changePassword} className="space-y-3 max-w-sm">
            <div><label className="input-label">Current Password</label>
              <input type="password" className="input-field" value={pwForm.current_password} onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))}/></div>
            <div><label className="input-label">New Password</label>
              <input type="password" className="input-field" value={pwForm.new_password} onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))}/></div>
            <div><label className="input-label">Confirm New Password</label>
              <input type="password" className="input-field" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}/></div>
            <button type="submit" className="btn-gold flex items-center gap-2"><Shield size={14}/> Change Password</button>
          </form>
        </Section>
      )}

      {/* ── USERS ── */}
      {tab === 'users' && hasRole('owner', 'manager', 'superadmin') && (
        <Section icon={Users} title="Team Access">
          <p className="text-txt-3 text-xs mb-3">Manage staff logins, menus, passwords, and device sessions for your store. Online &amp; international payments are activated by DGC superadmin only.</p>
          <div className="flex items-center justify-between mb-4">
            <p className="text-txt-3 text-xs">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
            {hasRole('owner', 'manager', 'superadmin') && (
              <button onClick={() => setUserModal('new')} className="btn-gold flex items-center gap-2 text-xs px-4 py-2">
                <Plus size={12}/> Add User
              </button>
            )}
          </div>

          {/* Role legend */}
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleRoleLegend.map(r => <RoleBadge key={r.value} role={r.value}/>)}
          </div>

          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-glass-border rounded-xl hover:border-gold/20 transition-colors">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold text-sm font-bold flex-shrink-0">
                  {u.full_name?.[0] || u.username?.[0]}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-txt text-sm font-medium">{u.full_name || u.username}</span>
                    <RoleBadge role={u.role}/>
                    {!u.is_active && <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500/10 border border-red-500/30 text-red-400">Inactive</span>}
                    {u.id === user?.id && <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-glass-border text-txt-3">You</span>}
                  </div>
                  <div className="text-txt-3 text-xs mt-0.5">@{u.username}{displayUserEmail(u.email) ? ` · ${displayUserEmail(u.email)}` : ''}</div>
                </div>
                {/* Actions */}
                {hasRole('owner', 'manager', 'superadmin') && u.id !== user?.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setTeamManage(u)} className="p-2 rounded-xl hover:bg-glass text-txt-3 hover:text-gold transition-colors text-[10px] font-bold px-2" title="Manage access">
                      Manage
                    </button>
                    {hasRole('owner', 'superadmin') && (
                      <>
                        <button onClick={() => setUserModal(u)} className="p-2 rounded-xl hover:bg-glass text-txt-3 hover:text-gold transition-colors" title="Edit">
                          <Edit2 size={13}/>
                        </button>
                        <button onClick={() => setResetModal(u)} className="p-2 rounded-xl hover:bg-glass text-txt-3 hover:text-blue-400 transition-colors" title="Reset Password">
                          <Key size={13}/>
                        </button>
                        <button onClick={() => deleteUser(u)} className="p-2 rounded-xl hover:bg-glass text-txt-3 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 size={13}/>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── BACKUP ── */}
      {tab === 'backup' && (
        <div className="space-y-4">
          <Section icon={Database} title="Cloud Backup">
            <div className="space-y-3">
              <p className="text-txt-2 text-sm leading-relaxed">
                Back up your store to <span className="text-gold">Google Drive</span>, <span className="text-gold">Gmail</span>, or <span className="text-gold">iCloud Drive</span>.
                {backupMeta.format === 'account_export'
                  ? ' Cloud backups export your store data securely (products, sales, customers, settings).'
                  : ' Local dev mode backs up the full database file.'}
              </p>
              <div className="grid sm:grid-cols-3 gap-2 text-xs">
                {[
                  { icon: Cloud, label: 'Google Drive', desc: 'OAuth → DG RetailOS Backups folder' },
                  { icon: Mail, label: 'Gmail', desc: 'Email backup file to your inbox' },
                  { icon: Smartphone, label: 'iCloud', desc: 'Download → Save to Files → iCloud' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="p-3 rounded-xl bg-white/[0.03] border border-glass-border">
                    <div className="flex items-center gap-2 text-txt font-semibold mb-1">
                      <Icon size={14} className="text-gold"/> {label}
                    </div>
                    <div className="text-txt-3">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section icon={Mail} title="Gmail Backup">
            <div className="space-y-4">
              <p className="text-txt-3 text-xs leading-relaxed">
                Sends your backup file as an email attachment. Open Gmail on any device and save the attachment to Google Drive or forward to yourself for safekeeping.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={emailBackupTo}
                  onChange={e => setEmailBackupTo(e.target.value)}
                  placeholder="you@gmail.com"
                  className="flex-1 bg-white/[0.04] border border-glass-border rounded-xl px-4 py-2.5 text-txt text-sm focus:outline-none focus:border-gold/50"
                />
                <button
                  onClick={emailBackup}
                  disabled={emailBackupSending}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                >
                  {emailBackupSending
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Sending…</>
                    : <><Mail size={16}/> Email Backup to Gmail</>
                  }
                </button>
              </div>
            </div>
          </Section>

          <Section icon={Smartphone} title="iCloud Drive & Download">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <Cloud size={20} className="text-blue-400 flex-shrink-0 mt-0.5"/>
                <div>
                  <div className="text-blue-300 font-semibold text-sm">iPhone, iPad & Mac</div>
                  <div className="text-txt-3 text-xs mt-0.5">
                    Tap <span className="text-gold">Download Backup</span> → Share → Save to Files → iCloud Drive.
                    {backupMeta.icloud_available && (
                      <span className="block mt-1 text-green-400">Mac server: iCloud folder detected — server backup also syncs automatically.</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={downloadBackup}
                  disabled={backupDownloading}
                  className="btn-gold flex items-center gap-2 text-sm px-5 py-2.5 disabled:opacity-50"
                >
                  {backupDownloading
                    ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"/> Preparing…</>
                    : <><Download size={16}/> Download Backup</>
                  }
                </button>
                <button onClick={handleBackup} className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-txt-2 border border-glass-border transition-colors">
                  <HardDrive size={16}/> Server Backup (Mac / local)
                </button>
              </div>
            </div>
          </Section>

          <Section icon={Cloud} title="Google Drive Backup">
            <div className="space-y-4">

              {/* Status Card */}
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${gdrive.connected ? 'bg-green-500/10 border-green-500/30' : 'bg-white/[0.03] border-glass-border'}`}>
                {gdrive.connected
                  ? <><Cloud size={20} className="text-green-400 flex-shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <div className="text-green-400 font-semibold text-sm">Connected to Google Drive</div>
                        <div className="text-txt-3 text-xs truncate">{gdrive.email}</div>
                      </div>
                      <button onClick={disconnectGdrive} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition-colors">
                        <Unlink size={12}/> Disconnect
                      </button>
                    </>
                  : <><CloudOff size={20} className="text-txt-3 flex-shrink-0"/>
                      <div className="flex-1">
                        <div className="text-txt font-semibold text-sm">Not Connected</div>
                        <div className="text-txt-3 text-xs">Link your Google account to enable cloud backups</div>
                      </div>
                    </>
                }
              </div>

              {!gdrive.connected && !gdrive.credentials_configured && (
                <div className="p-4 bg-white/[0.02] border border-glass-border rounded-xl space-y-3">
                  <div className="text-txt text-sm font-semibold flex items-center gap-2">
                    <FileJson size={14} className="text-gold"/>
                    Step 1 — Upload Google OAuth Credentials
                  </div>
                  <p className="text-txt-3 text-xs leading-relaxed">
                    Go to <span className="text-gold">console.cloud.google.com</span> → APIs &amp; Services → Credentials → Create OAuth 2.0 Client ID (Web app) → add redirect URI from your admin → Download JSON.
                  </p>

                  {/* Toggle paste/file */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCredsInput(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-txt-2 text-xs transition-colors"
                    >
                      <FileJson size={12}/> {showCredsInput ? 'Hide' : 'Paste JSON'}
                    </button>
                    <button
                      onClick={() => credsFileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-txt-2 text-xs transition-colors"
                    >
                      <HardDrive size={12}/> Upload File
                    </button>
                    <input ref={credsFileRef} type="file" accept=".json" className="hidden" onChange={handleCredsFile}/>
                  </div>

                  {showCredsInput && (
                    <div className="space-y-2">
                      <textarea
                        value={credsText}
                        onChange={e => setCredsText(e.target.value)}
                        placeholder='Paste credentials.json content here...'
                        rows={5}
                        className="w-full bg-white/[0.04] border border-glass-border rounded-xl p-3 text-txt-2 text-xs font-mono resize-none focus:outline-none focus:border-gold/50"
                      />
                      <button
                        onClick={uploadCreds}
                        disabled={!credsText.trim()}
                        className="btn-gold text-xs px-4 py-1.5 disabled:opacity-40"
                      >
                        Save Credentials
                      </button>
                    </div>
                  )}

                </div>
              )}

              {!gdrive.connected && (
                <div className="space-y-2">
                  {gdrive.credentials_configured && (
                    <p className="text-txt-3 text-xs">Google OAuth is configured. Connect your Google account to enable Drive backups.</p>
                  )}
                  <button
                    onClick={connectGdrive}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                  >
                    <Cloud size={14}/> {gdrive.credentials_configured ? 'Connect Google Drive' : 'Step 2 — Connect Google Drive'}
                  </button>
                </div>
              )}

              {/* Backup Button (show when connected) */}
              {gdrive.connected && (
                <div className="space-y-3">
                  <button
                    onClick={backupToGdrive}
                    disabled={gdriveUploading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition-colors"
                  >
                    {gdriveUploading
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>&nbsp;Uploading…</>
                      : <><Cloud size={16}/> Backup to Google Drive</>
                    }
                  </button>
                  <p className="text-txt-3 text-xs">
                    Backups are saved in a <span className="text-gold">DG RetailOS Backups</span> folder on your Google Drive.
                  </p>
                </div>
              )}

            </div>
          </Section>
        </div>
      )}

      {/* ── SYSTEM UPDATE ── */}
      {tab === 'system' && (
        <div className="space-y-4">

          {/* Lock Screen Settings */}
          <LockSettingsPanel />

          {/* Version Info */}
          <Section icon={GitBranch} title="System Information">
            {version ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Version',    value: version.version },
                    { label: 'Build',      value: version.build },
                    { label: 'Codename',   value: version.codename || '—' },
                    { label: 'Created By', value: version.created_by || 'GuruShah' },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-white/[0.03] border border-glass-border rounded-xl text-center">
                      <div className="text-txt-3 text-[10px] uppercase tracking-widest mb-1">{label}</div>
                      <div className="text-txt text-sm font-bold font-mono">{value}</div>
                    </div>
                  ))}
                </div>
                {/* Device / OS info */}
                {(() => {
                  const d = getDeviceInfo()
                  const wakeLockSupported = 'wakeLock' in navigator
                  return (
                    <div className="p-3 bg-white/[0.02] border border-glass-border rounded-xl">
                      <div className="text-txt-3 text-[10px] uppercase tracking-widest font-semibold mb-2">Device & Runtime</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { label: 'OS',          value: d.os },
                          { label: 'Device Type',  value: d.isIPad ? 'iPad' : d.isIPhone ? 'iPhone' : d.isTablet ? 'Tablet' : d.isMobile ? 'Mobile' : 'Desktop' },
                          { label: 'Touch',        value: d.isTouch ? 'Yes' : 'No' },
                          { label: 'PWA Mode',     value: d.isStandalone ? 'Installed' : 'Browser' },
                          { label: 'Wake Lock',    value: wakeLockSupported ? (d.isTablet ? '✅ Active' : 'Supported') : '⚠️ Not supported' },
                          { label: 'Screen Keep',  value: d.isTablet ? '✅ Always On' : 'OS Default' },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-center justify-between gap-2">
                            <span className="text-txt-3 text-[11px]">{label}</span>
                            <span className="text-txt-2 text-[11px] font-semibold font-mono">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
                {version.release_notes && (
                  <div className="p-4 bg-white/[0.02] border border-glass-border rounded-xl">
                    <div className="text-txt-3 text-xs uppercase tracking-widest font-semibold mb-2">Release Notes v{version.version}</div>
                    <ul className="space-y-1">
                      {version.release_notes.map((note, i) => (
                        <li key={i} className="text-txt-2 text-xs flex items-start gap-2">
                          <CheckCircle size={11} className="text-green-400 mt-0.5 flex-shrink-0"/>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {version.last_commit && (
                  <div className="flex items-center gap-2 text-xs text-txt-3 font-mono">
                    <GitBranch size={11}/>
                    <span className="text-gold">{version.last_commit.hash}</span>
                    <span>{version.last_commit.message}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-txt-3 text-sm">Loading version info…</div>
            )}
          </Section>

          {/* Update */}
          {hasRole('owner', 'superadmin') && (
            <Section icon={Download} title="System Update">
              <div className="space-y-4">
                <p className="text-txt-2 text-sm">Check for updates from the server and apply them automatically. The system will restart after a successful update.</p>

                <div className="flex gap-3">
                  <button onClick={checkUpdate} disabled={updateStatus === 'checking' || updateStatus === 'running'}
                    className="btn-ghost flex items-center gap-2">
                    <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''}/>
                    {updateStatus === 'checking' ? 'Checking…' : 'Check for Updates'}
                  </button>
                  {updateStatus && updateStatus !== 'checking' && updateStatus !== 'running' && updateStatus.can_update && (
                    <button onClick={applyUpdate} className="btn-gold flex items-center gap-2">
                      <Download size={14}/> Apply Update
                    </button>
                  )}
                </div>

                {/* Status banner */}
                {updateStatus && updateStatus !== 'checking' && updateStatus !== 'running' && (
                  <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                    updateStatus.can_update
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-white/[0.03] border-glass-border'}`}>
                    {updateStatus.can_update
                      ? <Download size={16} className="text-green-400 flex-shrink-0 mt-0.5"/>
                      : <CheckCircle size={16} className="text-gold flex-shrink-0 mt-0.5"/>}
                    <div>
                      <div className={`text-sm font-semibold ${updateStatus.can_update ? 'text-green-400' : 'text-txt'}`}>
                        {updateStatus.can_update ? 'Update Available!' : '✅ You are running the latest version'}
                      </div>
                      {updateStatus.can_update && (
                        <div className="text-txt-3 text-xs mt-0.5">{updateStatus.message}</div>
                      )}
                      {updateStatus.pending_commits && (
                        <div className="mt-2 font-mono text-xs text-txt-2 bg-black/20 p-2 rounded-lg whitespace-pre-wrap">{updateStatus.pending_commits}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Update log terminal */}
                {(updateStatus === 'running' || updateLog.length > 0) && (
                  <div className="bg-black/40 border border-glass-border rounded-xl p-4 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
                    <div className="flex items-center gap-2 text-txt-3 mb-2 pb-2 border-b border-glass-border">
                      <Terminal size={11}/>
                      <span className="uppercase tracking-widest text-[10px]">Update Log</span>
                      {updateStatus === 'running' && <div className="ml-auto w-2 h-2 bg-green-400 rounded-full animate-pulse"/>}
                    </div>
                    {updateLog.map((line, i) => (
                      <div key={i} className={`${
                        line.includes('❌') ? 'text-red-400'
                        : line.includes('✅') || line.includes('complete') ? 'text-green-400'
                        : line.includes('🚀') || line.includes('📦') || line.includes('🐍') ? 'text-gold'
                        : 'text-txt-2'}`}>
                        {line}
                      </div>
                    ))}
                    {updateStatus === 'running' && <div className="text-txt-3 animate-pulse">▋</div>}
                  </div>
                )}

                <div className="p-4 bg-white/[0.02] border border-glass-border rounded-xl">
                  <div className="text-txt-3 text-xs uppercase tracking-widest font-semibold mb-2">How updates work</div>
                  <ul className="text-txt-2 text-xs space-y-1">
                    <li>• Connect this project to a Git remote (GitHub/GitLab) for automatic updates</li>
                    <li>• Click <strong className="text-txt">Check for Updates</strong> to see if new version is available</li>
                    <li>• Click <strong className="text-txt">Apply Update</strong> — the system pulls code, updates dependencies, and restarts</li>
                    <li>• Always create a backup before updating</li>
                  </ul>
                </div>
              </div>
            </Section>
          )}

          {/* About / Credits */}
          <div className="glass-card overflow-hidden">
            <div className="p-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-gradient mb-2">
                <Sparkles size={22} className="text-bg"/>
              </div>
              <div className="font-display text-xl font-bold text-txt">DGC POS RetailOS</div>
              <div className="text-txt-3 text-xs tracking-widest uppercase">Thank you for your business</div>
              <div className="pt-3 border-t border-glass-border space-y-1">
                <div className="text-txt-2 text-sm">
                  Designed &amp; Developed by{' '}
                  <span className="text-gold font-bold font-display">GuruShah</span>
                </div>
                <div className="text-txt-3 text-xs">Version {version?.version || '1.0.0'} · Build {version?.build || '—'}</div>
                <div className="text-txt-3 text-[10px] mt-2">
                  © {new Date().getFullYear()} DGC POS · All rights reserved
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {userModal && (
          <UserModal
            user={userModal === 'new' ? null : userModal}
            onClose={() => setUserModal(null)}
            onSaved={() => { setUserModal(null); loadUsers() }}
          />
        )}
        {resetModal && (
          <ResetPasswordModal
            user={resetModal}
            onClose={() => setResetModal(null)}
          />
        )}
        {teamManage && (
          <TeamManageModal
            user={teamManage}
            onClose={() => setTeamManage(null)}
            onSaved={loadUsers}
          />
        )}
      </AnimatePresence>

      {/* Cinematic update overlay */}
      <UpdateOverlay
        log={updateLog}
        isRunning={updateStatus === 'running' || updateStatus === 'done' || updateStatus === 'error'}
        onClose={() => { setShowOverlay(false); setUpdateStatus(null); setUpdateLog([]) }}
        newVersion={version?.version}
        oldVersion={oldVersion}
      />
    </div>
  )
}
