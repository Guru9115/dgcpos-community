/** Bazaar category slugs — synced with backend bazaar_sync.py */

export const BAZAAR_CATEGORIES = [
  { id: 'all', label: 'All', emoji: '🛍️' },
  { id: 'grocery', label: 'Grocery', emoji: '🥬' },
  { id: 'fashion', label: 'Fashion', emoji: '👗' },
  { id: 'electronics', label: 'Electronics', emoji: '📱' },
  { id: 'home', label: 'Home', emoji: '🏠' },
  { id: 'beauty', label: 'Beauty', emoji: '💄' },
  { id: 'kids', label: 'Kids', emoji: '🧸' },
  { id: 'stays', label: 'Stays', emoji: '🏨' },
]

const FALLBACK_MATCH = {
  grocery: /rice|dal|grocery|food|snack|spice|oil|kirana|honey|tea|tomato|potato/i,
  fashion: /cloth|kurta|sari|saree|dress|shoe|fashion|wear|print|shawl|jeans|sandal/i,
  electronics: /phone|laptop|tv|electronic|charger|cable|gadget|bulb|led|board|earbud|speaker/i,
  home: /home|furniture|kitchen|decor|utensil|living/i,
  beauty: /beauty|cosmetic|cream|soap|perfume|face/i,
  kids: /kid|baby|toy|child/i,
  stays: /room|lodge|hotel|guesthouse|stay|hostel|accommodation/i,
}

export function matchBazaarCategory(post, catId) {
  if (!catId || catId === 'all') return true
  if (post.bazaar_category) return post.bazaar_category === catId
  const pattern = FALLBACK_MATCH[catId]
  if (!pattern) return true
  const hay = `${post.title || ''} ${post.description || ''} ${post.category_name || ''} ${post.store_name || ''}`
  return pattern.test(hay)
}