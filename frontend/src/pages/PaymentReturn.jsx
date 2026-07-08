import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { paymentsAPI } from '../api'
import toast from 'react-hot-toast'

const PENDING_KEY = 'dgc_pending_pos_payment'

export function stashPendingPayment(payload) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload))
}

export function popPendingPayment() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function PaymentReturn() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('Verifying payment…')

  useEffect(() => {
    const ref = params.get('ref')
    const method = params.get('method')
    const status = params.get('status')
    const sessionId = params.get('session_id')
    const paypalOrderId = params.get('token')
    const oid = params.get('oid')
    const amt = params.get('amt')
    const refId = params.get('refId')

    if (status === 'cancel' || status === 'fail') {
      toast.error('Payment cancelled')
      navigate('/pos', { replace: true })
      return
    }

    if (!ref) {
      setMsg('Missing payment reference')
      setTimeout(() => navigate('/pos', { replace: true }), 2000)
      return
    }

    ;(async () => {
      try {
        const verifyPayload = { reference: ref, method: method || undefined }
        if (sessionId) verifyPayload.session_id = sessionId
        if (paypalOrderId && (method === 'paypal' || !method)) {
          verifyPayload.order_id = paypalOrderId
          verifyPayload.method = 'paypal'
        }
        if (oid && amt && refId) {
          verifyPayload.oid = oid
          verifyPayload.amt = amt
          verifyPayload.refId = refId
        }
        const r = await paymentsAPI.verify(verifyPayload)
        stashPendingPayment({
          payment_method: r.data.payment_method,
          payment_ref: r.data.payment_ref,
          reference: r.data.reference,
          verified: true,
        })
        const returnTo = params.get('returnTo')
        if (returnTo && returnTo.includes('marketplace')) {
          toast.success('Payment verified — ad submitted for approval')
          setMsg('Payment verified! Returning to Bazaar…')
          setTimeout(() => navigate(decodeURIComponent(returnTo), { replace: true }), 1500)
          return
        }
        toast.success('Payment verified — return to POS to complete sale')
        setMsg('Payment verified! Redirecting to POS…')
      } catch (err) {
        toast.error(err.response?.data?.error || 'Verification failed')
        setMsg('Verification failed. Return to POS and try again.')
      }
      setTimeout(() => navigate('/pos?payment=verified', { replace: true }), 1500)
    })()
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fbff', color: '#071B52', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{msg}</div>
      </div>
    </div>
  )
}