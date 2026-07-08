/**
 * DGC RetailOS — Lock Screen
 * Premium PIN-code standby display with auto-lock on inactivity.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Delete } from 'lucide-react'
import { BRAND_LOGO, BRAND_TAGLINE } from '../theme/brand'

// ── Constants ────────────────────────────────────────────────────────────────
const LS_KEY      = 'dgc_lock_settings'
const LS_PIN      = 'dgc_lock_pin'
const DEFAULT_CFG = { enabled: true, timeoutMinutes: 5 }
const DEFAULT_PIN = '1234'

export function getLockSettings() {
  try { return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') } }
  catch { return DEFAULT_CFG }
}
export function saveLockSettings(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify({ ...DEFAULT_CFG, ...cfg }))
}
export function getPin()       { return localStorage.getItem(LS_PIN) || DEFAULT_PIN }
export function savePin(pin)   { localStorage.setItem(LS_PIN, pin) }

// ── Clock ────────────────────────────────────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const h = now.getHours(), m = now.getMinutes()
  const hh = String(h % 12 || 12).padStart(2, '0')
  const mm  = String(m).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 4 }}>
        <span className="dgc-lock-time" style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 'clamp(4rem, 18vw, 6.5rem)',
          fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1,
          color: '#F8FAFC',
        }}>{hh}:{mm}</span>
        <span style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 'clamp(0.9rem, 3vw, 1.2rem)',
          fontWeight: 700, color: 'rgba(0,0,0,0.50)',
          marginTop: '1.4rem', letterSpacing: '0.04em',
        }}>{ampm}</span>
      </div>
      <div style={{
        fontSize: '0.80rem', fontWeight: 500,
        color: 'rgba(0,0,0,0.42)',
        letterSpacing: '0.06em', marginTop: 4,
      }}>{date}</div>
    </div>
  )
}

// ── PIN dots ─────────────────────────────────────────────────────────────────
function PinDots({ count, filled, error }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          animate={error
            ? { x: [0, -6, 6, -4, 4, 0], backgroundColor: '#F87171' }
            : filled > i
              ? { scale: [1, 1.25, 1], backgroundColor: '#0B5FFF' }
              : { scale: 1, backgroundColor: 'rgba(255,255,255,0.15)' }
          }
          transition={{ duration: error ? 0.45 : 0.18 }}
          style={{
            width: 14, height: 14, borderRadius: '50%',
            border: `2px solid ${filled > i ? '#0B5FFF' : 'rgba(255,255,255,0.25)'}`,
          }}
        />
      ))}
    </div>
  )
}

// ── Numpad ───────────────────────────────────────────────────────────────────
const KEYS = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','⌫'],
]

function Numpad({ onKey }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'repeat(4,1fr)', gap: 10, width: '100%', maxWidth: 280 }}>
      {KEYS.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {row.map((k, ki) => k === '' ? (
            <div key={ki} />
          ) : (
            <motion.button
              key={ki}
              whileTap={{ scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              onPointerDown={() => onKey(k)}
              style={{
                height: 64,
                borderRadius: 18,
                border: k === '⌫'
                  ? '1px solid rgba(239,68,68,0.25)'
                  : '1px solid rgba(255,255,255,0.10)',
                background: k === '⌫'
                  ? 'rgba(239,68,68,0.10)'
                  : 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                color: k === '⌫' ? '#F87171' : '#F8FAFC',
                fontSize: k === '⌫' ? '1.2rem' : '1.6rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.08)',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                userSelect: 'none',
              }}
            >
              {k === '⌫' ? <Delete size={20} /> : k}
            </motion.button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Main LockScreen ───────────────────────────────────────────────────────────
export function LockScreen({ onUnlock, shopLogo, shopName = 'Your Store' }) {
  const [pin,    setPin]    = useState('')
  const [error,  setError]  = useState(false)
  const PIN_LEN = 4

  const handleKey = useCallback((k) => {
    if (error) return
    if (k === '⌫') { setPin(v => v.slice(0, -1)); return }
    if (pin.length >= PIN_LEN) return
    const next = pin + k
    setPin(next)
    if (next.length === PIN_LEN) {
      if (next === getPin()) {
        setTimeout(() => onUnlock(), 120)
      } else {
        setError(true)
        setTimeout(() => { setPin(''); setError(false) }, 700)
      }
    }
  }, [pin, error, onUnlock])

  // Hardware keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key)
      else if (e.key === 'Backspace') handleKey('⌫')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: '#050810',
        backgroundImage: [
          'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(37,99,235,0.13) 0%, transparent 60%)',
          'radial-gradient(ellipse 70% 45% at 80% 100%, rgba(11,95,255,0.09) 0%, transparent 60%)',
        ].join(','),
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'space-between',
        padding: 'max(env(safe-area-inset-top), 32px) 20px max(env(safe-area-inset-bottom), 24px)',
        overflow: 'hidden',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {/* Ambient glow */}
      <div style={{ position:'absolute', top:'8%', left:'50%', transform:'translateX(-50%)', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(11,95,255,0.07) 0%, transparent 65%)', pointerEvents:'none' }}/>
      {/* Dot grid */}
      <div style={{ position:'absolute', inset:0, opacity:0.013, backgroundImage:'radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize:'32px 32px', pointerEvents:'none' }}/>

      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', overflow:'hidden' }}>
        <img src={BRAND_LOGO} alt="" style={{ width:'65vw', maxWidth:420, opacity:0.02, filter:'grayscale(20%) brightness(1.6)' }}/>
      </div>

      {/* TOP — Logo + Shop name */}
      <motion.div
        initial={{ opacity:0, y:-16 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.15, type:'spring', damping:22, stiffness:280 }}
        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, paddingTop:8 }}
      >
        <img src={BRAND_LOGO} alt="DGC POS" style={{ width: 200, maxWidth: '72vw', height: 'auto', objectFit: 'contain' }} />
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:'1.1rem', fontWeight:700, color:'#F8FAFC', letterSpacing:'-0.01em' }}>
            {shopName}
          </div>
          <div style={{ fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(96,165,250,0.85)', marginTop:4 }}>
            {BRAND_TAGLINE}
          </div>
        </div>
      </motion.div>

      {/* MIDDLE — Clock */}
      <motion.div
        initial={{ opacity:0, scale:0.94 }}
        animate={{ opacity:1, scale:1 }}
        transition={{ delay:0.20, type:'spring', damping:20, stiffness:260 }}
      >
        <Clock />
      </motion.div>

      {/* BOTTOM — PIN entry */}
      <motion.div
        className="dgc-lock-panel"
        initial={{ opacity:0, y:24 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.28, type:'spring', damping:22, stiffness:280 }}
        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:18, width:'100%', maxWidth: 340, padding: '20px 18px 16px', borderRadius: 24 }}
      >
        {/* Label */}
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'0.75rem', fontWeight:700, color:'rgba(255,255,255,0.38)', letterSpacing:'0.10em', textTransform:'uppercase' }}>
            {error ? '⚠ Incorrect PIN' : 'Enter PIN to unlock'}
          </div>
        </div>

        {/* Dots */}
        <PinDots count={PIN_LEN} filled={pin.length} error={error} />

        {/* Numpad */}
        <Numpad onKey={handleKey} />
      </motion.div>

      {/* FOOTER */}
      <motion.div
        initial={{ opacity:0 }}
        animate={{ opacity:1 }}
        transition={{ delay:0.45 }}
        style={{ textAlign:'center', paddingTop:4 }}
      >
        <p style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.16)', margin:0, letterSpacing:'0.06em' }}>
          DGC‑POS &nbsp;·&nbsp; All Rights Reserved &nbsp;©&nbsp;{new Date().getFullYear()}
        </p>
        <p style={{ fontSize:'0.54rem', color:'rgba(255,255,255,0.10)', margin:'3px 0 0', letterSpacing:'0.05em' }}>
          Designed by <span style={{ color:'rgba(96,165,250,0.50)', fontWeight:700 }}>GuruShah</span>
        </p>
      </motion.div>
    </motion.div>
  )
}
