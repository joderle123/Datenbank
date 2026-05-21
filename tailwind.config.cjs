/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './public/**/*.js'],
  theme: {
    extend: {
      colors: {
        paper:   { DEFAULT: '#FAF8F4', dark: '#161513' },
        ink:     { DEFAULT: '#1A1814', dark: '#E8E4DC' },
        muted:   { DEFAULT: '#6B6358', dark: '#9C9489' },
        line:    { DEFAULT: '#E5DFD2', dark: '#2A2723' },
        primary: { DEFAULT: '#0F3D3E', soft: '#143F40' },
        accent:  { DEFAULT: '#B85C38', soft: '#C16C48' },
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'ui-serif', 'serif'],
        sans: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
};
