/** Community Edition stub — live payment gateways require Enterprise. */
export function loadKhaltiScript() {
  return Promise.resolve()
}

export function submitEsewaForm() {
  throw new Error('Live eSewa payments require DGCPOS Enterprise')
}