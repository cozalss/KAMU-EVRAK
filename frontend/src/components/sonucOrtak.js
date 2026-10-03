import { cleanDemoText } from "./result-cards.jsx";

/* Sonuç çalışma alanının ortak saf yardımcıları (SonucCalismaAlani + bölünmüş kart dosyaları). */
export const arr = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
export const clean = (value) => cleanDemoText(String(value ?? ""));
export const plain = (value) => clean(value).replace(/\*\*/g, "");
