import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, X } from 'lucide-react'
import { useAuth } from '../store/AuthContext'

export default function BetaBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('dg_beta_banner_dismissed') === '1')

  if (dismissed || !user?.account) return null
  const account = user.account
  const isGuest = account.subscription_plan === 'beta_guest' || account.is_guest
  const isBeta = isGuest || account.subscription_plan === 'beta' || account.subscription_status === 'beta'

  if (!isBeta) return null

  return (
    <div
      className="dgc-beta-banner dgc-liquid-frosted"
      style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '8px 16px',
      fontSize: '0.78rem',
      color: '#475569',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Rocket size={14} color="#0B5FFF" />
        <span>
          <strong style={{ color: '#071B52' }}>{isGuest ? 'Guest Beta' : 'Public Beta'}</strong>
          {' — '}
          {isGuest
            ? 'You are in an isolated demo workspace with sample data only — not connected to production admin records.'
            : <>You have full access{account.trial_ends_at && <> until {new Date(account.trial_ends_at).toLocaleDateString()}</>}. Help us improve — share feedback from your dashboard.</>}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/settings" style={{ color: '#0B5FFF', fontWeight: 700, textDecoration: 'none' }}>
          View plans →
        </Link>
        <button
          onClick={() => { localStorage.setItem('dg_beta_banner_dismissed', '1'); setDismissed(true) }}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}