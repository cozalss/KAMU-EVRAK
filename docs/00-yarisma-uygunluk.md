# 00 — Yarışma Özeti, Takvim ve Uygunluk Kontrol Listesi

> Kaynak: `2026_TEKNOFEST_TYDA_SARTNAME_Birinci_Senaryo_TR`. Bu dosya en kritik
> idari maddeleri (takvim, uygunluk, teslim formatı) içerir — **mimari kadar önemlidir;
> bu kapılar geçilmezse geliştirme aşamasına hiç gelinmez.**

## 1. Yarışma

**Yapay Zeka Dil Ajanları Yarışması (TYDA) — 1. Senaryo: "Kamu Evrak ve Yazışma Süreçleri
için Akıllı Agent Destek Sistemi."** Düzenleyen: Bilişim Vadisi (TEKNOFEST), destek Türksat.
Final: Bilişim Vadisi Kocaeli; ödül töreni TEKNOFEST Şanlıurfa.

## 2. İki zorunlu görev (§6.4)

- **Görev 1 — Evrak Sınıflandırma ve İçerik Analizi:** OCR/metin oku → tür belirle → bilgi
  unsurlarını çıkar → **eksik bilgileri tespit et** → ilgili mevzuat/yazışma kuralı öner → özet.
- **Görev 2 — Resmî Yazı Taslaklama ve Birim Yönlendirme:** üst/cevabi/bilgilendirme/olur
  taslağı → resmî üslup → **doğru birime yönlendir** → kullanıcıyı bilgilendir → eksik bilgi iste.

> §9: Değerlendirme uçtan-uca; **tek görev eksikse sistem tamamlanmamış sayılır.**

## 3. Puanlama (100) (§8-9)

| Kriter | Puan | İçerik |
|---|---|---|
| Yöntem ve Teknik Yaklaşım | 35 | Yöntemlerin derinliği, karmaşıklığı, teknik kurgu |
| Uygulama | 35 | Sınıflandırma doğruluğu, yönlendirme başarımı, özetleme, yazı şablon kalitesi, eksik bilgi tespiti |
| Demo | 15 | Etkili/anlaşılır sunum; **real-time üretim avantaj** |
| Yenilikçilik / Özgünlük / Ticarileşme | 15 | Literatüre göre farklılaşma, ölçeklenebilirlik, sürdürülebilir değer |

## 4. ⚠️ Takvim (Tablo 1) — DİKKAT: 12 Temmuz build deadline DEĞİL

| Aşama | Tarih |
|---|---|
| Başvuru başlangıç | 12 Haziran |
| **Son Başvuru + Ön Değerlendirme Sunumu son teslim** | **12 Temmuz** |
| Ön değerlendirme sonuçları | 17 Temmuz |
| **Teknik Değerlendirme Sınavı (TÜM üyelere zorunlu)** | **21 Temmuz** |
| Finalistlerin açıklanması | 24 Temmuz |
| Kick-off | 27 Temmuz |
| **Çevrimiçi geliştirme süreci** | **27 Temmuz – 26 Ağustos** |
| Final (fiziki, Bilişim Vadisi Kocaeli) | Ağustos |
| TEKNOFEST Şanlıurfa (ödül) | 30 Eylül – 4 Ekim |

**Sonuç:** Asıl ürün geliştirme penceresi **yalnız finalist olunursa** 27 Tmz–26 Ağu'dur.
12 Temmuz'a kadar **iki ön-eleme çıktısı** üretilmeli: (a) başvuru, (b) **Ön Değerlendirme
Sunumu** (proje/mimari/takım özeti + motivasyon — §3.1). 21 Temmuz teknik sınav bireysel
yeterlilik ölçer (NLP/agent/LLM). Bunlar geçilmeden 27 Tmz gelmez.

## 5. ✅ Uygunluk Kontrol Listesi (§5 + s.4) — diskalifiye riski

- [ ] Takım **tam 4 kişi** + 1 kaptan. *(Not: ekip 3 kişiyse +1 üye gerekir.)*
- [ ] Her üye 18+; lise/önlisans/lisans/YL/doktora/açıköğretim/mezun.
- [ ] Her kişi **yalnız bir takımda** (birden fazla başvuru → tümü geçersiz).
- [ ] **TAKP çatısı altındaki Doğal Dil İşleme projesinde aktif görevli** (kişi/danışman/
      akademisyen/öğrencisi) **YOK**. *(Not: kodu TAKP GitHub'a yüklemek bu kapsama girmez —
      karıştırma.)*
- [ ] **Aynı projeyle eşzamanlı başka TEKNOFEST başvurusu YOK.** *(ADALET-AGENT bu veya benzer
      projeyle başka bir yarışmada kullanılıyorsa kamu-evrak ayrı/yeterince farklı olmalı —
      teyit et.)*
- [ ] Son 2 yıl **üst üste** TYDA/Türkçe DİY'de dereceyle ödül alan takım/üye YOK.
- [ ] Önceki yıllarda diskalifiye/etik ihlali YOK.

## 6. Teslim formatı (§7-8) — eksik bırakılırsa puan/eleme

- Kod + veri **açık kaynak lisansla (MIT/Apache/GNU)** **TAKP GitHub**'a (zorunlu); teslim
  edilmezse değerlendirmeye alınmaz.
- Üçüncü-taraf **açık-ağırlık / kısıtlı lisanslı modeller depoya YÜKLENMEZ** → yalnız erişim
  linki + sürüm + lisans metni + kullanım talimatı (`docs/07-model-lisanslari.md`).
- Tüm belgeler **Türkçe**, bilimsel atıf kurallarına uygun.
- **Ön sunum** + **Final sunumu**: PDF **ve** PPTX; final **10 dk sunum + 5 dk soru-cevap**.
- **Demo:** gerçek-zamanlı veya kayıttan; kayıttansa **jüri canlı çalıştırma isteyebilir** →
  yedek plan + internet-kesinti offline path. Demo veri **kaynağı + kullanım hakları** açıkça belirtilir.

## 7. Veri kuralı (§6.5)

**Gerçek kamu verisi YASAK.** Açık kaynak metinler + kurgu evrak örnekleri + sentetik resmî
yazışma taslakları + kamuya açık mevzuat. Veri çeşitliliği artı puan. → `docs/05`.

## 8. Etik (§13.1)

Sistem "Türkçe konuşan tüm bireyler için adil, kapsayıcı, **yanlılıktan arındırılmış**" olmalı
→ eval'e küçük fairness kontrolü ekle (`docs/06`). Sonuç manipülasyonu/jüriyi yanıltma yasak →
kapalı-küme F1 yerine **kaynak-temelli taksonomi + blind gold etiketleme**.
