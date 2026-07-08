/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RETAIL OS — DESIGN TOKENS (JS)
 *  Single source of truth for all design values used in React components.
 *  Mirrors tailwind.config.js — use these in inline styles, Framer Motion
 *  variants, chart configs (Recharts/Chart.js), and dynamic style logic.
 *
 *  Usage:
 *    import { colors, shadows, easing, radius } from '../theme/tokens'
 *    <div style={{ background: colors.glass.bg, borderRadius: radius.card }}>
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────────────────────
   APPLE MACBOOK SETTINGS STYLE
   Grey background (#1C1C1E), white font, clean minimal interface
───────────────────────────────────────────────────────────────────────── */
export const colors = {
  // Grey Apple macOS style
  void:     '#1C1C1E',
  abyss:    '#2C2C2E',
  deep:     '#2C2C2E',
  surface:  '#2C2C2E',
  elevated: '#3A3A3C',
  overlay:  '#252526',

  // Subtle blue accent (Apple style)
  royal: {
    950: '#1C1C1E',
    900: '#252526',
    800: '#2C2C2E',
    700: '#0A84FF', // Apple blue
    600: '#0A84FF',
    500: '#0A84FF',
    400: '#409CFF',
    300: '#1C1C1E',
    200: '#3A3A3C',
    100: '#8E8E93',
    50:  '#F2F2F7',
    glow:     'rgba(10, 132, 255, 0.25)',
    glowSoft: 'rgba(10, 132, 255, 0.1)',
  },

  gold: { // now Apple blue
    1000: '#252526',
    900:  '#2C2C2E',
    800:  '#0A84FF',
    700:  '#0A84FF',
    600:  '#0A84FF',
    500:  '#0A84FF',
    400:  '#409CFF',
    300:  '#1C1C1E',
    200:  '#3A3A3C',
    100:  '#8E8E93',
    50:   '#F2F2F7',
    glow:     'rgba(10, 132, 255, 0.25)',
    glowSoft: 'rgba(10, 132, 255, 0.1)',
  },

  platinum: {
    900: '#000000',
    700: '#1C1C1E',
    500: '#8E8E93', // grey
    300: '#C7C7CC',
    100: '#D1D1D6',
    50:  '#F2F2F7',
  },

  // Subtle glass on grey
  glass: {
    3:    'rgba(255,255,255,0.02)',
    5:    'rgba(255,255,255,0.03)',
    8:    'rgba(255,255,255,0.05)',
    12:   'rgba(255,255,255,0.08)',
    18:   'rgba(255,255,255,0.1)',
    25:   'rgba(255,255,255,0.12)',
    40:   'rgba(255,255,255,0.15)',
    60:   'rgba(255,255,255,0.2)',
    bg:   '#2C2C2E',
    bg2:  '#3A3A3C',
    bg3:  '#252526',
    border:      '#3A3A3C',
    borderBright:'#48484A',
    borderGold:  'rgba(10,132,255,0.3)',
    borderRoyal: 'rgba(10,132,255,0.2)',
  },

  text: {
    primary:   '#0F172A',
    secondary: '#475569',
    tertiary:  '#64748B',
    ghost:     '#94A3B8',
    inverse:   '#FFFFFF',
  },

  // ── Semantic ──────────────────────────────────────────────────────────────
  success: {
    DEFAULT: '#10B981',
    light:   '#34D399',
    bg:      'rgba(16,185,129,0.12)',
    border:  'rgba(16,185,129,0.22)',
    glow:    'rgba(16,185,129,0.30)',
  },
  warning: {
    DEFAULT: '#F59E0B',
    light:   '#FCD34D',
    bg:      'rgba(245,158,11,0.12)',
    border:  'rgba(245,158,11,0.22)',
    glow:    'rgba(245,158,11,0.30)',
  },
  danger: {
    DEFAULT: '#EF4444',
    light:   '#FCA5A5',
    bg:      'rgba(239,68,68,0.12)',
    border:  'rgba(239,68,68,0.22)',
    glow:    'rgba(239,68,68,0.30)',
  },
  info: {
    DEFAULT: '#06B6D4',
    light:   '#67E8F9',
    bg:      'rgba(6,182,212,0.12)',
    border:  'rgba(6,182,212,0.22)',
    glow:    'rgba(6,182,212,0.30)',
  },
}

/* ─────────────────────────────────────────────────────────────────────────
   2. TYPOGRAPHY
───────────────────────────────────────────────────────────────────────── */
export const fonts = {
  display: '"Inter", system-ui, -apple-system, sans-serif',
  ui:      '"Inter", system-ui, -apple-system, sans-serif',
  mono:    '"JetBrains Mono", "Fira Code", monospace',
  luxury:  '"Inter", system-ui, -apple-system, sans-serif',
}

export const typography = {
  // KPI numbers (clean mono)
  kpiXl:   { fontFamily: fonts.mono, fontSize: '2.5rem',  fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1 },
  kpiLg:   { fontFamily: fonts.mono, fontSize: '2rem',    fontWeight: 700, letterSpacing: '-0.02em',  lineHeight: 1 },
  kpiMd:   { fontFamily: fonts.mono, fontSize: '1.5rem',  fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1 },
  kpiSm:   { fontFamily: fonts.mono, fontSize: '1.125rem',fontWeight: 600, lineHeight: 1 },
  // Display / Section headings — now Inter (matching Grok Build)
  displayLg: { fontFamily: fonts.display, fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1 },
  displayMd: { fontFamily: fonts.display, fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.02em',  lineHeight: 1.15 },
  displaySm: { fontFamily: fonts.display, fontSize: '1.35rem', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 },
  // Section title
  sectionTitle: { fontFamily: fonts.display, fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25 },
  // Eyebrow
  eyebrow: { fontFamily: fonts.ui, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.3 },
  // Label
  label:   { fontFamily: fonts.ui, fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.3 },
  // Body — Inter (Grok Build style)
  bodyLg:  { fontFamily: fonts.ui, fontSize: '1rem',     fontWeight: 400, lineHeight: 1.6 },
  bodyMd:  { fontFamily: fonts.ui, fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.55 },
  bodySm:  { fontFamily: fonts.ui, fontSize: '0.8125rem',fontWeight: 400, lineHeight: 1.5 },
  caption: { fontFamily: fonts.ui, fontSize: '0.75rem',  fontWeight: 400, lineHeight: 1.4 },
}

/* ─────────────────────────────────────────────────────────────────────────
   3. SPACING (4pt grid)
───────────────────────────────────────────────────────────────────────── */
export const space = {
  0:   0,
  0.5: 2,  1: 4,  1.5: 6,  2: 8,  2.5: 10,
  3:   12, 3.5: 14, 4: 16, 5: 20, 6: 24,
  7:   28, 8:  32, 9: 36,  10: 40, 12: 48,
  14:  56, 16: 64, 18: 72, 20: 80, 24: 96,
  // Semantic
  card:    20,
  panel:   24,
  section: 40,
  page:    32,
}

/* ─────────────────────────────────────────────────────────────────────────
   4. BORDER RADIUS
───────────────────────────────────────────────────────────────────────── */
export const radius = {
  none:   0,
  xs:     3,
  sm:     6,
  md:     10,
  lg:     14,
  xl:     18,
  '2xl':  24,
  '3xl':  32,
  card:   16,
  panel:  20,
  button: 10,
  pill:   9999,
}

/* ─────────────────────────────────────────────────────────────────────────
   5. SHADOW SYSTEM
───────────────────────────────────────────────────────────────────────── */
export const shadows = {
  // Liquid glass shadows for dark navy + white/grey glass theme
  glassSm: '0 1px 2px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15)',
  glass:   '0 4px 20px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.25)',
  glassLg: '0 8px 32px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)',
  glassXl: '0 16px 50px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.35)',
  // Floating premium
  float:   '0 20px 60px rgba(0,0,0,0.5), 0 6px 16px rgba(0,0,0,0.3)',
  // Dark blue glows
  gold:    '0 0 18px rgba(27,47,94,0.35), 0 0 36px rgba(27,47,94,0.2)',
  goldSm:  '0 0 8px rgba(27,47,94,0.3)',
  goldLg:  '0 0 26px rgba(27,47,94,0.4), 0 0 60px rgba(27,47,94,0.25)',
  // Status (kept minimal, using grey tones where possible)
  success: '0 0 10px rgba(16,185,129,0.25)',
  warning: '0 0 10px rgba(245,158,11,0.25)',
  danger:  '0 0 10px rgba(239,68,68,0.25)',
  // Focus ring - dark blue
  focus:     '0 0 0 3px rgba(27,47,94,0.3)',
  focusGold: '0 0 0 3px rgba(27,47,94,0.2)',
}

/* ─────────────────────────────────────────────────────────────────────────
   6. ANIMATION EASING
───────────────────────────────────────────────────────────────────────── */
export const easing = {
  luxury: [0.25, 0.46, 0.45, 0.94],
  spring: [0.16, 1, 0.3, 1],
  bounce: [0.34, 1.56, 0.64, 1],
  swift:  [0.55, 0, 0.1, 1],
  snap:   [0.77, 0, 0.175, 1],
  // CSS string versions
  luxuryCSS: 'cubic-bezier(0.25,0.46,0.45,0.94)',
  springCSS: 'cubic-bezier(0.16,1,0.3,1)',
  bounceCSS: 'cubic-bezier(0.34,1.56,0.64,1)',
}

export const duration = {
  instant:  75,
  fast:     150,
  normal:   250,
  slow:     400,
  slower:   600,
  slowest:  800,
}

/* ─────────────────────────────────────────────────────────────────────────
   7. FRAMER MOTION VARIANTS (pre-built, import and spread)
───────────────────────────────────────────────────────────────────────── */

/** Page entrance */
export const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: easing.spring } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.18, ease: easing.luxury } },
}

/** Card entrance with stagger */
export const cardVariants = {
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.35, ease: easing.spring } },
  exit:    { opacity: 0, y: 8,  scale: 0.98 },
  // Aliases for hidden/visible naming convention
  hidden:  { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.35, ease: easing.spring } },
}

/** Stagger container — use with motion.div wrapping a list */
export const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
}

/** Modal */
export const modalVariants = {
  overlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.22 } },
    exit:    { opacity: 0, transition: { duration: 0.18 } },
  },
  panel: {
    initial: { opacity: 0, scale: 0.94, y: 12 },
    animate: { opacity: 1, scale: 1,    y: 0,  transition: { duration: 0.32, ease: easing.spring } },
    exit:    { opacity: 0, scale: 0.96, y: 8,  transition: { duration: 0.20, ease: easing.luxury } },
  },
}

/** Sidebar slide-in */
export const sidebarVariants = {
  closed: { x: -240, opacity: 0 },
  open:   { x: 0,    opacity: 1, transition: { type: 'spring', damping: 28, stiffness: 280 } },
}

/** Hover lift — spread onto whileHover prop */
export const hoverLift = { y: -3, transition: { duration: 0.2, ease: easing.luxury } }

/** Press tap */
export const tapPress = { scale: 0.97 }

/** Count-up initial state */
export const countVariant = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easing.spring } },
}

/* ─────────────────────────────────────────────────────────────────────────
   8. GLASSMORPHISM STYLE PRESETS (inline style objects)
───────────────────────────────────────────────────────────────────────── */
export const glass = {
  // LIQUID GLASS (dark blue base + white/grey on frosted glass)
  card: {
    background: 'rgba(255,255,255,0.94)',
    backdropFilter: 'blur(20px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
    border: '1px solid rgba(7,27,82,0.08)',
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(7,27,82,0.04), 0 4px 16px rgba(7,27,82,0.05)',
  },

  crystal: {
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(44px) saturate(2)',
    WebkitBackdropFilter: 'blur(44px) saturate(2)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: radius.panel,
    boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
  },

  frosted: {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(48px) saturate(1.85)',
    WebkitBackdropFilter: 'blur(48px) saturate(1.85)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: radius.panel,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 12px 40px rgba(0,0,0,0.4)',
  },

  // Dark blue tinted
  gold: {
    background: 'rgba(27,47,94,0.25)',
    backdropFilter: 'blur(36px) saturate(1.7)',
    WebkitBackdropFilter: 'blur(36px) saturate(1.7)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: radius.card,
    boxShadow: '0 12px 40px rgba(10,18,40,0.16)',
  },

  royal: {
    background: 'rgba(255,255,255,0.94)',
    backdropFilter: 'blur(18px) saturate(1.5)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.5)',
    border: '1px solid #071B521A',
    borderRadius: radius.card,
    boxShadow: '0 10px 36px rgba(10,18,40,0.14)',
  },

  // Dark navy sidebar — solid professional
  nav: {
    background: 'rgba(255,255,255,0.94)',
    color: '#0F172A',
    borderRight: '1px solid rgba(7,27,82,0.08)',
    boxShadow: '4px 0 24px rgba(7,27,82,0.04)',
  },

  topbar: {
    background: 'rgba(255,255,255,0.82)',
    borderBottom: '1px solid rgba(7,27,82,0.08)',
    boxShadow: '0 4px 20px rgba(7,27,82,0.04)',
  },

  // Premium modal with elegant projection
  modal: {
    background: '#FFFFFF',
    border: '1px solid #D8D2C4',
    borderRadius: '20px',
    boxShadow: '0 25px 80px rgba(10,18,40,0.22), 0 8px 24px rgba(10,18,40,0.12)',
  },

  // Overlay
  overlay: {
    background: 'rgba(10,18,40,.65)',
    backdropFilter: 'blur(8px)',
  },
}

/* ─────────────────────────────────────────────────────────────────────────
   9. CHART THEME (Recharts / Chart.js palette)
───────────────────────────────────────────────────────────────────────── */
export const chartColors = {
  primary:   '#2A4A75',   // deep royal navy
  secondary: '#60A5FA',   // premium boutique gold
  success:   '#10B981',
  danger:    '#EF4444',
  warning:   '#D97706',
  info:      '#3B5F96',
  purple:    '#7C3AED',
  // Ordered palette — Navy Royal
  palette: [
    '#2A4A75',  // deep royal
    '#60A5FA',  // boutique gold
    '#10B981',  // emerald
    '#EF4444',  // rose
    '#D97706',  // amber
    '#7C3AED',  // violet
    '#5B7DB5',  // soft royal
    '#409CFF',  // muted gold
  ],
  // Grid lines (subtle on navy)
  grid:     'rgba(255,255,255,0.06)',
  axis:     'rgba(242,237,230,0.35)',
  tooltip: {
    background: '#0F1E35',
    border:     'rgba(255,255,255,0.10)',
    shadow:     '0 4px 20px rgba(0,0,0,0.45)',
  },
}

/* ─────────────────────────────────────────────────────────────────────────
   10. ROLE CHIPS (sidebar / topbar role badge)
───────────────────────────────────────────────────────────────────────── */
export const roleChips = {
  superadmin:  { label: 'Super Admin', bg: 'rgba(11,95,255,0.1)', color: '#0B5FFF', border: 'rgba(11,95,255,0.2)' },
  owner:       { label: 'Owner',       bg: 'rgba(7,27,82,0.08)', color: '#071B52', border: 'rgba(7,27,82,0.14)' },
  manager:     { label: 'Manager',     bg: 'rgba(11,95,255,0.08)', color: '#2563EB', border: 'rgba(11,95,255,0.16)' },
  sales_staff: { label: 'Sales Staff', bg: 'rgba(100,116,139,0.08)', color: '#64748B', border: 'rgba(100,116,139,0.16)' },
}

/* ─────────────────────────────────────────────────────────────────────────
   11. GRADIENTS (commonly used)
───────────────────────────────────────────────────────────────────────── */
export const gradients = {
  goldLuxury:   'linear-gradient(135deg, #071B52 0%, #0B5FFF 100%)',
  goldShine:    'linear-gradient(135deg, #0A2540 0%, #0B5FFF 100%)',
  goldSubtle:   'linear-gradient(135deg, rgba(11,95,255,0.10) 0%, rgba(7,27,82,0.04) 100%)',
  royalDeep:    'linear-gradient(135deg, #071B52 0%, #0B5FFF 100%)',
  royalShine:   'linear-gradient(135deg, #0A2540 0%, #409CFF 100%)',
  royalSubtle:  'linear-gradient(135deg, rgba(11,95,255,0.12) 0%, rgba(7,27,82,0.05) 100%)',
  sidebar:      'linear-gradient(180deg, #0A2540 0%, #071B52 100%)',
  glassCard:    '#FFFFFF',
  aurora:       'none',
  pageBg:       'linear-gradient(180deg, #f8fbff 0%, #f1f5f9 48%, #eef4ff 100%)',
}

/* ─────────────────────────────────────────────────────────────────────────
   12. Z-INDEX SCALE
───────────────────────────────────────────────────────────────────────── */
export const zIndex = {
  sidebar:  40,
  topbar:   50,
  dropdown: 60,
  overlay:  70,
  modal:    80,
  toast:    90,
  tooltip:  100,
}

/* ─────────────────────────────────────────────────────────────────────────
   13. BREAKPOINTS
───────────────────────────────────────────────────────────────────────── */
export const breakpoints = {
  xs:    375,
  sm:    640,
  md:    768,
  lg:    1024,
  xl:    1280,
  '2xl': 1536,
  '3xl': 1920,
}

/* ─────────────────────────────────────────────────────────────────────────
   DEFAULT EXPORT — Full token set
───────────────────────────────────────────────────────────────────────── */
const tokens = {
  colors,
  fonts,
  typography,
  space,
  radius,
  shadows,
  easing,
  duration,
  glass,
  gradients,
  chartColors,
  roleChips,
  zIndex,
  breakpoints,
  // Framer Motion variants
  variants: {
    page: pageVariants,
    card: cardVariants,
    stagger: staggerContainer,
    modal: modalVariants,
    sidebar: sidebarVariants,
  },
}

export default tokens
