/** Read version baked into the installed app bundle (Capacitor / PWA). */
export async function loadBundledAppVersion() {
  if (typeof window !== 'undefined' && window.__APP_VERSION__) {
    return {
      version: window.__APP_VERSION__,
      build: window.__APP_BUILD__ || null,
      codename: 'Mobile',
      created_by: 'GuruShah',
      source: 'bundle',
    }
  }

  try {
    const base = import.meta.env.BASE_URL || './'
    const url = `${base}version.json`.replace(/\.\/\//, './')
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return { ...data, source: 'bundle' }
  } catch {
    return null
  }
}