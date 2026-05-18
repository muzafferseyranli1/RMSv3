/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#e8521a',
          green:  '#8dc63f',
          amber:  '#fbbf24',
          navy:   '#00003a',
        }
      },
      fontFamily: {
        sans: ['Roboto', 'sans-serif'],
      }
    }
  },
  plugins: []
}
