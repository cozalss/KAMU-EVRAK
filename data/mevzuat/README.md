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

## 2026-06 Genişletme Batch 5 — trafik/ulaştırma/güvenlik (3 mevzuat / 18 madde)

> Korpus 76 -> **79 mevzuat**. Trafik cezası-itiraz (sulh ceza hâkimliği, m.114),
> sürücü belgesi/araç tescil, karayolu taşıma yetki belgesi, özel güvenlik izni/çalışma
> izni/kimlik kartı. Gerçek mevzuat madde-özetleri (mevzuat.gov.tr / resmigazete.gov.tr).
> Şüpheli/değişen hükümler `[DOĞRULA:]` taşır. Yeniden indeksleme: `python scripts/seed_mevzuat.py`.

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Karayolları Trafik Kanunu | 2918 | `2918_karayollari_trafik_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2918&MevzuatTur=1&MevzuatTertip=5 |
| Karayolu Taşıma Kanunu | 4925 | `4925_karayolu_tasima_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4925&MevzuatTur=1&MevzuatTertip=5 |
| Özel Güvenlik Hizmetlerine Dair Kanun | 5188 | `5188_ozel_guvenlik_hizmetleri_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5188&MevzuatTur=1&MevzuatTertip=5 |

## 2026-06 Genişletme Batch 5 — trafik/dernek/sendika/tarım/enerji/bankacılık (18 mevzuat)))

> Korpus 76 -> **94 mevzuat (623 chunk)**. Resmî mühür, e-yazışma (EBYS/KEP/e-imza/karekod),
> medeni/vekâlet/koruma, personel disiplin/mali haklar, ihale itiraz. Gerçek mevzuat (mevzuat.gov.tr).

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Karayolları Trafik Kanunu | 2918 | `2918_karayollari_trafik_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2918&MevzuatTur=1&MevzuatTertip=5 |
| Karayolu Taşıma Kanunu | 4925 | `4925_karayolu_tasima_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4925&MevzuatTur=1&MevzuatTertip=5 |
| Özel Güvenlik Hizmetlerine Dair Kanun | 5188 | `5188_ozel_guvenlik_hizmetleri_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5188&MevzuatTur=1&MevzuatTertip=5 |
| Dernekler Kanunu | 5253 | `5253_dernekler_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5253.pdf |
| Dernek ve Vakıfların Kamu Kurum ve Kuruluşları ile İlişkilerine Dair Kanun | 5072 | `5072_dernek_vakif_kamu_iliskileri_kanunu.txt` | 3 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5072.pdf |
| Toplantı ve Gösteri Yürüyüşleri Kanunu | 2911 | `2911_toplanti_ve_gosteri_yuruyusleri_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2911.pdf |
| Sendikalar ve Toplu İş Sözleşmesi Kanunu | 6356 | `6356_sendikalar_toplu_is_sozlesmesi_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6356.pdf |
| Türkiye İş Kurumu Kanunu | 4904 | `4904_turkiye_is_kurumu_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4904&MevzuatTur=1&MevzuatTertip=5 |
| Uluslararası İşgücü Kanunu | 6735 | `6735_uluslararasi_isgucu_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6735.pdf |
| Veteriner Hizmetleri, Bitki Sağlığı, Gıda ve Yem Kanunu | 5996 | `5996_veteriner_hizmetleri_bitki_sagligi_gida_yem_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5996.pdf |
| Toprak Koruma ve Arazi Kullanımı Kanunu | 5403 | `5403_toprak_koruma_ve_arazi_kullanimi_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5403.pdf |
| Kooperatifler Kanunu | 1163 | `1163_kooperatifler_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.1163.pdf |
| Maden Kanunu | 3213 | `3213_maden_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=3213&MevzuatTur=1&MevzuatTertip=5 |
| Elektrik Piyasasi Kanunu | 6446 | `6446_elektrik_piyasasi_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6446.pdf |
| Yeralti Sulari Hakkinda Kanun | 167 | `167_yeralti_sulari_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.4.167.pdf |
| Bankacılık Kanunu | 5411 | `5411_bankacilik_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5411.pdf |
| Sermaye Piyasası Kanunu | 6362 | `6362_sermaye_piyasasi_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6362.pdf |
| Sigortacılık Kanunu | 5684 | `5684_sigortacilik_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5684.pdf |

## 2026-06 Genişletme Batch 6 — aile/çocuk/kadın koruma (3 mevzuat / 24 madde)

> Korpus 94 -> **97 mevzuat (647 chunk)**. Çocuk koruma (koruyucu/destekleyici tedbir kararı,
> danışmanlık, acil korunma, sosyal inceleme), kadına karşı şiddet/aile koruma (mülki amir &
> hâkim koruyucu/önleyici tedbir, uzaklaştırma, başvuru, itiraz, zorlama hapsi), aile mahkemesi
> (kuruluş/görev, uzman, sulh). Gerçek mevzuat madde-özetleri (mevzuat.gov.tr / resmigazete.gov.tr).
> Şüpheli/değişen hükümler `[DOĞRULA:]` taşır. Yeniden indeksleme: `python scripts/seed_mevzuat.py`.

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Çocuk Koruma Kanunu | 5395 | `5395_cocuk_koruma_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5395.pdf |
| Ailenin Korunması ve Kadına Karşı Şiddetin Önlenmesine Dair Kanun | 6284 | `6284_ailenin_korunmasi_kadina_siddet_onleme.txt` | 9 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6284.pdf |
| Aile Mahkemelerinin Kuruluş, Görev ve Yargılama Usullerine Dair Kanun | 4787 | `4787_aile_mahkemeleri_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4787.pdf |

## 2026-06 Genişletme Batch 6 — spor/turizm/basın/orman/gümrük-vergi/sağlık/aile (18 mevzuat))))

> Korpus 94 -> **112 mevzuat (744 chunk)**. Resmî mühür, e-yazışma (EBYS/KEP/e-imza/karekod),
> medeni/vekâlet/koruma, personel disiplin/mali haklar, ihale itiraz. Gerçek mevzuat (mevzuat.gov.tr).

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Spor Kulüpleri ve Spor Federasyonları Kanunu | 7405 | `7405_spor_kulupleri_ve_spor_federasyonlari_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.7405.pdf |
| Turizmi Teşvik Kanunu | 2634 | `2634_turizmi_tesvik_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2634.pdf |
| Seyahat Acentaları ve Seyahat Acentaları Birliği Kanunu | 1618 | `1618_seyahat_acentalari_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.1618.pdf |
| Basın Kanunu | 5187 | `5187_basin_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5187.pdf |
| Radyo ve Televizyonların Kuruluş ve Yayın Hizmetleri Hakkında Kanun | 6112 | `6112_radyo_televizyon_yayin_hizmetleri_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6112.pdf |
| Elektronik Haberleşme Kanunu | 5809 | `5809_elektronik_haberlesme_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5809.pdf |
| Orman Kanunu | 6831 | `6831_orman_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6831&MevzuatTur=1&MevzuatTertip=3 |
| Kiyi Kanunu | 3621 | `3621_kiyi_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=3621&MevzuatTur=1&MevzuatTertip=5 |
| Su Urunleri Kanunu | 1380 | `1380_su_urunleri_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=1380&MevzuatTur=1&MevzuatTertip=5 |
| Gümrük Kanunu | 4458 | `4458_gumruk_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4458&MevzuatTur=1&MevzuatTertip=5 |
| Katma Değer Vergisi Kanunu | 3065 | `3065_katma_deger_vergisi_kanunu.txt` | 9 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=3065&MevzuatTur=1&MevzuatTertip=5 |
| Kurumlar Vergisi Kanunu | 5520 | `5520_kurumlar_vergisi_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5520&MevzuatTur=1&MevzuatTertip=5 |
| Tababet ve Şuabatı San'atlarının Tarzı İcrasına Dair Kanun | 1219 | `1219_tababet_ve_suabati_sanatlari_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.3.1219.pdf |
| Eczacılar ve Eczaneler Hakkında Kanun | 6197 | `6197_eczacilar_ve_eczaneler_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/1.3.6197.pdf |
| Sağlık Hizmetleri Temel Kanunu | 3359 | `3359_saglik_hizmetleri_temel_kanunu.txt` | 4 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3359.pdf |
| Çocuk Koruma Kanunu | 5395 | `5395_cocuk_koruma_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5395.pdf |
| Ailenin Korunması ve Kadına Karşı Şiddetin Önlenmesine Dair Kanun | 6284 | `6284_ailenin_korunmasi_kadina_siddet_onleme.txt` | 9 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6284.pdf |
| Aile Mahkemelerinin Kuruluş, Görev ve Yargılama Usullerine Dair Kanun | 4787 | `4787_aile_mahkemeleri_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4787.pdf |

## 2026-06 Genişletme Batch 7 — sosyal-yardım/tarım/sendika-emekli/infaz/vakıf/şehit-gazi (18 mevzuat)))))

> Korpus 112 -> **130 mevzuat (855 chunk)**. Resmî mühür, e-yazışma (EBYS/KEP/e-imza/karekod),
> medeni/vekâlet/koruma, personel disiplin/mali haklar, ihale itiraz. Gerçek mevzuat (mevzuat.gov.tr).

| Mevzuat | No | Dosya | Madde | Kaynak |
|---|---|---|---|---|
| Sosyal Yardımlaşma ve Dayanışmayı Teşvik Kanunu | 3294 | `3294_sosyal_yardimlasma_dayanismayi_tesvik_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3294.pdf |
| 65 Yaşını Doldurmuş Muhtaç, Güçsüz ve Kimsesiz Türk Vatandaşlarına Aylık Bağlanması Hakkında Kanun | 2022 | `2022_65_yas_muhtac_aylik_baglanmasi_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2022.pdf |
| Yardım Toplama Kanunu | 2860 | `2860_yardim_toplama_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2860.pdf |
| Mera Kanunu | 4342 | `4342_mera_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4342.pdf |
| Hayvanları Koruma Kanunu | 5199 | `5199_hayvanlari_koruma_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5199.pdf |
| Tohumculuk Kanunu (6968 mülga olduğundan ikame edilen yürürlükteki tarım mevzuatı) | 5553 | `5553_tohumculuk_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5553.pdf |
| Kamu Görevlileri Sendikaları ve Toplu Sözleşme Kanunu | 4688 | `4688_kamu_gorevlileri_sendikalari_toplu_sozlesme_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4688.pdf |
| Türkiye Cumhuriyeti Emekli Sandığı Kanunu | 5434 | `5434_emekli_sandigi_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.3.5434.pdf |
| Sosyal Güvenlik Kurumlarına Tabi Olarak Geçen Hizmetlerin Birleştirilmesi Hakkında Kanun | 2829 | `2829_hizmet_birlestirme_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/MevzuatMetin/5.5.2829.pdf |
| Ceza Muhakemesi Kanunu | 5271 | `5271_ceza_muhakemesi_kanunu.txt` | 7 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5271.pdf |
| Ceza ve Güvenlik Tedbirlerinin İnfazı Hakkında Kanun | 5275 | `5275_ceza_guvenlik_tedbirleri_infazi_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5275.pdf |
| İnfaz Hâkimliği Kanunu | 4675 | `4675_infaz_hakimligi_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4675.pdf |
| Vakıflar Kanunu | 5737 | `5737_vakiflar_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5737.pdf |
| Vakıflar Yönetmeliği | — | `vakiflar_yonetmeligi.txt` | 7 | https://www.resmigazete.gov.tr/eskiler/2008/09/20080927-13.htm |
| Diyanet İşleri Başkanlığı Kuruluş ve Görevleri Hakkında Kanun | 633 | `633_diyanet_isleri_baskanligi_kanunu.txt` | 5 | https://www.mevzuat.gov.tr/mevzuatmetin/1.5.633.pdf |
| Terörle Mücadele Kanunu | 3713 | `3713_terorle_mucadele_kanunu.txt` | 3 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3713.pdf |
| Nakdi Tazminat ve Aylık Bağlanması Hakkında Kanun | 2330 | `2330_nakdi_tazminat_ve_aylik_baglanmasi_kanunu.txt` | 6 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2330.pdf |
| Terör ve Terörle Mücadeleden Doğan Zararların Karşılanması Hakkında Kanun | 5233 | `5233_teror_zararlarinin_karsilanmasi_kanunu.txt` | 8 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5233.pdf |
