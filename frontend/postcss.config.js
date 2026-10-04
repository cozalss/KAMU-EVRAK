// PostCSS tüm CSS'te koşar; Tailwind yalnız `@tailwind` yönergesi taşıyan dosyada çıktı üretir
// (src/styles/app-tailwind.css, kendi @config'iyle). Diğer CSS'e yalnız autoprefixer dokunur.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
