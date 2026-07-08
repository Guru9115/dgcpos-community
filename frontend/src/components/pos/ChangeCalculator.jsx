import { useState } from 'react'
import { motion } from 'framer-motion'
import { Calculator, X } from 'lucide-react'

export default function ChangeCalculator({ total, currency, onClose }) {
  const [given, setGiven] = useState('')
  const change = parseFloat(given || 0) - (total || 0)
  const cur = v => `${currency || 'Rs.'} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const quickAmounts = [100, 200, 500, 1000, 2000, 5000].filter(a => a >= (total || 0) - 1)

  const handleKey = (k) => {
    if (k === 'C')  { setGiven(''); return }
    if (k === '⌫') { setGiven(v => v.slice(0, -1)); return }
    if (k === '.' && given.includes('.')) return
    setGiven(v => v + k)
  }

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '.', '⌫']

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="modal-panel mx-4 w-full max-w-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-[#071B52]" />
            <span className="font-display text-base font-semibold text-txt">Change Calculator</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-glass text-txt-3 hover:text-txt transition-colors"><X size={15} /></button>
        </div>

        <div className="p-3 bg-white/[0.03] border border-glass-border rounded-xl mb-3 flex justify-between items-center">
          <span className="text-txt-3 text-xs uppercase tracking-widest">Bill Total</span>
          <span className="text-[#071B52] font-display font-bold text-lg">{cur(total || 0)}</span>
        </div>

        <div className="p-3 bg-white/[0.05] border border-glass-border rounded-xl mb-3 text-right">
          <div className="text-txt-3 text-[10px] uppercase tracking-widest mb-1">Customer Gives</div>
          <div className="text-txt font-mono text-2xl font-bold min-h-[2rem]">
            {given ? cur(parseFloat(given)) : <span className="text-txt-3 text-base">Enter amount…</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {quickAmounts.slice(0, 6).map(a => (
            <button key={a} onClick={() => setGiven(String(a))}
              className="flex-1 min-w-[60px] py-1.5 rounded-lg bg-glass border border-glass-border text-txt-2 text-xs font-semibold hover:border-gold/30 hover:text-[#071B52] transition-all">
              {a.toLocaleString()}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {keys.map(k => (
            <button key={k} onClick={() => handleKey(k)}
              className={`py-3 rounded-xl text-sm font-bold transition-all
                ${k === 'C' ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                : k === '⌫' ? 'bg-white/[0.05] border border-glass-border text-txt-2 hover:text-txt hover:bg-glass'
                : 'bg-white/[0.04] border border-glass-border text-txt hover:bg-glass hover:border-gold/20'}`}>
              {k}
            </button>
          ))}
        </div>

        <div className={`p-4 rounded-xl border-2 text-center transition-all ${
          !given ? 'border-glass-border bg-white/[0.02]'
          : change >= 0 ? 'border-green-500/30 bg-green-500/10'
          : 'border-red-500/30 bg-red-500/10'}`}>
          <div className="text-xs uppercase tracking-widest mb-1 text-txt-3">
            {!given ? 'Change' : change >= 0 ? 'Return to Customer' : 'Short By'}
          </div>
          <div className={`font-display text-2xl font-bold ${
            !given ? 'text-txt-3' : change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {given ? cur(Math.abs(change)) : '—'}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
