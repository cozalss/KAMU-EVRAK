# kamu-evrak — AI Asistan Bağlam Dosyası

> TEKNOFEST 2026 Yapay Zeka Dil Ajanları Yarışması, **1. Senaryo: Kamu Evrak ve Yazışma
> Süreçleri için Akıllı Agent Destek Sistemi**. Bu depo ADALET-AGENT'tan kod kopyalanarak
> kuruldu; **ADALET-AGENT ayrı bir projedir, oraya dokunulmaz.**

## Klasörler

| Klasör | Dil | Çalıştır |
|--------|-----|----------|
| `frontend/` | JS (Vite + React) | `pnpm dev` |
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

## İki Zorunlu Görev (biri eksikse sistem tamamlanmamış sayılır — şartname §9)

- **Görev 1:** oku (OCR/metin) → tür sınıflandır → bilgi unsuru çıkar → eksik tespit →
  mevzuat öner → özetle.
- **Görev 2:** resmî yazı taslağı (üst/cevabi/bilgilendirme/olur) → resmî üslup → birim
  yönlendir → kullanıcıyı bilgilendir → gerekirse eksik bilgi iste.

## Puanlama (100)

Yöntem & Teknik 35 · Uygulama 35 (sınıflandırma/yönlendirme/özet/yazı-kalitesi/eksik-tespit) ·
Demo 15 (real-time avantaj) · Yenilikçilik/Özgünlük/Ticarileşme 15.

## STUB → üretim

`agents/nodes/*.py` içinde `# TODO(kamu-evrak)` ile işaretli stub'lar deterministik çalışır
(uçtan-uca akış ayakta). Üretimde: sınıflandırma/çıkarım few-shot LLM JSON; mevzuat hybrid-RAG
(lokal seed birincil); yazı taslağı jinja2 + LLM gövde; birim yönlendirme sınıflandırıcı.
Eval: `eval/` (metrik → puanlama eşleme; bkz. `docs/06-eval-harness.md`).
