import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        terra: {
          50:  '#fdf6ee',
          100: '#f9e8d0',
          200: '#f2cd9d',
          300: '#e9ab64',
          400: '#e08d3c',
          500: '#d97220',
          600: '#c05a17',
          700: '#9f4315',
          800: '#813619',
          900: '#6a2e18',
        },
        forest: {
          50:  '#f1f8f2',
          100: '#dcf0de',
          200: '#bbe0bf',
          300: '#8cc894',
          400: '#58aa63',
          500: '#378d44',
          600: '#277134',
          700: '#20592b',
          800: '#1c4724',
          900: '#193b20',
        },
        stone: {
          50:  '#f8f7f4',
          100: '#eeece5',
          200: '#dcd8cc',
          300: '#c4bead',
          400: '#a9a18e',
          500: '#978e7a',
          600: '#8a7f6e',
          700: '#73695c',
          800: '#5e564c',
          900: '#4d4740',
        },
      },
      backgroundImage: {
        'topography': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}
export default config
