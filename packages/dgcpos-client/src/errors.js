export class DgcPosError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message)
    this.name = 'DgcPosError'
    this.status = status ?? 0
    this.code = code
    this.data = data
  }
}

export async function parseErrorResponse(res) {
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  const message = data?.error || data?.message || res.statusText || 'Request failed'
  return new DgcPosError(message, {
    status: res.status,
    code: data?.code,
    data,
  })
}