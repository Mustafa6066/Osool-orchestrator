/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0efff',
          400: '#4a9eff',
          500: '#0e72e9',
          600: '#025ac7',
          700: '#0348a2',
          800: '#063880',
          900: '#0c346e',
          950: '#082149',
        },
        surface: {
          DEFAULT: '#0a0f1a',
          card: '#111827',
          hover: '#1a2332',
        },
        border: {
          DEFAULT: '#1e293b',
          light: '#334155',
        },
      },
    },
  },
  plugins: [],
};
