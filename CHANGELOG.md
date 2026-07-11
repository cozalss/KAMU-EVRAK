# Değişiklik Günlüğü

Biçim [Keep a Changelog](https://keepachangelog.com/tr/) esinlidir; tarihler dalga (wave)
bazında gruplanır — her satır repodaki gerçek commit'lere dayanır (`git log` ile izlenebilir).
Sürüm numarası yerine yarışma takvimi milatları kullanılır (TEKNOFEST 2026, 1. Senaryo).

## [2026-07-10 → 11] — Açıklanabilirlik dalgası

### Eklendi
- **Bürokrasi Kurulu**: hukuk/üslup/vatandaş/birim-amiri perspektifli ajanların taslağı
  gerçek çok-turlu DEBATE ile tartıştığı revizyon motoru; öneriler çapalı-düzenleme
  (anchored-edit) olarak deterministik uygulanır, turlar SSE ile canlı açılır
  (`agents/kurul.py`).
- **Ölçülmüş risk skoru**: sabit katsayı yerine `ağırlık = ciddiyet × isabet` — isabet
  bağımsız oracle'la sayılıp Wilson alt sınırı olarak yazılır; belge skoru noisy-OR
  (`agents/risk_agirlik.py`, `eval/risk_calibration.py`).
- **Yönetmelik-2646 denetimi büyütüldü**: 13 kural; her bulgu yönetmelik maddesinin
  mevzuat.gov.tr PDF'inden doğrulanmış **gerçek lafzını** + somut düzeltme önerisini taşır;
  çıkarımsal sinyal asla yanlış-pozitif SARI bant üretmez (`agents/yazi_lint.py`).
- **Yapısal vatandaş bilgilendirmesi** (GOV.UK 3'lü desen): iskelet deterministik, LLM yalnız
  "ne oldu" paragrafını yazar ve uydurma-guard'dan geçer; 4982 itiraz yolu + 3071 gerekçe
  hakkı notları otomatik (`nodes/finalize.py`).
- Mevzuat önerisine tıklayınca sayfa değiştirmeden okuma modalı.

### Düzeltildi
- Canlı koşumda risk bandı tutarsızlığı (adım çipi SARI iken sağ panel YEŞİL kalabiliyordu).
- Bölümler rayının son bölüme geçmeyen scroll-spy hatası.
- Lint kartı başlığındaki "lint" jargonu → "Yazışma kuralları denetimi (Yön. 2646)".

## [2026-07-09] — Güvenlik + operasyon dalgası

### Eklendi
- AI-destekli taslak revizyonu + kanıt-alıntılı eksik-bilgi tespiti; dinamik yazı planı
  (tür + muhatap LLM ile duruma göre, kapalı-küme).
- Tatil-duyarlı yasal süre: iş günü sayımı + son-gün kaydırma + birim-bazlı gecikme paneli.
- İçerikten türetilen hizmet müdürlüğü önerisi (additive routing katmanı).

### Düzeltildi
- 15 güvenlik denetimi bulgusu (IDOR, persist, CORS, idempotency).
- Üretimde hiç çalışmayan rerank (event-loop hatası) + UI'a yansımayan CRAG.
- Sunum dokümanları kanonik DeepSeek skorlarına hizalandı (drift kapatıldı).

## [2026-07-04 → 08] — Dürüstlük + demo dalgası

### Eklendi
- Dairesel-olmayan held-out ölçümü (n=108, 2 bağımsız set): macro-F1 ~0.89, yönlendirme
  Top-1 0.907 (`eval/runs/heldout_deepseek_set{1,2}_n54_fixed.json`).
- Mobil QR ile telefondan evrak yükleme + erişim tanısı; canlı 16-ajan AuthPage sahnesi.
- Ajan izi adımlarına "neden bu karar" detay modalları.

### Değişti
- route_birim düzeltmesi: held-out Top-1 0.537/0.593 → **0.907** (düzeltme-öncesi artefaktlar
  tarihsel kayıt olarak saklanır, silinmez).

## [2026-07-02 → 03] — Rubrik yükseltme paketi

### Eklendi
- SDP otomatik dosya kodu atama (Standart Dosya Planı 2005/7), EYP 2.0 paket çıktısı,
  GraphRAG-lite atıf genişletme, KVKK_MODU (on-prem), VITRIN_MODU (HITL + clarifier + CRAG +
  hız profili tek anahtar), OCR CER/WER eval, KamuEvrak-Bench (`bench/`).

## [2026-06-25 → 07-01] — Çekirdek pipeline

### Eklendi
- LangGraph çok-ajanlı boru hattı (Görev 1: oku → sınıflandır → çıkar → eksik → mevzuat →
  özet; Görev 2: taslak → doğrula → risk → HITL → yönlendir → bilgilendir).
- Her LLM katmanına deterministik fallback (mock modda uçtan uca akış + deterministik CI).
- BM25 mevzuat RAG (233 mevzuat), PII maskeleme, SHA-256 denetim izi, sohbet asistanı.
