/* ESLint flat config — RUNTIME hata sınıfını yakalamaya odaklı (build/lint'in kaçırdığı
   beyaz-ekran = tanımsız değişken / stale referans / hook ihlali). Stil kuralları KAPALI;
   yalnız gerçek çökme/hata üreten kurallar açık (jüri demosu güvenliği). */
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "public/**", "design-system/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      // ÇEKİRDEK: tanımsız/bildirilmemiş değişken → ReferenceError → beyaz ekran (bu görevin nedeni)
      "no-undef": "error",
      // JSX'te kullanılan bileşen/değişken "kullanılmadı" sanılmasın (yoksa no-unused-vars yanıltır)
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      // Gerçekten ölü/yanlış referanslar — argümanlar hariç (imza korunur); _ ile başlayanlar serbest
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // Hook kuralları — koşullu hook / bağımlılık hataları runtime'da sinsi bug üretir
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Diğer çökme/mantık tuzakları
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-cond-assign": "error",
      "no-self-assign": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-fallthrough": "error",
      // Stil/gürültü kapalı — demo güvenliği için yalnız çökme sınıfına odak
      "no-empty": "off",
      "no-prototype-builtins": "off",
    },
  },
];
