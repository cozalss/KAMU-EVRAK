/* ÖLÇÜM KOŞUMU — Taslaklar mount jank'i (geçici, ölçümden sonra silinir). */
import React from "react";
import ReactDOM from "react-dom/client";
import TaslaklarView from "./components/TaslaklarView.jsx";
import { THEME_CSS, NEON_KEYFRAMES } from "./components/neonUi.jsx";
import "./styles/fonts.css";
import "./styles/kamu-evrak.css";
import "./styles/app-tailwind.css";

const GOVDE = `T.C.
 KAYSERİ VALİLİĞİ
 Yazı İşleri Birimi

Sayı : E-[DETSİS No]-906-[Kayıt No] 12.08.2026
Konu : Yıllık izin talebi

 Sayın Elif Doğan

İlgi : 02.07.2026 tarihli başvurunuz.

İlgi yazıda belirtilen "Yıllık izin talebi" konusundaki başvurunuz kurumumuz kayıtlarına alınmıştır. Konu, gerekli değerlendirmenin yapılması için ilgili birime iletilmiş olup sonucu tarafınıza ayrıca bildirilecektir.

 Bilgilerinize sunulur.

 Yetkili İmza
 Birim Yetkilisi`;

const params = new URLSearchParams(location.search);
// sayfa=N → gövde N sayfaya taşacak kadar tekrarlanır (1 = tek sayfa).
const SAYFA = Math.max(1, Number(params.get("sayfa") || 1));
const metin = SAYFA === 1 ? GOVDE : Array(SAYFA * 3).fill(GOVDE).join("\n\n");

const TASLAKLAR = Array.from({ length: 6 }, (_, i) => ({
  id: `t${i}`,
  name: `ornek-${i}.txt`,
  ts: Date.now() - i * 86400000,
  evrak_turu: "dilekce",
  hedef_birim: "yazi_isleri",
  result: {
    evrak_turu: "dilekce",
    hedef_birim: "yazi_isleri",
    yazi_turu: "bilgilendirme_yazisi",
    yazi_taslak_md: metin,
  },
}));

document.documentElement.setAttribute("data-theme", "light");

window.__RENDER = 0;
function Sayac({ children }) {
  window.__RENDER += 1;
  return children;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <style>{THEME_CSS}</style>
    <style>{NEON_KEYFRAMES}</style>
    <Sayac><TaslaklarView drafts={TASLAKLAR} /></Sayac>
  </React.StrictMode>,
);
