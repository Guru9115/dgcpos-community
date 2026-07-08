import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { suppliersAPI } from '../api'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, X, Check, Truck } from 'lucide-react'

function SupplierModal({ supplier, onClose, onSaved }) {
  const editing = !!supplier?.id
  const [form, setForm] = useState({name:'',contact:'',phone:'',email:'',address:'',notes:'',pan_number:'',tax_number:'', ...(supplier||{})})
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const submit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await suppliersAPI.update(supplier.id, form)
      else await suppliersAPI.create(form)
      toast.success(editing?'Updated':'Added'); onSaved()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} className="modal-panel mx-4 max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold text-txt">{editing?'Edit Supplier':'Add Supplier'}</h3>
          <button onClick={onClose} className="text-txt-3 hover:text-txt"><X size={16}/></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="input-label">Supplier Name *</label><input className="input-field" value={form.name} onChange={e=>set('name',e.target.value)} required/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">Contact Person</label><input className="input-field" value={form.contact||''} onChange={e=>set('contact',e.target.value)}/></div>
            <div><label className="input-label">Phone</label><input className="input-field" value={form.phone||''} onChange={e=>set('phone',e.target.value)}/></div>
          </div>
          <div><label className="input-label">Email</label><input type="email" className="input-field" value={form.email||''} onChange={e=>set('email',e.target.value)}/></div>
          <div><label className="input-label">Address</label><textarea className="input-field h-16 resize-none" value={form.address||''} onChange={e=>set('address',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">PAN Number</label><input className="input-field" value={form.pan_number||''} onChange={e=>set('pan_number',e.target.value)}/></div>
            <div><label className="input-label">Tax Number</label><input className="input-field" value={form.tax_number||''} onChange={e=>set('tax_number',e.target.value)}/></div>
          </div>
          <div><label className="input-label">Notes</label><input className="input-field" value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2">
              {saving?<div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin"/>:<Check size={14}/>}
              {editing?'Update':'Add'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = async () => { setLoading(true); try { const r = await suppliersAPI.getAll(); setSuppliers(r.data) } finally { setLoading(false) } }
  useEffect(()=>{ load() },[])
  const handleDelete = async (s) => {
    if (!confirm(`Delete ${s.name}?`)) return
    try { await suppliersAPI.delete(s.id); toast.success('Deleted'); load() } catch { toast.error('Failed') }
  }
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="section-title">Suppliers</h2><p className="section-subtitle">{suppliers.length} suppliers</p></div>
        <button onClick={()=>setModal({})} className="btn-gold flex items-center gap-2"><Plus size={14}/> Add Supplier</button>
      </div>
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead><tr>
            <th className="table-header">Supplier</th>
            <th className="table-header">Contact</th>
            <th className="table-header">Phone</th>
            <th className="table-header">Email</th>
            <th className="table-header text-center">Orders</th>
            <th className="table-header"></th>
          </tr></thead>
          <tbody>
            {loading ? [...Array(3)].map((_,i)=>(<tr key={i}><td colSpan={6} className="table-cell"><div className="h-4 bg-white/[0.04] rounded animate-pulse"/></td></tr>))
            : suppliers.length === 0 ? <tr><td colSpan={6} className="table-cell text-center py-10 text-txt-3">No suppliers yet</td></tr>
            : suppliers.map(s => (
              <motion.tr key={s.id} initial={{opacity:0}} animate={{opacity:1}} className="table-row">
                <td className="table-cell">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0"><Truck size={13}/></div>
                    <span className="text-txt text-sm font-medium">{s.name}</span>
                  </div>
                </td>
                <td className="table-cell text-txt-2 text-sm">{s.contact||'—'}</td>
                <td className="table-cell text-txt-2 text-sm">{s.phone||'—'}</td>
                <td className="table-cell text-txt-2 text-sm">{s.email||'—'}</td>
                <td className="table-cell text-center"><span className="badge-blue">{s.purchase_count}</span></td>
                <td className="table-cell">
                  <div className="flex gap-1 justify-end">
                    <button onClick={()=>setModal(s)} className="p-1.5 rounded-lg hover:bg-glass text-txt-3 hover:text-gold transition-colors"><Edit2 size={13}/></button>
                    <button onClick={()=>handleDelete(s)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-txt-3 hover:text-red-400 transition-colors"><Trash2 size={13}/></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <AnimatePresence>
        {modal !== null && <SupplierModal supplier={modal} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load()}}/>}
      </AnimatePresence>
    </div>
  )
}