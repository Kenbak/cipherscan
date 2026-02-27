import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cipher: {
          // ===== THEME-AWARE BACKGROUNDS (use CSS variables) =====
          bg: 'var(--color-bg)',
          elevated: 'var(--color-elevated)',
          surface: 'var(--color-surface)',
          hover: 'var(--color-hover)',
          active: 'var(--color-active)',
          border: 'var(--color-border)',

          // ===== STATIC COLORS (for specific use cases) =====
          'bg-dark': '#08090F',           // Force dark background
          'surface-dark': '#14161F',      // Force dark surface
          'bg-light': '#FAFBFC',          // Force light background
          'surface-light': '#FFFFFF',     // Force light surface
          'border-light': '#E2E8F0',      // Force light border

          // ===== BRAND IDENTITY - CYAN =====
          cyan: '#00D4FF',         // PRIMARY - Logo, titles, links (dark mode)
          'cyan-dark': '#0E7490',  // PRIMARY for light mode
          'cyan-glow': '#00E5FF',  // Glow effects
          'cyan-muted': '#5EBBCE', // Softer accent

          // ===== FUNCTIONAL COLORS =====
          green: '#00E676',        // SUCCESS - Warmer than pure #00FF41
          'green-dark': '#047857', // Green for light mode

          purple: '#A78BFA',       // SHIELDED - Slightly muted for elegance
          'purple-dark': '#7C3AED',// Purple for light mode
          'purple-glow': '#C4B5FD',// Purple glow

          yellow: '#F4B728',       // ZCASH ACCENT - Secondary brand highlight
          'yellow-dark': '#D49B00',// Yellow for light mode
          'yellow-glow': '#FFD060',// Yellow glow
          'yellow-muted': '#C9A035',// Muted yellow

          orange: '#FF6B35',       // WARNING - Only for alerts
          'orange-dark': '#C2410C',// Orange for light mode

          // ===== TEXT COLORS =====
          text: {
            primary: '#E5E7EB',
            secondary: '#9CA3AF',
            muted: '#6B7280',
          },
        },
      },

      // ===== TYPOGRAPHY =====
      fontFamily: {
        // Geist as primary, with fallbacks
        sans: ['var(--font-geist-sans)', 'Geist', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
        // Berkeley Mono preferred, JetBrains as fallback
        mono: ['var(--font-geist-mono)', 'Berkeley Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
        // Display font for headlines
        display: ['var(--font-geist-sans)', 'Geist', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },

      // ===== TYPE SCALE (Major Third - 1.250) =====
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.5' }],      // 12px
        'sm': ['0.875rem', { lineHeight: '1.5' }],    // 14px
        'base': ['1rem', { lineHeight: '1.5' }],      // 16px
        'lg': ['1.25rem', { lineHeight: '1.4' }],     // 20px
        'xl': ['1.5rem', { lineHeight: '1.3' }],      // 24px
        '2xl': ['1.875rem', { lineHeight: '1.25' }],  // 30px
        '3xl': ['2.375rem', { lineHeight: '1.2' }],   // 38px
        '4xl': ['3rem', { lineHeight: '1.1' }],       // 48px
        '5xl': ['3.75rem', { lineHeight: '1.05' }],   // 60px
      },

      // ===== LETTER SPACING =====
      letterSpacing: {
        'tighter': '-0.02em',
        'tight': '-0.01em',
        'normal': '0',
        'wide': '0.02em',
        'wider': '0.05em',
      },

      // ===== BORDER RADIUS (Consistent hierarchy) =====
      borderRadius: {
        'sm': '6px',      // Badges, tags
        'DEFAULT': '8px', // Default
        'md': '10px',     // Buttons, inputs
        'lg': '16px',     // Cards
        'xl': '20px',     // Featured cards
        '2xl': '24px',    // Modals, large containers
      },

      // ===== SHADOWS (Apple-style depth) =====
      boxShadow: {
        // Card shadows
        'card': '0 2px 4px rgba(0, 0, 0, 0.04), 0 8px 16px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 8px rgba(0, 0, 0, 0.06), 0 16px 32px rgba(0, 0, 0, 0.1)',
        'card-light': '0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.04)',
        'card-light-hover': '0 2px 6px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06)',

        // Elevation levels
        'sm': '0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'lg': '0 4px 8px rgba(0, 0, 0, 0.04), 0 16px 32px rgba(0, 0, 0, 0.08)',
        'xl': '0 8px 16px rgba(0, 0, 0, 0.06), 0 32px 64px rgba(0, 0, 0, 0.12)',

        // Glow effects
        'glow': '0 0 20px rgba(0, 212, 255, 0.15)',
        'glow-lg': '0 0 40px rgba(0, 212, 255, 0.2)',
        'glow-purple': '0 0 20px rgba(167, 139, 250, 0.15)',
      },

      // ===== SPACING (Semantic additions) =====
      spacing: {
        'card-compact': '16px',
        'card-standard': '24px',
        'card-featured': '32px',
        'section-sm': '48px',
        'section-md': '64px',
        'section-lg': '80px',
      },

      // ===== BACKGROUND IMAGES =====
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
      },

      // ===== ANIMATIONS =====
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'glow': 'glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'scan': 'scan 4s ease-in-out infinite',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 212, 255, 0.5)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        scan: {
          '0%': { top: '0%', opacity: '0' },
          '10%': { opacity: '0.5' },
          '90%': { opacity: '0.5' },
          '100%': { top: '100%', opacity: '0' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },

      // ===== TRANSITION TIMING =====
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-circ': 'cubic-bezier(0.85, 0, 0.15, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      // ===== TRANSITION DURATION =====
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '400ms',
      },
    },
  },
  plugins: [],
};

export default config;
