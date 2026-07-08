import { useEffect } from 'react'

/** Hide the global app footer while this page/modal is active (portrait + landscape). */
export function useHideAppFooter(active = true) {
  useEffect(() => {
    if (!active) return undefined
    window.__DGC_PAYMENT_ACTIVE__ = true
    document.documentElement.classList.add('dgc-payment-active')
    window.dispatchEvent(new CustomEvent('dgc:payment-mode', { detail: { active: true } }))
    return () => {
      window.__DGC_PAYMENT_ACTIVE__ = false
      document.documentElement.classList.remove('dgc-payment-active')
      window.dispatchEvent(new CustomEvent('dgc:payment-mode', { detail: { active: false } }))
    }
  }, [active])
}