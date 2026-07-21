/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#12201E',
          soft: '#3A4F4B',
          muted: '#6B7F7A',
        },
        teal: {
          50: '#EEF7F5',
          100: '#D5EBE6',
          200: '#A8D5CC',
          300: '#6FB8AB',
          400: '#3D9688',
          500: '#1F7A6C',
          600: '#0F5F54',
          700: '#0A4A42',
          800: '#083A34',
          900: '#062E29',
        },
        sand: {
          50: '#F7F6F3',
          100: '#EEECE6',
          200: '#DDD8CE',
        },
        status: {
          green: '#1B7A4E',
          yellow: '#B8860B',
          red: '#B33A3A',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 12px 40px -16px rgba(8, 58, 52, 0.25)',
        glow: '0 0 0 1px rgba(31, 122, 108, 0.12), 0 18px 50px -20px rgba(8, 58, 52, 0.35)',
      },
      backgroundImage: {
        'mesh':
          'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(107, 184, 171, 0.28), transparent 55%), radial-gradient(ellipse 60% 50% at 90% 10%, rgba(168, 213, 204, 0.22), transparent 50%), radial-gradient(ellipse 50% 40% at 50% 100%, rgba(15, 95, 84, 0.08), transparent 55%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        pulseSoft: 'pulseSoft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
