const STORAGE_KEY = 'dgc_core_ai_drafts'

export function loadCoreAIDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCoreAIDraft(draft) {
  const drafts = loadCoreAIDrafts()
  const entry = {
    id: draft.id || `draft-${Date.now()}`,
    savedAt: new Date().toISOString(),
    ...draft,
  }
  const next = [entry, ...drafts.filter((d) => d.id !== entry.id)].slice(0, 30)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return entry
}

export function removeCoreAIDraft(id) {
  const next = loadCoreAIDrafts().filter((d) => d.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export const BACKGROUND_STYLES = [
  { id: 'auto', label: 'AI auto', desc: 'Best match for product type' },
  { id: 'white_marble', label: 'White marble', desc: 'Liquid crystal marble studio' },
  { id: 'marble_floor', label: 'Marble floor', desc: 'Product on marble floor' },
  { id: 'studio_white', label: 'Plain white', desc: 'Clean white gradient' },
  { id: 'warm_fashion', label: 'Warm boutique', desc: 'Fashion & apparel' },
  { id: 'cool_tech', label: 'Cool tech', desc: 'Electronics & gadgets' },
  { id: 'fresh_grocery', label: 'Fresh grocery', desc: 'Kirana & food' },
]

export function backgroundLabel(id) {
  return BACKGROUND_STYLES.find((b) => b.id === id)?.label || id?.replace(/_/g, ' ') || 'Studio'
}