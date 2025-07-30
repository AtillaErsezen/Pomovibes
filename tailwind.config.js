/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
       colors: {
        coral: { 500: '#FF7F50' },
        teal: { 500: '#008080' },
        lavender: { 500: '#E6E6FA' },
        mint: { 500: '#98FF98' },
        amber: { 500: '#FFC107' },
        violet: { 500: '#8A2BE2' },
        sage: { 500: '#9ACD32' },
        rose: { 500: '#FF69B4' },
        indigo: { 500: '#4B0082' },
        emerald: { 500: '#2E8B57' },
    },
      animation: {
        'fade-in': 'fadeIn 0.5s forwards',
        'wave': 'wave 10s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        wave: {
          '0%': { transform: 'translateX(0) rotate(2deg)' },
          '100%': { transform: 'translateX(-50%) rotate(2deg)' },
        },
      },
    },
  },
  safelist: [
    'bg-coral-500',
  'bg-teal-500',
  'bg-lavender-500',
  'bg-mint-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-sage-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-emerald-500'
  ],
  plugins: [],
};