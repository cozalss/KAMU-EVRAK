// PostCSS runs on ALL CSS Vite processes — this chain is global. Isolation is
// by ABSENCE of directives, not plugin scoping: Tailwind emits output (preflight
// + utilities) ONLY for files containing `@tailwind` directives, which is just
// src/portfolio/index.css. Main-app CSS has none, so Tailwind emits nothing for
// it; autoprefixer only adds harmless vendor prefixes. Each Vite HTML entry also
// bundles its own CSS, so the two pages never share a stylesheet at runtime.
// (Verified: loading / never pulls in the portfolio CSS.)
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
