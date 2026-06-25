# data/mevzuat — Kamuya açık mevzuat korpusu (seed kaynağı)

Bu klasöre **kamuya açık** mevzuat metinleri konur ve `scripts/seed_mevzuat.py` (TODO) ile
chunk'lanıp Qdrant'a yüklenir (`mevzuat_oner` node'unun hybrid-RAG kaynağı). **Gerçek kamu
evrakı / PII içermez** (şartname §6.5).

## Korpus metinleri (mevzuat.gov.tr — kamuya açık, izinli)

Aşağıdaki `*.txt` dosyaları korpusa dahildir (madde-başlıklı özet/alıntı; lafzî tam
metin değil). Madde no'ları kamuya açık kaynaklardan çapraz doğrulanmıştır
(CLAUDE.md §1); doğrulanamayan hükümler `[DOĞRULA:]` işaretini taşır.

| Mevzuat | No | Dosya | Kaynak |
|---|---|---|---|
| Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik | CB 2646 / 2020 | `2646_resmi_yazisma_yonetmeligi.txt` | https://mevzuat.gov.tr/MevzuatMetin/21.5.2646.pdf |
| Dilekçe Hakkının Kullanılmasına Dair Kanun | 3071 | `3071_dilekce_hakki_kanunu.txt` | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.3071.pdf |
| Bilgi Edinme Hakkı Kanunu | 4982 | `4982_bilgi_edinme_kanunu.txt` | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4982&MevzuatTur=1&MevzuatTertip=5 |
| Tebligat Kanunu | 7201 | `7201_tebligat_kanunu.txt` | https://mevzuat.gov.tr/mevzuatmetin/1.3.7201.pdf |
| Standart Dosya Planı Genelgesi | 2005/7 | `2005-7_standart_dosya_plani.txt` | https://www.resmigazete.gov.tr/eskiler/2005/03/20050325-10.htm |
| Devlet Memurları Kanunu (personel/özlük) | 657 | `657_devlet_memurlari_kanunu.txt` | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=657&MevzuatTur=1&MevzuatTertip=5 |
| Kamu İhale Kanunu (ihale/şikâyet) | 4734 | `4734_kamu_ihale_kanunu.txt` | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4734&MevzuatTur=1&MevzuatTertip=5 |
| İdari Yargılama Usulü Kanunu (itiraz/süre) | 2577 | `2577_idari_yargilama_usulu_kanunu.txt` | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2577&MevzuatTur=1&MevzuatTertip=5 |
| Kamu Malî Yönetimi ve Kontrol Kanunu (mali/ödeme) | 5018 | `5018_kamu_mali_yonetimi_kanunu.txt` | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5018&MevzuatTur=1&MevzuatTertip=5 |
| Gizlilik Dereceli Belgeler Yönetmeliği (planlı) | 5529 | — | https://www.mevzuat.gov.tr/MevzuatMetin/21.5.5529.pdf |

## Format

Her mevzuat `<no>_<kisa_ad>.txt` olarak kaydedilir (UTF-8, madde başlıkları korunur).
Chunk'lama `retrieval/chunker.py` (KEEP) `MADDE_PATTERN` ile madde-bazlı yapılır.

> CLAUDE.md §1: madde no'ları çıktıdan önce DOĞRULANIR; şüpheli → `[DOĞRULA:]`.
