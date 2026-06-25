# 01 — Resmî Yazışma Mevzuatı Referansı (Görev 2 temeli)

> Görev 2 "resmî üsluba uygun taslak" + Görev 1 "mevzuat önerisi" için derlenmiş referans.
> **Madde no'ları üretimden önce mevzuat.gov.tr'de doğrulanmalı** (CLAUDE.md §1; şüpheli →
> `[DOĞRULA:]`). Kaynaklar madde sonunda.

## 0. Yürürlükteki mevzuat hiyerarşisi

| Belge | Karar/Sayı | Tarih | Durum |
|---|---|---|---|
| Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. **Yönetmelik** | CB Kararı **2646** / RG **31151** | **10.06.2020** | **YÜRÜRLÜKTE** |
| Önceki Yönetmelik (Bakanlar Kurulu) | RG 29331 | 02.02.2015 | MÜLGA |
| Resmî Yazışma **Kılavuzu** | TCCB İdari İşler Başkanlığı | — | Uygulama rehberi |
| **Standart Dosya Planı** Genelgesi | Başbakanlık **2005/7** / RG 25766 | 24.03.2005 | YÜRÜRLÜKTE |
| **e-Yazışma Teknik Rehberi** | CBDDO | sürüm 2.0+ | EBYS uyum zorunlu |

2020'nin kırılması: CB Hükümet Sistemine geçiş + **asıl ortam elektronik** (güvenli e-imza);
fiziksel ortam "zorunlu hâller" istisnası.

## 1. Resmî yazının zorunlu unsurları (bölümleri)

| Bölüm | Yön. Madde | Kural özeti |
|---|---|---|
| **Başlık (antet)** | md. 10 | En üstte ortalı; 1. satır **"T.C."**, 2. idare adı (BÜYÜK), 3. birim adı |
| **Sayı** | md. 11 | Solda; **DETSİS no – SDP kodu – kayıt no**. Örn `E-45678257-622.03-12345` (e-imza → "E-") |
| **Tarih** | md. 12 | İmza/onay tarihi; `gg.aa.yyyy`; sayı hizasında sağda |
| **Konu** | md. 13 | "Konu:"; kısa; nokta ile bitmez; "T.C." hizasını geçmez |
| **Muhatap** | md. 14 | Ortada; idare/makam adı veya sayın + ad-soyad |
| **İlgi** | md. 15 | Önceki belgeye atıf; çok ise a) b) c) kronolojik; her biri tarih+sayı |
| **Metin (gövde)** | md. 16 | İlgi ile imza arası; giriş/gelişme/sonuç; kapanış hiyerarşiye göre |
| **İmza** | md. 17 | Metinden 2–4 satır sonra, sağa ortalı: ad (ilk büyük) **SOYAD (büyük)** + unvan. Yetki: "Bakan a.", "Vali a.", "V." |
| **Ek** | md. 18 | İmzadan sonra solda; `Ek: 1 adet ...` veya numaralı liste |
| **Dağıtım** | md. 19 | "**Gereği:**" / "**Bilgi:**" alt başlıkları |
| **Olur / Onay** | md. 20 | Metin sonunda ortalı **"OLUR"** + tarih + onay makamı imza bloğu |
| **Paraf** | md. 21 | Son nüshada sol altta; hazırlayan/kontrol eden; EBYS'de elektronik paraf zinciri |
| **Koordinasyon** | md. 22 | İmzadan sonra "Koordinasyon:" + iş birliği yapan unvan-ad-soyad |
| **Gizlilik / İvedilik** | genel | Sayfa üst-alt orta (gizlilik); sayı üstü/sağ üst (ivedilik) |
| **Sayfa no / Belge Doğrulama Kodu** | biçim + e-Yazışma | Çok sayfada sayfa no; e-imzalı belgede karekod + doğrulama adresi |

Biçim (Kılavuz): A4, kenar ~2,5 cm, Times New Roman 12 / Arial 11, tek satır aralığı.

## 2. Yazı türü iskeletleri (Görev 2 şablon temeli)

### 2.1 Üst yazı
```
                              T.C.
                    ADALET BAKANLIĞI
                Ceza İşleri Genel Müdürlüğü
Sayı : E-45678257-622.03-12345                       25.06.2026
Konu : ... hakkında
                        ........... VALİLİĞİNE
İlgi : a) 01.06.2026 tarihli ve E-...-9876 sayılı yazınız.
       (Metin gövdesi.) ........................
       Gereğini rica ederim.
                                              Ahmet YILMAZ
                                          Bakan a. Genel Müdür
Ek   : 1- Görüş yazısı (2 sayfa)
Dağıtım:  Gereği: ...    Bilgi: ...
```
- **Cevabi yazı (2.2):** aynı iskelet; cevaplanan yazı **İlgi (a)**; metin "İlgi yazıda...".
- **Olur/Onay (2.3):** muhatap YOK; "...olurlarınıza arz ederim." → ortalı **OLUR** + tarih + onay makamı. Alt makam onayı "Onay/Uygundur"; üst makam "OLUR".
- **Bilgilendirme (2.4):** kapanış "Bilgilerinize arz ederim."; dağıtım "Bilgi:" altında.
- **Dağıtımlı (2.5):** muhatap "Dağıtım yerlerine"; Gereği/Bilgi ayrımı.

## 3. EBYS, e-imza, kayıtlı evrak akışı

- **EBYS:** belgeleri e-Yazışma Teknik Rehberi'ne uygun, aidiyet zinciriyle yöneten sistem; resmî yazışma asıl olarak EBYS üzerinden.
- **Güvenli e-imza** (5070): NES'e dayalı; el yazısı imzayla aynı hukuki sonuç. Mobil imza geçerli.
- **Akış:** oluşturma (SDP+DETSİS otomatik) → paraf/koordinasyon → imza ("E-" + kayıt no + doğrulama kodu) → giden (e-Yazışma paketi) → gelen (kayıt → **havale** → gereği/bilgi) → saklama/arşiv (SDP kodu).

## 4. Standart Dosya Planı (2005/7)

| Aralık | İçerik |
|---|---|
| **000–099** | Tüm kurumlarda ortak (mevzuat, plan, rapor, kurullar) |
| **100–599** | Ana hizmet (kuruma özgü) |
| **600–999** | Yardımcı/danışma/denetim (personel, bütçe, hukuk müşavirliği) ortak |

Hiyerarşi: ana konu **3 hane** → `.NN` → `.NN`. Örn `622 → 622.03 → 622.03.01`.
Sayı: `[DETSİS] – [SDP kodu] – [kayıt no]`. Coğrafi: `724.13.DE`; il: `622.01.06` (Ankara).

## 5. Resmî üslup

- Kapanış: alt makama "**Rica ederim.**", üst/aynı düzeye "**Arz ederim.**", her ikisine "Arz ve rica ederim.", olur "...olurlarınıza arz ederim."
- 3. tekil/edilgen, kısa-açık cümle; argo/kısaltma yok; "T.C."+idare adı dışında gereksiz büyük harf yok; Türkçe karakter tam.
- Tek konu = tek yazı. **Tarih** `gg.aa.yyyy`; **Sayı** `E-`+DETSİS+SDP+kayıt.

## 6. Gizlilik ve ivedilik

- Gizlilik (5529 dayanaklı): **ÇOK GİZLİ > GİZLİ > ÖZEL > HİZMETE ÖZEL > TASNİF DIŞI**; sayfa üst-alt orta BÜYÜK HARF; gizli belge çift zarf.
- İvedilik: **ÇOK İVEDİ / İVEDİ / GÜNLÜDÜR (tarihli) / NORMAL**; sayı üstü/sağ üst.

## Kaynaklar
- Yönetmelik PDF: https://mevzuat.gov.tr/MevzuatMetin/21.5.2646.pdf
- Mevzuat Bilgi Sistemi (2646): https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2646&MevzuatTur=21&MevzuatTertip=5
- RG 10.06.2020/31151: https://resmigazete.gov.tr/eskiler/2020/06/20200610-8.pdf
- TCCB Resmî Yazışma: https://www.tccb.gov.tr/resmiyazisma/yonetmelik/ · Kılavuz: https://www.tccb.gov.tr/assets/dosya/resmiyazisma/dosyalar/kilavuz.pdf
- SDP Genelgesi 2005/7: https://www.resmigazete.gov.tr/eskiler/2005/03/20050325-10.htm · Devlet Arşivleri SDP: https://www.devletarsivleri.gov.tr/Sayfalar/Sayfa.aspx?icerik=20
- e-Yazışma Teknik Rehberi: https://cbddo.gov.tr/SharedFolderServer/Projeler/File/EYP_2.0/EYP2.0_teknik-rehberi.pdf
- Gizlilik Dereceli Belgeler Yön. (5529): https://www.mevzuat.gov.tr/MevzuatMetin/21.5.5529.pdf

> Not: mevzuat.gov.tr/RG PDF'leri binary olduğundan madde özetleri metin mirror'larından çapraz
> doğrulandı; **lafzî madde metni gerekiyorsa mevzuat.gov.tr Word/PDF indirilmeli.**
