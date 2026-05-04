/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Brand: deep indigo — distinguishes from the generic blue-600 most
        // extensions default to. Used for primary action, active project
        // dot, "updated" indicator accents, etc.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        primary: '#0f172a',
        accent: '#4f46e5',
        border: '#e2e8f0',
      },
      boxShadow: {
        'soft-sm': '0 1px 2px rgba(15, 23, 42, 0.05), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        soft: '0 4px 14px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        'soft-lg': '0 18px 40px -12px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04)',
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
      },
    },
  },
  plugins: [],
};
