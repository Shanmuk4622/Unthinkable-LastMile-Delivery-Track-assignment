/**
 * SwiftRoute design tokens.
 *
 * The palette is built around a violet→sky "route" gradient, with a dedicated
 * hue for every order status so a shipment's colour is consistent everywhere it
 * appears — badge, timeline node, chart series and progress rail.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        surf: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -8px rgba(15,23,42,.10)',
        lift: '0 2px 4px rgba(15,23,42,.04), 0 18px 44px -12px rgba(15,23,42,.18)',
        glow: '0 0 0 1px rgba(124,58,237,.14), 0 14px 40px -12px rgba(124,58,237,.42)',
      },
      backgroundImage: {
        route: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 45%, #0ea5e9 100%)',
        'route-soft': 'linear-gradient(135deg, #f5f3ff 0%, #faf5ff 45%, #f0f9ff 100%)',
        sunrise: 'linear-gradient(135deg, #f97316 0%, #ec4899 55%, #8b5cf6 100%)',
        mesh:
          'radial-gradient(at 12% 8%, rgba(124,58,237,.18) 0px, transparent 55%),' +
          'radial-gradient(at 88% 4%, rgba(14,165,233,.16) 0px, transparent 50%),' +
          'radial-gradient(at 72% 92%, rgba(236,72,153,.14) 0px, transparent 55%),' +
          'radial-gradient(at 8% 88%, rgba(16,185,129,.12) 0px, transparent 50%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-14px) rotate(2deg)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(.85)', opacity: '.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'route-dash': {
          to: { strokeDashoffset: '-40' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.21,1.02,.73,1) both',
        float: 'float 7s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(.24,.6,.35,1) infinite',
        shimmer: 'shimmer 1.8s infinite',
        'route-dash': 'route-dash 1.2s linear infinite',
      },
    },
  },
  plugins: [],
};
