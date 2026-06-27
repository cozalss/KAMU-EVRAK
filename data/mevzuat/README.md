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

## 2026-06 Genişletme Batch 2 — denetim/tüketici/çevre/e-tebligat/ceza (15 mevzuat / 96 madde)

> Korpus 31 -> **46 mevzuat (306 chunk)**. Gerçek mevzuat madde-özetleri (mevzuat.gov.tr).

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Sayıştay Kanunu | 6085 | `6085_sayistay_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6085.pdf |
| Mal Bildiriminde Bulunulması, Rüşvet ve Yolsuzluklarla Mücadele Kanunu | 3628 | `3628_mal_bildirimi_kanunu.txt` | 9 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.3628.pdf |
| Kamu Görevlileri Etik Kurulu Kurulması ve Bazı Kanunlarda Değişiklik Yapılması Hakkında Kanun | 5176 | `5176_etik_kurulu_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5176.pdf |
| Tüketicinin Korunması Hakkında Kanun | 6502 | `6502_tuketicinin_korunmasi.txt` | 7 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6502.pdf |
| Kamu İhale Sözleşmeleri Kanunu | 4735 | `4735_kamu_ihale_sozlesmeleri.txt` | 10 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.4735.pdf |
| Türk Ticaret Kanunu | 6102 | `6102_turk_ticaret_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6102.pdf |
| Çevre Kanunu | 2872 | `2872_cevre_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2872.pdf |
| Yapı Denetimi Hakkında Kanun | 4708 | `4708_yapi_denetimi_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.4708.pdf |
| Afet Riski Altındaki Alanların Dönüştürülmesi Hakkında Kanun | 6306 | `6306_afet_riski_donusum_kanunu.txt` | 4 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6306&MevzuatTur=1&MevzuatTertip=5 |
| Ulusal Bayram ve Genel Tatiller Hakkında Kanun | 2429 | `2429_ulusal_bayram_genel_tatiller.txt` | 3 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2429.pdf |
| Elektronik Tebligat Yönetmeliği | 30617 (RG) | `elektronik_tebligat_yonetmeligi.txt` | 8 | https://www.resmigazete.gov.tr/eskiler/2018/12/20181206-2.htm |
| Kayıtlı Elektronik Posta Sistemine İlişkin Usul ve Esaslar Hakkında Yönetmelik (KEP) | 28036 (RG) | `kayitli_elektronik_posta_yonetmeligi.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=15169&MevzuatTur=7&MevzuatTertip=5 |
| Türk Ceza Kanunu — Resmî Belgede Sahtecilik ve Görev Suçları (seçili maddeler) | 5237 | `5237_turk_ceza_kanunu_belgede_sahtecilik.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5237.pdf |
| İl İdaresi Kanunu | 5442 | `5442_il_idaresi_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.3.5442.pdf |
| İl Özel İdaresi Kanunu | 5302 | `5302_il_ozel_idaresi_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5302.pdf |

## 2026-06 Genişletme Batch 3 — resmî mühür/e-yazışma + medeni/vekâlet + personel-disiplin (9 mevzuat)

> Korpus 46 -> **55 mevzuat (370 chunk)**. Resmî mühür, e-yazışma (EBYS/KEP/e-imza/karekod),
> medeni/vekâlet/koruma, personel disiplin/mali haklar, ihale itiraz. Gerçek mevzuat (mevzuat.gov.tr).

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Resmî Mühür Yönetmeliği | 84/8422 | `resmi_muhur_yonetmeligi.txt` | 11 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=848422&MevzuatTur=21&MevzuatTertip=5 |
| Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik — Elektronik Yazışma (e-Yazışma / EBYS / KEP / Güvenli Elektronik İmza) | 2646 | `2646_resmi_yazisma_e_yazisma.txt` | 8 | https://mevzuat.gov.tr/MevzuatMetin/21.5.2646.pdf |
| 1 Sayılı Cumhurbaşkanlığı Teşkilatı Hakkında Cumhurbaşkanlığı Kararnamesi — Bakanlıklara İlişkin Ortak Hükümler (Teşkilat ve Yazışma) | 1 | `1_cumhurbaskanligi_teskilati_cbk.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/19.5.1.pdf |
| Türk Medeni Kanunu | 4721 | `4721_turk_medeni_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.4721.pdf |
| Avukatlık Kanunu | 1136 | `1136_avukatlik_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.1136.pdf |
| Kültür ve Tabiat Varlıklarını Koruma Kanunu | 2863 | `2863_kultur_tabiat_varliklari_koruma_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.2863.pdf |
| Devlet Memurları Disiplin Yönetmeliği | 3935 (Cumhurbaşkanı Kararı) | `devlet_memurlari_disiplin_yonetmeligi.txt` | 7 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=3935&MevzuatTur=21&MevzuatTertip=5 |
| 375 sayılı Kanun Hükmünde Kararname (Kamu Personeli Mali ve Sosyal Hakları) | 375 (KHK) | `375_khk_mali_sosyal_haklar.txt` | 4 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=375&MevzuatTur=4&MevzuatTertip=5 |
| İhalelere Yönelik Başvurular Hakkında Yönetmelik | 12766 (Yönetmelik) | `ihalelere_yonelik_basvurular_yonetmeligi.txt` | 7 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=12766&MevzuatTur=7&MevzuatTertip=5 |

## 2026-06 Genişletme Batch 4 — sağlık/eğitim/ticaret/imar-yön/nüfus/devlet-ihale (21 mevzuat))

> Korpus 55 -> **76 mevzuat (513 chunk)**. Resmî mühür, e-yazışma (EBYS/KEP/e-imza/karekod),
> medeni/vekâlet/koruma, personel disiplin/mali haklar, ihale itiraz. Gerçek mevzuat (mevzuat.gov.tr).

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Umumi Hıfzıssıhha Kanunu | 1593 | `1593_umumi_hifzissihha_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.3.1593.pdf |
| Sosyal Hizmetler Kanunu | 2828 | `2828_sosyal_hizmetler_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2828.pdf |
| Engelliler Hakkında Kanun | 5378 | `5378_engelliler_hakkinda_kanun.txt` | 7 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5378.pdf |
| İş Sağlığı ve Güvenliği Kanunu | 6331 | `6331_is_sagligi_guvenligi_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6331.pdf |
| Yükseköğretim Kanunu | 2547 | `2547_yuksekogretim_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2547&MevzuatTur=1&MevzuatTertip=5 |
| Millî Eğitim Temel Kanunu | 1739 | `1739_milli_egitim_temel_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.1739.pdf |
| Özel Öğretim Kurumları Kanunu | 5580 | `5580_ozel_ogretim_kurumlari_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5580&MevzuatTur=1&MevzuatTertip=5 |
| Meslekî Eğitim Kanunu | 3308 | `3308_mesleki_egitim_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=3308&MevzuatTur=1&MevzuatTertip=5 |
| Elektronik Ticaretin Düzenlenmesi Hakkında Kanun | 6563 | `6563_elektronik_ticaret_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6563.pdf |
| Sınai Mülkiyet Kanunu | 6769 | `6769_sinai_mulkiyet_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6769.pdf |
| Fikir ve Sanat Eserleri Kanunu | 5846 | `5846_fikir_ve_sanat_eserleri_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.3.5846.pdf |
| Rekabetin Korunması Hakkında Kanun | 4054 | `4054_rekabetin_korunmasi_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4054.pdf |
| Planlı Alanlar İmar Yönetmeliği | 30113 (RG sayısı); 3194 sayılı İmar Kanununa dayanır | `planli_alanlar_imar_yonetmeligi.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=23722&MevzuatTur=7&MevzuatTertip=5 |
| Kat Mülkiyeti Kanunu | 634 | `634_kat_mulkiyeti_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=634&MevzuatTur=1&MevzuatTertip=5 |
| Yapı Ruhsatı ve Yapı Kullanma İzin Belgesi İşlemleri (İmar Kanunu m.21-30 ve Planlı Alanlar İmar Yönetmeliği) | 3194 (İmar Kanunu) + 30113 sayılı Planlı Alanlar İmar Yönetmeliği | `yapi_ruhsati_yapi_kullanma_izni_islemleri.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3194.pdf |
| Nüfus Hizmetleri Kanunu | 5490 | `5490_nufus_hizmetleri_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5490.pdf |
| Türk Vatandaşlığı Kanunu | 5901 | `5901_turk_vatandasligi_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5901.pdf |
| Yabancılar ve Uluslararası Koruma Kanunu | 6458 | `6458_yabancilar_uluslararasi_koruma_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6458.pdf |
| Devlet İhale Kanunu | 2886 | `2886_devlet_ihale_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2886&MevzuatTur=1&MevzuatTertip=5 |
| Taşınır Mal Yönetmeliği | 2006/11545 (BKK) | `tasinir_mal_yonetmeligi.txt` | 7 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=9014&MevzuatTur=21&MevzuatTertip=5 |
| Kamu İdarelerine Ait Taşınmazların Tahsis ve Devri Hakkında Yönetmelik | RG 26315 | `tasinmaz_tahsis_devir_yonetmeligi.txt` | 7 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=10691&MevzuatTur=7&MevzuatTertip=5 |
