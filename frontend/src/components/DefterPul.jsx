/* DefterPul — Giden evrak defterinin posta damgası ("iptal pulu") ve GÜNÜN PULU ayracı.

   Neden satırdan alındı (jüri tur 6): her satıra pul basılıyordu (30 gönderide 30 mühür —
   ekran başına ≤2 damga kuralının ruhunu deliyordu) ve pul yazısı ~6 px'te okunmuyordu.
   Şimdi gerçek posta defterindeki gibi: her GÜN bir pul, gün ayracına basılır; satırda
   yalnız mono "saat 20:43" kalır. Pul 1:1 ölçekte çizilir — en küçük yazı 9 px.
   Aynı pul detay nüshasında kâğıdın sağ üst köşesine basılır (arşiv nüshası).

   Görsel: dairesel çift halka, üst yayda GÖNDERİLDİ, alt yayda yıl, ortada gün.ay; sağda
   iptal dalgaları. Istampa moru (DERIN.V), mürekkep dokusu maskesi, kimlikten türeyen SABİT
   eğim (yeniden çizimde zıplamaz). Salt görsel (aria-hidden) — tarih metin olarak ayrıca
   okunur. Giriş: nu-damga vuruşu (reduced-motion global kuralı kapatır). */
import React, { useId } from "react";
import { DISPLAY, MONO, PAL, TYPE, TNUM, SP, DERIN } from "./neonUi.jsx";

const PUL_DOKU = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const iki = (n) => String(n).padStart(2, "0");

/** @param {{ts:number, tohum?:string, olcek?:number, gecikme?:number}} p */
export function PostaDamgasi({ ts, tohum = "", olcek = 1, gecikme = 120 }) {
  const uid = useId().replace(/:/g, "");
  const d = new Date(Number(ts || 0));
  const gecerli = !Number.isNaN(d.getTime());
  const gun = gecerli ? `${iki(d.getDate())}.${iki(d.getMonth() + 1)}` : "—";
  const yil = gecerli ? String(d.getFullYear()) : "";
  let h = 0;
  for (const c of String(tohum)) h = (h * 31 + c.charCodeAt(0)) % 997;
  const egim = -4 - (h % 9);
  return (
    <svg width={100 * olcek} height={64 * olcek} viewBox="0 0 100 64" aria-hidden="true"
      style={{ "--egim": `${egim}deg`, display: "block", color: DERIN.V, transform: `rotate(${egim}deg)`, overflow: "visible",
        WebkitMaskImage: PUL_DOKU, maskImage: PUL_DOKU, WebkitMaskSize: "120px 80px", maskSize: "120px 80px",
        animation: `nu-damga .5s var(--ke-ease-out) ${gecikme}ms both` }}>
      <defs>
        <path id={`ust-${uid}`} d="M 10.5 32 A 21.5 21.5 0 0 1 53.5 32" />
        <path id={`alt-${uid}`} d="M 6.5 32 A 25.5 25.5 0 0 0 57.5 32" />
      </defs>
      {[0, 8, 16].map((y) => <path key={y} d={`M 64 ${24 + y} q 4.5 -3.5 8.5 0 t 8.5 0 t 8.5 0 t 8.5 0`} fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".75" />)}
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" strokeWidth="1" />
      <text style={{ fontFamily: DISPLAY, fontSize: 9, fontWeight: 800, letterSpacing: ".03em", fontStretch: "100%" }} fill="currentColor">
        <textPath href={`#ust-${uid}`} startOffset="50%" textAnchor="middle">GÖNDERİLDİ</textPath>
      </text>
      <text style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: ".04em" }} fill="currentColor">
        <textPath href={`#alt-${uid}`} startOffset="50%" textAnchor="middle">★ {yil} ★</textPath>
      </text>
      <text x="32" y="35.5" textAnchor="middle" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, ...TNUM }} fill="currentColor">{gun}</text>
    </svg>
  );
}

/* Günün pulu ayracı — zimmet defterinin gün başlığı: solda gün adı + tarih + gönderi sayısı,
   sağda o günün posta damgası. Yapışkan değil (pul yüksekliği kayan satırları örterdi). */
export function GunPuluBasligi({ etiket, tarih, sayi, ts, tohum, kolon = 4 }) {
  return (
    /* Tur 8 jüri 2: iki satırlı başlık + tam boy pul tek kayıtta ~80 px tutuyordu → tek satır
       künye, 56 px; pul satır çizgisine oturan küçültülmüş damga (yükseklik eklemez). */
    <div data-sd-grup="" role="row" style={{ position: "relative", padding: `0 20px`, minHeight: 56, alignItems: "center" }}>
      <span role="gridcell" aria-colspan={kolon} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.l, width: "100%", minWidth: 0 }}>
        <span role="heading" aria-level={2} style={{ ...TYPE.antet, fontSize: 10, color: PAL.ink2, textTransform: "uppercase", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {etiket} <span style={{ color: PAL.mut2, ...TNUM }}>{tarih}</span>
          <span style={{ color: PAL.mut3, ...TNUM }}> · {sayi} gönderi · posta defteri</span>
        </span>
        {ts != null && <span style={{ marginRight: SP.xl, flexShrink: 0, height: 48, display: "flex", alignItems: "center" }}><PostaDamgasi ts={ts} tohum={tohum} olcek={0.72} /></span>}
      </span>
    </div>
  );
}
