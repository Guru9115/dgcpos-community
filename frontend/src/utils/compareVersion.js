/** Compare semver-ish strings: 1 if a>b, -1 if a<b, 0 if equal */
export function compareVersion(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

export function isNewerVersion(latest, current) {
  return compareVersion(latest, current) > 0
}