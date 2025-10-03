/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
      },
      colors: {
        'wolf': {
          50: '#fef7ee',
          100: '#fdedd3',
          200: '#fbd7a5',
          300: '#f8bb6d',
          400: '#f59533',
          500: '#f2750b',
          600: '#e35a01',
          700: '#bc4202',
          800: '#953408',
          900: '#782c0b',
        }
      }
    },
  },
  plugins: [],
}