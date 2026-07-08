/**
 * CashierSessionWidget — shows in the POS header when a cashier is logged in.
 * Lets them open/close their till session with cash float entry.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cashierSessionsAPI } from '../api'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, DollarSign, LogIn, LogOut, X, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, isValid } from 'date-fns'

const safeFmt = (val, fmt) => {
  try {
    const d = new Date(val)
    return isValid(d) ? format(d, fmt) : '—'
  } catch { return '—' }
}

export default function CashierSessionWidget() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(null)  // 'open' | 'close'
  const [cash, setCash]   = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const { data } = useQuery({
    queryKey: ['cashier-session-active'],
    queryFn:  () => cashierSessionsAPI.getActive().then(r => r.data).catch(() => null),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })

  const session = data?.session

  const openSession = async () => {
    setLoading(true)
    try {
      await cashierSessionsAPI.open({ opening_cash: parseFloat(cash) || 0, notes })
      toast.success('Session opened')
      qc.invalidateQueries({ queryKey: ['cashier-session-active'] })
      setModal(null); setCash(''); setNotes('')
    } catch (e) {
      const err = e?.response?.data?.error
      if (err?.includes('already open')) {
        toast.error('You already have an open session')
        qc.invalidateQueries({ queryKey: ['cashier-session-active'] })
        setModal(null)
      } else {
        toast.error(err || 'Failed to open session')
      }
    } finally { setLoading(false) }
  }

  const closeSession = async () => {
    if (!session) return
    setLoading(true)
    try {
      await cashierSessionsAPI.close(session.id, { closing_cash: parseFloat(cash) || 0, notes })
      toast.success('Session closed')
      qc.invalidateQueries({ queryKey: ['cashier-session-active'] })
      setModal(null); setCash(''); setNotes('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to close session')
    } finally { setLoading(false) }
  }

  const diff = session && cash !== ''
    ? parseFloat(cash) - session.opening_cash - (session.sales_total || 0)
    : null

  return (
    <>
      {/* Chip shown in POS header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.8rem',
          borderRadius: 10, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          background: session ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
          color:      session ? '#34D399' : '#F87171',
          border:     session ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.25)',
          transition: 'all 0.18s',
          position: 'relative',
        }}
      >
        <Clock size={12}/>
        {session ? 'Session Open' : 'No Session'}
        {session && (
          <span style={{ fontSize: '0.68rem', color: 'rgba(0,0,0,0.50)', marginLeft: 2 }}>
            {safeFmt(session.opened_at, 'HH:mm')}
          </span>
        )}
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              position: 'fixed', top: 60, right: 16, zIndex: 50,
              background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 14, padding: '1.25rem', minWidth: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontWeight: 700, color: '#EDE8DF', fontSize: '0.88rem' }}>Till Session</span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.45)', cursor: 'pointer', padding: 2 }}><X size={14}/></button>
            </div>

            {session ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1rem', fontSize: '0.78rem' }}>
                  <Row label="Opened"   value={safeFmt(session.opened_at, 'dd/MM HH:mm')} />
                  <Row label="Opening Cash" value={`Rs. ${session.opening_cash.toLocaleString('en-IN')}`} />
                  <Row label="Sales"    value={session.sales_count ?? 0} />
                  <Row label="Revenue"  value={`Rs. ${(session.sales_total || 0).toLocaleString('en-IN')}`} accent />
                </div>
                <button
                  onClick={() => { setModal('close'); setCash(''); setNotes(''); setOpen(false) }}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 10, border: '1px solid rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.10)', color: '#F87171', fontSize: '0.80rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  <LogOut size={13}/> Close Session
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', marginBottom: '1rem' }}>
                  No active session. Open one to start tracking sales.
                </p>
                <button
                  onClick={() => { setModal('open'); setCash(''); setNotes(''); setOpen(false) }}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 10, border: '1px solid rgba(16,185,129,0.28)', background: 'rgba(16,185,129,0.10)', color: '#34D399', fontSize: '0.80rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  <LogIn size={13}/> Open Session
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Open / Close modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.70)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
            onClick={e => e.target === e.currentTarget && setModal(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: '#0F1923', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 380 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#EDE8DF', margin: 0 }}>
                  {modal === 'open' ? 'Open Till Session' : 'Close Till Session'}
                </h3>
                <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.50)', cursor: 'pointer', padding: 4 }}><X size={18}/></button>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.50)', marginBottom: 8 }}>
                  {modal === 'open' ? 'Opening Cash Float (Rs.)' : 'Closing Cash Count (Rs.)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field"
                  placeholder="0.00"
                  value={cash}
                  onChange={e => setCash(e.target.value)}
                  autoFocus
                />
              </div>

              {modal === 'close' && session && cash !== '' && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(0,0,0,0.05)', marginBottom: '1rem', fontSize: '0.78rem' }}>
                  <Row label="Opening Cash" value={`Rs. ${session.opening_cash.toLocaleString('en-IN')}`} />
                  <Row label="Sales Revenue" value={`Rs. ${(session.sales_total || 0).toLocaleString('en-IN')}`} />
                  <Row label="Expected"     value={`Rs. ${(session.opening_cash + (session.sales_total || 0)).toLocaleString('en-IN')}`} />
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 6 }}>
                    <Row label="Variance"
                      value={`${diff >= 0 ? '+' : ''}Rs. ${diff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      accent={diff !== 0}
                      red={diff < 0}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.70rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.50)', marginBottom: 8 }}>Notes (optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Any notes…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setModal(null)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
                <button
                  onClick={modal === 'open' ? openSession : closeSession}
                  disabled={loading}
                  className="btn-gold"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                           background: modal === 'close' ? 'rgba(239,68,68,0.15)' : undefined,
                           color: modal === 'close' ? '#F87171' : undefined,
                           borderColor: modal === 'close' ? 'rgba(239,68,68,0.40)' : undefined }}>
                  {loading ? <Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : (modal === 'open' ? <LogIn size={14}/> : <LogOut size={14}/>)}
                  {loading ? 'Please wait…' : (modal === 'open' ? 'Open Session' : 'Close Session')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function Row({ label, value, accent, red }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: 'rgba(0,0,0,0.50)', fontSize: '0.75rem' }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: '0.75rem', color: red ? '#F87171' : accent ? '#E8C547' : '#CBD5E1' }}>{value}</span>
    </div>
  )
}
