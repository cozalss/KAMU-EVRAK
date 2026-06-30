/** @type {import('tailwindcss').Config} */
// SCOPED to the standalone portfolio entry only — main kamu-evrak app never
// imports the portfolio CSS, so Tailwind's preflight/utilities never touch it.
export default {
  // NOT: yalnız landing (index.html) + portfolio kaynakları taranır. app.html
  // (neon çalışma alanı) BİLEREK listede yok — orada Tailwind sınıfı KULLANILMAZ
  // (neon UI inline-stil). app.html'e Tailwind sınıfı eklemeyin; üretilmez.
  content: ["./index.html", "./src/portfolio/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050505",
        card: "#101010",
        card2: "#161616",
        line: "#262626",
        muted: "#a1a1a1",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      maxWidth: {
        shell: "1440px",
      },
    },
  },
  plugins: [],
};
