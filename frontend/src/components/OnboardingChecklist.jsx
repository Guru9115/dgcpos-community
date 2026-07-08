import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Rocket, X, MessageSquare } from 'lucide-react'
import { onboardingAPI } from '../api'
import toast from 'react-hot-toast'

const STEP_LINKS = {
  profile: '/settings',
  products: '/products',
  pos_sale: '/pos',
  team: '/settings',
  feedback: null,
}

export default function OnboardingChecklist({ onDismiss }) {
  const [steps, setSteps] = useState([])
  const [progress, setProgress] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState({ rating: 5, message: '' })
  const [loading, setLoading] = useState(true)

  const load = () => {
    onboardingAPI.getChecklist()
      .then(r => {
        setSteps(r.data.steps || [])
        setProgress(r.data.progress || 0)
        setCompleted(r.data.completed)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const submitFeedback = async (e) => {
    e.preventDefault()
    if (!feedback.message.trim()) return
    try {
      await onboardingAPI.submitFeedback({ ...feedback, category: 'onboarding', page: 'dashboard' })
      toast.success('Thanks for your feedback!')
      setShowFeedback(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit feedback')
    }
  }

  if (loading || completed) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
      style={{ border: '1px solid rgba(11,95,255,0.22)' }}
    >
      <div className="p-4 border-b border-glass-border flex items-center justify-between bg-gold/5">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-gold" />
          <div>
            <p className="text-sm font-semibold text-txt m-0">Getting started — {progress}% complete</p>
            <p className="text-[11px] text-txt-3 m-0">Complete these steps to get the most from RetailOS beta</p>
          </div>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="p-1.5 rounded-lg hover:bg-white/5 text-txt-3">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="p-4 grid gap-2">
        {steps.map(step => {
          const link = STEP_LINKS[step.id]
          const content = (
            <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors">
              {step.done
                ? <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
                : <Circle size={18} className="text-txt-3 flex-shrink-0" />}
              <span className={`text-sm ${step.done ? 'text-txt-3 line-through' : 'text-txt'}`}>{step.label}</span>
            </div>
          )
          if (step.id === 'feedback' && !step.done) {
            return (
              <button key={step.id} type="button" onClick={() => setShowFeedback(true)} className="text-left w-full">
                {content}
              </button>
            )
          }
          return link && !step.done
            ? <Link key={step.id} to={link}>{content}</Link>
            : <div key={step.id}>{content}</div>
        })}
      </div>

      <div className="px-4 pb-4">
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-gold/80 to-emerald-400/80 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <AnimatePresence>
        {showFeedback && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={submitFeedback}
            className="px-4 pb-4 border-t border-glass-border pt-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-txt">
              <MessageSquare size={14} className="text-gold" /> Share beta feedback
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFeedback(f => ({ ...f, rating: n }))}
                  className={`w-8 h-8 rounded-lg text-xs font-bold ${feedback.rating >= n ? 'bg-gold/20 text-gold' : 'bg-white/5 text-txt-3'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <textarea
              className="input-field min-h-[80px]"
              placeholder="What would make RetailOS better for your business?"
              value={feedback.message}
              onChange={e => setFeedback(f => ({ ...f, message: e.target.value }))}
              required
            />
            <button type="submit" className="btn-gold text-xs px-4 py-2">Submit Feedback</button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  )
}