/* temaCss — "Antet & Damga" RENK token'larının TEK hex kaynağı (THEME_CSS).
   neonUi.jsx'ten ayrıldı (tur 4): dosya 800 satır sınırını aşıyordu VE saf .js olduğu için
   node --test onu doğrudan import edebilir → kontrast sözleşmesi birim testte ölçülür
   (lib/temaKontrast.test.js). neonUi.jsx THEME_CSS'i buradan yeniden dışa aktarır; çağıranlar
   değişmez. "Hex yalnız THEME_CSS'te" kuralı aynen geçerli: bu dosya o bloğun kendisidir. */

/* Açık/koyu mod değerleri — kök [data-theme] ile seçilir (main.jsx Root ayarlar; kalıcı
   tercih localStorage "ke-tema", yoksa OS prefers-color-scheme). Hex YALNIZ burada yazılır;
   PAL/T/V/R/BANT/DERIN hep var() üzerinden okur — görünüm dosyaları hiç değişmeden iki modda
   da çalışır. */
export const THEME_CSS = `
:root{
  color-scheme:light;
  --ke-t:#2b4fd6; --ke-v:#6b3ea6; --ke-r:#d93a2b;
  --ke-bg:#eceee9; --ke-bg2:#e2e5de; --ke-surf:#ffffff; --ke-surf2:#f7f8f4; --ke-surf-hi:rgba(17,22,40,.05);
  --ke-line:rgba(17,22,40,.11); --ke-line-hi:rgba(17,22,40,.22);
  --ke-ink:#10131d; --ke-ink2:#2c3140; --ke-mut:#5c6272; --ke-mut2:#474d5d; --ke-mut3:#5b6173;
  --ke-hov:rgba(17,22,40,.04); --ke-press:rgba(17,22,40,.075);
  --ke-input-line:rgba(17,22,40,.47); --ke-on-accent:#ffffff; --ke-ink-surf:#141827; --ke-scrim:rgba(12,15,28,.40);
  /* scrim-koyu: A4/kurul modallarının "her iki temada koyu" karartısı (bkz. --ke-on-ink
     gerekçesi) — dark'ta YENİDEN TANIMLANMAZ. on-ink-2: bu karartı üstündeki ikincil metin. */
  --ke-scrim-koyu:rgba(10,12,22,.82); --ke-on-ink-2:rgba(238,241,250,.74);
  /* cam: yarı saydam yüzey — opak beyaz yerine zeminin sıcaklığını içeri alan kart (bkz. CAM). */
  --ke-cam:rgba(255,255,255,.62); --ke-cam-line:rgba(17,22,40,.09);
  /* iris: sıralı pastel rampa (bkz. IRIS). Landing hero'sunun gökyüzünden türer:
     gök mavisi → lavanta → pudra gülü. ÖLÇÜLDÜ — bağıl parlaklık 0.560 / 0.323 / 0.178,
     komşu adım kontrastı 1.64 ve 1.64 (eşit adım): sıralama gri tonlamada da okunur.
     *b = adımın açık ucu (hologram parlaması) · *k = kenar çizgisi.
     Kenar ŞART: pastel dolgunun kremle kontrastı 1.56:1 (WCAG 1.4.11 bilgi taşıyan grafik
     için 3:1 ister); kenarlar 3.5–6.2:1 ile eşiği tek başına karşılar, dolgu pastel kalır. */
  --ke-iris-1:#93cfdd; --ke-iris-1b:#cdeef4; --ke-iris-1k:#3d8ba1;
  --ke-iris-2:#a68fd0; --ke-iris-2b:#d5c9ec; --ke-iris-2k:#6b52a0;
  --ke-iris-3:#b25878; --ke-iris-3b:#e0a0b4; --ke-iris-3k:#8f3f60;
  /* --ke-on-ink:#f3f5fb; üstündeki metin de hep açık kalmalı.
     --ke-on-accent bunun için YANLIŞ token'dı: DERIN.*-dolgulu buton metni için tema-tersine
     akar (koyu modda karartı+onAccent ikisi de koyulaşıp metin kayboluyordu — 2026-07 bulgusu). */
  --ke-on-ink:#fbf7f0;
  /* on-ink-hata: HEP KOYU katman (scrim/inkSurf) üstünde hata metni — on-ink gibi iki modda
     tek değer. Ham BANT.kirmizi scrim üstünde ~1.4:1'e düşüyordu (2026-08 bulgusu); bu açık
     mercan koyu scrimde her iki temada ~7:1 verir. */
  --ke-on-ink-hata:#ff9d8f;
  /* alfa: ALFA() tint oranı — koyu modda %8 siyaha kompozit olunca görünmüyordu, tek token'la
     moda göre ayarlanır (çağıran 91 yer değişmeden). */
  --ke-alfa:8%;
  /* surf-pop: havada duran katman yüzeyi — açık modda surf ile bit-aynı; koyu modda bir
     basamak açık (siyahta gölge yerine ışıkla yükseklik). */
  --ke-surf-pop:#ffffff;
  /* kagit: EVRAK kâğıdının kendisi (A4 taslak, okunan belge, giriş sahnesindeki dilekçe).
     Açık temada evrak yüzeyiyle bit-aynı; koyu temada AÇIK kalır (bkz. dark blok + kâğıt kapsamı). */
  --ke-kagit:#ffffff;
  --ke-shadow-rgb:16,20,38;
  /* Gölge token'ları var() üzerinden: açık mod değerleri eski SH dizgeleriyle BİT-AYNI;
     koyu mod kendi zanaatını taşır (iç üst-kenar ışığı + gerçek karartı — bkz. dark blok). */
  --ke-sh-card:0 1px 2px rgba(var(--ke-shadow-rgb),.05);
  --ke-sh-pop:0 4px 12px -2px rgba(var(--ke-shadow-rgb),.10), 0 1px 3px rgba(var(--ke-shadow-rgb),.05);
  --ke-sh-modal:0 16px 40px -12px rgba(var(--ke-shadow-rgb),.18), 0 2px 8px rgba(var(--ke-shadow-rgb),.06);
  /* kagit: A4 kâğıdının koyu scrim üstündeki derin gölgesi (A4Belge) — değerler eski elle
     yazımla bit-aynı, yalnız mürekkep tek kaynağa (--ke-shadow-rgb) bağlandı. */
  --ke-sh-kagit:0 1px 2px rgba(var(--ke-shadow-rgb),.06), 0 12px 28px -8px rgba(var(--ke-shadow-rgb),.18);
  /* Güçlü özel easing eğrileri (emil-design-eng) — yerleşik ease-* zayıf; mod-bağımsız (dark'ta ezilmez).
     spring: geri tepmeli (back-out) — yalnız SAHNE tamamlanma/ateşleme vuruşları. */
  --ke-ease-out:cubic-bezier(0.23,1,0.32,1); --ke-ease-in-out:cubic-bezier(0.77,0,0.175,1);
  --ke-ease-spring:cubic-bezier(0.34,1.56,0.64,1);
  --ke-bant-yesil:#1f8a5b; --ke-bant-sari:#c4841a; --ke-bant-kirmizi:#d23a2e;
  --ke-derin-t:#1f3fb4; --ke-derin-th:#18329a; --ke-derin-v:#56308a; --ke-derin-r:#a8261b;
  --ke-derin-yesil:#17704a; --ke-derin-sari:#87570d; --ke-derin-kirmizi:#a8261b;
}
:root[data-theme="dark"]{
  color-scheme:dark;
  /* 2026-08 revizyonu #3 "Mürekkep Gecesi": #2 hâlâ vasat okundu (kullanıcı). Teşhis, siyahlık
     değil ÇAMURDU — surf #161310 doygunluğu ~%27 (kahve lekesi) + yüzey merdiveni çökmüştü
     (sidebar saf siyah, kart≈zemin, gölge siyah-üstü-siyah görünmez). Üç ilke:
     1) Zemin near-black KALIR (ölçülmüş tercih), yüzeyler nötr-sıcak ANTRASİTE çekilir
        (doygunluk ≤%19 — "mum ışığında antrasit", kahve değil).
     2) Beş basamaklı yükseklik merdiveni — ΔL* ile ölçüldü (siyah dibinde parlaklık oranı
        duyarsız): bg2 4.0 &lt; bg 5.4 &lt; surf2 7.7 &lt; surf 11.0 &lt; surf-pop 16.1.
        Ray (sidebar) zeminden koyu → içerik öne çıkar; havada duran katman en açık.
     3) Yükseklik gölgeyle değil IŞIKLA: sh-* iç üst-kenar parlaması + gerçek karartı taşır.
     64 kontrast çifti ölçüldü (scratchpad/kontrast.mjs): tüm metin ≥4.5, grafik ≥3.0. */
  --ke-t:#7491ff; --ke-v:#b98de6; --ke-r:#ff6a5a;
  --ke-bg:#0c0e14; --ke-bg2:#08090e; --ke-surf:#161924; --ke-surf2:#11131b; --ke-surf-hi:rgba(255,255,255,.07);
  --ke-line:rgba(255,255,255,.10); --ke-line-hi:rgba(255,255,255,.22);
  --ke-ink:#eef0f7; --ke-ink2:#cfd3df; --ke-mut:#9aa0b2; --ke-mut2:#b8bdcb; --ke-mut3:#8c92a5;
  --ke-hov:rgba(255,255,255,.05); --ke-press:rgba(255,255,255,.09);
  --ke-input-line:rgba(255,255,255,.34); --ke-on-accent:#0b0d16; --ke-ink-surf:#1a1e2c; --ke-scrim:rgba(0,0,0,.66);
  --ke-cam:rgba(24,27,38,.6); --ke-cam-line:rgba(255,255,255,.10);
  --ke-alfa:14%;
  --ke-surf-pop:#1f2331;
  /* Kâğıt gece de kâğıttır (tur 4 jüri A#26: girişte lacivert "kâğıt", sonuçta açık gri kâğıt —
     metafor iki ekranda iki türlüydü). Masa lambası altındaki SICAK, kısık kâğıt: saf beyaz
     koyu zeminde göz kamaştırır; #e4e1d8 parlaklığı ~%76 (beyazın ¾'ü) ve sarıya ~4° kayık. */
  --ke-kagit:#e4e1d8;
  /* Koyu modda açıklık SIRASI aynı; rampa bir tık yukarı — en koyu adım bile yeni surf'ten
     ≥3:1 ayrışır (kenarlar 8.3–12.5:1, yeniden ölçüldü). Kenarlar AÇIK uçtur — koyu zeminde
     koyu kenar görünmez. */
  --ke-iris-1:#7fcadd; --ke-iris-1b:#a5dcea; --ke-iris-1k:#a8e0ee;
  --ke-iris-2:#a68fd0; --ke-iris-2b:#b8a6e0; --ke-iris-2k:#c3b0e8;
  --ke-iris-3:#a85575; --ke-iris-3b:#d894ac; --ke-iris-3k:#e0a0b8;
  --ke-shadow-rgb:0,0,0;
  /* Işıkla yükseklik: inset üst-kenar parlaması (mum ışığı) + siyahta GERÇEKTEN görünen
     karartı. Kart en sessiz; pop/modal katmanı hem daha açık yüzey (surf-pop) hem daha
     belirgin ışık alır — merdiven iki kanaldan birden okunur. */
  --ke-sh-card:inset 0 1px 0 rgba(255,255,255,.04), 0 1px 2px rgba(0,0,0,.35);
  --ke-sh-pop:inset 0 1px 0 rgba(255,255,255,.06), 0 8px 24px -6px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35);
  --ke-sh-modal:inset 0 1px 0 rgba(255,255,255,.07), 0 24px 60px -16px rgba(0,0,0,.65), 0 4px 12px rgba(0,0,0,.4);
  --ke-sh-kagit:inset 0 1px 0 rgba(255,255,255,.07), 0 12px 28px -8px rgba(0,0,0,.6), 0 1px 2px rgba(0,0,0,.35);
  --ke-bant-yesil:#45c08a; --ke-bant-sari:#e2a940; --ke-bant-kirmizi:#ff6a5a;
  --ke-derin-t:#a3b5ff; --ke-derin-th:#b8c6ff; --ke-derin-v:#d3b4f2; --ke-derin-r:#ff9d8f;
  --ke-derin-yesil:#7ad9ae; --ke-derin-sari:#f0c168; --ke-derin-kirmizi:#ff9d8f;
}
/* RAY KAPSAMI (Antet & Damga, 2026-10) — kenar çubuğu "dosya cildi": iki temada da koyu
   lacivert bez. Token'lar alt ağaçta YENİDEN tanımlanır → ray içindeki her atom (hesap
   menüsü tetikleyicisi, yükle düğmesi, rozetler) kodu değişmeden koyu yüzeye uyar.
   --ke-sayfa*: :root'ta HESAPLANIP miras alınır (var() tanım yerinde çözülür) → ray içinden
   sayfanın kendi zemini/mürekkebi okunabilir: aktif sekme sayfaya "bağlanan" dosya sırtıdır. */
:root{ --ke-sayfa:var(--ke-bg); --ke-sayfa-ink:var(--ke-ink); --ke-sayfa-t:var(--ke-derin-t); --ke-sayfa-mut:var(--ke-mut2); }
[data-ray]{
  color-scheme:dark;
  --ke-bg:#141a31; --ke-bg2:#141a31; --ke-surf:#1c2340; --ke-surf2:#182039; --ke-surf-hi:rgba(255,255,255,.07);
  --ke-line:rgba(255,255,255,.10); --ke-line-hi:rgba(255,255,255,.20);
  --ke-ink:#f1f3fa; --ke-ink2:#d6dae8; --ke-mut:#9ea6c4; --ke-mut2:#b9c0da; --ke-mut3:#8890b0;
  --ke-hov:rgba(255,255,255,.06); --ke-press:rgba(255,255,255,.10); --ke-input-line:rgba(255,255,255,.26);
  --ke-t:#8aa2ff; --ke-derin-t:#aebdff; --ke-derin-th:#c3ceff; --ke-on-accent:#0d1124;
  --ke-derin-sari:#f0c168; --ke-alfa:14%;
  /* ACELE kırmızısı cilt üstünde (tur 6): gecikmiş sayısı rozeti rayda/alt şeritte okunmalı —
     açık temanın #a8261b'i lacivert bezde ~2:1 kalıyordu. */
  --ke-derin-kirmizi:#ff9d8f; --ke-derin-r:#ff9d8f;
}
/* Koyu temada ray ≈ sayfa zemini (ölçüldü: 1,04:1) → dosya sırtı ve ray kenarı kayboluyordu.
   Lacivert hue + cilt bezi dokusu + sağ kenar dikiş çizgisi (--ke-ray-kenar) üç ayrı sinyal;
   açıklık farkına yaslanmaz (siyah dibinde açıklık farkı göze yetmez). */
/* Tur 4 (jüri A#7): #080a15 ray ile #0c0e14 sayfa arasında parlaklık oranı 1,02'ydi — "dosya
   sırtı" koyu temada YOKTU, yerini 2 px sol çizgi almıştı. Çözüm açıklık değil RENK basamağı:
   ray gerçek bir GECE LACİVERDİ (cilt bezi), sayfa nötr mavi-siyah kalır. Sırt sayfa zeminini
   (--ke-sayfa) taşıdığından lacivert cildin içine giren KOYU bir dil olarak okunur — açık
   temadaki "açık dil koyu cilde girer" ilişkisinin tersi, aynı geometri. Ölçüm: ray/sayfa
   parlaklık oranı 1,02 → 1,16; ray içi metinler yeniden ölçüldü (kontrast.mjs, hepsi ≥4,5). */
:root[data-theme="dark"] [data-ray]{ --ke-bg:#121b3d; --ke-bg2:#121b3d; --ke-surf:#1b2652; --ke-surf2:#162047; --ke-surf-hi:rgba(255,255,255,.08); --ke-line:rgba(255,255,255,.12); --ke-ray-kenar:rgba(255,255,255,.10); --ke-kulak-kenar:rgba(255,255,255,.18); }
/* Cilt bezi: çok ince atkı/çözgü örgüsü — rayın "lacivert bez kapak" malzemesi. Statik,
   tek katman, metnin altında (ray zemininin background-image'ı). */
[data-ray]{ --ke-ray-doku:repeating-linear-gradient(0deg, rgba(255,255,255,.022) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(255,255,255,.016) 0 1px, transparent 1px 3px); }
/* KÂĞIT KAPSAMI (tur 4) — [data-evrak-kagit] taşıyan alt ağaç koyu temada AÇIK kâğıt
   token'larına döner (ray kapsamının tersi): kâğıdın üstündeki her atom (Damga, havale fişi,
   mono künye) kodu değişmeden "kâğıt üstünde" renk alır. Açık temada kapsam etkisizdir. */
:root[data-theme="dark"] [data-evrak-kagit]{
  color-scheme:light;
  --ke-surf:var(--ke-kagit); --ke-surf2:#dad6cb; --ke-surf-pop:#ece9e1; --ke-surf-hi:rgba(20,22,32,.05);
  --ke-line:rgba(20,22,32,.13); --ke-line-hi:rgba(20,22,32,.26); --ke-hov:rgba(20,22,32,.05); --ke-press:rgba(20,22,32,.09);
  --ke-ink:#13151d; --ke-ink2:#2a2d38; --ke-mut:#4f5462; --ke-mut2:#40444f; --ke-mut3:#515664;
  --ke-t:#2b4fd6; --ke-v:#6b3ea6; --ke-r:#d93a2b; --ke-on-accent:#ffffff; --ke-alfa:9%;
  --ke-derin-t:#1f3fb4; --ke-derin-th:#18329a; --ke-derin-v:#56308a; --ke-derin-r:#a8261b;
  --ke-derin-yesil:#125f3d; --ke-derin-sari:#7a4e0b; --ke-derin-kirmizi:#a8261b;
}
/* Seçim vurgusu yalnız koyu modda tanımlanır (açık mod bit-aynı kalsın): tarayıcı
   varsayılan mavisi mürekkep paletinde yabancı duruyordu — marka gök mavisi tintine çekilir. */
:root[data-theme="dark"] ::selection{ background:color-mix(in srgb, var(--ke-t) 32%, transparent); }
/* ——— Masa (Antet & Damga, 2026-10) ——————————————————————————————————————
   Zemin "arşiv kâğıdı": body'nin ARKASINDA çok hafif lif/gren dokusu (SVG gürültü, sabit).
   z-index:-1 → beyaz evrak yüzeyleri onu örter; doku yalnız masada görünür. Metnin üstüne
   hiç binmez. Koyu temada "screen" ile açık lif — gece mesaisi masası. */
html{background:var(--ke-bg)}
body{position:relative}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.55;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .08  0 0 0 0 .09  0 0 0 0 .16  0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");}
:root[data-theme="dark"] body::before{opacity:.5;filter:invert(1)}
::selection{background:color-mix(in srgb, var(--ke-t) 22%, transparent)}
/* İnce kaydırma çubuğu — mürekkep tonunda, zemin şeffaf. */
*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb, var(--ke-ink) 22%, transparent) transparent}

`;
