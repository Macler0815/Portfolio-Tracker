/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#e6f4ea',
          100: '#c4e4cd',
          200: '#98d3a8',
          300: '#62bd7e',
          400: '#34a259',
          500: '#1d8643',
          600: '#146a35',
          700: '#0f552b',
          800: '#0c4523',
          900: '#0a3a1e',
        },
      },
    },
  },
  plugins: [],
};
