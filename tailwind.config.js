/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'dash-cyan': '#06B6D4',
        'dash-dark': '#0F172A',
        'dash-panel': '#1E293B',
        'dash-card': '#334155',
        'dash-accent': '#22D3EE',
        'success': '#22C55E',
        'warning': '#F59E0B',
        'danger': '#EF4444',
      },
    },
  },
  plugins: [],
}
