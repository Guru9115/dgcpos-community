const PREFIX = '[POS Cart]'

/**
 * Lightweight cart telemetry — console + CustomEvent for future analytics wiring.
 */
export function trackCartEvent(event, detail = {}) {
  const payload = { event, ts: Date.now(), ...detail }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(PREFIX, event, detail)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dgc:pos-cart', { detail: payload }))
  }
  return payload
}