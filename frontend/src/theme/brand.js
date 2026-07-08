/** DGC POS brand — matches dgc-pos-logo.png */
export const BRAND_LOGO = '/dgc-pos-logo.png'
export const BRAND_NAME = 'DGC POS'
export const BRAND_TAGLINE = 'Smart POS. Better Business.'

export const brandColors = {
  navy: '#071B52',
  navyDeep: '#0A2540',
  blue: '#0B5FFF',
  blueBright: '#007BFF',
  blueSoft: '#409CFF',
  slate: '#64748B',
  ice: '#F8FAFC',
  cloud: '#F6F9FC',
  surface: '#FFFFFF',
  meshBlue: 'rgba(11, 95, 255, 0.12)',
  meshNavy: 'rgba(7, 27, 82, 0.08)',
}

/** Cloudflare-style page background mesh */
export const pageMeshBackground = `
  radial-gradient(ellipse 90% 55% at 8% -8%, ${brandColors.meshBlue}, transparent 58%),
  radial-gradient(ellipse 70% 45% at 92% 4%, ${brandColors.meshNavy}, transparent 52%),
  radial-gradient(ellipse 55% 40% at 50% 108%, ${brandColors.meshBlue}, transparent 55%),
  linear-gradient(180deg, #f8fbff 0%, #f1f5f9 48%, #eef4ff 100%)
`