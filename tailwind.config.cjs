/** @type {import('tailwindcss').Config} */
// Keep in sync with the inline tailwind.config in index.html (used while
// developing with the Play CDN). Colours come from CSS variables defined in
// index.html (:root and html.dark), so light and dark mode switch in one place.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./index.html', './public/**/*.js'],
  theme: {
    extend: {
      colors: {
        canvas:  { DEFAULT: v('--c-bg'),      dark: v('--c-bg') },
        paper:   { DEFAULT: v('--c-surface'), dark: v('--c-surface') },
        ink:     { DEFAULT: v('--c-ink'),     dark: v('--c-ink') },
        muted:   { DEFAULT: v('--c-muted'),   dark: v('--c-muted') },
        line:    { DEFAULT: v('--c-line'),    dark: v('--c-line') },
        primary: { DEFAULT: v('--c-primary'), soft: v('--c-primary-strong') },
        accent:  { DEFAULT: v('--c-accent'),  soft: v('--c-accent') },
      },
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Manrope var"', 'Manrope', '"Inter var"', 'system-ui', 'sans-serif'],
        mono: ['"Inter var"', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['"Manrope var"', 'Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
};
