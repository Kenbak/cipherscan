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
          // Dark theme backgrounds (default)
          bg: '#0A0E27',
          surface: '#141827',
          border: '#1E293B',

          // Light theme backgrounds
          'bg-light': '#F8FAFC',
          'surface-light': '#FFFFFF',
          'border-light': '#E2E8F0',

          // Brand Identity - CYAN is our signature
          cyan: '#00D4FF',       // PRIMARY - Logo, titles, links, interactive (dark mode)
          'cyan-dark': '#0891B2', // CYAN for light mode - more visible on light backgrounds

          // Functional colors
          green: '#00FF41',      // SUCCESS - Confirmations, positive actions
          'green-dark': '#059669', // Green for light mode
          purple: '#A855F7',     // SHIELDED - Privacy, encryption, shielded transactions
          orange: '#FF6B35',     // WARNING - Only for alerts and negative values

          // Dark theme text
          text: {
            primary: '#E5E7EB',
            secondary: '#9CA3AF',
            muted: '#6B7280',
          },
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'glow': 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 212, 255, 0.5)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
