# data/mevzuat — Kamuya açık mevzuat korpusu (seed kaynağı)

Bu klasöre **kamuya açık** mevzuat metinleri konur ve `scripts/seed_mevzuat.py` (TODO) ile
chunk'lanıp Qdrant'a yüklenir (`mevzuat_oner` node'unun hybrid-RAG kaynağı). **Gerçek kamu
evrakı / PII içermez** (şartname §6.5).

## İndirilecek metinler (mevzuat.gov.tr — izinli)

| Mevzuat | No | Kaynak |
|---|---|---|
| Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik | CB 2646 / 2020 | https://mevzuat.gov.tr/MevzuatMetin/21.5.2646.pdf |
| Dilekçe Hakkının Kullanılmasına Dair Kanun | 3071 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.3071.pdf |
| Bilgi Edinme Hakkı Kanunu | 4982 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4982&MevzuatTur=1&MevzuatTertip=5 |
| Tebligat Kanunu | 7201 | https://mevzuat.gov.tr/mevzuatmetin/1.3.7201.pdf |
| Standart Dosya Planı Genelgesi | 2005/7 | https://www.resmigazete.gov.tr/eskiler/2005/03/20050325-10.htm |
| Gizlilik Dereceli Belgeler Yönetmeliği | 5529 | https://www.mevzuat.gov.tr/MevzuatMetin/21.5.5529.pdf |

## Format

Her mevzuat `<no>_<kisa_ad>.txt` olarak kaydedilir (UTF-8, madde başlıkları korunur).
Chunk'lama `retrieval/chunker.py` (KEEP) `MADDE_PATTERN` ile madde-bazlı yapılır.

> CLAUDE.md §1: madde no'ları çıktıdan önce DOĞRULANIR; şüpheli → `[DOĞRULA:]`.
