# UI Tasarım Yönü — kamu-evrak

> **Amaç:** Demo (15p) puanını maksimize eden, jüriyi ilk 10 saniyede etkileyen, "düşünen
> sistem" hissini canlı veren bir arayüz yönü + somut, uygulanabilir animasyon/stil spec'i.
> Bu belge **frontend ajanının uygulayacağı** sözleşmedir.
>
> **DÜRÜSTLÜK KAYDI (2026-06 yazımı):** Buradaki her öneri **saf react/react-dom + CSS/SVG** ile,
> **sıfır ek bağımlılıkla** uygulanabilir (o zamanki `frontend/` kuralı). Hiçbir öneri
> canvas/WebGL/GSAP/framer-motion gerektirmez. Abartı yok: her teknik bilinen, test-edilebilir
> CSS/SVG kalıbıdır.
>
> **DÜZELTME (2026-07-20):** Bu belgedeki Ajan Akış Şeması/kart animasyonları hâlâ saf CSS/SVG
> ile uygulı (§3.1-3.6 aynen geçerli) — ama proje politikası o tarihten sonra genişledi:
> headless/unstyled etkileşim kütüphaneleri (`motion`/framer-motion dahil) artık izinli, sidebar
> ve modal animasyonlarında kullanılıyor (bkz. `CHANGELOG.md` [2026-07-20], `MASTER.md`
> "Etkileşim kütüphanesi katmanı"). "Hiçbir öneri framer-motion gerektirmez" cümlesi artık bu
> belgenin KAPSAMI için doğru, proje geneli için değil.
>
> **RED-LINE (mimari):** Ajan Akış Şeması yalnız **ilerleme** görselleştirir; sonuç (tür/birim/
> yazı) backend'de üretilir. Animasyonlar veri uydurmaz — yalnız mevcut `status` ve `data`
> alanlarını sahneler (`AgentFlowGraph.jsx` sözleşmesi korunur).

---

## 0. Mevcut durum (envanter) — neyi koruyoruz, neyi evrimleştiriyoruz

| Varlık | Dosya | Durum |
|---|---|---|
| Tema | `styles/kamu-evrak.css` | **warm-light** — kâğıt/kurum hissi; **KORU** (evrim öner) |
| Token sistemi | `:root` (kamu-evrak.css) | yüzey/ink/aksan + g1/g2 görev renkleri; AA kontrast doğrulanmış — **KORU**, ÜZERİNE EKLE |
| Ajan Akış Şeması | `agent-flow/AgentFlowGraph.jsx` + `topology.js` | SVG, 10 node, akan kenar (`agw-flow`), pulse (`agw-pulse`); **iskelet hazır — sahnele** |
| Sonuç kartları | `result-cards.jsx` | 9 kart, dikey akış (`rc-grid` flex-column); **bento'ya evrimleştir + stagger** |
| Erişilebilirlik | tüm bileşenler | skip-link, landmark, `role`/`aria-live`, `prefers-reduced-motion` blok — **ALTIN STANDART, BOZMA** |

**Sonuç:** Sıfırdan tasarım değil — **mevcut iskelet zaten doğru**. Görev: var olan sahneyi
"canlı/akan" hâle getirmek + görsel hiyerarşi ve derinlik eklemek. Risk düşük, etki yüksek.

---

## 1. Stil yönü

### 1.1 Karar: "Resmî Kâğıt + Canlı Akıl" (warm-light KORUNUR, kasıtlı evrim)

Kamu/resmî bağlam **güven** ister; warm-light tema (kâğıt-bej yüzey, koyu mürekkep, altın/devlet
aksanı) zaten bu hissi taşıyor — "ciddi kamu ürünü" sinyali. Karanlık tema
veya neon agent-graph estetiği (LangFlow/Flowise tarzı koyu canvas) **reddedilir**: bu, "tüketici
hackathon demosu" hissi verir, kamu evrak bağlamına yanlış oturur ve ECC anti-template kuralına
takılır (default dark-mode otomatizmi).

**Kasıtlı evrim (warm-light üzerine, tema değiştirmeden):**
1. **Derinlik katmanı:** Düz kartlar → hafif yükseltilmiş yüzeyler (layered surface + yumuşak
   gölge). Bento ızgarası ile boyut kontrastı (büyük "Bilgilendirme" + "Akış Şeması" kartları,
   küçük metrik kartları). 2026 trendi "3D Bento" — kamu dashboard'una iyi oturur (bkz. kaynaklar).
2. **Editöryel tipografi:** Sonuç başlıkları (evrak türü, hedef birim) için ölçek kontrastı
   artırılır → tarama kolaylığı + "ürün ekran görüntüsü gibi görünür" testi.
3. **Akıl (intelligence) sinyali:** Ajan Akış Şeması sahnenin **kahramanı** olur — canlı akan
   kenarlar + sıralı node yanması + aktif-node vurgu = "düşünen sistem". Bu, real-time
   üretim avantajını (şartname §8 Demo) görsel olarak ispatlar.

### 1.2 Stil referansları (linkli)

- **Bento + derinlik:** [Bento Grid Design 2026 (Senorit)](https://senorit.de/en/blog/bento-grid-design-trend-2025) ve [Galaxy UX — Bento Grids](https://www.galaxyux.studio/blog/bento-grids-the-new-standard-for-modular-ui-design/) — asimetrik modüler bloklar, veri-yoğun dashboard'a oturur; "ekranı akış değil parça olarak okuruz".
- **Canlı ajan reasoning görseli:** [agent-flow (GitHub, patoles)](https://github.com/patoles/agent-flow) — Claude Code ajan orkestrasyonunu canlı node-graph olarak gösterir (tool-call/branch/return akışı). Bizim hedef estetiğin referansı (ama biz daha sade/resmî yaparız).
- **"Thinking" stream deseni:** [shadcn AI Reasoning](https://www.shadcn.io/ai/reasoning) — düşünme başlayınca aç, **shimmer** akarken göster, süreyi say ("X sn düşündü"), bitince otomatik daralt. Özet/taslak token-token yazımı için doğrudan kalıp.
- **SVG akan çizgi tekniği:** [CSS-Tricks — How SVG Line Animation Works](https://css-tricks.com/svg-line-animation-works/) — `stroke-dasharray` + `stroke-dashoffset` ile akan kenar (zaten `agw-flow`'da kullanıyoruz; bu kaynak doğrular/genişletir).
- **Erişilebilir motion:** [W3C WCAG 2.2 — SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) + [W3C C39 — prefers-reduced-motion](https://www.w3.org/WAI/WCAG21/Techniques/css/C39) — tüm hareket kapatılabilir; hareket TEK sinyal olamaz.

---

## 2. Token önerileri (mevcut `:root` üzerine ekleme — hiçbiri mevcut token'ı kırmaz)

> Tümü `kamu-evrak.css` `:root` bloğuna **eklenir**; renkler mevcut AA-doğrulanmış paletten
> türetilir. Yeni renk paleti **getirilmez** — tutarlılık korunur.

### 2.1 Motion token'ları (yeni — DRY için)

```css
:root {
  /* --- motion (yeni) --- */
  --dur-fast: 160ms;
  --dur-normal: 280ms;
  --dur-slow: 480ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);     /* "expo-out" — yumuşak yerleşme */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --stagger-step: 70ms;                            /* kart giriş gecikme adımı */

  /* --- derinlik (yeni katman — mevcut shadow-sm/md korunur) --- */
  --shadow-lg: 0 14px 40px rgba(43, 38, 32, 0.12);
  --surface-raised: #fffefb;                       /* bento "kahraman" kart için bir tık parlak */
  --glow-active: 0 0 0 3px var(--accent-soft);     /* aktif node/kart halo (focus-ring değil) */
}
```

### 2.2 Tipografi ölçeği (yeni — editöryel kontrast)

```css
:root {
  --text-hero: clamp(1.5rem, 1.2rem + 1.4vw, 2.1rem);  /* evrak türü / hedef birim adı */
  --text-h2: clamp(1.05rem, 1rem + .3vw, 1.2rem);
  --text-label: .72rem;                                 /* üst etiketler (UPPERCASE) */
  --tracking-label: .06em;
}
```

> Mevcut font stack (`-apple-system / Segoe UI`) **korunur** — sistem fontu = sıfır yükleme +
> Türkçe diakritik garantisi (ç/ş/ğ). İkinci font ailesi eklemek YAGNI; ölçek kontrastı
> tek aile ile sağlanır.

### 2.3 Motion-friendly kural

Tüm yeni animasyonlar **yalnız `transform` ve `opacity`** (compositor-friendly) üzerinde çalışır —
mevcut CSS dosyasının kuralı budur (kâğıt yorumu: `width/height/top/left` animasyonu YASAK). Tek
istisna: SVG `stroke-dashoffset` (zaten kullanılıyor, GPU-dostu, layout tetiklemez).

---

## 3. Bileşen-bileşen animasyon planı

> Sıralama = jürinin gözünün izleyeceği yol. Her madde: **ne**, **nasıl (CSS/SVG)**, **a11y**.

### 3.1 Ajan Akış Şeması — SAHNENİN KAHRAMANI (en yüksek etki)

Mevcut `AgentFlowGraph.jsx` zaten node `status` (`pending/active/done/error`) ve akan kenar
(`agw-edge-flowing`) + pulse (`agw-pulse`) içeriyor. Eklenecek **4 katman**:

**(a) Kenar akışı — "veri akıyor" hissi (mevcut `agw-flow` güçlendirilir)**
- Mevcut: `agw-edge-flowing` → `stroke-dashoffset` ile marching-ants (9 6 dash, .9s). **KORU.**
- Ekle: akan kenara **ikincil parlak akış noktası** — kenar path'i üzerinde küçük bir daire
  `<circle>` `animateMotion` veya CSS `offset-path` ile uçtan uca kayar ("paket gönderiliyor").
  Saf SVG, dep yok:

```jsx
{/* edgePath(e.from, e.to) zaten var — flowing kenarda akan nokta */}
{edgeState(...) === "flowing" && (
  <circle className="agw-spark" r="3">
    <animateMotion dur="0.9s" repeatCount="indefinite" path={edgePath(e.from, e.to)} />
  </circle>
)}
```
```css
.agw-spark { fill: var(--accent); filter: drop-shadow(0 0 3px var(--accent)); }
```

**(b) Node sıralı yanma — "sistem düşünüyor"**
- Mevcut: `done` olunca yeşil ✓, `active` olunca accent + pulse. **KORU.**
- Ekle: `pending → active` geçişinde kartın **hafif yukarı sıçraması** (translateY) + scale:

```css
.agw-node { transition: transform var(--dur-fast) var(--ease-out); }
.agw-node-active { /* SVG <g> transform zaten translate ile konumda; transform-box ile scale */ }
.agw-node-active .agw-card {
  filter: drop-shadow(0 4px 10px rgba(138, 94, 18, .25));  /* aktif derinlik */
}
@keyframes agw-pop {
  0% { transform: scale(.94); opacity: .7; }
  60% { transform: scale(1.04); }
  100% { transform: scale(1); opacity: 1; }
}
.agw-node-done .agw-card { animation: agw-pop var(--dur-normal) var(--ease-out); }
```

**(c) Done check-mark "stamp" — onay damgası**
- `done` olunca ✓ işareti küçükten büyüğe "damgalanır" (resmî evrak onayı metaforu):

```css
.agw-node-done .agw-dot {
  animation: agw-stamp var(--dur-normal) var(--ease-out);
  transform-box: fill-box; transform-origin: center;
}
@keyframes agw-stamp { 0% { transform: scale(0); opacity: 0; } 70% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } }
```

**(d) Paralel kol vurgusu — mevzuat ∥ özet (teknik derinlik sinyali)**
- `eksik_tespit` done olunca iki kol (`mevzuat_oner`, `ozetle`) **aynı anda** active olur (kod
  zaten yapıyor — `handleEvent`). Görsel olarak iki kenar **eşzamanlı** akar → jüriye
  "paralel fan-out" anlatımı. Sunum noktası: "Bu iki ajan aynı anda koşuyor."
- Ekle: paralel-aktif iki node'a kısa süreli ortak **bağ-vurgusu** (her ikisi de pulse) — kod
  zaten `active` veriyor; CSS değişikliği gerekmez, yalnız sunucu/animasyon zamanlamasında
  `STEP_MS` ile iki kol ardışık değil eşzamanlı tetiklenmeli (JSON yolunda `animateNodes`'ta
  aynı `col`'daki node'lara aynı gecikme verilebilir — opsiyonel iyileştirme).

> **a11y (3.1 tümü):** `figcaption role="status" aria-live` mevcut TR özet cümlesini koruyacak
> (`buildFigcaption`). `prefers-reduced-motion`: spark dairesi **gizlenir** (`display:none`),
> pop/stamp/flow kapanır → mevcut blok genişletilir (bkz. §5). Renk TEK sinyal değil: ✓/●/✕
> işaret + görev etiketi + figcaption metni kalır.

### 3.2 Token-token yazım (typewriter) — Özet + Bilgilendirme + Taslak önizleme

**En güçlü "düşünen sistem" wow'u.** Backend SSE'de özet/taslak metni **chunk** olarak gelebilir
(`/process_doc/stream`); gelmiyorsa client-side daktilo efekti uygulanır (deterministik, dep'siz).

**Yaklaşım A — gerçek stream (tercih, SSE varsa):** `node` event'inde gelen `data.ozet` /
`data.yazi_taslak_md` parçaları geldikçe `setState` ile eklenir → doğal token akışı. Ek kod yok,
sadece event'i parça-parça yansıt.

**Yaklaşım B — client daktilo (JSON yolu / SSE tek-parça ise):** Saf React hook, sıfır dep:

```jsx
// useTypewriter.js — sıfır dep, prefers-reduced-motion duyarlı
function useTypewriter(fullText, { cps = 90, enabled = true } = {}) {
  const [shown, setShown] = useState(enabled ? "" : fullText);
  useEffect(() => {
    if (!enabled || !fullText) { setShown(fullText || ""); return; }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(fullText); return; }     // a11y: hareket yok → tam metin anında
    let i = 0;
    const step = Math.max(1, Math.round(fullText.length / (fullText.length / cps * 60)));
    const id = setInterval(() => {
      i = Math.min(fullText.length, i + 2);          // 2 char/tick ~ akıcı, 60fps altı yük
      setShown(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(id);
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [fullText, cps, enabled]);
  return shown;
}
```
- **Caret (imleç):** son karakterden sonra yanıp sönen blok — saf CSS:
```css
.tw-caret::after { content: "▌"; animation: tw-blink 1s steps(1) infinite; color: var(--accent); }
@keyframes tw-blink { 50% { opacity: 0; } }
```
- **a11y:** Daktilo aktifken kapsayıcıya `aria-live="off"` ver, **tam metin bitince** `aria-live`
  bölgesinde tek seferde duyur (her karakteri okutma). `prefers-reduced-motion` → anında tam metin
  (hook içinde halledilir).

> **Nereye:** `ozet` (BilgilendirmeCard / yeni Özet kartı), `yazi_taslak_md` (YaziTaslakCard
> `<pre>`), `bilgilendirme`. Taslak `<pre>` için daktilo "resmî yazı yazılıyor" hissi verir → en
> güçlü Görev-2 demosu.

### 3.3 Sonuç kartları giriş animasyonu (stagger) — "sonuç akıyor"

Mevcut `rc-grid` (flex-column) → kartlar **sırayla** belirir (akış şeması bitince sonuç akar):

```css
.rc-card {
  /* giriş: aşağıdan yukarı + fade */
  animation: rc-enter var(--dur-slow) var(--ease-out) both;
}
@keyframes rc-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

/* stagger: nth-child ile gecikme (saf CSS, JS gerekmez) */
.rc-grid > * { animation-delay: calc(var(--i, 0) * var(--stagger-step)); }
```
```jsx
// React tarafı: her karta --i index ver (inline style)
{cards.map((c, i) => <div style={{ "--i": i }}>{c}</div>)}
```
- **Hover/focus derinliği:** kart üstüne gelince hafif yükselme + gölge artışı:
```css
.rc-card { transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast); }
.rc-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
```
- **a11y:** `ke-result-wrap` zaten `aria-live="polite"` + `aria-busy` → ekran okuyucu sonucu
  duyurur. Stagger yalnız görsel; `prefers-reduced-motion`'da kapanır (kart anında, opaklık 1).

### 3.4 Güven ölçeri (meter) doluş — Evrak Türü kartı

Mevcut `rc-meter-fill` `width` transition (.5s) içeriyor. **Sorun:** `width` animasyonu
layout-bound (motion kuralına aykırı). **Düzeltme önerisi:** `transform: scaleX()` ile değiştir:

```css
.rc-meter { /* sabit genişlik kapsayıcı */ }
.rc-meter-fill { transform-origin: left; transform: scaleX(var(--p)); transition: transform var(--dur-slow) var(--ease-out); }
/* JS: style={{ "--p": pct/100 }} */
```
- Doluş animasyonu, kart girişinden ~150ms sonra başlar → "ölçüluyor" hissi.
- **a11y:** `role="meter"` + `aria-valuenow` mevcut — KORU. Reduced-motion'da anında dolu.

### 3.5 Durum geçişleri (state transitions)

| Geçiş | Görsel | CSS |
|---|---|---|
| Boş → işliyor | placeholder fade-out + skeleton fade-in (cross-fade) | `opacity` transition, mevcut skeleton KORU |
| İşliyor → sonuç | skeleton fade-out → kartlar stagger-in (§3.3) | sıralama: akış bitince sonuç |
| Hata | `ke-error` aşağıdan kayarak gir + sol kenar `danger` pulse (1 kez) | mevcut `role="alert"` KORU |
| Örnek seçili | `ke-sample.active` accent border + hafif scale | mevcut, KORU |

### 3.6 Derinlik / katmanlama (bento + layered surface)

**`rc-grid`'i bento ızgarasına evrimleştir** (mevcut dikey akış → kasıtlı boyut kontrastı):

```css
@media (min-width: 860px) {
  .rc-grid {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(6, 1fr);
    grid-auto-flow: dense;
  }
  .rc-info       { grid-column: span 6; }              /* Bilgilendirme — tam genişlik (kahraman) */
  .rc-tur        { grid-column: span 2; }              /* Evrak türü — kompakt metrik */
  .rc-birim      { grid-column: span 4; }              /* Hedef birim — orta */
  .rc-alanlar    { grid-column: span 3; }
  .rc-eksik      { grid-column: span 3; }
  .rc-mevzuat    { grid-column: span 3; }
  .rc-taslak     { grid-column: span 6; }              /* Yazı taslağı — tam genişlik (Görev 2 yıldızı) */
  .rc-dogrulama  { grid-column: span 3; }
  .rc-arsiv      { grid-column: span 3; }
  .rc-disclaimer { grid-column: span 6; }
}
```
- **Layered surface:** kahraman kartlar (`rc-info`, `rc-taslak`, akış şeması) `--surface-raised`
  + `--shadow-md`; metrik kartlar `--surface` + `--shadow-sm` → **derinlik hiyerarşisi**.
- **a11y:** Bento yalnız ≥860px'de; altında mevcut tek-kolon akış KORUNUR (responsive zaten var).
  Grid sırası DOM sırasını bozmaz → klavye/okuyucu mantıksal sıra korunur.

---

## 4. "Demo-wow" kontrol listesi — jüri 10 saniyede ne görmeli

> Sahneye çıkınca ilk 10 sn'de göz şu sırayı izlemeli (real-time vurgu **kalın**):

1. **0–2 sn:** Üst şerit — "kamu-evrak" + 3 güvence rozeti (2 görev tek pipeline · veri maskeli ·
   uydurmasız). Resmî/güvenilir ilk izlenim.
2. **2–4 sn:** Örnek evrağa tıklanır → **Ajan Akış Şeması canlanır**: node'lar sırayla yanar,
   **kenarlar akar** (spark noktaları uçar). "Sistem düşünüyor" anı = **en güçlü wow**.
3. **4–6 sn:** Paralel kol (mevzuat ∥ özet) **aynı anda** yanar → teknik derinlik sinyali ("iki
   ajan paralel"). İlerleme sayacı `n/10` artar.
4. **6–8 sn:** Akış biter → **sonuç kartları stagger ile akar**; Evrak Türü güven ölçeri dolar.
5. **8–10 sn:** **Resmî Yazı Taslağı token-token yazılır** (daktilo) → 🛡️ "Kişisel veri maskeli"
   rozeti + ⚖️ disclaimer görünür. "Üretti + güvenli + sorumlu."

**Real-time vurgu cümlesi (sunum):** *"Hiçbir şey önceden hazır değil — evrak şu an, canlı,
10 node'lu pipeline'dan geçiyor; her node yandıkça arkada gerçek bir LangGraph adımı koşuyor."*

**Wow envanteri (uygulama önceliğine göre):**
- [ ] **(P1)** Akış şeması spark + sıralı yanma + done-stamp (§3.1) — *en yüksek etki/çaba oranı*
- [ ] **(P1)** Taslak/özet token-token yazım (§3.2) — *"canlı üretim" ispatı*
- [ ] **(P2)** Sonuç kartları stagger giriş (§3.3) — *akış→sonuç doğal geçişi*
- [ ] **(P2)** Bento ızgarası + layered derinlik (§3.6) — *"ürün gibi görünür" testi*
- [ ] **(P3)** Güven ölçeri transform-doluş (§3.4) — *cila*

---

## 5. Erişilebilirlik kuralları (reduced-motion alternatifleri) — ZORUNLU

> Mevcut `@media (prefers-reduced-motion: reduce)` bloğu **altın standart**; yeni animasyonlar bu
> bloğa **eklenmeli**, yoksa WCAG SC 2.3.3 ihlali. Hareket TEK sinyal olamaz (SC 1.4.1).

```css
@media (prefers-reduced-motion: reduce) {
  /* mevcut blok KORUNUR + ekle: */

  /* §3.1 akış şeması yeni hareketleri kapat */
  .agw-spark { display: none; }                      /* akan nokta gizlenir */
  .agw-node-done .agw-card,
  .agw-node-done .agw-dot { animation: none; }        /* pop/stamp yok */
  /* aktif node yine kalın kenarlık + fill ile ayırt edilir (mevcut kural) */

  /* §3.2 daktilo: hook zaten tam metni anında basar (JS reduce kontrolü) */
  .tw-caret::after { animation: none; content: ""; }  /* imleç yanıp sönmez */

  /* §3.3 kart giriş + hover */
  .rc-card { animation: none; }
  .rc-card:hover { transform: none; }

  /* §3.4 meter doluş anında */
  .rc-meter-fill { transition: none; }
}
```

**Genel a11y kuralları (yeni animasyonlar için):**
1. **Hareket = TEK sinyal DEĞİL.** Her animasyonun yanında metin/işaret/durum kalır (figcaption,
   ✓/●/✕, badge, `aria-live` özet).
2. **Daktilo ekran okuyucuyu boğmaz:** yazım sırasında `aria-live="off"`; tam metin bitince tek
   seferde `role="status"` ile duyur.
3. **Flaş yok:** Hiçbir animasyon saniyede 3+ kez yanıp sönmez (SC 2.3.1). Pulse 1.5s, blink 1s —
   güvenli.
4. **Süre kısa:** Tüm giriş animasyonları ≤480ms (`--dur-slow`); döngüsel (akış/pulse) yalnız
   `active` durumda, bitince durur.
5. **Focus korunur:** Animasyon `:focus-visible` outline'ı (mevcut 3px accent) gizlemez/geciktirmez.
6. **Klavye sırası:** Bento grid `grid-auto-flow` DOM sırasını değiştirmez → sekme sırası
   mantıksal kalır (SC 2.4.3).

---

## EK: Uygulama sırası önerisi (frontend ajanı için)

1. **Token ekle** (§2) — `:root`'a motion + derinlik + tipografi token'ları (kırılma riski yok).
2. **Akış şeması canlandır** (§3.1) — spark + pop + stamp; `prefers-reduced-motion` blokunu güncelle.
3. **Daktilo hook** (§3.2) — `lib/useTypewriter.js` + taslak/özet/bilgilendirme'ye uygula.
4. **Kart stagger + hover** (§3.3) — `--i` index + `rc-enter`.
5. **Bento + derinlik** (§3.6) — `rc-grid` grid evrim (≥860px).
6. **Meter transform-fix** (§3.4) — `width`→`scaleX`.
7. Her adımdan sonra: reduced-motion testi + mevcut test suite (frontend) yeşil + 1280px demo
   çözünürlüğünde göz kontrolü.

**Test notu:** Mevcut testler `AgentFlowGraph` / `result-cards` DOM yapısını/sınıflarını
kontrol ediyor olabilir — animasyon eklerken **mevcut class/`aria` kontratını koruyun** (yeni
class ekleyin, eskiyi silmeyin) → testler kırılmaz.
