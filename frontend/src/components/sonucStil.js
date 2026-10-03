/* Sonuç çalışma alanı — "Antet & Damga" katmanı (2026-10).

   kamu-evrak.css'teki `sc-*` sınıfları YERLEŞİMİ taşır ve o dosya bu ekranın sahibine ait
   değil; görsel katman burada, `.kd-sonuc` kapsamıyla (daha yüksek özgüllük) üstüne yazılır.
   KaynakBelge (CanliAjanAkisi.jsx) satır-içi stil kullandığı için kâğıt/masa/fosfor kalemi
   kuralları !important taşır — bu kapsam dışına sızmaz.

   Renkler yalnız token (var(--ke-*) / kagitDoku.js'teki --kd-*) ve onların color-mix'i. */
export const SONUC_CSS = `
.kd-sonuc{ --kd-gir: 0ms; }

/* ---------- HÜKÜM şeridi ---------- */
.kd-sonuc .kd-hukum{
  position: relative; padding: 14px 24px 18px; overflow: visible;
  background: var(--ke-surf); border: 1px solid var(--ke-line); border-radius: 12px;
  box-shadow: var(--ke-sh-card);
  animation: nu-rise .36s var(--ke-ease-out) both;
}
.kd-hukum-kunye{
  display: flex; align-items: center; gap: 12px; min-width: 0;
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; line-height: 14px;
  letter-spacing: .08em; font-weight: 500; color: var(--ke-mut3); text-transform: uppercase;
  padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid var(--ke-line);
}
.kd-hukum-kunye > span:first-child{ color: var(--ke-ink); font-weight: 600; }
.kd-hukum-kunye-tur{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.kd-hukum-kunye-cizgi{ flex: 1; height: 1px; min-width: 12px; background: var(--ke-line); }
.kd-hukum-kunye-iz{ display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; text-transform: none; letter-spacing: .02em; }

.kd-hukum-izgara{
  display: grid; align-items: center; gap: 14px 28px;
  grid-template-columns: max-content minmax(220px, 1.3fr) minmax(180px, 1fr) auto;
  grid-template-areas: "baslik havale not damga";
}
.kd-hukum-baslik{ grid-area: baslik; min-width: 0; }
.kd-hukum-baslik h2{
  margin: 0; color: var(--ke-ink);
  font-family: 'Archivo', 'Segoe UI', system-ui, sans-serif; font-size: 30px; line-height: 34px;
  font-weight: 800; font-stretch: 112%; white-space: nowrap; letter-spacing: -.025em; text-wrap: balance;
}
.kd-sonuc .kd-hukum .sc-decision-status-line{ margin-top: 6px; font-size: 14px; line-height: 20px; font-weight: 600; }
.kd-sonuc .kd-hukum-havale{ grid-area: havale; min-width: 0; margin: 0; flex: none; }
.kd-sonuc .kd-hukum-havale > div{ padding-left: 20px; border-left: 1px solid var(--ke-line); }
.kd-sonuc .kd-hukum-havale dt{ font-size: 12px; line-height: 16px; letter-spacing: .02em; }
.kd-sonuc .kd-hukum-havale dd{ font-size: 15px; line-height: 21px; }
.kd-hukum-not{
  grid-area: not; margin: 0; padding-left: 20px; border-left: 1px solid var(--ke-line);
  font-size: 13px; line-height: 19px; color: var(--ke-mut2); text-wrap: pretty;
}
.kd-hukum-karar{
  display: flex; width: fit-content; align-items: center; gap: 6px; margin-top: 8px; min-height: 32px; padding: 5px 12px;
  /* İkincil görünüm: ekranın TEK birincil düğmesi taslaktaki "Onayla ve gönder" kalır. */
  border-radius: 8px; border: 1px solid color-mix(in srgb, var(--ke-derin-t) 45%, transparent); background: var(--ke-surf); color: var(--ke-derin-t);
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .12s ease;
}
.kd-hukum-karar:hover{ background: color-mix(in srgb, var(--ke-t) 8%, var(--ke-surf)); }
@media (hover: none){ .kd-hukum-karar{ min-height: 44px; } }
.kd-hukum-not-etiket{ display: block; margin-bottom: 3px; font-size: 12px; line-height: 16px; color: var(--ke-mut3); }
/* overflow:clip + clip-margin: eğik damganın dış çizgisi/dönme köşeleri BOYANIR ama sayfanın
   kaydırma genişliğine KATILMAZ (390px'te 27px yatay kayma buradan geliyordu, TUR 3). */
.kd-hukum-damga{ grid-area: damga; justify-self: end; padding: 6px 8px 6px 4px; overflow: clip; overflow-clip-margin: 14px; }
.kd-damga-ic{ display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
.kd-damga-ust{ font-size: 9px; line-height: 10px; letter-spacing: .22em; font-weight: 700; }
.kd-damga-ad{ font-size: 25px; line-height: 26px; letter-spacing: .06em; font-weight: 900; }

@media (max-width: 1180px){
  .kd-hukum-baslik h2{ white-space: normal; }
  .kd-hukum-izgara{
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "baslik damga" "havale havale" "not not";
  }
  .kd-sonuc .kd-hukum-havale > div, .kd-hukum-not{ padding-left: 0; border-left: 0; }
  .kd-sonuc .kd-hukum-havale{ padding-top: 12px; border-top: 1px dashed var(--ke-line); }
}
@media (max-width: 760px){
  .kd-sonuc .kd-hukum{ padding: 12px 16px 16px; }
  .kd-hukum-baslik h2{ font-size: 22px; line-height: 26px; font-stretch: 104%; }
  .kd-hukum-izgara{ column-gap: 12px; }
  .kd-damga-ad{ font-size: 19px; line-height: 20px; }
  .kd-hukum-damga{ align-self: start; padding: 4px 2px 0 0; }
  .kd-hukum-kunye-iz{ display: none; }
}

/* ---------- Belge masası + kâğıt ---------- */
.kd-sonuc .sc-result-document-grid{ position: relative; }
/* EŞLEŞMİŞ ÇİFT: iki kâğıt aynı genişlikte, AYNI ölçekte iki A4 sayfasıdır — kaynak ile taslak
   yan yana bir "karşılaştırma masası" gibi okunur. Taslak A4Belge'de ölçeğini genişlikten
   türetir (genişlik / 210 mm, azami 860px kâğıt); kaynak kâğıdı aynı matematiği CSS kap
   birimleriyle (cqi) kurar: punto = 11pt × (genişlik / 793,7px), kenar = 15 mm × aynı ölçek.
   İki sütun + iki masa dolgusu eşit olduğu sürece ölçekler piksel-aynı çıkar. */
@media (min-width: 1121px){ .kd-sonuc .sc-result-document-grid{ grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 20px; } }
.kd-sonuc .sc-source-slot [data-kd="kaynak-masa"]{
  container-type: inline-size; align-items: flex-start;
  padding: 18px 12px 22px !important;
}
.kd-sonuc .sc-source-slot [data-kd="kaynak-kagit"]{
  --kd-a4: min(100cqi, 860px);
  flex: none !important; width: var(--kd-a4) !important; max-width: none !important;
  aspect-ratio: 210 / 297; overflow: visible !important;
  padding: calc(var(--kd-a4) * .07143) !important;
}
.kd-sonuc .sc-source-slot [data-kd="kaynak-kagit"] pre{
  font-size: calc(var(--kd-a4) * .018477) !important;
  line-height: 1.45 !important; letter-spacing: 0 !important;
}
@media (max-width: 760px){
  .kd-sonuc .sc-source-slot [data-kd="kaynak-masa"]{ padding: 12px 8px 16px !important; }
  .kd-sonuc .sc-main-draft-shell .sc-document-stage{ padding: 12px 8px 16px !important; }
  /* Eşleşmiş çift telefonda da piksel-aynı: kâğıt sarmalının mobil iç dolgusu (kamu-evrak.css)
     taslağı kaynaktan 48px dar bırakıyordu (236 vs 284). */
  .kd-sonuc .sc-main-draft-shell .sc-document-paper,
  .kd-sonuc .sc-draft-card .sc-document-paper{ padding: 0 !important; min-height: 0 !important; }
  .kd-sonuc .sc-draft-card .sc-document-stage{ padding: 12px 8px 16px !important; }
}
/* Masa: kart başlığının altındaki alan arşiv grisine iner, hafif iç gölgeyle "çukur". */
.kd-sonuc .sc-source-slot [data-kd="kaynak-masa"],
.kd-sonuc .sc-main-draft-shell .sc-document-stage,
.kd-sonuc .sc-draft-card .sc-document-stage{
  background: var(--kd-masa) !important;
  box-shadow: var(--kd-masa-golge);
}
.kd-sonuc .sc-main-draft-shell .sc-document-stage{ padding: 18px 12px 22px; }
/* Kâğıt: keskin köşe, lif dokusu, kâğıt gölgesi. Koyu temada da açık kâğıt — token'lar
   kâğıdın İÇİNDE yeniden kapsamlanır ki satır-içi var(--ke-ink2) vb. kâğıt mürekkebine dönsün. */
.kd-sonuc .sc-source-slot [data-kd="kaynak-kagit"]{
  --ke-ink: var(--kd-kagit-murekkep);
  --ke-ink2: color-mix(in srgb, var(--kd-kagit-murekkep) 90%, var(--kd-kagit));
  --ke-mut2: color-mix(in srgb, var(--kd-kagit-murekkep) 66%, var(--kd-kagit));
  --ke-press: color-mix(in srgb, var(--kd-kagit-murekkep) 9%, transparent);
  --ke-line: color-mix(in srgb, var(--kd-kagit-murekkep) 12%, transparent);
  background-color: var(--kd-kagit) !important;
  background-image: var(--kd-doku) !important;
  border-radius: 2px !important;
  border-color: color-mix(in srgb, var(--kd-kagit-murekkep) 10%, transparent) !important;
  box-shadow: var(--ke-sh-kagit) !important;
  color: var(--kd-kagit-murekkep);
}
.kd-sonuc .sc-source-slot pre{ font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important; letter-spacing: .005em; }

/* ---------- Fosforlu kalem (çıkarılan alanlar) ----------
   Kalem darbesi: sol ucu ince başlayan, sağda hafif sönen eğik şerit; metin mürekkep kalır
   (eskiden sarı METİN + tint kutu — kâğıt üstünde "UI çipi" gibi okunuyordu). Giriş: şerit
   soldan sağa çekilir, alanlar sırayla (kalem belgeyi yukarıdan aşağı tarıyor). */
.kd-sonuc .sc-source-slot mark{
  color: inherit !important;
  background-color: transparent !important;
  background-image: linear-gradient(100deg, transparent 0, var(--kd-fosfor) .3em, var(--kd-fosfor) calc(100% - .5em), color-mix(in srgb, var(--kd-fosfor) 55%, transparent) calc(100% - .1em), transparent 100%) !important;
  background-repeat: no-repeat; background-size: 100% 74%; background-position: 0 72%;
  border-radius: .5em .25em .45em .2em !important;
  padding: 0 .14em; margin: 0 -.14em;
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
  animation: kd-fosfor .55s var(--ke-ease-out) both;
  transition: background-size .2s var(--ke-ease-out), box-shadow .2s var(--ke-ease-out);
}
.kd-sonuc .sc-source-slot mark:nth-of-type(2){ animation-delay: .12s; }
.kd-sonuc .sc-source-slot mark:nth-of-type(3){ animation-delay: .24s; }
.kd-sonuc .sc-source-slot mark:nth-of-type(4){ animation-delay: .36s; }
.kd-sonuc .sc-source-slot mark:nth-of-type(5){ animation-delay: .48s; }
.kd-sonuc .sc-source-slot mark:nth-of-type(n+6){ animation-delay: .6s; }
.kd-sonuc .sc-source-slot mark.kd-ip-aktif{
  background-image: linear-gradient(100deg, transparent 0, var(--kd-fosfor-koyu) .3em, var(--kd-fosfor-koyu) calc(100% - .3em), transparent 100%) !important;
  box-shadow: 0 1.5px 0 0 var(--kd-ip);
}
@keyframes kd-fosfor{ from{ background-size: 0% 74%; } to{ background-size: 100% 74%; } }

/* ---------- Dayanak ipliği ---------- */
.kd-ip-katman{ position: absolute; inset: 0; pointer-events: none; z-index: 6; overflow: visible; }
.kd-ip-serit{
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; margin-top: 14px;
  font-size: 12px; line-height: 16px; color: var(--ke-mut2);
}
.kd-ip-serit-etiket{
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--ke-mut3); margin-right: 4px; white-space: nowrap;
}
.kd-ip-dugme{
  display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 3px 10px 3px 8px;
  border-radius: 999px; border: 1px solid var(--ke-line); background: var(--ke-surf);
  color: var(--ke-ink2); font: inherit; font-weight: 600; cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.kd-ip-dugme:hover, .kd-ip-dugme[aria-pressed="true"]{ background: color-mix(in srgb, var(--kd-ip) 8%, var(--ke-surf)); border-color: color-mix(in srgb, var(--kd-ip) 45%, transparent); }
.kd-ip-dugme i{ width: 7px; height: 7px; border-radius: 50%; background: var(--kd-ip); flex: none; }
.kd-ip-not{ flex-basis: 100%; color: var(--ke-mut3); }
.kd-ip-not-dokun{ display: none; }
@media (hover: none){ .kd-ip-not-imlec{ display: none; } .kd-ip-not-dokun{ display: inline; } }
@media (min-width: 1181px){ .kd-ip-not{ flex-basis: auto; margin-left: auto; } }

/* ---------- Bölüm başlıkları: antet çizgisi ----------
   Hızlı inceleme / Ayrıntılar: görünüm başlığındaki çift antet çizgisinin küçük kardeşi
   (2px + 1px ink) — sayfanın "bölümleri" resmî bir dosyanın kısımları gibi ayrılır. */
.kd-sonuc .sc-review-heading{ position: relative; padding-top: 14px; }
.kd-sonuc .sc-review-heading::before{
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px;
  border-top: 2px solid var(--ke-ink); border-bottom: 1px solid var(--ke-ink); opacity: .85;
}
.kd-sonuc .sc-review-heading h2{ font-size: 22px !important; line-height: 28px !important; font-stretch: 114% !important; letter-spacing: -.015em !important; }

/* Risk gerekçesi telefonda: metin tam satır, ağırlık çubuğu + birimsiz değer alt satırda
   (yan yana 5 kelimelik sütuna sıkışıyordu). */
@media (max-width: 560px){
  .kd-sonuc .sc-risk-reason{ flex-wrap: wrap; }
  .kd-sonuc .sc-risk-reason > span:nth-child(2){ flex-basis: calc(100% - 20px) !important; }
  .kd-sonuc .sc-risk-reason .sc-risk-meter{ margin-left: 14px; flex: 1 1 auto; }
}

@media (prefers-reduced-motion: reduce){
  .kd-sonuc .sc-source-slot mark, .kd-sonuc .kd-hukum{ animation: none !important; }
}
@media print{ .kd-ip-katman, .kd-ip-serit{ display: none !important; } }
`;
