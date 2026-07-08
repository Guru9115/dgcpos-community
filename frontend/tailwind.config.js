/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  D&G COLLECTION RETAIL OS — MASTER TAILWIND THEME
 *  Design Direction: Apple Vision Pro × Tesla × Dior × Rolex × Aman Resorts
 *  Phase 1 — Complete Design System
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {

      /* ─────────────────────────────────────────────────────────────────
         1. MASTER COLOR SYSTEM
         Depth: void → abyss → surface → elevated
         Accent: royal blue × luxury gold × platinum
      ───────────────────────────────────────────────────────────────── */
      colors: {
        // ── LIQUID GLASS DARK THEME (deep dark blue base + white/grey on glass) ──────
        // Strict: only DARK BLUE (#071B52), WHITE, GREY on glass
        void:     '#0A1628',
        abyss:    '#0F1E3D',
        deep:     '#0F1E3D',
        surface:  'rgba(255,255,255,0.07)',
        elevated: 'rgba(255,255,255,0.09)',
        overlay:  'rgba(255,255,255,0.05)',
        rim:      'rgba(255,255,255,0.15)',

        // ── Royal Navy / Dark Blue (primary and only accent) ───────────
        royal: {
          950: '#0A1428',
          900: '#0F1E42',
          800: '#122040',
          700: '#071B52',   // DARK BLUE
          600: '#071B52',
          500: '#071B52',
          400: '#0B5FFF',
          300: '#071B52',
          200: '#2C3650',
          100: '#8A90A0',
          50:  '#F2EFE8',
        },

        // ── Gold remapped to dark blue accents ─────────────────────────
        gold: {
          1000: '#0F1E42',
          900:  '#122040',
          800:  '#071B52',
          700:  '#071B52',
          600:  '#071B52',
          500:  '#071B52',   // DARK BLUE
          400:  '#0B5FFF',
          300:  '#071B52',
          200:  '#0B5FFF',
          100:  '#5B6B90',
          50:   '#D8D2C4',
        },

        // ── Soft neutrals / greys on glass ─────────────────────────────
        platinum: {
          900: '#0A0C12',
          700: '#2C3650',
          500: '#6B7280',   // dark grey
          300: '#9CA3AF',   // grey
          100: '#D1D5DB',
          50:  '#F3F4F6',
        },

        // ── Liquid glass / frosted surfaces (white tint on dark) ───────
        crystal: {
          '3':   'rgba(255,255,255,0.03)',
          '5':   'rgba(255,255,255,0.05)',
          '8':   'rgba(255,255,255,0.07)',
          '12':  'rgba(255,255,255,0.09)',
          '18':  'rgba(255,255,255,0.12)',
          '25':  'rgba(255,255,255,0.16)',
          '40':  'rgba(255,255,255,0.22)',
          '60':  'rgba(255,255,255,0.32)',
          '80':  'rgba(255,255,255,0.45)',
          full:  'rgba(255,255,255,0.85)',
        },

        // ── Semantic / Status Colors ──────────────────────────────────
        success: {
          DEFAULT: '#10B981',
          light:   '#D1FAE5',
          dark:    '#065F46',
          glow:    'rgba(16,185,129,0.25)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light:   '#FEF3C7',
          dark:    '#92400E',
          glow:    'rgba(245,158,11,0.25)',
        },
        danger: {
          DEFAULT: '#EF4444',
          light:   '#FEE2E2',
          dark:    '#991B1B',
          glow:    'rgba(239,68,68,0.25)',
        },
        info: {
          DEFAULT: '#06B6D4',
          light:   '#CFFAFE',
          dark:    '#164E63',
          glow:    'rgba(6,182,212,0.25)',
        },

        // ── Text Scale — Navy Royal light theme (black on cream, soft white on dark) ─
        txt: {
          primary:   '#0A0C12',              // main black on light cream
          secondary: '#2C3650',              // secondary dark
          tertiary:  '#4A5568',              // tertiary
          ghost:     '#718096',              // placeholder
          inverse:   '#EDE8DF',              // soft matte white for dark/sidebar/black areas (eye comfort)
        },

        // ── Glass Border Tokens (warm-brown-on-parchment) ────────────
        glass: {
          border:   'rgba(101,65,20,0.10)',
          'border-bright': 'rgba(101,65,20,0.16)',
          'border-gold':   'rgba(139,105,20,0.28)',
          'border-royal':  'rgba(139,105,20,0.14)',
          bg:       'rgba(101,65,20,0.03)',
          'bg-2':   'rgba(101,65,20,0.05)',
          'bg-3':   'rgba(101,65,20,0.08)',
        },
      },

      /* ─────────────────────────────────────────────────────────────────
         2. TYPOGRAPHY SYSTEM
         Display: Playfair Display (Dior/Rolex editorial weight)
         UI:      DM Sans (clean, modern, Tesla-inspired)
         Mono:    JetBrains Mono (code, numbers, KPIs)
      ───────────────────────────────────────────────────────────────── */
      fontFamily: {
        display: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        ui:      ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        luxury:  ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },

      fontSize: {
        // Inter display scale (Grok Build clean & modern)
        'display-2xl': ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-xl':  ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-lg':  ['1.875rem',{ lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-md':  ['1.5rem',  { lineHeight: '1.2',  letterSpacing: '-0.015em', fontWeight: '600' }],
        'display-sm':  ['1.25rem', { lineHeight: '1.25', letterSpacing: '-0.01em',  fontWeight: '600' }],
        'display-xs':  ['1.05rem', { lineHeight: '1.3',  letterSpacing: '-0.005em', fontWeight: '600' }],
        // UI scale (Inter)
        'ui-2xl':  ['1.25rem',  { lineHeight: '1.6' }],
        'ui-xl':   ['1.125rem', { lineHeight: '1.55' }],
        'ui-lg':   ['1rem',     { lineHeight: '1.5' }],
        'ui-md':   ['0.875rem', { lineHeight: '1.45' }],
        'ui-sm':   ['0.8125rem',{ lineHeight: '1.4' }],
        'ui-xs':   ['0.75rem',  { lineHeight: '1.35' }],
        'ui-2xs':  ['0.6875rem',{ lineHeight: '1.3' }],
        // KPI / numbers
        'kpi-xl':  ['2.25rem', { lineHeight: '1', fontWeight: '700', letterSpacing: '-0.025em' }],
        'kpi-lg':  ['1.875rem',{ lineHeight: '1', fontWeight: '600', letterSpacing: '-0.02em' }],
        'kpi-md':  ['1.375rem',{ lineHeight: '1', fontWeight: '600', letterSpacing: '-0.015em' }],
        'kpi-sm':  ['1rem',    { lineHeight: '1', fontWeight: '500' }],
        // Label / caption
        'label':   ['0.6875rem',{ lineHeight: '1.3', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase' }],
        'eyebrow': ['0.625rem', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }],
      },

      letterSpacing: {
        tightest: '-0.04em',
        tighter:  '-0.025em',
        tight:    '-0.01em',
        normal:   '0',
        wide:     '0.025em',
        wider:    '0.06em',
        widest:   '0.12em',
        luxury:   '0.20em',
        eyebrow:  '0.22em',
      },

      /* ─────────────────────────────────────────────────────────────────
         3. SPACING SYSTEM — 4pt grid, Tesla-inspired generosity
      ───────────────────────────────────────────────────────────────── */
      spacing: {
        px: '1px',
        0.5: '2px', 1: '4px', 1.5: '6px', 2: '8px', 2.5: '10px',
        3: '12px',  3.5: '14px', 4: '16px', 5: '20px', 6: '24px',
        7: '28px',  8: '32px',   9: '36px', 10: '40px', 11: '44px',
        12: '48px', 14: '56px',  16: '64px', 18: '72px', 20: '80px',
        24: '96px', 28: '112px', 32: '128px', 36: '144px',
        // Semantic
        'panel': '1.5rem',
        'card':  '1.25rem',
        'section': '2.5rem',
        'page': '2rem',
      },

      /* ─────────────────────────────────────────────────────────────────
         4. BORDER RADIUS — Rolex precision meets Apple softness
      ───────────────────────────────────────────────────────────────── */
      borderRadius: {
        none:   '0',
        sm:     '4px',
        DEFAULT:'8px',
        md:     '10px',
        lg:     '12px',
        xl:     '16px',
        '2xl':  '20px',
        '3xl':  '24px',
        '4xl':  '32px',
        '5xl':  '40px',
        panel:  '20px',
        card:   '16px',
        button: '10px',
        pill:   '999px',
        full:   '9999px',
      },

      /* ─────────────────────────────────────────────────────────────────
         5. SHADOW SYSTEM — Depth, glow, and luxury elevation
      ───────────────────────────────────────────────────────────────── */
      boxShadow: {
        // Clean elevation (light theme)
        'glass-sm':   '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.04)',
        'glass':      '0 2px 8px rgba(0,0,0,0.07), 0 4px 20px rgba(0,0,0,0.05)',
        'glass-lg':   '0 4px 16px rgba(0,0,0,0.09), 0 8px 32px rgba(0,0,0,0.06)',
        'glass-xl':   '0 8px 32px rgba(0,0,0,0.11), 0 16px 48px rgba(0,0,0,0.07)',
        // Floating panels
        'float':      '0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.07)',
        'float-lg':   '0 24px 64px rgba(0,0,0,0.14), 0 8px 20px rgba(0,0,0,0.08)',
        // Royal Blue glow
        'royal':      '0 0 20px rgba(37,99,235,0.22), 0 0 40px rgba(37,99,235,0.10)',
        'royal-sm':   '0 0 10px rgba(37,99,235,0.18)',
        'royal-lg':   '0 0 30px rgba(37,99,235,0.28), 0 0 70px rgba(37,99,235,0.10)',
        // Luxury Gold glow (lighter on white)
        'gold':       '0 0 20px rgba(184,134,11,0.28), 0 0 40px rgba(184,134,11,0.12)',
        'gold-sm':    '0 0 10px rgba(184,134,11,0.22)',
        'gold-lg':    '0 0 30px rgba(184,134,11,0.35), 0 0 70px rgba(184,134,11,0.14)',
        // Platinum
        'platinum':   '0 0 16px rgba(0,0,0,0.10)',
        // Status
        'success':    '0 0 12px rgba(16,185,129,0.22)',
        'warning':    '0 0 12px rgba(245,158,11,0.22)',
        'danger':     '0 0 12px rgba(239,68,68,0.22)',
        // Inset specular highlights
        'inner-top':  'inset 0 1px 0 rgba(255,255,255,0.90)',
        'inner-gold': 'inset 0 1px 0 rgba(184,134,11,0.20)',
        'inner-royal':'inset 0 1px 0 rgba(37,99,235,0.15)',
        // Focus ring
        'focus':      '0 0 0 3px rgba(37,99,235,0.22)',
        'focus-gold': '0 0 0 3px rgba(184,134,11,0.18)',
      },

      /* ─────────────────────────────────────────────────────────────────
         6. BACKGROUND IMAGES — Gradients and textures
      ───────────────────────────────────────────────────────────────── */
      backgroundImage: {
        // Premium Boutique Gold gradients
        'gold-luxury': 'linear-gradient(135deg, #5F4722 0%, #8C6F3E 30%, #C5A26F 52%, #D4B26A 68%, #C5A26F 82%, #8C6F3E 100%)',
        'gold-shine':  'linear-gradient(135deg, #A78B5A 0%, #C5A26F 42%, #E2C58A 55%, #C5A26F 72%, #A78B5A 100%)',
        'gold-subtle': 'linear-gradient(135deg, rgba(197,162,111,0.12) 0%, rgba(197,162,111,0.04) 100%)',
        'gold-radial': 'radial-gradient(ellipse at top, rgba(197,162,111,0.18) 0%, transparent 62%)',
        // Deep Royal Navy gradients
        'royal-deep':  'linear-gradient(135deg, #050B16 0%, #0A1528 42%, #0F1E35 100%)',
        'royal-shine': 'linear-gradient(135deg, #1E3A5F 0%, #2A4A75 55%, #3B5F96 100%)',
        'royal-subtle':'linear-gradient(135deg, rgba(46,90,145,0.14) 0%, rgba(46,90,145,0.04) 100%)',
        'royal-radial':'radial-gradient(ellipse at top, rgba(46,90,145,0.22) 0%, transparent 62%)',
        // Sidebar (deep navy)
        'sidebar':     'linear-gradient(180deg, #0A1528 0%, #0F1E35 100%)',
        // Glass surfaces
        'glass-card':  'linear-gradient(145deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)',
        'glass-shine': 'linear-gradient(120deg, rgba(255,255,255,0.00) 30%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.00) 70%)',
        // Aurora / ambient — refined navy + soft gold
        'aurora':      'radial-gradient(ellipse 125% 65% at 18% 6%, rgba(197,162,111,0.07) 0%, transparent 60%)',
        'aurora-2':    'radial-gradient(ellipse 75% 55% at 82% 88%, rgba(46,90,145,0.06) 0%, transparent 58%)',
        // Page background — clean professional navy royal
        'page-bg':     'radial-gradient(ellipse 130% 55% at 50% 6%, rgba(46,90,145,0.08) 0%, transparent 60%), linear-gradient(180deg, #050B16 0%, #0A1528 100%)',
      },

      /* ─────────────────────────────────────────────────────────────────
         7. BACKDROP BLUR — Glassmorphism levels
      ───────────────────────────────────────────────────────────────── */
      backdropBlur: {
        xs:    '4px',
        sm:    '8px',
        md:    '16px',
        lg:    '24px',
        xl:    '32px',
        '2xl': '40px',
        '3xl': '56px',
        '4xl': '80px',   // maximum luxury blur
      },

      backdropSaturate: {
        100: '1',
        150: '1.5',
        180: '1.8',
        200: '2',
      },

      /* ─────────────────────────────────────────────────────────────────
         8. ANIMATION SYSTEM
      ───────────────────────────────────────────────────────────────── */
      transitionTimingFunction: {
        'luxury':  'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'spring':  'cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce':  'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'swift':   'cubic-bezier(0.55, 0, 0.1, 1)',
        'snap':    'cubic-bezier(0.77, 0, 0.175, 1)',
      },

      transitionDuration: {
        75: '75ms', 100: '100ms', 150: '150ms',
        200: '200ms', 250: '250ms', 300: '300ms',
        400: '400ms', 500: '500ms', 600: '600ms',
        700: '700ms', 800: '800ms', 1000: '1000ms',
      },

      animation: {
        // Entrance
        'fade-in':        'fadeIn 0.3s ease forwards',
        'fade-in-up':     'fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in-down':   'fadeInDown 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in-scale':  'fadeInScale 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
        'slide-in-left':  'slideInLeft 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
        // Continuous
        'float':          'float 6s ease-in-out infinite',
        'float-slow':     'float 9s ease-in-out infinite',
        'pulse-gold':     'pulseGold 3s ease-in-out infinite',
        'pulse-royal':    'pulseRoyal 3s ease-in-out infinite',
        'shimmer':        'shimmer 2.2s linear infinite',
        'shimmer-fast':   'shimmer 1.4s linear infinite',
        'aurora':         'aurora 18s ease-in-out infinite alternate',
        'rotate-slow':    'rotate 20s linear infinite',
        // Glass
        'glass-shine':    'glassShine 4s ease-in-out infinite',
        // Skeleton
        'skeleton':       'skeleton 1.8s ease-in-out infinite',
        // Glow pulse
        'glow-gold':      'glowGold 2.5s ease-in-out infinite',
        'glow-royal':     'glowRoyal 2.5s ease-in-out infinite',
        // Counter
        'count-up':       'countUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards',
      },

      keyframes: {
        // Entrance animations
        fadeIn:       { '0%':{opacity:'0'}, '100%':{opacity:'1'} },
        fadeInUp:     { '0%':{opacity:'0',transform:'translateY(20px)'}, '100%':{opacity:'1',transform:'translateY(0)'} },
        fadeInDown:   { '0%':{opacity:'0',transform:'translateY(-20px)'}, '100%':{opacity:'1',transform:'translateY(0)'} },
        fadeInScale:  { '0%':{opacity:'0',transform:'scale(0.94)'}, '100%':{opacity:'1',transform:'scale(1)'} },
        slideInLeft:  { '0%':{opacity:'0',transform:'translateX(-24px)'}, '100%':{opacity:'1',transform:'translateX(0)'} },
        slideInRight: { '0%':{opacity:'0',transform:'translateX(24px)'}, '100%':{opacity:'1',transform:'translateX(0)'} },
        // Float (B&O levitation feel)
        float: {
          '0%,100%': { transform:'translateY(0px)' },
          '50%':     { transform:'translateY(-6px)' },
        },
        // Gold pulse
        pulseGold: {
          '0%,100%': { boxShadow:'0 0 20px rgba(11,95,255,0.25), 0 0 60px rgba(11,95,255,0.08)' },
          '50%':     { boxShadow:'0 0 32px rgba(11,95,255,0.50), 0 0 80px rgba(11,95,255,0.18)' },
        },
        // Royal pulse
        pulseRoyal: {
          '0%,100%': { boxShadow:'0 0 20px rgba(37,99,235,0.25), 0 0 60px rgba(37,99,235,0.08)' },
          '50%':     { boxShadow:'0 0 32px rgba(37,99,235,0.50), 0 0 80px rgba(37,99,235,0.18)' },
        },
        // Shimmer (skeleton + gold shine)
        shimmer: {
          '0%':   { backgroundPosition:'200% center' },
          '100%': { backgroundPosition:'-200% center' },
        },
        // Aurora background
        aurora: {
          '0%':   { opacity:'0.5', transform:'scale(1) rotate(0deg)' },
          '33%':  { opacity:'0.7', transform:'scale(1.06) rotate(2deg)' },
          '66%':  { opacity:'0.55', transform:'scale(0.97) rotate(-1.5deg)' },
          '100%': { opacity:'0.6', transform:'scale(1.03) rotate(1deg)' },
        },
        // Glass shine sweep
        glassShine: {
          '0%':   { backgroundPosition:'-200% center' },
          '40%':  { backgroundPosition:'200% center' },
          '100%': { backgroundPosition:'200% center' },
        },
        // Skeleton loading
        skeleton: {
          '0%':   { backgroundPosition:'200% center' },
          '100%': { backgroundPosition:'-200% center' },
        },
        // Glow effects
        glowGold: {
          '0%,100%': { filter:'drop-shadow(0 0 8px rgba(11,95,255,0.40))' },
          '50%':     { filter:'drop-shadow(0 0 16px rgba(11,95,255,0.70))' },
        },
        glowRoyal: {
          '0%,100%': { filter:'drop-shadow(0 0 8px rgba(37,99,235,0.40))' },
          '50%':     { filter:'drop-shadow(0 0 16px rgba(37,99,235,0.70))' },
        },
        countUp: {
          '0%':   { opacity:'0', transform:'translateY(8px)' },
          '100%': { opacity:'1', transform:'translateY(0)' },
        },
        rotate: { to: { transform:'rotate(360deg)' } },
      },

      /* ─────────────────────────────────────────────────────────────────
         9. LAYOUT & GRID
      ───────────────────────────────────────────────────────────────── */
      maxWidth: {
        '8xl':  '88rem',   // 1408px
        '9xl':  '96rem',   // 1536px
        '10xl': '104rem',  // 1664px
        'panel': '420px',
        'card':  '380px',
        'form':  '560px',
        'content': '720px',
      },

      screens: {
        xs:  '375px',
        sm:  '640px',
        md:  '768px',
        lg:  '1024px',
        xl:  '1280px',
        '2xl':'1536px',
        '3xl':'1920px',
      },

      /* ─────────────────────────────────────────────────────────────────
         10. Z-INDEX SCALE
      ───────────────────────────────────────────────────────────────── */
      zIndex: {
        sidebar:  '40',
        topbar:   '50',
        dropdown: '60',
        overlay:  '70',
        modal:    '80',
        toast:    '90',
        tooltip:  '100',
      },
    },
  },
  plugins: [],
}
