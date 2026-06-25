# 02 — Evrak Türleri Taksonomisi + Birim Yönlendirme + Zorunlu Alanlar

> Görev 1 (sınıflandırma sınıfları) + Görev 2 (birim routing) + eksik-bilgi tespiti için
> kaynaklı sentez. Kümeler `backend/agents/config.py`'da kodlanmıştır.
>
> ⚠️ **Şartname sabit sınıf/birim listesi VERMEZ.** Bu taksonomi resmî kaynaklara
> dayandırılmıştır; gold-set **blind etiketleme** ile kurulmalı (etik §13.1 — kendi-tanımlı
> kapalı-küme F1 manipülasyon algısını önle).

## 1. Gelen evrak türleri (Görev 1 sınıfları)

| # | Tür (`key`) | Ayırt edici | Dayanak |
|---|---|---|---|
| 1 | Dilekçe (`dilekce`) | Vatandaştan; talep + ad-soyad + imza + adres | 3071 |
| 2 | Başvuru (`basvuru`) | Hizmet/işlem talebi (ruhsat/izin/kayıt), ekli belge | 3071/sektörel |
| 3 | Şikâyet (`sikayet`) | Kusur bildirimi; inceleme/soruşturma tetikler | 3071/CİMER |
| 4 | İhbar (`ihbar`) | Usulsüzlük bildirimi; isimsiz olabilir | CİMER/4483 |
| 5 | Talep (`talep`) | Somut istek (belge/randevu/ödeme) | 3071 |
| 6 | Bilgi edinme (`bilgi_edinme`) | **Mevcut kayda** erişim; 15 iş günü | 4982 |
| 7 | CİMER (`cimer`) | 7 alt-tür; elektronik, yönlendirilmiş | 5690 |
| 8 | Üst yazı (`ust_yazi`) | Kamu kurumundan; resmî format | Yön. 2646 |
| 9 | Cevabi yazı (`cevabi_yazi`) | "İlgi" ile atıf | Yön. 2646 |
| 10 | Tebligat (`tebligat`) | Süre başlatan resmî bildirim; e-tebligat 5. gün | 7201 |
| 11 | Dava evrakı (`dava_evraki`) | Mahkemeden; süreli; hukuk birimi | HMK/7201 |
| 12 | İcra evrakı (`icra_evraki`) | Ödeme/haciz; süreli; mali+hukuki | İİK/7201 |
| 13 | Müzekkere (`muzekkere`) | Mahkeme/savcılık/icra bilgi-belge ister | usul |
| 14 | Fatura (`fatura`) | Mal-hizmet; tahakkuk-ödeme | 5018 |
| 15 | Tutanak (`tutanak`) | Olay/tespit/teslim imzalı kayıt | Yön. 2646 |
| 16 | Rapor (`rapor`) | Denetim/inceleme; bulgu+öneri | sektörel |
| 17 | Görüş/Mütalaa (`gorus_mutalaa`) | Hukuki/teknik değerlendirme | Hukuk Müş. Yön. |
| 18 | Genelge/Talimat/Olur (`genelge_talimat_olur`) | Üst makam bağlayıcı yönlendirme | Yön. 2646 |
| — | Belirsiz (`belirsiz`) | Abstention (düşük güven) | — |

> Kritik ayrım: *dilekçe* serbest talep; *bilgi edinme* özel olarak **var olan kayda** erişim
> (4982, farklı süre rejimi). Karıştırılmamalı.

## 2. Evrak türü → işlem / üretilecek yazı (`config.EVRAK_TO_YAZI`)

| Gelen | İşlem | Üretilen yazı |
|---|---|---|
| Dilekçe/Başvuru | kayıt→havale→değerlendirme | **Cevabi yazı** (en geç 30 gün, gerekçeli — 3071) |
| Bilgi edinme | havale | **Bilgi verme yazısı** (15 iş günü; 30'a uzayabilir) |
| Şikâyet/İhbar | inceleme/soruşturma | **Olur** + cevabi yazı |
| Üst yazı | konuya göre | **Cevabi üst yazı** (İlgi atıflı) |
| Tebligat | süre takibi | **İtiraz/cevap** (süre içinde) |
| Dava/İcra | savunma/işlem | **Dava cevabı / haciz cevabı** (hukuk) |

## 3. Birim yönlendirme (havale) — `config.EVRAK_TO_BIRIM`

| Birim (`key`) | Havale edilen evrak |
|---|---|
| Yazı İşleri / Genel Evrak (`yazi_isleri_evrak`) | **tüm evrak önce buraya**; sonra dağıtım |
| Hukuk Müşavirliği (`hukuk_musavirligi`) | dava, icra, tebligat, müzekkere, mütalaa |
| İnsan Kaynakları (`insan_kaynaklari`) | personel/atama/izin/disiplin |
| Strateji/Mali (`mali_strateji_sgb`) | fatura, ödeme, bütçe (5018 m.60) |
| Bilgi İşlem (`bilgi_islem`) | teknik/sistem/erişim |
| Destek/İdari (`destek_idari_hizmetler`) | satın alma, lojistik |
| Basın-Halkla İlişkiler/CİMER (`basin_halkla_iliskiler_cimer`) | CİMER, dilekçe, bilgi edinme, şikâyet (ilk yönlendirme) |
| Teftiş/İç Denetim (`teftis_ic_denetim`) | ihbar, şikâyet (soruşturma), denetim raporu |
| İlgili Teknik Daire (`ilgili_teknik_daire`) | konuya özgü teknik evrak |

**Havale akışı:** gelen evrak → tarama → kayıt (*tür, geldiği yer, sayı, tarih, ek, konu*) →
yetkili amir **elektronik havale** → dağıtım masası (günde ≥1; ivedi derhal). Konu kodu SDP'den.

## 4. Bilgi Edinme (4982) + CİMER (5690)

- **4982:** mevcut bilgi/belgeye erişim; **15 iş günü** (başka birimden toplanırsa **30**);
  red sebepleri **m.16-17**; red tebliğinden **15 gün** içinde **BEDK** itirazı (Kurul 30 iş günü).
- **CİMER (5690):** 7 tür (talep/şikâyet/ihbar/görüş-öneri/bilgi edinme/teşekkür/başvuru);
  ilgili kuruma yönlendirilir; bilgi-edinme türü 4982 rejiminde, diğerleri 3071 (30 gün).
  İşleme alınmayan: somut konusuz isimsiz şikâyet, tekrar, yargıya giren, yetki dışı, hakaret.

## 5. Eksik bilgi tespiti — zorunlu alanlar (`config.ZORUNLU_ALANLAR`)

**Dilekçe (3071 m.4):** ad-soyad · imza · adres · konu · talep · (uygulamada T.C./tarih).
> **Ad-soyad veya imza veya adres eksikse dilekçe İNCELENMEZ** — eksik-tespit kuralının yasal temeli.

**Bilgi edinme:** + istenen bilgi/belgenin açıkça belirtilmesi; tüzel kişide unvan+yetkili imza.

**Resmî yazı:** başlık · sayı · tarih · konu · muhatap · ilgi · metin · imza/onay · ek · dağıtım · gizlilik/ivedilik.

**Uygulanabilir kural:** `gonderen_ad_soyad`, `tckn_veya_kurum`, `tarih`, `konu`, `talep`,
`iletisim_adres`, `imza` alanlarından biri yoksa "eksik" işaretle (recall-öncelikli — `docs/06`).

## Kaynaklar
- Yön. 2646: https://mevzuat.gov.tr/MevzuatMetin/21.5.2646.pdf
- 4982 Bilgi Edinme: https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4982&MevzuatTur=1&MevzuatTertip=5
- 3071 Dilekçe Hakkı: https://www.mevzuat.gov.tr/mevzuatmetin/1.5.3071.pdf
- 7201 Tebligat: https://mevzuat.gov.tr/mevzuatmetin/1.3.7201.pdf
- CİMER: https://www.cimer.gov.tr/ · 5690: Lexpera CB İletişim Merkezi Yönetmeliği
- SDP 2005/7: https://www.resmigazete.gov.tr/eskiler/2005/03/20050325-10.htm
- Strateji Geliştirme Birimleri (5018 m.60): https://www.mevzuat.gov.tr/MevzuatMetin/3.5.20069972.pdf
- CB Teşkilatı Kararnamesi (Sayı:1) — birim yapısı modeli
