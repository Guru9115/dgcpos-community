/**
 * Owner/manager — manage staff: menus, password, device reset, block/enable
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { X, KeyRound, Smartphone, ShieldOff, Shield, Check } from 'lucide-react'
import { teamAPI } from '../../api'

function MenuTick({ item, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 p-2 rounded-lg border border-glass-border hover:bg-white/[0.03] cursor-pointer text-xs">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(item.key, e.target.checked)} />
      <span>
        <span className="font-semibold text-txt block">{item.label}</span>
        <span className="text-[10px] text-txt-3">{item.path}</span>
      </span>
    </label>
  )
}

export default function TeamManageModal({ user, onClose, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [restrictMenus, setRestrictMenus] = useState(false)
  const [menuKeys, setMenuKeys] = useState([])
  const [isActive, setIsActive] = useState(true)
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [ctxRes, userRes] = await Promise.all([
          teamAPI.getContext(),
          teamAPI.getUser(user.id),
        ])
        if (cancelled) return
        const u = userRes.data?.user || user
        setMenuItems(ctxRes.data?.menu_items || [])
        const perms = u.menu_permissions || []
        setRestrictMenus(Array.isArray(perms) && perms.length > 0)
        setMenuKeys(Array.isArray(perms) ? [...perms] : [])
        setIsActive(u.is_active !== false)
      } catch {
        toast.error('Failed to load team member')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user.id])

  const toggleMenu = (key, on) => {
    setMenuKeys((prev) => (on ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)))
  }

  const applyTemplate = async (role) => {
    const tpl = (await teamAPI.getContext()).data?.role_templates?.find((t) => t.role === role)
    if (!tpl?.menu_keys?.length) {
      setRestrictMenus(false)
      setMenuKeys([])
      return
    }
    setRestrictMenus(true)
    setMenuKeys([...tpl.menu_keys])
    toast.success(`Applied ${role} menu template`)
  }

  const save = async () => {
    setSaving(true)
    try {
      await teamAPI.updateUser(user.id, {
        is_active: isActive,
        menu_permissions: restrictMenus ? menuKeys : [],
      })
      toast.success('Team member updated')
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async () => {
    if (pwd.length < 8) { toast.error('Password min 8 characters'); return }
    try {
      await teamAPI.resetPassword(user.id, { password: pwd, must_change_password: true })
      toast.success('Password reset — user must change on next login')
      setPwd('')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed')
    }
  }

  const resetDevice = async () => {
    try {
      await teamAPI.resetDevice(user.id, {})
      toast.success('Device sessions cleared')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Device reset failed')
    }
  }

  const toggleActive = async () => {
    try {
      await teamAPI.setStatus(user.id, { is_active: !isActive })
      setIsActive(!isActive)
      toast.success(!isActive ? 'User enabled' : 'User blocked')
      onSaved?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Status update failed')
    }
  }

  const gridMenus = useMemo(() => menuItems, [menuItems])

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="modal-panel mx-4 max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-txt m-0">Manage — {user.full_name || user.username}</h2>
            <p className="text-txt-3 text-xs m-0 mt-0.5">@{user.username} · {user.role}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-glass text-txt-3"><X size={16} /></button>
        </div>

        {loading ? (
          <p className="text-txt-3 text-sm text-center py-8">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleActive} className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${isActive ? 'border-red-500/30 text-red-400' : 'border-emerald-500/30 text-emerald-500'}`}>
                {isActive ? <><ShieldOff size={12} /> Block user</> : <><Shield size={12} /> Enable user</>}
              </button>
              <button type="button" onClick={resetDevice} className="text-xs px-3 py-1.5 rounded-lg border border-glass-border text-txt-2 flex items-center gap-1.5">
                <Smartphone size={12} /> Device reset
              </button>
            </div>

            <div className="p-3 rounded-xl border border-glass-border bg-white/[0.02] space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-txt-3 m-0">Password reset</p>
              <div className="flex gap-2">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input-field flex-1 text-sm"
                  placeholder="New password (min 8)"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
                <button type="button" onClick={() => setShowPwd((v) => !v)} className="btn-ghost text-xs px-2">{showPwd ? 'Hide' : 'Show'}</button>
                <button type="button" onClick={resetPassword} className="btn-gold text-xs px-3 flex items-center gap-1"><KeyRound size={12} /> Reset</button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-txt-3 m-0">Sidebar menu access</p>
                <label className="flex items-center gap-2 text-xs text-txt-2 cursor-pointer">
                  <input type="checkbox" checked={restrictMenus} onChange={(e) => setRestrictMenus(e.target.checked)} />
                  Restrict menus
                </label>
              </div>
              {restrictMenus && (
                <>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {['sales_staff', 'operations_staff', 'engineer'].map((r) => (
                      <button key={r} type="button" onClick={() => applyTemplate(r)} className="text-[10px] px-2 py-1 rounded-lg border border-glass-border text-txt-3 hover:text-gold">
                        Template: {r.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                    {gridMenus.map((item) => (
                      <MenuTick key={item.key} item={item} checked={menuKeys.includes(item.key)} onChange={toggleMenu} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="btn-gold flex-1 flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin" /> : <Check size={14} />}
                Save
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}