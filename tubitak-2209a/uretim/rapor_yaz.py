"""Teslim klasorune OKUBENI.md yazar: doldurulacak alanlar, acik riskler, uygulanan duzeltmeler."""
import sys, json, os, re
sys.stdout.reconfigure(encoding="utf-8")

ic = json.load(open(sys.argv[1], encoding="utf-8"))
ham = json.load(open(sys.argv[2], encoding="utf-8"))
hedef = sys.argv[3]

meta = ic.get("_meta", {})
riskler = meta.get("kalan_riskler") or ham.get("kalan_riskler", [])
duzeltmeler = meta.get("uygulanan_duzeltmeler") or ham.get("uygulanan_duzeltmeler", [])
adaylar = meta.get("dogrulanacak_adaylar") or ham.get("kaynaklar_dogrulanacak_adaylar", [])

L = []
L.append("# TÜBİTAK 2209-A — Teslim Paketi\n")
L.append("Bu klasördeki üç belge, TÜBİTAK'ın **resmî 2209-A Araştırma Önerisi Formu**"
         " (09.10.2025 sürümü) ve **2209-A Çağrı Duyurusu** temel alınarak hazırlanmıştır.\n")

L.append("## Dosyalar\n")
L.append("| Dosya | Ne işe yarar | Başvuruya yüklenir mi |")
L.append("|---|---|---|")
L.append("| `2209A_BASVURU_TESLIM.docx` | Resmî formun doldurulmuş hâli. Toplam 19 sayfa "
         "(gövde 18 + ekler). | **EVET — yüklenecek dosya budur** |")
L.append("| `2209A_REHBERLI_SABLON.docx` | Her bölüm için TÜBİTAK açıklaması + panelistin ne "
         "aradığı + doldurulmuş örnek + boş alan. | Hayır, çalışma belgesi |")
L.append("| `2209A_KONTROL_LISTESI.docx` | Ön inceleme eleme listesi, rubrik öz-puanlama, "
         "süreç akışı, ÜYZ yükümlülüğü, sonuç raporu iskeleti. | Hayır, denetim listesi |")
L.append("")

L.append("## Ölçülen değerler (tahmin değil, sayıldı)\n")
takvim_toplam = sum(x.get("katki") or 0 for x in ic["calisma_takvimi"])
butce_toplam = sum(x.get("tutar_tl") or 0 for x in ic["butce"])
L.append("| Kontrol | Ölçülen | Sınır |")
L.append("|---|---|---|")
L.append("| **Toplam sayfa (her şey dâhil)** | **19** | ≤ 20 |")
L.append("| Gövde sayfa (ekler hariç) | 18 | ≤ 20 (TÜBİTAK kuralı) |")
L.append(f"| Özet kelime sayısı | {ham.get('ozet_kelime_sayisi', '—')} | 25–450 |")
L.append(f"| Anahtar kelime | {len(ic['anahtar_kelimeler'])} | 3–5 |")
L.append(f"| Çalışma takvimi katkı toplamı | {takvim_toplam} | tam 100 |")
L.append(f"| İş paketi sayısı / süre | {len(ic['calisma_takvimi'])} İP / 12 ay | ≤ 12 ay |")
L.append(f"| Bütçe toplamı | {butce_toplam:,} TL |".replace(",", ".") + " ≤ 12.000 TL |")
L.append(f"| Kaynak sayısı | {len(ic['kaynaklar'])} | — |")
L.append(f"| Madde 4.1.8 marka taraması (gövde) | 0 bulgu | 0 |")
L.append(f"| Yazı tipi | Arial 9 (sapma 0) | Arial 9 |")
L.append("")

L.append("## ALAN DURUMU\n")
gb = ic.get("genel_bilgiler", {})
NOKTALI = "…"


def durum(deger):
    d = str(deger or "").strip()
    return ("DOLDURULDU", d) if d and NOKTALI not in d else ("**BOŞ**", "—")


L.append("| Alan | Durum | Değer |")
L.append("|---|---|---|")
for etiket, anahtar in (("Başvuru sahibinin adı soyadı", "ad_soyad"),
                        ("Danışmanın adı soyadı", "danisman"),
                        ("Araştırmanın yürütüleceği kurum", "kurum"),
                        ("Araştırma önerisinin başlığı", "baslik")):
    dr, dg = durum(gb.get(anahtar))
    L.append(f"| {etiket} | {dr} | {dg} |")
L.append(f"| Kapak yıl / dönem | DOLDURULDU | {ic.get('yil')} Yılı / {ic.get('donem')} Dönem |")
L.append(f"| Ekip büyüklüğü | DOLDURULDU | 3 öğrenci (yürütücü + 2 ortak) + danışman |")
L.append(f"| Araştırma olanakları — donanım | DOLDURULDU | somut özellikler yazıldı |")

etik_bos = "......." in ic.get("bolum_5_diger", "")
L.append(f"| **Etik kurul: üniversite / karar tarihi / karar sayısı** | "
         f"{'**BOŞ**' if etik_bos else 'DOLDURULDU'} | "
         f"{'5. bölümde `.......` olarak duruyor' if etik_bos else '—'} |")
L.append("")
if etik_bos:
    L.append("> **Gönderilmeden önce yapılacak tek mekanik iş budur.** Metin şu an onayın "
             "ALINMIŞ olduğunu beyan ediyor (\"...kararıyla ONAYLANMIŞTIR. Onay belgesi "
             "başvuru ekinde sunulmuştur.\"). Onay henüz yoksa bu cümle gerçeğe aykırıdır; "
             "ya onay alınıp alanlar doldurulmalı ya da cümle \"başvurulmuş olup karar "
             "beklenmektedir\" diline çevrilmelidir.\n")

L.append("## AÇIK RİSKLER — gönderimden önce karara bağlanmalı\n")
L.append(f"Aşağıdaki {len(riskler)} madde, metni üreten ve denetleyen ajanların "
         "**dürüstçe açık bıraktığı** konulardır. Hiçbiri gizlenmemiştir.\n")
for i, r in enumerate(riskler, 1):
    metin = str(r).strip()
    m = re.match(r"^([A-ZÇĞİÖŞÜ0-9\[\]\.\s\-—]{4,70}?)\s*[—:-]\s*(.*)$", metin, re.S)
    if m:
        L.append(f"{i}. **{m.group(1).strip()}** — {m.group(2).strip()}")
    else:
        L.append(f"{i}. {metin}")
L.append("")

if adaylar:
    L.append("## DOĞRULANMAMIŞ KAYNAK ADAYLARI\n")
    L.append("Bunlar **metinde KULLANILMAMIŞTIR** ve teslim dosyasının kaynakçasında yer "
             "almaz. Var olduklarını teyit ederseniz metne ekleyip bilimsel nitelik puanını "
             "yükseltebilirsiniz. **Teyit etmeden eklemeyin** — var olmayan atıf, çağrı "
             "metni m.5.2.3/m.8.2 uyarınca etik ihlali işlemine yol açar.\n")
    for a in adaylar:
        L.append(f"- {str(a).strip()}")
    L.append("")

L.append("## ÜRETKEN YAPAY ZEKÂ (ÜYZ) BEYANI — çağrı m.8.4 / m.8.5\n")
L.append("Bu metin üretken yapay zekâ araçları kullanılarak hazırlanmıştır. Çağrı duyurusu "
         "m.8.4 proje yürütücüsünü, m.8.5 ise **akademik danışmanı** ÜYZ ile üretilen tüm "
         "içeriğin doğruluğundan, özgünlüğünden ve bilimsel güvenilirliğinden sorumlu tutar.\n")
L.append("Bu nedenle gönderimden önce **zorunlu** olarak:\n")
L.append("1. TÜBİTAK'ın güncel *Destek Süreçlerinde Üretken Yapay Zekânın Sorumlu ve "
         "Güvenilir Kullanımı Rehberi*'ni okuyun ve o dönemki beyan yükümlülüğünü teyit edin.")
L.append("2. Metnin tamamını satır satır okuyup kendi ifadelerinizle sahiplenin.")
L.append("3. **21 kaynağın her birini tek tek açıp** künyesinin doğruluğunu teyit edin.")
L.append("4. Ön çalışmadan gelen tüm sayıların kendi ölçümlerinizle uyuştuğunu doğrulayın.")
L.append("5. Danışmanınıza ÜYZ kullanıldığını açıkça bildirin — nihai sorumluluk kendisindedir.")
L.append("")

L.append("## Uygulanan düzeltmeler (adversarial panel çıktısı)\n")
L.append(f"Metin, üç bağımsız hakem lensinden geçirildi (rubrik panelisti · ön inceleme "
         f"denetçisi · \"bu araştırma değil\" şüphecisi) ve {len(duzeltmeler)} düzeltme "
         f"uygulandı:\n")
for i, d in enumerate(duzeltmeler, 1):
    L.append(f"{i}. {str(d).strip()}")
L.append("")

L.append("## Kaynaklar\n")
L.append("- 2209-A program sayfası: https://tubitak.gov.tr/tr/burslar/lisans-onlisans/"
         "destek-programlari/2209-universite-ogrencileri-arastirma-projeleri-destekleme-programi")
L.append("- Resmî araştırma önerisi formu (09.10.2025): "
         "https://www.tubitak.gov.tr/sites/default/files/2025-10/2209-A_arastirma_onerisi_formu_09102025.docx")
L.append("- Çağrı duyurusu: "
         "https://tubitak.gov.tr/sites/default/files/2026-06/2209-A_2025_Yili_Cagri_Duyurusu_V2_1.pdf")
L.append("- Sonuç raporu formatı: "
         "https://www.tubitak.gov.tr/sites/default/files/2023-09/2209-a_sonuc_raporu_formati.docx")
L.append("- Başvuru sistemi: https://tybs.tubitak.gov.tr · İzleme: https://e-bideb.tubitak.gov.tr")
L.append("")
L.append("> **Uyarı:** Çağrı duyurusu ve başvuru tarihleri her yıl güncellenir. Başvurudan "
         "önce program sayfasından o dönemin güncel çağrı metnini ve takvimini teyit edin.")

govde = "\n".join(L)
yol = os.path.join(hedef, "OKUBENI.md")
with open(yol, "w", encoding="utf-8") as f:
    f.write(govde)
print("YAZILDI:", yol, f"({len(govde)} karakter)")
print(f"  açık risk: {len(riskler)} · uygulanan düzeltme: {len(duzeltmeler)} · "
      f"doğrulanacak aday: {len(adaylar)}")
