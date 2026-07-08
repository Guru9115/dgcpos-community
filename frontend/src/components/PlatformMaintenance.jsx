import { BRAND_LOGO } from '../theme/brand'

export default function PlatformMaintenance({ message, title = 'Temporarily offline' }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      background: 'linear-gradient(165deg, #f6f9fc 0%, #e8f0ff 55%, #f6f9fc 100%)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        maxWidth: 480,
        width: '100%',
        textAlign: 'center',
        background: 'rgba(255,255,255,0.82)',
        border: '1px solid rgba(11,95,255,0.12)',
        borderRadius: 20,
        padding: '36px 28px',
        boxShadow: '0 18px 48px rgba(11,95,255,0.08)',
      }}>
        <img src={BRAND_LOGO} alt="DGC POS" style={{ width: 180, height: 'auto', margin: '0 auto 20px' }} />
        <h1 style={{ margin: '0 0 10px', fontSize: '1.35rem', color: '#0f172a' }}>{title}</h1>
        <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.6, color: '#64748b' }}>
          {message || 'DGC POS is temporarily offline for maintenance. Please try again shortly.'}
        </p>
        <p style={{ margin: '18px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
          Superadmin: use{' '}
          <a href="https://admin.dgcpos.net/admin" style={{ color: '#0B5FFF', fontWeight: 600 }}>
            admin.dgcpos.net
          </a>{' '}
          to bring the app back online.
        </p>
      </div>
    </div>
  )
}