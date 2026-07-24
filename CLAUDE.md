# kamu-evrak — AI Asistan Bağlam Dosyası

> TEKNOFEST 2026 Yapay Zeka Dil Ajanları Yarışması, **1. Senaryo: Kamu Evrak ve Yazışma
> Süreçleri için Akıllı Agent Destek Sistemi**. Bu depo ADALET-AGENT'tan kod kopyalanarak
> kuruldu; **ADALET-AGENT ayrı bir projedir, oraya dokunulmaz.**

## Klasörler

| Klasör | Dil | Çalıştır |
|--------|-----|----------|
| `frontend/` | JS (Vite + React) | `npm install` → `npm run dev` |
| `backend/` | Python 3.11 (FastAPI + LangGraph) | `uv run main.py` (reload + LAN varsayılan — mobil QR sözleşmesi) |
| `backend/agents/` | Pipeline node'ları (Görev 1+2) | — |
| `backend/multimodal/` | OCR (PDF/görsel/Word) — KEEP | — |
| `backend/retrieval/` | Mevzuat RAG (KEEP, opsiyonel) | — |
| `backend/yazi/` | Resmî yazı taslak render (dilekçe'den ADAPT) | — |
| `data/` | Sentetik evrak + şablon + mevzuat | — |
| `docs/` | Araştırma + plan | — |

## Asla Yapma

1. **Hukuki/mevzuat referansı uydurma.** Madde no şüpheliyse `[DOĞRULA: ...]` bırak;
   üretimden önce mevzuat.gov.tr'de doğrula.
2. **Gerçek kamu verisi / gerçek PII (TCKN/telefon/isim) kullanma.** Şartname §6.5: yalnız
   sentetik/kurgu evrak + kamuya açık mevzuat. Sahte: `Ayşe Yılmaz`, `0555-123-4567`,
   checksum-geçerli SAHTE TCKN.
3. **Hardcoded secret.** `.env` kullan (`.gitignore`'da). Model **ağırlıklarını repoya yükleme**
   (şartname §7: link+sürüm+lisans yeterli).
4. **AGPL bağımlılık ekleme** (PyMuPDF gibi) — MIT açık-kaynak repo iddiasını bozar. PDF için
   pypdfium2 (Apache/BSD).

## Her Zaman Yap

1. Dosya < 800 satır, fonksiyon < 50 satır.
2. Yeni özellik için test (TDD); deterministik metrikler CI'da.
3. Türkçe karakterler içerikte tam (ç, ş, ğ, İ); değişken isimleri Latin (`evrak_turu`).
4. Yeni node eklerken `agents/graph.py` topolojisine + frontend `agent-flow/topology.js`'e ekle.
5. Çıkarılan PII'yi **maskele** (kullanıcı koruması + jüri "wow").
6. **UI = Hero Light tema.** Renk/font/animasyon `frontend/src/components/neonUi.jsx`
   token'larından (`T`/`V`/`R`/`PAL`/`BANT`) gelir — elle hex yazma. Palet landing hero'sundan
   (`frontend/public/portfolio/hero.webp`) türetilir; **landing sayfasına (`index.html` +
   `src/portfolio/**`) dokunulmaz.** Detay: aşağıdaki Tasarım/UI bölümü +
   `frontend/design-system/kamu-evrak/MASTER.md`.

## Tasarım / UI — Hero Light v2 "Sakin Ürün" (aktif tema)

> Tek kaynak: `frontend/src/components/neonUi.jsx`. Tam spesifikasyon:
> `frontend/design-system/kamu-evrak/MASTER.md`. Palet, landing hero görselinin (sıcak fildişi
> zemin + pudra-gül→lavanta→gök mavisi pastel gökyüzü + tek mercan kırmızısı nokta) koyulaştırılmış,
> UI'da kullanılabilir versiyonudur — **çalışma alanına (app.html) özgüdür, landing page ayrı kalır.**

- **Aktif kabuk:** `DashboardApp.jsx` → `NeonSidebar` + görünümler (`PanelView`, `GelenEvrakView`,
  `TaslaklarView`, `MevzuatView`, `DenetimView`) + canlı `CanliAjanAkisi` (demo yıldızı).
- **Renk (token):** birincil aksan gök mavisi `T=#2f8fa6`, ikincil mühür moru `V=#8e3d66`, imza mercanı
  `R=#e0563c` (yalnız küçük dokunuşlar — genel CTA rengi değil); zemin `PAL.bg=#f7f3ee` /
  `PAL.bg2=#efe6da`; metin `PAL.ink=#161616` / `ink2=#3a3229`; risk bandı `BANT` (yeşil `#2f9e6e` /
  sarı `#c98a1f` / kırmızı `#c9432f`). **Hex'i elle yazma, token kullan.**
- **Font:** IBM Plex Sans (`SANS`, tüm UI/metin) + IBM Plex Mono (`MONO`, **yalnız makine
  verisi**: evrak no, tarih damgası, hash, maskeli PII, dosya adı) + Bricolage Grotesque
  (`DISPLAY`, **yalnız display katmanı**: `TYPE.h1` görünüm başlıkları + `TYPE.disp` hüküm
  liderleri — gövdeye/UI'a yayılmaz) — `app.html` Google Fonts.
- **v2 disiplini:** tip ölçeği `TYPE` (12/13/14/16/20/24/28 + `disp` 36 yalnız hüküm kartı liderleri) · radius `RAD` (4/6/8/12/"50%") ·
  boşluk `SP` · gölge `SH` (border-first: statik yüzey 1px hairline) · açık zeminde renkli metin
  yalnız `DERIN.*` (AA) · tint zemin yalnız `ALFA()`. **Gradyan/glow/uppercase-eyebrow/hover-kalkış
  sıfır** — sentence case varsayılan; çip yalnız semantik durum; ekran başına 1 primary buton.
- **Hareket zanaatı (emil-design-eng, 2026-07-13):** güçlü easing token'ları `EASE.out/inOut`
  (yerleşik `ease-*` zayıf) + **press feedback**: tıklanabilir öğe `:active`'te `scale(0.97)`
  (`data-press=""` opt-in; kural `NEON_KEYFRAMES`'te). Hover transform hâlâ yasak — press serbest
  (hareket=bilgi). Detay: `design-system/kamu-evrak/MASTER.md` Motion bölümü. Skill'ler
  `~/.claude/skills/`'te kurulu (emil-design-eng · apple-design · review/improve-animations).
- **Stil yaklaşımı:** satır-içi stil + `neonUi` atomları (`ViewWrap`/`NeonCard`/`KV`/`Btn`/
  `EmptyState`/`Icon`). CSS sınıf sistemi yok; yalnız `@keyframes` için `NEON_KEYFRAMES`
  (isim tarihsel — animasyon mekaniği renkten bağımsız).
- **Headless kütüphane katmanı (2026-07-20):** `motion`/Radix (`Dialog`/`DropdownMenu`/
  `Tooltip`)/`vaul`/`embla-carousel-react`/`lucide-react` — hepsi görünümsüz, `neonUi.jsx`
  token'larıyla boyanır. **Stilli** kütüphane (kendi CSS/tema getiren) hâlâ yasak. Tam liste +
  gerekçe: `frontend/design-system/kamu-evrak/MASTER.md`.
- **Adlandırma:** kabuk/parça `Neon*` (isim tarihsel, görünüm artık açık/kağıt), bölümler `*View`,
  canlı akış `CanliAjanAkisi`.
- **a11y:** her tıklanabilirde `focusRing` + `cursor:pointer`; renk tek sinyal değil (ikon+metin+etiket);
  `prefers-reduced-motion` desteklenir; açık zeminde AA kontrast.
- **Legacy (yedek, unmounted):** açık "Kurumsal Devlet" teması (`App.jsx` + `styles/kamu-evrak.css`,
  Lexend) `main.jsx`'te render edilmiyor; CSS dosyası reset + `rc-*`/`agw-*` yardımcıları için
  yüklenir, `:root` token'ları Hero Light ile hizalı. **Genişletme;** yeni iş `neonUi.jsx`'ten kurulur.

## İki Zorunlu Görev (biri eksikse sistem tamamlanmamış sayılır — şartname §9)

- **Görev 1:** oku (OCR/metin) → tür sınıflandır → bilgi unsuru çıkar → eksik tespit →
  mevzuat öner → özetle.
- **Görev 2:** resmî yazı taslağı (üst/cevabi/bilgilendirme/olur) → resmî üslup → birim
  yönlendir → kullanıcıyı bilgilendir → gerekirse eksik bilgi iste.

## Puanlama (100)

Yöntem & Teknik 35 · Uygulama 35 (sınıflandırma/yönlendirme/özet/yazı-kalitesi/eksik-tespit) ·
Demo 15 (real-time avantaj) · Yenilikçilik/Özgünlük/Ticarileşme 15.

## LLM entegrasyonu + fallback

> **MODEL ADI UYARISI (2026-07-24):** DeepSeek eski adları KALDIRDI — `deepseek-chat` ve
> `deepseek-reasoner` artık HTTP 400 döndürüyor. Geçerli adlar: **`deepseek-v4-flash`**
> (varsayılan) ve **`deepseek-v4-pro`**. İkisi de REASONING modeli: düşünme token'ları
> `max_tokens`'tan düşer, bu yüzden node bütçelerine `LLM_DUSUNME_MARJI` (varsayılan 700)
> `_llm_extract._chat_dene`'de EKLENİR. Marj olmadan dar bütçeli node'lar BOŞ cevap alıp
> sessizce deterministik yedeğe düşer (ölçüldü: 28 çağrının 13'ü boş → marj sonrası 0).

Çekirdek anlama/üretim node'ları **gerçek LLM (DeepSeek, `LLM_MODE=openai`,
`deepseek-v4-flash`)** kullanır — **sınıflandır · bilgi çıkar · çok-konulu ayır · eksik tespit ·
özetle · yazı taslağı · birim yönlendir · bilgilendir** (8 çekirdek node). 2026-07
güçlendirme dalgası (14 madde, hepsi ENV-gated + deterministik fallback'li): OCR imla
düzeltme (`OCR_LLM_DUZELT`, WER %51→%29) · sınıflandırmada güçlü-model (`deepseek-v4-pro`)
eskalasyonu (`SINIFLANDIR_ESKALASYON`) · risk bandı doğal dil açıklaması · llm_json
parse-retry + LRU cache · 2646 lint auto-fix önerisi (`LINT_AUTOFIX`) · iddia-düzeyi
grounding (`VERIFY_GROUNDING_LLM`, yalnız bandı sertleştirir) · DeepSeek listwise rerank
(`RERANK_PROVIDER=deepseek`, Recall@1 0.65→1.00) · CRAG LLM grader+rewrite · decompose
kapalı-küme tür/birim · SDP kapalı-küme seçici · NLI `NLI_PROVIDER=deepseek` ·
eval LLM-judge (özet+üslup, default kapalı) · sohbet araç döngüsü (`SOHBET_ARAC_DONGUSU`,
maks 3 tur + geçmiş) · anlama fan-out (`PARALEL_ANLAMA`, sınıflandır ∥ çıkar).
Her LLM noktasında yok/mock/hata/timeout → **deterministik fallback**: mock modda uçtan-uca
akış ayakta kalır, CI deterministik geçer. **Mevzuat öner = BM25 RAG birincil** (LLM yalnız
rerank/doğrulama katmanı); risk bandı KARARI daima deterministik (LLM yalnız sunar/sertleştirir).
Risk **skoru** sabit değil **ölçülmüştür**: `ağırlık = ciddiyet × isabet`, belge skoru noisy-OR
(`agents/risk_agirlik.py`); isabet `eval/risk_calibration.py`'de bağımsız oracle'la sayılıp Wilson
alt sınırı olarak yazılır. Gözlem sinyalleri (checksum/lint/`[DOĞRULA]`) ölçülmez → isabet 1.0.
Skor bir olasılık DEĞİL, beklenen zarardır; kalibre edilen ayrı büyüklük `kusur_olasiligi`'dır.
Maliyet ~$0.001-0.002/belge. Eval: `eval/` (bkz. `docs/06-eval-harness.md`).
