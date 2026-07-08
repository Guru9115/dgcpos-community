/**
 * Customer-facing display — open in a second tab/monitor
 * Receives live cart updates from the POS page via BroadcastChannel.
 * URL: /display  (no auth required — cashier opens it on second screen)
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CHANNEL = 'dgc-pos-display'

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const hm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 'clamp(3.5rem,10vw,6rem)', fontWeight: 700, color: '#000000', letterSpacing: '-0.03em', lineHeight: 1 }}>{hm}</div>
      <div style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.45)', marginTop: 6, letterSpacing: '0.05em' }}>{date}</div>
    </div>
  )
}

export default function CustomerDisplay() {
  const [state, setState] = useState(null) // { cart, total, subtotal, taxAmt, discAmt, taxPct, currency, shopName, shopLogo, status }

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (e) => setState(e.data)
    // Request current state from POS immediately
    const ping = new BroadcastChannel(CHANNEL)
    ping.postMessage({ type: 'DISPLAY_READY' })
    return () => { ch.close(); ping.close() }
  }, [])

  const SYM = state?.currency || 'Rs.'
  const fmt = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Idle screen ─────────────────────────────────────────────────────────────
  const isIdle   = !state || state.status === 'idle' || (state.cart?.length === 0 && state.status !== 'complete')
  const isPaying = state?.status === 'paying'
  const isDone   = state?.status === 'complete'

  return (
    <div style={{
      height: '100dvh', width: '100vw', overflow: 'hidden',
      background: '#050810',
      backgroundImage: [
        'radial-gradient(ellipse 80% 50% at 20% 10%, rgba(37,99,235,0.12) 0%, transparent 55%)',
        'radial-gradient(ellipse 70% 45% at 80% 90%, rgba(11,95,255,0.09) 0%, transparent 55%)',
      ].join(','),
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
      userSelect: 'none',
    }}>
      {/* Header bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {state?.shopLogo && <img src={state.shopLogo} alt="" style={{ height: 36, width: 36, objectFit: 'contain', borderRadius: 8, border: '1px solid rgba(11,95,255,0.25)' }} />}
          <div>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#000000' }}>{state?.shopName || 'Your Store'}</div>
            <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(11,95,255,0.55)' }}>RetailOS · Customer Display</div>
          </div>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.30)', letterSpacing: '0.06em' }}>DGC-POS · All Rights Reserved</div>
      </div>

      <AnimatePresence mode="wait">

        {/* ── DONE screen ─────────────────────────────────────────────────── */}
        {isDone && (
          <motion.div key="done"
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', damping: 14, stiffness: 300 }}
              style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '3px solid rgba(16,185,129,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(16,185,129,0.18)' }}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </motion.div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 'clamp(1.8rem,5vw,2.8rem)', fontWeight: 700, color: '#34D399', marginBottom: 8 }}>Thank You!</div>
              <div style={{ fontSize: '1rem', color: 'rgba(0,0,0,0.50)' }}>Payment confirmed — enjoy your purchase</div>
              {state?.total > 0 && <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 'clamp(1.5rem,4vw,2.2rem)', fontWeight: 900, color: '#0B5FFF', marginTop: 16 }}>{SYM} {fmt(state.total)}</div>}
            </div>
          </motion.div>
        )}

        {/* ── PAYING screen ────────────────────────────────────────────────── */}
        {isPaying && !isDone && (
          <motion.div key="paying"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 12 }}>Total Payable</div>
              <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 'clamp(3rem,12vw,7rem)', fontWeight: 900, color: '#0B5FFF', letterSpacing: '-0.03em', lineHeight: 1, textShadow: '0 0 80px rgba(11,95,255,0.25)' }}>
                {SYM} {fmt(state?.total)}
              </div>
              <div style={{ display: 'flex', gap: 28, justifyContent: 'center', marginTop: 20 }}>
                {state?.discAmt > 0 && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.68rem', color: 'rgba(0,0,0,0.42)' }}>Discount</div><div style={{ fontWeight: 700, color: '#FDE68A' }}>− {SYM} {fmt(state.discAmt)}</div></div>}
                {state?.taxAmt > 0 && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.68rem', color: 'rgba(0,0,0,0.42)' }}>VAT {state?.taxPct}%</div><div style={{ fontWeight: 700, color: 'rgba(0,0,0,0.55)' }}>+ {SYM} {fmt(state.taxAmt)}</div></div>}
              </div>
            </div>
            {/* Pulsing ring */}
            <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ repeat: Infinity, duration: 2 }}
              style={{ width: 80, height: 80, borderRadius: '50%', border: '2px solid rgba(11,95,255,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(11,95,255,0.30)' }}/>
            </motion.div>
            <div style={{ fontSize: '0.80rem', color: 'rgba(0,0,0,0.42)', letterSpacing: '0.08em' }}>Awaiting payment…</div>
          </motion.div>
        )}

        {/* ── ACTIVE CART ──────────────────────────────────────────────────── */}
        {!isIdle && !isPaying && !isDone && (
          <motion.div key="cart"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', overflow: 'hidden' }}>

            {/* Left: item list */}
            <div style={{ overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.42)', marginBottom: 4 }}>Your Items</div>
              <AnimatePresence>
                {state?.cart?.map((item, i) => (
                  <motion.div key={item.product_id}
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
                    transition={{ delay: i * 0.04 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
                    <div>
                      <div style={{ color: '#000000', fontWeight: 700, fontSize: '0.95rem' }}>{item.product_name}</div>
                      <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.75rem', marginTop: 2 }}>{item.qty} × {SYM} {fmt(item.unit_price)}</div>
                    </div>
                    <div style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 900, fontSize: '1rem', color: '#0B5FFF' }}>{SYM} {fmt(item.total)}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Right: totals */}
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.07)', padding: '24px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Subtotal', value: fmt(state?.subtotal), color: 'rgba(0,0,0,0.60)' },
                  state?.discAmt > 0 && { label: 'Discount', value: `− ${fmt(state.discAmt)}`, color: '#FDE68A' },
                  state?.taxAmt > 0 && { label: `VAT ${state?.taxPct}%`, value: `+ ${fmt(state.taxAmt)}`, color: 'rgba(0,0,0,0.50)' },
                ].filter(Boolean).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'rgba(0,0,0,0.50)', fontSize: '0.82rem' }}>{r.label}</span>
                    <span style={{ color: r.color, fontWeight: 600, fontFamily: '"JetBrains Mono",monospace', fontSize: '0.82rem' }}>{SYM} {r.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(11,95,255,0.08)', border: '2px solid rgba(11,95,255,0.30)', borderRadius: 16, padding: '20px 20px', textAlign: 'center', marginTop: 8 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginBottom: 8 }}>Total Payable</div>
                <div style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', color: '#0B5FFF', letterSpacing: '-0.02em' }}>{SYM} {fmt(state?.total)}</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── IDLE screen ─────────────────────────────────────────────────── */}
        {isIdle && (
          <motion.div key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
            {state?.shopLogo && (
              <img src={state.shopLogo} alt="" style={{ width: 'min(180px,30vw)', opacity: 0.08, filter: 'grayscale(100%) brightness(4)' }} />
            )}
            <Clock />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 'clamp(1.2rem,3vw,1.8rem)', color: 'rgba(0,0,0,0.28)', fontStyle: 'italic' }}>
                Welcome to {state?.shopName || 'Your Store'}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
