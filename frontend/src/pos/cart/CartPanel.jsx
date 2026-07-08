import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Plus, Minus, User, CreditCard, Banknote, QrCode, Award, Crown, UserPlus,
  ShieldX, ChevronRight, X, Check,
} from 'lucide-react'
import { promotionsAPI, giftCardsAPI } from '../../api'
import { cartItemKey } from './lineItems'
import CartErrorBoundary from './CartErrorBoundary'

function ShoppingCartIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

export default function CartPanel({
  cart,
  online,
  pendingCount,
  customer,
  customers,
  custSearch,
  custDropOpen,
  showQuickAdd,
  quickForm,
  quickSaving,
  redeemPoints,
  customerSearchRef,
  cartApi,
  onClearCart,
  onOpenCheckout,
  onCustSearchChange,
  onCustFocus,
  onCustBlur,
  onClearCustSearch,
  onUnlinkCustomer,
  onLinkCustomer,
  onShowQuickAdd,
  onHideQuickAdd,
  onQuickFormChange,
  onQuickAddSubmit,
  onRedeemPointsChange,
  onClearRedeemPoints,
}) {
  const {
    discPct, setDiscPct,
    taxPct, setTaxPct,
    promoCode, setPromoCode,
    appliedPromo, setAppliedPromo,
    promoDiscount, setPromoDiscount,
    gcCode, setGcCode,
    appliedGC, setAppliedGC,
    payment, setPayment,
    amtPaid, setAmtPaid,
    splitPayment, setSplitPayment,
    cashAmount, setCashAmount,
    cardAmount, setCardAmount,
    subtotal, discAmt, taxAmt, redeemValue, gcDiscount, total, change,
    pointsRate, cur, updateQty, removeFromCart,
    POS_MAX_DISCOUNT_PCT, discountBlocked,
  } = cartApi

  const applyPromo = () => {
    promotionsAPI.apply({
      subtotal,
      code: promoCode,
      items: cart.map((i) => ({ product_id: i.product_id, qty: i.qty, price: i.unit_price })),
    })
      .then((r) => {
        const d = r.data.discount_amount
        if (d > 0) {
          setPromoDiscount(d)
          setAppliedPromo(r.data.promo)
          toast.success(`Promo applied: -Rs. ${d}`)
        } else toast.error('Promo code not valid or no discount available')
      })
      .catch(() => toast.error('Failed to apply promo'))
  }

  const applyGiftCard = () => {
    if (!gcCode.trim()) return
    giftCardsAPI.lookup(gcCode.trim()).then((r) => {
      const gc = r.data
      if (gc.status !== 'active') {
        toast.error(`Gift card is ${gc.status}`)
        return
      }
      const maxDed = Math.max(0, subtotal - discAmt + taxAmt - redeemValue)
      const redeemAmt = Math.min(gc.balance || 0, maxDed || (total > 0 ? total : subtotal))
      setAppliedGC({ id: gc.id, code: gc.code, balance: gc.balance, redeemAmt })
      toast.success(`Gift card applied — Rs. ${redeemAmt.toFixed(2)} will be deducted`)
    }).catch(() => toast.error('Gift card not found'))
  }

  return (
    <CartErrorBoundary onClearCart={onClearCart}>
      <div className="p-5 border-b border-[rgba(7,27,82,0.08)]">
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '15px', fontWeight: 600, color: '#071B52' }}>
            Cart <span style={{ color: '#64748B' }}>({cart.length})</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!online && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 99, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#DC2626' }}>
                📴 OFFLINE
              </span>
            )}
            {pendingCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(180,83,9,0.10)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 99, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#B45309' }}>
                🕐 {pendingCount} queued
              </span>
            )}
            {cart.length > 0 && (
              <button type="button" onClick={onClearCart} style={{ color: '#64748B' }} className="text-xs hover:text-[#071B52] transition-colors">Clear all</button>
            )}
          </div>
        </div>

        {customer ? (
          <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'rgba(27,47,94,0.08)', border: '1px solid rgba(27,47,94,0.18)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'rgba(27,47,94,0.12)', border: '1px solid rgba(27,47,94,0.22)', color: '#071B52' }}>
              {(customer.name || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[#0F172A] text-xs font-semibold truncate flex items-center gap-1">
                {customer.name}
                {customer.is_vip && <Crown size={9} style={{ color: '#071B52' }} />}
              </div>
              <div className="text-[#64748B] text-[10px] flex items-center gap-1">
                <span className="capitalize">{customer.membership_tier || 'bronze'}</span>
                {customer.phone && <span>· {customer.phone}</span>}
              </div>
            </div>
            <button type="button" onClick={onUnlinkCustomer}
              className="p-1 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400 transition-colors flex-shrink-0">
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <User size={13} className="absolute left-3 top-[9px] text-[#64748B]" />
            <input ref={customerSearchRef} className="input-field pl-8 pr-8 text-xs py-2"
              placeholder="Search or type phone to link customer…"
              value={custSearch}
              onChange={onCustSearchChange}
              onFocus={onCustFocus}
              onBlur={onCustBlur}
            />
            {custSearch && (
              <button type="button" onClick={onClearCustSearch}
                className="absolute right-2.5 top-[9px] text-[#64748B] hover:text-[#071B52] transition-colors">
                <X size={12} />
              </button>
            )}
            {custDropOpen && !showQuickAdd && (
              <div className="absolute z-20 w-full mt-1 glass-card py-1 max-h-40 overflow-y-auto shadow-xl">
                {customers.length === 0 && <div className="px-3 py-2 text-[10px] text-[#64748B] italic">No customers found…</div>}
                {customers.map((c) => (
                  <div key={c.id} onClick={(e) => { e.preventDefault(); onLinkCustomer(c) }}
                    className="px-3 py-2.5 text-xs text-[#64748B] hover:bg-white active:bg-white cursor-pointer flex items-center gap-2 transition-colors">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: 'rgba(27,47,94,0.12)', color: '#071B52' }}>{(c.name || '?')[0].toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#0F172A] font-semibold truncate">{c.name}</div>
                      {c.phone && <div className="text-[#64748B] text-[10px]">{c.phone}</div>}
                    </div>
                    <span className="text-[9px] capitalize text-[#64748B] flex-shrink-0">{c.membership_tier || 'bronze'}</span>
                  </div>
                ))}
                <div onClick={(e) => { e.preventDefault(); onShowQuickAdd() }}
                  className="px-3 py-2 text-xs flex items-center gap-2 hover:bg-white active:bg-white cursor-pointer border-t border-[rgba(15,23,42,0.08)] transition-colors" style={{ color: '#071B52' }}>
                  <UserPlus size={12} />
                  <span>Add &quot;<strong>{custSearch}</strong>&quot; as new customer</span>
                </div>
              </div>
            )}
            <AnimatePresence>
              {showQuickAdd && (
                <motion.form initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  onSubmit={onQuickAddSubmit} className="absolute z-20 w-full mt-1 glass-card p-3 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: '#071B52' }}><UserPlus size={10} /> New Customer</span>
                    <button type="button" onClick={onHideQuickAdd} className="text-[#64748B] hover:text-[#071B52]"><X size={11} /></button>
                  </div>
                  <div className="space-y-2">
                    <input className="input-field text-xs py-1.5" placeholder="Full name *" value={quickForm.name} onChange={(e) => onQuickFormChange({ ...quickForm, name: e.target.value })} required autoFocus />
                    <input className="input-field text-xs py-1.5" placeholder="Phone number" value={quickForm.phone} onChange={(e) => onQuickFormChange({ ...quickForm, phone: e.target.value })} inputMode="tel" />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={onHideQuickAdd} className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold btn-ghost">Cancel</button>
                    <button type="submit" disabled={quickSaving} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1" style={{ background: '#071B52', color: '#FFFFFF' }}>
                      {quickSaving ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={10} />}
                      Add & Link
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        )}

        {customer && customer.loyalty_points > 0 && (
          <div className="mt-2 p-2.5 rounded-xl" style={{ background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.22)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Award size={11} style={{ color: '#0A84FF' }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0A84FF' }}>{customer.membership_tier || 'Bronze'} Member</span>
                {customer.is_vip && <Crown size={9} style={{ color: '#0A84FF' }} />}
              </div>
              <span className="text-[10px] font-bold" style={{ color: '#0A84FF' }}>{Number(customer.loyalty_points).toLocaleString()} pts</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#8E8E93] text-[10px] whitespace-nowrap">Redeem:</span>
              <input type="number" min="0" max={customer.loyalty_points}
                value={redeemPoints || ''}
                onChange={(e) => onRedeemPointsChange(Math.min(parseInt(e.target.value, 10) || 0, customer.loyalty_points))}
                className="input-field py-1 text-xs text-center w-16 flex-shrink-0" placeholder="0" />
              <span className="text-[#8E8E93] text-[10px] whitespace-nowrap">pts = Rs.{(redeemPoints * pointsRate).toFixed(0)}</span>
              {redeemPoints > 0 && (
                <button type="button" onClick={onClearRedeemPoints} className="text-[#8E8E93] hover:text-red-400 transition-colors ml-auto"><X size={10} /></button>
              )}
            </div>
            {redeemPoints > 0 && (
              <div className="mt-1.5 text-center text-[10px] font-semibold text-green-400">- Rs.{redeemValue.toFixed(2)} discount applied</div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {cart.length === 0 ? (
          <div className="text-center py-12 text-[#64748B]">
            <ShoppingCartIcon size={36} className="mx-auto mb-3 opacity-25" />
            <p className="text-sm">Tap products to add</p>
          </div>
        ) : cart.map((item, idx) => {
          const key = cartItemKey(item, idx)
          return (
            <div key={key} className="dgc-pos-cart-item p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[#0F172A] text-xs font-medium leading-tight flex-1">{item.product_name || 'Item'}</span>
                <button type="button" onClick={() => removeFromCart(item.product_id, item.variant_id)} className="text-[#94A3B8] hover:text-[#071B52] flex-shrink-0 transition-colors"><X size={12} /></button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => updateQty(key, -1)} className="pos-qty-btn w-6 h-6 rounded-lg bg-[rgba(7,27,82,0.04)] border border-[rgba(7,27,82,0.10)] text-[#64748B] flex items-center justify-center hover:border-[#0B5FFF] hover:text-[#071B52] transition-all"><Minus size={10} /></button>
                  <span className="text-[#071B52] text-sm font-bold w-6 text-center">{item.qty}</span>
                  <button type="button" onClick={() => updateQty(key, 1)} className="pos-qty-btn w-6 h-6 rounded-lg bg-[rgba(7,27,82,0.04)] border border-[rgba(7,27,82,0.10)] text-[#64748B] flex items-center justify-center hover:border-[#0B5FFF] hover:text-[#071B52] transition-all"><Plus size={10} /></button>
                </div>
                <span className="text-[#071B52] text-sm font-bold font-display">Rs.{Number(item.total).toLocaleString()}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="dgc-pos-cart-totals p-5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="input-label text-[10px]" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Discount %
              {discountBlocked && (
                <span style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 4, padding: '0px 5px', color: '#F87171', fontSize: '0.6rem', fontWeight: 800 }}>MAX {POS_MAX_DISCOUNT_PCT}%</span>
              )}
              {(parseFloat(discPct) || 0) > 0 && !discountBlocked && (
                <span style={{ background: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.25)', borderRadius: 4, padding: '0px 5px', color: '#047857', fontSize: '0.6rem', fontWeight: 700 }}>✓ OK</span>
              )}
            </label>
            <input type="number" className="input-field text-xs py-2" value={discPct}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0
                if (v > POS_MAX_DISCOUNT_PCT) toast.error(`Max discount is ${POS_MAX_DISCOUNT_PCT}%`, { id: 'disc-warn', duration: 2500 })
                setDiscPct(e.target.value)
              }}
              placeholder="0" min="0" max={POS_MAX_DISCOUNT_PCT}
              style={discountBlocked ? { borderColor: 'rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.08)', color: '#F87171' } : {}} />
          </div>
          <div>
            <label className="input-label text-[10px]">Tax %</label>
            <input type="number" className="input-field text-xs py-2" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} placeholder="0" min="0" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="text" className="input-field text-xs py-2" placeholder="Promo code (optional)"
            value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            style={{ flex: 1, letterSpacing: '0.06em' }}
            onKeyDown={(e) => { if (e.key === 'Enter') applyPromo() }} />
          {appliedPromo ? (
            <button type="button" onClick={() => { setPromoCode(''); setPromoDiscount(0); setAppliedPromo(null) }}
              style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Clear
            </button>
          ) : (
            <button type="button" onClick={applyPromo}
              style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.22)', color: '#B45309', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Apply
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="text" className="input-field text-xs py-2" placeholder="Gift card code (GC-XXXX-XXXX)"
            value={gcCode} onChange={(e) => setGcCode(e.target.value.toUpperCase())}
            style={{ flex: 1, letterSpacing: '0.06em', fontFamily: 'monospace' }}
            disabled={!!appliedGC} />
          {appliedGC ? (
            <button type="button" onClick={() => { setGcCode(''); setAppliedGC(null) }}
              style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Remove
            </button>
          ) : (
            <button type="button" onClick={applyGiftCard}
              style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.22)', color: '#047857', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Apply GC
            </button>
          )}
        </div>

        <div className="space-y-1.5 text-xs" style={{ color: '#64748B' }}>
          <div className="flex justify-between"><span>Subtotal</span><span style={{ color: '#0F172A' }}>{cur(subtotal)}</span></div>
          {discAmt > 0 && <div className="flex justify-between"><span>Discount</span><span style={{ color: '#0F172A' }}>-{cur(discAmt)}</span></div>}
          {appliedPromo && promoDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}><span>Promo: {appliedPromo.name}</span><span style={{ color: '#0F172A' }}>-{cur(promoDiscount)}</span></div>}
          {taxAmt > 0 && <div className="flex justify-between"><span>Tax ({taxPct}%)</span><span style={{ color: '#0F172A' }}>{cur(taxAmt)}</span></div>}
          {redeemValue > 0 && <div className="flex justify-between"><span>Points Redeemed ({redeemPoints} pts)</span><span style={{ color: '#0F172A' }}>-{cur(redeemValue)}</span></div>}
          {gcDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}><span>Gift Card ({appliedGC.code})</span><span style={{ color: '#0F172A' }}>-{cur(gcDiscount)}</span></div>}
          <div className="dgc-pos-total-due flex justify-between items-center border-t border-[rgba(7,27,82,0.10)] pt-3 mt-2"
            style={{ background: 'linear-gradient(135deg, rgba(11,95,255,0.10) 0%, rgba(7,27,82,0.05) 100%)', border: '1px solid rgba(11,95,255,0.22)', borderRadius: 12, padding: '10px 12px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Payable</span>
            <span className="dgc-pos-total-amt" style={{ color: '#0B5FFF', fontWeight: 900, fontSize: '1.2rem', fontFamily: '"JetBrains Mono",monospace', letterSpacing: '-0.02em' }}>{cur(total)}</span>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div className={`relative w-8 h-4 rounded-full transition-colors ${splitPayment ? 'bg-[#0B5FFF]' : 'bg-[rgba(7,27,82,0.12)]'}`}
            onClick={() => { setSplitPayment((v) => !v); setCashAmount(''); setCardAmount('') }}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${splitPayment ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>Split Payment</span>
        </label>

        {!splitPayment && (
          <div className="grid grid-cols-3 gap-1.5">
            {[{ k: 'cash', icon: Banknote, label: 'Cash' }, { k: 'card', icon: CreditCard, label: 'Card' }, { k: 'qr', icon: QrCode, label: 'QR' }].map(({ k, icon: Icon, label }) => (
              <button key={k} type="button" onClick={() => setPayment(k)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-semibold transition-all ${payment === k ? 'bg-[#071B52] border-[#0B5FFF] text-white shadow-[0_2px_8px_rgba(11,95,255,0.25)]' : 'border-[rgba(7,27,82,0.10)] bg-white text-[#64748B] hover:border-[#0B5FFF] hover:text-[#071B52]'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
        )}

        {!splitPayment && payment === 'cash' && (
          <div>
            <label className="input-label text-[10px]">Cash Received</label>
            <input type="number" className="input-field text-sm py-2" value={amtPaid}
              onChange={(e) => setAmtPaid(e.target.value)} placeholder={cur(total)} />
            {change > 0 && <div className="text-success text-xs mt-1 font-semibold">Change: {cur(change)}</div>}
          </div>
        )}

        {splitPayment && (
          <div className="space-y-2">
            <div>
              <label className="input-label text-[10px] flex items-center gap-1"><Banknote size={10} /> Cash Amount</label>
              <input type="number" className="input-field text-sm py-2" value={cashAmount} placeholder="0.00" min="0"
                onChange={(e) => { const v = e.target.value; setCashAmount(v); const rem = Math.max(0, total - parseFloat(v || 0)); setCardAmount(rem > 0 ? rem.toFixed(2) : '') }} />
            </div>
            <div>
              <label className="input-label text-[10px] flex items-center gap-1"><CreditCard size={10} /> Card Amount</label>
              <input type="number" className="input-field text-sm py-2" value={cardAmount} placeholder="0.00" min="0"
                onChange={(e) => { const v = e.target.value; setCardAmount(v); const rem = Math.max(0, total - parseFloat(v || 0)); setCashAmount(rem > 0 ? rem.toFixed(2) : '') }} />
            </div>
            {(parseFloat(cashAmount || 0) + parseFloat(cardAmount || 0)) > 0 && (
              <div className="text-[10px] text-[#64748B] text-right">
                Total covered: <span className={`font-semibold ${parseFloat(cashAmount || 0) + parseFloat(cardAmount || 0) >= total ? 'text-green-600' : 'text-red-500'}`}>
                  {cur(parseFloat(cashAmount || 0) + parseFloat(cardAmount || 0))}
                </span>
              </div>
            )}
          </div>
        )}

        {discountBlocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '8px 12px' }}>
            <ShieldX size={14} style={{ color: '#F87171', flexShrink: 0 }} />
            <span style={{ color: '#FCA5A5', fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.3 }}>Discount {(parseFloat(discPct) || 0)}% exceeds max {POS_MAX_DISCOUNT_PCT}%. Sale blocked.</span>
          </div>
        )}

        <button type="button" onClick={onOpenCheckout}
          disabled={cart.length === 0 || discountBlocked}
          className="w-full py-3 flex items-center justify-center gap-2 text-sm font-bold rounded-xl transition-all"
          style={discountBlocked ? { opacity: 0.4, cursor: 'not-allowed', background: 'rgba(100,116,139,0.2)', border: '1px solid rgba(100,116,139,0.3)', color: '#64748B' } : { background: 'linear-gradient(135deg, #071B52 0%, #0B5FFF 100%)', color: '#FFFFFF', border: '1px solid #0B5FFF', boxShadow: '0 4px 18px rgba(11,95,255,0.30)' }}>
          {discountBlocked
            ? <><ShieldX size={15} /> Sale Blocked — Discount Too High</>
            : <><ChevronRight size={15} /> Proceed to Checkout</>}
        </button>
      </div>
    </CartErrorBoundary>
  )
}