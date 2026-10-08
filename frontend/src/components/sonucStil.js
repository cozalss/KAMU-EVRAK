/* Sonuç çalışma alanı — "Antet & Damga" katmanı (2026-10).

   kamu-evrak.css'teki `sc-*` sınıfları YERLEŞİMİ taşır ve o dosya bu ekranın sahibine ait
   değil; görsel katman burada, `.kd-sonuc` kapsamıyla (daha yüksek özgüllük) üstüne yazılır.
   KaynakBelge (CanliAjanAkisi.jsx) satır-içi stil kullandığı için kâğıt/masa/fosfor kalemi
   kuralları !important taşır — bu kapsam dışına sızmaz.

   Renkler yalnız token (var(--ke-*) / kagitDoku.js'teki --kd-*) ve onların color-mix'i. */
export const SONUC_CSS = `
.kd-sonuc{ --kd-gir: 0ms; --kd-ip: var(--ke-t); }
/* --kd-ip tükenmez mavisi (jüri tur 8): ip çiplerinin kırmızı noktası hata/uyarı gibi
   okunuyordu. İp bir BAĞLANTIDIR; kırmızı yalnız aciliyet/hata için kalır. */

/* ---------- Gönderim kilidi (jüri tur 8, yüksek) ----------
   Şerit "Gönderime hazır değil" derken taslağın altındaki "Onayla ve gönder" dolu primary
   duruyordu. data-gonderim-kilit (SonucCalismaAlani, gonderimDenetimi ile) varken düğme İKİNCİL
   tona iner ve "eksik var" künyesi taşır; tıklamak onay fişini açar — fiş kilitlidir ve
   "Taslağı düzenle"ye yönlendirir (gönderim yolu tek). Satır-içi stilin üstüne !important. */
.kd-sonuc[data-gonderim-kilit] .sc-main-draft-shell .sc-decision-footer button[aria-label="Taslağı onayla ve gönder"]:not(:disabled){
  background: var(--ke-surf) !important; color: var(--ke-ink2) !important;
  border: 1px dashed var(--ke-input-line) !important; font-weight: 500 !important;
}
.kd-sonuc[data-gonderim-kilit] .sc-main-draft-shell .sc-decision-footer button[aria-label="Taslağı onayla ve gönder"]:not(:disabled)::after{
  content: "eksik var"; margin-left: 8px; padding: 1px 6px; border-radius: 4px;
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10px; line-height: 14px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--ke-derin-kirmizi); border: 1px solid currentColor;
}

/* TUR 9 (jüri, yüksek): kilitliyken ekranda dolu primary kalmıyordu. Onarım eylemi Düzenle
   TEK dolu primary'ye terfi eder (aynı dolgu token çifti); Onayla ikincil kilit olarak kalır. */
.kd-sonuc[data-gonderim-kilit] .sc-main-draft-shell .sc-decision-footer button[aria-label="Taslağı düzenle"]:not(:disabled){
  background: var(--ke-dolgu-t) !important; color: var(--ke-on-dolgu) !important;
  border-color: transparent !important; font-weight: 600 !important;
}
.kd-sonuc[data-gonderim-kilit] .sc-main-draft-shell .sc-decision-footer button[aria-label="Taslağı düzenle"]:not(:disabled):hover{
  background: var(--ke-dolgu-th) !important;
}

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
/* Blok akış: son kelime + '?' tek bölünmez birim (HukumKarti) — flex sarmada '?' yetim kalıyordu. */
.kd-sonuc .kd-hukum .sc-decision-status-line{ display: block; }
.kd-sonuc .kd-hukum .sc-decision-status-line .sc-risk-help{ margin-left: 6px; vertical-align: -5px; }
.kd-sonuc .kd-hukum-havale{ grid-area: havale; min-width: 0; margin: 0; flex: none; }
.kd-sonuc .kd-hukum-havale > div{ padding-left: 20px; border-left: 1px solid var(--ke-line); }
.kd-sonuc .kd-hukum-havale dt{ font-size: 12px; line-height: 16px; letter-spacing: .02em; }
.kd-sonuc .kd-hukum-havale dd{ font-size: 15px; line-height: 21px; }
.kd-hukum-not{
  grid-area: not; margin: 0; padding-left: 20px; border-left: 1px solid var(--ke-line);
  font-size: 13px; line-height: 19px; color: var(--ke-mut2); text-wrap: pretty;
}
/* Tur 6: şeritteki eylem METİN BAĞLANTISIDIR (tükenmez, altı çizili) — ekranın tek dolu
   primary'si taslağın altındaki "Onayla ve gönder"dir (görünüm başına 1 primary). Bağlantı
   aynı düğmeye götürür ve fişi açar; iki ayrı karar yolu yok. */
.kd-hukum-karar{
  /* flex (blok düzeyi): bağlantı daima KENDİ satırında — inline-flex metnin son satırına
     oturup o satırın aralığını 34–40px'e açıyordu (Tur 6 doğrulaması). */
  display: flex; width: fit-content; align-items: center; gap: 6px; margin-top: 6px; min-height: 32px; padding: 4px 2px;
  border: none; border-radius: 6px; background: transparent; color: var(--ke-derin-t);
  font: inherit; font-size: 14px; line-height: 20px; font-weight: 600; cursor: pointer;
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px;
  text-decoration-color: color-mix(in srgb, var(--ke-derin-t) 45%, transparent);
  transition: text-decoration-color .14s ease, color .14s ease, transform .14s var(--ke-ease-out);
}
.kd-hukum-karar:hover{ text-decoration-color: currentColor; color: var(--ke-derin-th); }
.kd-hukum-karar svg{ transition: transform .18s var(--ke-ease-out); }
.kd-hukum-karar:hover svg{ transform: translateX(2px); }
@media (hover: none){ .kd-hukum-karar{ min-height: 44px; } }
@media (prefers-reduced-motion: reduce){ .kd-hukum-karar:hover svg{ transform: none; } }
/* Sabit üst bar (İşleniyor başlığı) altında çapalar kesilmesin. */
.kd-sonuc .kd-hukum, .kd-sonuc .sc-review-anchor, .kd-sonuc .sc-review-section, .kd-sonuc .sc-quick-review-section{ scroll-margin-top: 128px; }
@media (max-width: 720px){ .kd-sonuc .kd-hukum, .kd-sonuc .sc-review-anchor, .kd-sonuc .sc-review-section, .kd-sonuc .sc-quick-review-section{ scroll-margin-top: 96px; } }
.kd-hukum-not-etiket{ display: block; margin-bottom: 3px; font-size: 12px; line-height: 16px; color: var(--ke-mut3); }
/* overflow:clip + clip-margin: eğik damganın dış çizgisi/dönme köşeleri BOYANIR ama sayfanın
   kaydırma genişliğine KATILMAZ (390px'te 27px yatay kayma buradan geliyordu, TUR 3). */
.kd-hukum-damga{ grid-area: damga; justify-self: end; padding: 6px 8px 6px 4px; overflow: clip; overflow-clip-margin: 14px; }
.kd-damga-ic{ display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
.kd-damga-ust{ font-size: 10px; line-height: 12px; letter-spacing: .2em; font-weight: 700; }
.kd-damga-ad{ font-size: 25px; line-height: 26px; letter-spacing: .06em; font-weight: 900; }

/* TUR 9 (jüri: 1440'ta dört sütun sıkışıyordu — kurum/birim 2 satır, kilit nedeni 4 satır):
   1181–1679 aralığında 2+1 düzen — üstte hüküm · havale · damga, kilit nedeni/sıradaki adım
   tam genişlikte ALT ŞERİT (etiket · metin · bağlantı tek satırda). ≥1680 dört sütun kalır. */
@media (min-width: 1181px) and (max-width: 1679px){
  .kd-hukum-izgara{
    grid-template-columns: max-content minmax(0, 1fr) auto;
    grid-template-areas: "baslik havale damga" "not not not";
    row-gap: 12px;
  }
  .kd-hukum-not{
    display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 12px; row-gap: 2px;
    padding: 10px 0 0; border-left: 0; border-top: 1px dashed var(--ke-line);
  }
  .kd-hukum-not-etiket{ display: inline; margin: 0; flex: none; font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  .kd-hukum-not > [role="status"], .kd-hukum-not > span:not(.kd-hukum-not-etiket){ flex: 1 1 320px; min-width: 0; }
  .kd-hukum-karar{ margin: 0 0 0 auto; min-height: 28px; padding: 2px; }
}
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
/* (TUR 4'e dek) EŞLEŞMİŞ ÇİFT: iki kâğıt aynı genişlikte, AYNI ölçekte iki A4 sayfasıydı — kaynak ile taslak
   yan yana bir "karşılaştırma masası" gibi okunur. Taslak A4Belge'de ölçeğini genişlikten
   türetir (genişlik / 210 mm, azami 860px kâğıt); kaynak kâğıdı aynı matematiği CSS kap
   birimleriyle (cqi) kurar: punto = 11pt × (genişlik / 793,7px), kenar = 15 mm × aynı ölçek.
   İki sütun + iki masa dolgusu eşit olduğu sürece ölçekler piksel-aynı çıkar. */
/* OKUNABİLİRLİK (bağımsız denetim, TUR 4): eşit iki sütunda taslak metni 1440'ta ~9 px'e
   düşüyordu. İmzalanacak belge taslaktır; sütun ona genişlik verir (≈%59). Kaynak belge
   düz metin olduğu için kâğıt ölçeğine bağlı kalmaz, okunur puntoda kendi sütununa akar. */
@media (min-width: 1121px){ .kd-sonuc .sc-result-document-grid{ grid-template-columns: minmax(0, .82fr) minmax(0, 1.18fr); column-gap: 20px; } }
/* TUR 8 (jüri: 1440'ta iki kâğıdın puntosu ayrışıyordu, kaynak 13 px · taslak 11,7 px): dar
   masaüstünde taslak sütunu biraz daha pay alır (≈%64) → A4 ölçeği 0,80 → ~0,88; kaynak
   puntosu aynı ölçeği izler (aşağıdaki clamp tabanı 12 px'e indi). Geniş ekranda (≥1680)
   taslak zaten tam ölçeğe yakın; oran değişmez. */
/* TUR 8 (jüri: asıl karar çubuğu katlama çizgisinin altında — 1440x900'de y≈960): masaüstünde
   taslak kartının dibine YAPIŞIK. Kart overflow:hidden taşıdığından kendisi kaydırma kabı
   sayılıyor ve sticky'yi yutuyordu → clip (kırpar ama kaydırma kabı kurmaz). Üstte ince
   kâğıt gölgesi: altında belge devam ettiği okunur. Telefon düzeni değişmez. */
@media (min-width: 1121px){
  .kd-sonuc .sc-main-draft-shell .sc-draft-card{ overflow: clip !important; }
  .kd-sonuc .sc-main-draft-shell .sc-decision-footer{ position: sticky; bottom: 0; z-index: 3; background: var(--ke-surf);
    box-shadow: 0 -10px 16px -14px color-mix(in srgb, var(--ke-ink) 45%, transparent); }
}
/* Çift sarmalayıcı dar ekranda eski düzeni korur: tek sütun, 16px aralık (support-grid ile aynı). */
.kd-sonuc .kd-destek-cift{ display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
/* TUR 8 — Ayrıntılar ızgarası (jüri: mevzuat satır ölçüsü ~1100px, okunamaz). Masaüstünde her
   öneri iki sütun: metin ≤72ch · sağda dar künye sütunu (alaka çubuğu + göreli skor etiketi).
   Başlıktaki göreli yüzde o sütuna taşınır (aynı bilgi iki yerde basılmaz). */
@media (min-width: 1121px){
  .kd-sonuc .kd-mev-govde{ display: grid !important; grid-template-columns: minmax(0, 72ch) minmax(150px, 200px); justify-content: space-between; column-gap: 32px; row-gap: 6px !important; }
  .kd-sonuc .kd-mev-govde > *{ grid-column: 1; }
  .kd-sonuc .kd-mev-govde > .kd-mev-cubuk{ grid-column: 2; grid-row: 1 / span 4; align-self: start; padding-top: 3px; }
  .kd-sonuc .kd-mev-cubuk-etiket{ display: block !important; }
  .kd-sonuc .kd-mev-pct{ display: none !important; }
  /* Dosyalama künyesi üç eşit kolon (kod · plan başlığı · saklama) — "Saklama süresi" sağa
     savrulmuyordu artık ızgaraya oturur. */
  .kd-sonuc .kd-destek-cift{ display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 16px; align-items: stretch; }
  .kd-sonuc .kd-destek-cift[data-tek]{ grid-template-columns: minmax(0, 1fr); }
  .kd-sonuc .sc-archive-grid{ grid-template-columns: repeat(3, minmax(0, 1fr)) !important; column-gap: 24px; }
}
/* TUR 8 jüri: masaüstünde iki panelin ALT KENARI aynı hizada biter (kaynak kartı ızgara
   satırını doldurur; taslak kartı da) — sağ panelin altında boş şerit kalmaz. Kart çiftleri
   (Risk | Bilgiler, Yönlendirme | Doğrulama) içerik boyunda: kısa kartın altında 150–250px
   ölü alan kalıyordu. Telefon düzenine dokunulmaz. */
@media (min-width: 1121px){
  .kd-sonuc .sc-result-document-grid{ align-items: stretch; }
  .kd-sonuc .sc-result-document-grid > .sc-document-slot{ display: flex; flex-direction: column; min-height: 0; }
  .kd-sonuc .sc-result-document-grid > .sc-document-slot > *{ flex: 1 1 auto; }
  .kd-sonuc .sc-main-draft-shell .sc-draft-card .sc-document-stage{ flex: 1 1 auto; padding-bottom: 28px; }
  /* TUR 8 · 2. jüri: içerik boyu çiftlerde alt kenarlar 40–80 px düzensiz kalıyordu. Çift
     artık satırı doldurur (stretch) ve kartın gövdesi esner; alt eylem/dipnot kart DİBİNE
     yaslanır (margin-top:auto) — boşluk içerik ile eylem arasına düşer, kartın altına değil. */
  .kd-sonuc .sc-quick-review-grid, .kd-sonuc .kd-destek-cift{ align-items: stretch; }
  .kd-sonuc .kd-destek-cift > .sc-support-half{ align-self: stretch; display: flex; }
  .kd-sonuc .sc-quick-review-grid > .sc-review-anchor{ display: flex; }
  .kd-sonuc .sc-quick-review-grid > .sc-review-anchor > section,
  .kd-sonuc .sc-quick-review-grid > section,
  .kd-sonuc .kd-destek-cift > .sc-support-half > section{ flex: 1 1 auto; height: auto !important; display: flex; flex-direction: column; }
  .kd-sonuc .sc-quick-review-grid section > div:last-child,
  .kd-sonuc .kd-destek-cift > .sc-support-half > section > div:last-child{ flex: 1 1 auto; display: flex; flex-direction: column; }
  .kd-sonuc .sc-quick-info-footer, .kd-sonuc .kd-kart-dip{ margin-top: auto !important; }
  .kd-sonuc .sc-quick-info-list + .sc-quick-info-footer{ padding-top: 16px; }
  /* Sticky karar çubuğu imza bloğunu örtmesin (jüri, 1440): sahne çubuk yüksekliği kadar
     alt pay ayırır → kâğıdın dibi, çubuk yapıştığında da çubuğun ÜSTÜNDE okunur. */
  .kd-sonuc .sc-main-draft-shell .sc-draft-card .sc-document-stage{ padding-bottom: 96px !important; scroll-padding-bottom: 96px; }
}
@media (min-width: 1121px) and (max-width: 1679px){ .kd-sonuc .sc-result-document-grid{ grid-template-columns: minmax(0, .72fr) minmax(0, 1.28fr); } }
.kd-sonuc .sc-source-slot [data-kd="kaynak-masa"]{
  container-type: inline-size; align-items: flex-start;
  padding: 18px 12px 22px !important;
}
.kd-sonuc .sc-source-slot [data-kd="kaynak-kagit"]{
  --kd-a4: min(100cqi, 860px);
  flex: none !important; width: var(--kd-a4) !important; max-width: none !important;
  /* İçeriğe göre uzar (boş A4 yüksekliği yok); kısa metinde kâğıt hissi için taban yükseklik. */
  min-height: calc(var(--kd-a4) * 1.4142 * .45); overflow: visible !important;
  padding: calc(var(--kd-a4) * .07143) !important;
}
.kd-sonuc .sc-source-slot [data-kd="kaynak-kagit"] pre{
  /* Tur 6: punto, yandaki taslağın ekrandaki puntosunu izler. Taslak sütunu kaynaktan
     1,18/0,82 ≈ 1,44 kat geniştir ve 11 pt'yi (14,67 px) kendi ölçeğiyle basar →
     14,67 × 1,44 / 793,7 ≈ 0,026 × kaynak genişliği. 1920'de 13 px'e karşı 15,9 px
     ayrışıyordu (jüri); artık ~15 px'e karşı ~15,9 px. Taban 13 px okunurluk kilididir. */
  font-size: clamp(13px, calc(var(--kd-a4) * .026), 16px) !important;
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
/* Telefon: 44px dokunma hedefi (tur 6 doğrulaması: çipler 28px, '?' 22px idi). '?' görsel
   olarak küçük kalır; tıklanabilir alanı görünmez ::after ile büyür. */
@media (max-width: 640px){
  .kd-ip-dugme{ min-height: 44px; padding: 4px 14px 4px 12px; }
  .kd-sonuc .sc-risk-help-trigger::after{ inset: -11px; }
}
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
