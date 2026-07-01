# kamu-evrak — AI Asistan Bağlam Dosyası

> TEKNOFEST 2026 Yapay Zeka Dil Ajanları Yarışması, **1. Senaryo: Kamu Evrak ve Yazışma
> Süreçleri için Akıllı Agent Destek Sistemi**. Bu depo ADALET-AGENT'tan kod kopyalanarak
> kuruldu; **ADALET-AGENT ayrı bir projedir, oraya dokunulmaz.**

## Klasörler

| Klasör | Dil | Çalıştır |
|--------|-----|----------|
| `frontend/` | JS (Vite + React) | `npm install` → `npm run dev` |
| `backend/` | Python 3.11 (FastAPI + LangGraph) | `uv run uvicorn main:app --reload` |
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

## Tasarım / UI — Hero Light (aktif tema)

> Tek kaynak: `frontend/src/components/neonUi.jsx`. Tam spesifikasyon:
> `frontend/design-system/kamu-evrak/MASTER.md`. Palet, landing hero görselinin (sıcak fildişi
> zemin + pudra-gül→lavanta→gök mavisi pastel gökyüzü + tek mercan kırmızısı nokta) koyulaştırılmış,
> UI'da kullanılabilir versiyonudur — **çalışma alanına (app.html) özgüdür, landing page ayrı kalır.**

- **Aktif kabuk:** `DashboardApp.jsx` → `NeonSidebar` + görünümler (`PanelView`, `GelenEvrakView`,
  `TaslaklarView`, `MevzuatView`, `DenetimView`) + canlı `CanliAjanAkisi` (demo yıldızı).
- **Renk (token):** birincil aksan gök mavisi `T=#2f8fa6`, ikincil lavanta `V=#8b5cb0`, imza mercanı
  `R=#e0563c` (yalnız küçük dokunuşlar — genel CTA rengi değil); zemin `PAL.bg=#f7f3ee` /
  `PAL.bg2=#efe6da`; metin `PAL.ink=#161616` / `ink2=#3a3229`; risk bandı `BANT` (yeşil `#2f9e6e` /
  sarı `#c98a1f` / kırmızı `#c9432f`). **Hex'i elle yazma, token kullan.**
- **Font:** Space Grotesk (`SANS`, başlık/UI) + IBM Plex Mono (`MONO`, etiket/veri) —
  `app.html` Google Fonts.
- **Stil yaklaşımı:** satır-içi stil + `neonUi` atomları (`ViewWrap`/`NeonCard`/`KV`/`Btn`/
  `EmptyState`/`Icon`). CSS sınıf sistemi yok; yalnız `@keyframes` için `NEON_KEYFRAMES`
  (isim tarihsel — animasyon mekaniği renkten bağımsız).
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

Çekirdek anlama/üretim node'ları **gerçek LLM (DeepSeek, `LLM_MODE=openai`,
`deepseek-chat`)** kullanır — **sınıflandır · bilgi çıkar · çok-konulu ayır · eksik tespit ·
özetle · yazı taslağı · birim yönlendir · bilgilendir** (8 node, belge başına ~8 çağrı).
Her node'da LLM yok/mock/hata/timeout → **deterministik fallback** (keyword/regex/şablon):
mock modda uçtan-uca akış ayakta kalır, CI testleri deterministik geçer. **Mevzuat öner =
BM25 RAG** (LLM yok, lokal seed birincil); CRAG/Self-RAG/multi_query ENV-gated (varsayılan
kapalı). Maliyet ~$0.001/belge (DeepSeek). Eval: `eval/` (mock-taban ölçer; metrik →
puanlama eşleme, bkz. `docs/06-eval-harness.md`).
