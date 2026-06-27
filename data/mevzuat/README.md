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
| Cumhurbaşkanlığı İletişim Merkezi (CİMER) Yönetmeliği | 5690 | `5690_cimer_cb_kararnamesi.txt` | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5690&MevzuatTur=21&MevzuatTertip=5 |
| Gizlilik Dereceli Belgeler Yönetmeliği (planlı) | 5529 | — | https://www.mevzuat.gov.tr/MevzuatMetin/21.5.5529.pdf |

## Format

Her mevzuat `<no>_<kisa_ad>.txt` olarak kaydedilir (UTF-8, madde başlıkları korunur).
Chunk'lama `retrieval/chunker.py` (KEEP) `MADDE_PATTERN` ile madde-bazlı yapılır.

> CLAUDE.md §1: madde no'ları çıktıdan önce DOĞRULANIR; şüpheli → `[DOĞRULA:]`.

## 2026-06 Genişletme — web araştırmasıyla eklenen mevzuat (21 mevzuat / 147 madde)

> Çok-ajanlı web araştırması (mevzuat.gov.tr / resmigazete.gov.tr) ile derlenen GERÇEK
> mevzuat madde-özetleri. Korpus 10 → **31 mevzuat (210 chunk)**. Şüpheli/değişen hükümler
> `[DOĞRULA:]` işareti taşır. Yeniden indeksleme: `uv run python scripts/seed_mevzuat.py`.

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Kişisel Verilerin Korunması Kanunu (KVKK) | 6698 | `6698_kvkk.txt` | 8 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6698.pdf |
| Elektronik İmza Kanunu | 5070 | `5070_elektronik_imza.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5070.pdf |
| İnternet Ortamında Yapılan Yayınların Düzenlenmesi ve Bu Yayınlar Yoluyla İşlenen Suçlarla Mücadele Edilmesi Hakkında Kanun | 5651 | `5651_internet_yayinlari.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5651.pdf |
| Muhafazasına Lüzum Kalmayan Evrak ve Malzemenin Yok Edilmesi Hakkında Kanun Hükmünde Kararnamenin Değiştirilerek Kabulü Hakkında Kanun | 3473 | `3473_evrak_imha_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.3473.pdf |
| Devlet Arşiv Hizmetleri Hakkında Yönetmelik | RG 30922 (Yönetmelik, 11 sayılı CBK'ya dayalı) | `devlet_arsiv_hizmetleri_yonetmeligi.txt` | 10 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=33899&MevzuatTur=7&MevzuatTertip=5 |
| Devlet Arşivleri Başkanlığı Hakkında Cumhurbaşkanlığı Kararnamesi | CB 11 | `11_devlet_arsivleri_baskanligi_cbk.txt` | 8 | https://www.mevzuat.gov.tr/MevzuatMetin/19.5.11.pdf |
| Vergi Usul Kanunu | 213 | `213_vergi_usul_kanunu.txt` | 11 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=213&MevzuatTur=1&MevzuatTertip=4 |
| Amme Alacaklarının Tahsil Usulü Hakkında Kanun | 6183 | `6183_amme_alacaklari_tahsil_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6183&MevzuatTur=1&MevzuatTertip=3 |
| Harçlar Kanunu | 492 | `492_harclar_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=492&MevzuatTur=1&MevzuatTertip=5 |
| Harcırah Kanunu | 6245 | `6245_harcirah_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6245&MevzuatTur=1&MevzuatTertip=3 |
| İmar Kanunu | 3194 | `3194_imar_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3194.pdf |
| Belediye Kanunu | 5393 | `5393_belediye_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5393.pdf |
| Büyükşehir Belediyesi Kanunu | 5216 | `5216_buyuksehir_belediyesi_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5216.pdf |
| Kamulaştırma Kanunu | 2942 | `2942_kamulastirma_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.2942.pdf |
| İş Kanunu | 4857 | `4857_is_kanunu.txt` | 10 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.4857.pdf |
| Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu | 5510 | `5510_sosyal_sigortalar_gss_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5510.pdf |
| Memurlar ve Diğer Kamu Görevlilerinin Yargılanması Hakkında Kanun | 4483 | `4483_memur_yargilama_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.4483.pdf |
| Kabahatler Kanunu | 5326 | `5326_kabahatler_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5326.pdf |
| İcra ve İflas Kanunu | 2004 | `2004_icra_iflas_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.3.2004.pdf |
| Hukuk Muhakemeleri Kanunu | 6100 | `6100_hukuk_muhakemeleri_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6100.pdf |
| Türk Borçlar Kanunu | 6098 | `6098_turk_borclar_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6098.pdf |
