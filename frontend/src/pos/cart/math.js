export const safeCartNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const asArray = (data) => (Array.isArray(data) ? data : [])