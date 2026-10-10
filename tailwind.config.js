/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F7FAF6',
        'soft-mint': '#EAF5E9',
        primary: '#26965D',
        secondary: '#21866B',
        'light-mint': '#CDE8D0',
        navy: '#172B3F',
        gold: '#B49A73',
        card: '#FFFFFF',
        'primary-text': '#172B3F',
        'secondary-text': '#64748B',
        border: '#DCE8DE',
        success: '#218653',
        warning: '#C58A28',
        error: '#D94848',
        info: '#3976B8',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
