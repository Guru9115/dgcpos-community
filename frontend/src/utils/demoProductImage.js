/**
 * Name-matched AI demo product image URLs (mirrors backend product_images.py).
 */
const PROMPT_RULES = [
  [/sari|saree/i, (n) => `elegant ${n} silk saree fabric product photo, draped on mannequin, studio lighting, Nepal fashion retail`],
  [/kurta/i, (n) => `${n} cotton kurta ethnic wear flat lay product photography, white background, ecommerce`],
  [/shoe|sandal|footwear/i, (n) => `${n} running shoes footwear product photo, side angle, clean white background`],
  [/shawl/i, (n) => `${n} handmade wool shawl textile product photo, folded display, artisan craft`],
  [/jeans|denim/i, (n) => `${n} blue denim jeans clothing product photo, flat lay, fashion catalog`],
]

function aiPrompt(name, category) {
  const title = (name || 'product').trim()
  const hay = `${title} ${category || ''}`
  for (const [re, fn] of PROMPT_RULES) {
    if (re.test(hay)) return fn(title)
  }
  const cat = category ? `, ${category} category` : ''
  return `professional ecommerce product photography of ${title}${cat}, isolated on clean white background, high detail, Nepal retail catalog`
}

function seed(name) {
  let h = 0
  const s = (name || 'product').toLowerCase()
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16).slice(0, 12)
}

export function demoProductImageUrl(name, category, w = 480, h = 360) {
  const prompt = encodeURIComponent(aiPrompt(name, category))
  return `https://image.pollinations.ai/prompt/${prompt}?width=${w}&height=${h}&seed=${seed(name)}&nologo=true&enhance=true`
}