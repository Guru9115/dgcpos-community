import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Printer, Receipt as ReceiptIcon, Banknote, QrCode, CreditCard, Smartphone, BedDouble } from 'lucide-react'
import { asArray, cartItemKey } from '../../pos/cart'

export default function CheckoutModal({ cart, subtotal, discAmt, taxAmt, redeemValue, total,
                                        discPct, taxPct, customer, settings, onConfirm, onClose, processing,
                                        chargeableBookings = [] }) {
  const safeCart = asArray(cart)
  const folios = asArray(chargeableBookings)
  const SYM = settings?.currency || 'Rs.'
  const cur = v => `${SYM} ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmt = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const METHODS = [
    { id: 'cash',  label: 'Cash',    icon: Banknote,    color: '#047857', ring: 'rgba(5,150,105,0.35)',   bg: 'rgba(5,150,105,0.10)' },
    { id: 'qr',    label: 'QR Code', icon: QrCode,      color: '#1D4ED8', ring: 'rgba(29,78,216,0.35)',   bg: 'rgba(59,130,246,0.10)' },
    { id: 'esewa', label: 'eSewa',   icon: Smartphone,  color: '#7C3AED', ring: 'rgba(124,58,237,0.35)',  bg: 'rgba(124,58,237,0.10)' },
    { id: 'card',  label: 'Card',    icon: CreditCard,  color: '#B45309', ring: 'rgba(180,83,9,0.35)',    bg: 'rgba(180,83,9,0.10)'  },
  ]

  const [method,    setMethod]    = useState('cash')
  const [cashInput, setCashInput] = useState('')
  const [folioBookingId, setFolioBookingId] = useState(
    folios[0]?.id ? String(folios[0].id) : ''
  )

  const roomChargeEnabled = folios.length > 0
  const allMethods = roomChargeEnabled
    ? [...METHODS, { id: 'room_charge', label: 'Room', icon: BedDouble, color: '#7C3AED', ring: 'rgba(124,58,237,0.35)', bg: 'rgba(124,58,237,0.10)' }]
    : METHODS

  const cashReceived = parseFloat(cashInput || 0)
  const changeAmt    = cashReceived - total
  const isExact      = cashReceived > 0 && Math.abs(changeAmt) < 0.01
  const overpaid     = changeAmt > 0.009
  const underpaid    = cashReceived > 0 && changeAmt < -0.009
  const canConfirm   = method === 'room_charge'
    ? !!folioBookingId
    : method !== 'cash' || cashReceived >= total - 0.009

  const r100 = Math.ceil(total / 100) * 100
  const r500 = Math.ceil(total / 500) * 500
  const quickAmts = [...new Set([Math.round(total), r100, r500].filter(v => v >= total - 0.01))].slice(0, 4)

  const pad = (k) => {
    if (k === '⌫') { setCashInput(v => v.slice(0, -1)); return }
    if (k === 'C')  { setCashInput(''); return }
    setCashInput(v => { const n = v + k; return n.length > 9 ? v : n })
  }

  const NUMPAD = [['7','8','9'],['4','5','6'],['1','2','3'],['C','0','⌫']]
  const sel = allMethods.find(m => m.id === method) || allMethods[0]
  const confirm = () => onConfirm({
    method,
    amtPaid: method === 'cash' ? cashReceived : total,
    folioBookingId: method === 'room_charge' ? Number(folioBookingId) : null,
  })

  const S = {
    overlay: { position:'fixed', inset:0, zIndex:70, background:'rgba(7,27,82,0.18)', backdropFilter:'blur(18px)', WebkitBackdropFilter:'blur(18px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'12px' },
    hdr:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 22px', borderBottom:'1px solid rgba(7,27,82,0.08)', flexShrink:0, background: 'rgba(255,255,255,0.98)' },
    foot:    { display:'flex', gap:10, padding:'12px 20px', borderTop:'1px solid rgba(7,27,82,0.08)', flexShrink:0, background: 'rgba(248,251,255,0.98)' },
  }

  return (
    <div className="checkout-overlay" style={S.overlay}>
      <motion.div
        initial={{ opacity:0, scale:0.95, y:16 }}
        animate={{ opacity:1, scale:1,    y:0  }}
        exit={{    opacity:0, scale:0.95, y:16 }}
        transition={{ type:'spring', stiffness:420, damping:22 }}
        className="checkout-modal">

        {/* HEADER */}
        <div style={S.hdr}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ background:'rgba(11,95,255,0.10)', border:'1px solid rgba(11,95,255,0.22)', borderRadius:12, padding:'7px 9px' }}>
              <ReceiptIcon size={17} style={{ color:'#0B5FFF' }}/>
            </div>
            <div>
              <div style={{ color:'#071B52', fontWeight:900, fontSize:'1rem' }}>Checkout</div>
              <div style={{ color:'#64748B', fontSize:'0.72rem' }}>
                {safeCart.length} item{safeCart.length!==1?'s':''}{customer?` · ${customer.name}`:''}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ textAlign:'right' }}>
              <div style={{ color:'#64748B', fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em' }}>Amount Due</div>
              <div style={{ color:'#0B5FFF', fontWeight:900, fontSize:'1.4rem', fontFamily:'"JetBrains Mono",monospace', letterSpacing:'-0.02em', lineHeight:1.1 }}>{cur(total)}</div>
            </div>
            <button type="button" onClick={onClose} style={{ background:'rgba(7,27,82,0.04)', border:'1px solid rgba(7,27,82,0.10)', borderRadius:9, padding:'6px 7px', color:'#64748B', cursor:'pointer', display:'flex', touchAction:'manipulation' }}>
              <X size={15}/>
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="checkout-body">

          {/* LEFT — bill */}
          <div className="pos-bill-scroll checkout-left">
            <div style={{ color:'#64748B', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em' }}>Order Items</div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {safeCart.map((item, i) => (
                <div key={cartItemKey(item, i)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 11px', background: '#ffffff', borderRadius:10, border:'1px solid rgba(7,27,82,0.08)', boxShadow:'0 1px 4px rgba(7,27,82,0.04)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:'#0F172A', fontSize:'0.83rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.product_name || 'Item'}</div>
                    <div style={{ color:'#64748B', fontSize:'0.70rem', marginTop:1 }}>{item.qty} × {SYM} {fmt(item.unit_price)}</div>
                  </div>
                  <div style={{ color:'#071B52', fontWeight:800, fontSize:'0.86rem', fontFamily:'"JetBrains Mono",monospace', marginLeft:10, whiteSpace:'nowrap' }}>{SYM} {fmt(item.total)}</div>
                </div>
              ))}
            </div>
            <div style={{ height:1, background:'rgba(7,27,82,0.08)', margin:'4px 0' }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                { label:'Subtotal',                       value: cur(subtotal),              color:'#64748B' },
                discAmt>0&&{ label:`Discount −${discPct}%`,  value:`−${cur(discAmt)}`,        color:'#DC2626' },
                taxAmt>0 &&{ label:`Tax +${taxPct}%`,        value:`+${cur(taxAmt)}`,         color:'#64748B' },
                redeemValue>0&&{ label:'Points Redeemed',    value:`−${cur(redeemValue)}`,    color:'#059669' },
              ].filter(Boolean).map((r,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid rgba(7,27,82,0.06)' }}>
                  <span style={{ color:'#64748B', fontSize:'0.78rem' }}>{r.label}</span>
                  <span style={{ color:r.color, fontSize:'0.78rem', fontWeight:600, fontFamily:'"JetBrains Mono",monospace' }}>{r.value}</span>
                </div>
              ))}
            </div>
            <div className="dgc-checkout-bill-total" style={{ background:'linear-gradient(135deg, #071B52 0%, #0B5FFF 100%)', border:'1px solid rgba(11,95,255,0.35)', borderRadius:14, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'auto', boxShadow:'0 4px 18px rgba(11,95,255,0.22)' }}>
              <div>
                <div style={{ color:'rgba(255,255,255,0.78)', fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em' }}>Total Payable</div>
                <div style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.72rem', marginTop:2 }}>{safeCart.length} item{safeCart.length!==1?'s':''}</div>
              </div>
              <div style={{ color:'#FFFFFF', fontWeight:900, fontSize:'1.85rem', fontFamily:'"JetBrains Mono",monospace', letterSpacing:'-0.02em' }}>{cur(total)}</div>
            </div>
          </div>

          {/* RIGHT — payment */}
          <div className="checkout-right">
            <div className="dgc-checkout-due-bar" style={{ background:'linear-gradient(135deg, #071B52 0%, #0B5FFF 100%)', borderRadius:14, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, boxShadow:'0 4px 20px rgba(11,95,255,0.28)' }}>
              <div>
                <div style={{ color:'rgba(255,255,255,0.75)', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em' }}>Collect From Customer</div>
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.68rem', marginTop:2 }}>Amount due now</div>
              </div>
              <div style={{ color:'#FFFFFF', fontWeight:900, fontSize:'2.1rem', fontFamily:'"JetBrains Mono",monospace', letterSpacing:'-0.03em', lineHeight:1 }}>{cur(total)}</div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns: roomChargeEnabled ? 'repeat(3, 1fr)' : '1fr 1fr', gap:6, flexShrink:0 }}>
              {allMethods.map(m => (
                <button key={m.id} className="pos-pay-tab" onClick={() => { setMethod(m.id); setCashInput('') }}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, padding:'10px 6px', borderRadius:13, cursor:'pointer', background: method===m.id ? 'rgba(11,95,255,0.08)' : '#ffffff', border:`2px solid ${method===m.id ? 'rgba(11,95,255,0.35)' : 'rgba(7,27,82,0.10)'}`, boxShadow: method===m.id ? `0 0 12px rgba(11,95,255,0.15)` : 'none' }}>
                  <m.icon size={18} style={{ color: method===m.id ? '#0B5FFF' : '#64748B' }}/>
                  <span style={{ fontSize:'0.72rem', fontWeight:800, color: method===m.id ? '#071B52' : '#64748B' }}>{m.label}</span>
                </button>
              ))}
            </div>

            {method === 'cash' && (
              <>
                {/* Cash received display */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, flexShrink:0 }}>
                  <div style={{ background:'rgba(7,27,82,0.04)', border:'1px solid rgba(7,27,82,0.10)', borderRadius:12, padding:'8px 12px' }}>
                    <div style={{ color:'#64748B', fontSize:'0.58rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em' }}>Due</div>
                    <div style={{ color:'#0B5FFF', fontWeight:900, fontSize:'1.1rem', fontFamily:'"JetBrains Mono",monospace', marginTop:2 }}>{cur(total)}</div>
                  </div>
                  <div style={{ background:'#ffffff', border:`2px solid ${underpaid?'rgba(239,68,68,0.4)':overpaid||isExact?'rgba(16,185,129,0.4)':'rgba(11,95,255,0.25)'}`, borderRadius:12, padding:'8px 12px', transition:'border-color 0.2s' }}>
                    <div style={{ color:'#64748B', fontSize:'0.58rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em' }}>Received</div>
                    <div style={{ color:'#071B52', fontWeight:900, fontSize:'1.1rem', fontFamily:'"JetBrains Mono",monospace', marginTop:2, lineHeight:1.15 }}>
                      {SYM} {cashInput ? Number(cashInput).toLocaleString('en-IN') : <span style={{ opacity:0.25 }}>0</span>}
                    </div>
                  </div>
                </div>

                {/* Quick amount buttons */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {quickAmts.map(a => (
                    <button key={a} className="pos-preset-btn" onClick={()=>setCashInput(String(a))}
                      style={{ flex:1, padding:'8px 4px', borderRadius:10, cursor:'pointer', background: cashReceived===a ? 'rgba(11,95,255,0.10)' : '#ffffff', border:`1px solid ${cashReceived===a ? 'rgba(11,95,255,0.30)' : 'rgba(7,27,82,0.10)'}`, color: cashReceived===a ? '#0B5FFF' : '#64748B', fontSize:'0.78rem', fontWeight:800 }}>
                      {a===Math.round(total) ? 'Exact' : a.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>

                {/* Numpad */}
                <div style={{ display:'grid', gridTemplateRows:'repeat(4,1fr)', gap:6, flex:1, minHeight:0 }}>
                  {NUMPAD.map((row,ri) => (
                    <div key={ri} style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                      {row.map(k => {
                        const isDel = k==='⌫', isClear = k==='C'
                        return (
                          <button key={k} className="np-key" onClick={()=>pad(k)}
                            style={{ borderRadius:12, cursor:'pointer', border: isDel ? '1px solid rgba(239,68,68,0.3)' : isClear ? '1px solid rgba(11,95,255,0.25)' : '1px solid rgba(7,27,82,0.10)', fontWeight:900, fontSize: isDel ? '1.30rem' : isClear ? '0.95rem' : '1.50rem', background: isDel ? 'rgba(239,68,68,0.06)' : isClear ? 'rgba(11,95,255,0.06)' : '#ffffff', color: isDel ? '#DC2626' : isClear ? '#0B5FFF' : '#071B52', lineHeight:1, boxShadow: 'inset 0 -2px 0 rgba(7,27,82,0.06)' }}>
                            {k}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {/* Change / status bar */}
                <div className="checkout-change-bar" style={{ flexShrink:0, borderRadius:12, padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', background: isExact ? 'rgba(16,185,129,0.08)' : overpaid ? 'rgba(16,185,129,0.08)' : underpaid ? 'rgba(239,68,68,0.08)' : 'rgba(7,27,82,0.03)', border:`1px solid ${isExact?'rgba(16,185,129,0.3)':overpaid?'rgba(16,185,129,0.25)':underpaid?'rgba(239,68,68,0.25)':'rgba(7,27,82,0.08)'}` }}>
                  <span style={{ color:'#64748B', fontSize:'0.82rem', fontWeight:800 }}>
                    {isExact ? '✓ Exact' : overpaid ? '↩ Change' : underpaid ? '⚠ Short' : 'Change'}
                  </span>
                  <span style={{ fontWeight:900, fontSize:'1.20rem', fontFamily:'"JetBrains Mono",monospace', color: isExact?'#059669':overpaid?'#059669':underpaid?'#DC2626':'#64748B' }}>
                    {cashReceived>0 ? cur(Math.abs(changeAmt)) : '—'}
                  </span>
                </div>
              </>
            )}

            {method === 'room_charge' && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10, minHeight:0 }}>
                <div style={{ color:'#64748B', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  Charge to in-house guest
                </div>
                <select
                  value={folioBookingId}
                  onChange={(e) => setFolioBookingId(e.target.value)}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1px solid rgba(7,27,82,0.12)', fontSize:'0.85rem', fontWeight:600, background:'#fff' }}
                >
                  <option value="">Select guest / room</option>
                  {folios.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.guest_name} — {b.room_name || b.room_code} (folio {cur(b.folio_balance || 0)})
                    </option>
                  ))}
                </select>
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
                  <BedDouble size={36} color="#7C3AED" />
                  <div style={{ color:'#071B52', fontWeight:900, fontSize:'1.6rem', fontFamily:'"JetBrains Mono",monospace' }}>{cur(total)}</div>
                  <div style={{ color:'#64748B', fontSize:'0.74rem', textAlign:'center', lineHeight:1.5 }}>
                    Posts to guest folio — no cash collected now. Settle at check-out.
                  </div>
                </div>
              </div>
            )}

            {method !== 'cash' && method !== 'room_charge' && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
                <div style={{ width:80, height:80, borderRadius:20, background: 'rgba(11,95,255,0.08)', border:`2px solid rgba(11,95,255,0.25)`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 24px rgba(11,95,255,0.12)` }}>
                  <sel.icon size={38} style={{ color: '#0B5FFF' }}/>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#64748B', fontSize:'0.74rem', marginBottom:6 }}>
                    {method==='esewa'?'eSewa Amount':method==='qr'?'Scan to Pay':'Card Amount'}
                  </div>
                  <div style={{ color:'#071B52', fontWeight:900, fontSize:'1.9rem', fontFamily:'"JetBrains Mono",monospace', letterSpacing:'-0.02em' }}>{cur(total)}</div>
                </div>
                <div style={{ background:'#ffffff', border:'1px solid rgba(7,27,82,0.08)', borderRadius:11, padding:'9px 14px', textAlign:'center', width:'100%' }}>
                  <div style={{ color:'#64748B', fontSize:'0.72rem', lineHeight:1.5 }}>
                    {method==='esewa'?'📱 Customer pays via eSewa / Fonepay':method==='qr'?'📷 Show QR to customer for scanning':'💳 Tap, swipe or insert card on terminal'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div style={S.foot}>
          <button onClick={onClose}
            style={{ padding:'12px 18px', borderRadius:13, border:'1px solid rgba(7,27,82,0.10)', background:'#ffffff', color:'#64748B', fontWeight:700, cursor:'pointer', fontSize:'0.85rem', whiteSpace:'nowrap' }}>
            ← Back
          </button>
          <button className="pos-confirm-btn" onClick={canConfirm && !processing ? confirm : undefined} disabled={processing || !canConfirm}
            style={{ flex:1, padding:'13px 20px', borderRadius:13, fontWeight:900, fontSize:'0.95rem', letterSpacing:'-0.01em', display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor: !canConfirm ? 'not-allowed' : 'pointer', background: canConfirm ? 'linear-gradient(135deg, #071B52 0%, #0B5FFF 100%)' : 'rgba(100,116,139,0.12)', border: canConfirm ? '1px solid #0B5FFF' : '1px solid rgba(7,27,82,0.10)', color: canConfirm ? '#FFFFFF' : '#64748B', opacity: processing ? 0.65 : 1, boxShadow: canConfirm ? '0 4px 24px rgba(11,95,255,0.25)' : 'none' }}>
            {processing
              ? <><div style={{ width:17,height:17,border:'2.5px solid rgba(255,255,255,0.35)',borderTopColor:'#FFFFFF',borderRadius:'50%',animation:'spin 0.7s linear infinite' }}/> Processing…</>
              : <><Printer size={17}/> Complete Sale &amp; Print Receipt</>}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
