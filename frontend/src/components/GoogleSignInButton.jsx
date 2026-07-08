import { GoogleLogin } from '@react-oauth/google'
import toast from 'react-hot-toast'

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'signin_with',
  disabled = false,
  width = '100%',
}) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  if (!clientId) {
    return (
      <p style={{
        margin: 0,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(148,163,184,0.12)',
        color: '#64748b',
        fontSize: '0.8rem',
        textAlign: 'center',
      }}>
        Google sign-in is not configured yet.
      </p>
    )
  }

  return (
    <div style={{ opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <GoogleLogin
        onSuccess={async (response) => {
          try {
            await onSuccess(response.credential)
          } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Google sign-in failed'
            toast.error(msg)
            onError?.(err)
          }
        }}
        onError={() => {
          toast.error('Google sign-in was cancelled or failed')
          onError?.()
        }}
        text={text}
        shape="rectangular"
        theme="outline"
        size="large"
        width={width}
        useOneTap={false}
      />
    </div>
  )
}