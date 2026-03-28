/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tavern dark theme palette
        ink: {
          950: '#0d0d0f',
          900: '#111114',
          800: '#18181d',
          700: '#1f1f26',
          600: '#28282f',
          500: '#35353e',
          400: '#4a4a56',
        },
        parchment: {
          50:  '#fdf8ef',
          100: '#f7edda',
          200: '#eed8b0',
          300: '#e2bf80',
          400: '#d4a055',
          500: '#c4843a',
        },
        crimson: {
          400: '#e05c5c',
          500: '#c94444',
          600: '#a83030',
        },
        arcane: {
          400: '#9b7fe8',
          500: '#7c5dc7',
          600: '#5e3fa6',
        },
        forest: {
          400: '#5dab7a',
          500: '#3d8a5a',
          600: '#276940',
        },
        gold: {
          300: '#f5d98a',
          400: '#e8c14d',
          500: '#d4a520',
        },
      },
      fontFamily: {
        display: ['"Cinzel"', 'Georgia', 'serif'],
        body: ['"Crimson Pro"', 'Georgia', 'serif'],
        mono: ['"Fira Code"', 'monospace'],
        ui: ['"Inter"', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.4' }],
        'sm': ['0.875rem', { lineHeight: '1.5' }],
        'base': ['1rem', { lineHeight: '1.6' }],
        'lg': ['1.125rem', { lineHeight: '1.6' }],
        'xl': ['1.25rem', { lineHeight: '1.5' }],
        '2xl': ['1.5rem', { lineHeight: '1.3' }],
        '3xl': ['1.875rem', { lineHeight: '1.2' }],
      },
      backgroundImage: {
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'flicker': 'flicker 4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
          '75%': { opacity: '0.95' },
        },
      },
      borderRadius: {
        'sm': '3px',
        DEFAULT: '5px',
        'md': '7px',
        'lg': '10px',
        'xl': '14px',
      },
      boxShadow: {
        'glow-gold': '0 0 12px rgba(212, 165, 32, 0.25)',
        'glow-arcane': '0 0 12px rgba(155, 127, 232, 0.25)',
        'glow-crimson': '0 0 12px rgba(201, 68, 68, 0.25)',
        'panel': '0 2px 8px rgba(0, 0, 0, 0.4)',
        'panel-lg': '0 4px 20px rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
}
