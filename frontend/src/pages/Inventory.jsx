import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { inventoryAPI, productsAPI } from '../api'
import toast from 'react-hot-toast'
import { Plus, AlertTriangle, Package, TrendingDown, X, Check } from 'lucide-react'
import { format } from 'date-fns'

function StockAdjustModal({ product, onClose, onSaved }) {
  const [newQty, setNewQty] = useState(product.stock_qty)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    setSaving(true)
    try {
      await inventoryAPI.adjustStock({ product_id: product.id, new_qty: parseInt(newQty), notes })
      toast.success('Stock updated')
      onSaved()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} className="modal-panel mx-4 max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-txt">Adjust Stock</h3>
          <button onClick={onClose} className="text-txt-3 hover:text-txt"><X size={16}/></button>
        </div>
        <div className="text-txt text-sm font-medium mb-4">{product.name}</div>
        <div className="space-y-3">
          <div><label className="input-label">Current Stock</label>
            <div className="text-gold font-display text-xl font-bold">{product.stock_qty} {product.unit}</div></div>
          <div><label className="input-label">New Stock Quantity</label>
            <input type="number" className="input-field" value={newQty} onChange={e=>setNewQty(e.target.value)} min="0"/></div>
          <div><label className="input-label">Reason / Notes</label>
            <input className="input-field" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Damaged, Manual count, etc."/></div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-gold flex items-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/> : <Check size={14}/>}
              Update
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function Inventory() {
  const [tab, setTab] = useState('overview')
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [valuation, setValuation] = useState(null)
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [p, m, v] = await Promise.all([
        inventoryAPI.getLowStock(), inventoryAPI.getMovements(), inventoryAPI.getValuation()
      ])
      setProducts(p.data); setMovements(m.data.movements); setValuation(v.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const cur = v => `Rs. ${Number(v||0).toLocaleString('en-IN')}`
  const tabs = ['overview','low-stock','movements','valuation']

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="section-title">Inventory</h2></div>
      </div>
      {/* Tabs */}
      <div className="dgc-submenu-bar">
        {tabs.map(t => (
          <button key={t} type="button" onClick={()=>setTab(t)}
            className={`dgc-submenu-tab capitalize ${tab===t?'active':''}`}>
            {t.replace('-',' ')}
          </button>
        ))}
      </div>

      {tab === 'overview' && valuation && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {label:'Total Products',value:valuation.items?.length,icon:Package,color:'text-gold'},
            {label:'Cost Value',value:cur(valuation.total_cost_value),icon:TrendingDown,color:'text-blue-400'},
            {label:'Retail Value',value:cur(valuation.total_retail_value),icon:Package,color:'text-success'},
            {label:'Potential Profit',value:cur(valuation.potential_profit),icon:TrendingDown,color:'text-gold'},
          ].map((kpi,i) => (
            <div key={i} className="kpi-card">
              <div className={`text-xs font-semibold tracking-widest uppercase mb-2 ${kpi.color}`}>{kpi.label}</div>
              <div className="font-display text-2xl font-bold text-txt">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'low-stock' && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-glass-border flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400"/>
            <span className="text-txt font-semibold text-sm">Low Stock Alerts</span>
            <span className="badge-red ml-auto">{products.length} items</span>
          </div>
          <table className="w-full">
            <thead><tr>
              <th className="table-header">Product</th>
              <th className="table-header text-center">Stock</th>
              <th className="table-header text-center">Reorder</th>
              <th className="table-header"></th>
            </tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="table-cell"><div className="text-txt text-sm font-medium">{p.name}</div><div className="text-txt-3 text-xs">{p.category_name}</div></td>
                  <td className="table-cell text-center"><span className="badge-red">{p.stock_qty}</span></td>
                  <td className="table-cell text-center text-txt-2 text-xs">{p.reorder_level}</td>
                  <td className="table-cell text-right">
                    <button onClick={()=>setAdjustTarget(p)} className="btn-ghost text-xs py-1.5 px-3">Adjust</button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={4} className="table-cell text-center py-8 text-success">✓ All products are well stocked!</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'movements' && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-glass-border"><span className="text-txt font-semibold text-sm">Stock Movements</span></div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead><tr>
              <th className="table-header">Product</th>
              <th className="table-header">Type</th>
              <th className="table-header text-center">Before</th>
              <th className="table-header text-center">Change</th>
              <th className="table-header text-center">After</th>
              <th className="table-header">Date</th>
            </tr></thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} className="table-row">
                  <td className="table-cell text-txt text-sm">{m.product_name}</td>
                  <td className="table-cell"><span className="badge-blue capitalize">{m.movement_type}</span></td>
                  <td className="table-cell text-center text-txt-2 text-xs">{m.qty_before}</td>
                  <td className="table-cell text-center">
                    <span className={m.qty_change > 0 ? 'text-success text-xs font-bold' : 'text-red-400 text-xs font-bold'}>
                      {m.qty_change > 0 ? '+' : ''}{m.qty_change}
                    </span>
                  </td>
                  <td className="table-cell text-center text-txt-2 text-xs">{m.qty_after}</td>
                  <td className="table-cell text-txt-3 text-xs">{m.created_at ? format(new Date(m.created_at),'dd/MM/yy HH:mm') : '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && <tr><td colSpan={6} className="table-cell text-center py-8 text-txt-3">No movements yet</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === 'valuation' && valuation && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-glass-border"><span className="text-txt font-semibold text-sm">Inventory Valuation Report</span></div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead><tr>
              <th className="table-header">Product</th>
              <th className="table-header">Category</th>
              <th className="table-header text-right">Cost Price</th>
              <th className="table-header text-right">Sell Price</th>
              <th className="table-header text-center">Stock</th>
              <th className="table-header text-right">Cost Value</th>
              <th className="table-header text-right">Retail Value</th>
            </tr></thead>
            <tbody>
              {valuation.items?.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="table-cell text-txt text-sm">{p.name}</td>
                  <td className="table-cell"><span className="badge-blue text-[10px]">{p.category||'—'}</span></td>
                  <td className="table-cell text-right text-txt-2 text-xs">{cur(p.cost_price)}</td>
                  <td className="table-cell text-right text-txt-2 text-xs">{cur(p.selling_price)}</td>
                  <td className="table-cell text-center text-xs">{p.stock_qty}</td>
                  <td className="table-cell text-right text-xs text-txt-2">{cur(p.cost_value)}</td>
                  <td className="table-cell text-right text-xs font-semibold text-gold">{cur(p.retail_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {adjustTarget && (
        <StockAdjustModal product={adjustTarget} onClose={()=>setAdjustTarget(null)} onSaved={()=>{setAdjustTarget(null);load()}} />
      )}
    </div>
  )
}
