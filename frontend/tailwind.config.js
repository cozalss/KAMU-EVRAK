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
        // Çalışma alanı aksanları (neonUi THEME_CSS ile aynı değerler).
        tukenmez: "#2b4fd6",
        tukenmezKoyu: "#1f3fb4",
        istampa: "#6b3ea6",
        acele: "#d93a2b",
        arsiv: "#eceee9",
      },
      fontFamily: {
        // Çalışma alanıyla tek marka dili ("Antet & Damga"): gövde Instrument Sans,
        // başlık Archivo (genişlik ekseni), makine verisi Plex Mono. Inter yalnız
        // footer Lottie wordmark'ı için yüklenir (lottie metin kutuları ona göre ölçülü).
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Archivo", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: {
        shell: "1440px",
      },
    },
  },
  plugins: [],
};
