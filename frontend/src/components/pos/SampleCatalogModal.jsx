import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Sparkles, Store, Check, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { productsAPI } from '../../api'

export default function SampleCatalogModal({ onClose, onAdded }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [meta, setMeta] = useState(null)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [listOnBazaar, setListOnBazaar] = useState(true)

  useEffect(() => {
    productsAPI.getSampleCatalog()
      .then((r) => {
        const list = r.data?.items || []
        setMeta(r.data?.meta || null)
        setItems(list)
        setSelected(new Set(list.map((it) => it.id)))
      })
      .catch((err) => {
        toast.error(err.response?.data?.error || 'Could not load sample catalog')
        onClose()
      })
      .finally(() => setLoading(false))
  }, [onClose])

  const allSelected = items.length > 0 && selected.size === items.length

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(items.map((it) => it.id)))
  }

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = async () => {
    if (!selected.size) return toast.error('Select at least one item')
    setSaving(true)
    try {
      const res = await productsAPI.createSampleBatch({
        item_ids: [...selected],
        list_on_bazaar: listOnBazaar,
      })
      const { created = 0, skipped = 0, bazaar_listed = 0 } = res.data || {}
      const parts = [`${created} added to inventory`]
      if (bazaar_listed) parts.push(`${bazaar_listed} listed on Bazaar`)
      if (skipped) parts.push(`${skipped} skipped (already exist)`)
      toast.success(parts.join(' · '), { icon: '✨', duration: 5000 })
      onAdded?.(res.data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add sample items')
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay dgc-modal-layer dgc-upload-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="modal-panel dgc-upload-modal dgc-liquid-frosted mx-4 max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h3 className="font-display text-lg font-bold text-txt dgc-text-3d flex items-center gap-2">
            <Sparkles size={18} className="text-gold" />
            {meta?.ai_label || 'AI Sample Catalog'}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-glass text-txt-3">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-txt-3 mb-1 px-6 shrink-0">
          {meta?.disclaimer || 'Sample version — demo prices & placeholder images'}
        </p>
        {meta?.store_label && (
          <p className="text-xs text-txt-2 mb-3 px-6 shrink-0">
            Tailored for <strong>{meta.store_label}</strong> · {items.length} items
          </p>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16 text-txt-3 text-sm">Loading sample catalog…</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-3 px-6 shrink-0">
              <button type="button" onClick={toggleAll} className="text-xs font-semibold text-gold hover:underline">
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <label className="flex items-center gap-2 text-xs text-txt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={listOnBazaar}
                  onChange={(e) => setListOnBazaar(e.target.checked)}
                  className="rounded border-glass-border"
                />
                <Store size={12} className="text-[#8B5E3C]" />
                Also list on DGC Bazaar
              </label>
            </div>

            <div className="dgc-upload-modal-body px-6 pb-4 space-y-2">
              {items.map((item) => {
                const on = selected.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleOne(item.id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      on
                        ? 'bg-[rgba(245,166,35,0.08)] border-[rgba(139,94,60,0.35)]'
                        : 'bg-glass border-glass-border hover:border-[rgba(11,95,255,0.2)]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        on ? 'bg-gold border-gold text-white' : 'border-glass-border'
                      }`}
                    >
                      {on && <Check size={12} strokeWidth={3} />}
                    </div>
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-glass shrink-0 border border-glass-border">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">{item.emoji || '🛍️'}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-txt truncate flex items-center gap-1.5">
                        <span>{item.emoji}</span>
                        {item.name}
                      </div>
                      <div className="text-xs text-txt-3 mt-0.5">
                        {item.category} · {item.stock_qty} {item.unit}
                      </div>
                      <div className="text-xs font-bold text-emerald-600 mt-1">
                        Rs.{Number(item.selling_price || 0).toLocaleString()}
                        <span className="text-txt-3 font-normal ml-2">
                          cost Rs.{Number(item.cost_price || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-txt-3 shrink-0">Sample</span>
                  </button>
                )
              })}
            </div>

            <div className="dgc-modal-actions">
              <button
                type="button"
                onClick={submit}
                disabled={saving || !selected.size}
                className="btn-gold w-full py-3 font-bold flex items-center justify-center gap-2"
              >
                <Package size={16} />
                {saving
                  ? 'Adding items…'
                  : `Add ${selected.size} sample item${selected.size !== 1 ? 's' : ''} to POS`}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )

  return createPortal(modal, document.body)
}