# Teşkilat Korpusu — kaynak-doğrulamalı birim yönlendirmesi

Route ajanı (`backend/agents/nodes/route_birim.py` → `birim_ara` aracı) bir evrakı
**gerçekte var olan** bir birime yönlendirirken bu korpusu resmî kaynak olarak kullanır.
Amaç: uydurma birim (veya başka kurumun teşkilatı) ASLA çıkmasın — seçilen birim, kurum +
görev tanımı + evrak konusuyla birlikte kaynak zincirinde doğrulanır (üçlü grounding).

## "Her yer" kapsamı — üç katman

1. **Kuruma-özel dizinler** (`<kurum-slug>/`): belirli bir kurumun gerçek müdürlükleri +
   görev tanımları. Doğrulanmış hedef ÜRETİR. Ör. `yenimahalle-belediyesi/`.
2. **Kurum-tipi jenerik şablonlar** (`_genel-*`): kuruma-özel dizin yoksa TİP'e göre aday
   üretir (`belediye`→`_genel-belediye`, `valilik`/`kaymakamlik`→`_genel-il-mudurlukleri`).
   Müdürlük taksonomisi ülke genelinde yasa ile aynı (5393 + Norm Kadro; 3152 taşra) →
   yapısal olarak HER belediye/valilik kapsanır. **Yalnız aday/sorgu genişletme; tek başına
   doğrulanmış hedef DEĞİL** (route ajanı kuruma-özel kaynak yoksa `insan_onayi_gerekli`).
3. **Web adapter** (`ROUTE_WEB_YEDEK=1`): korpusta olmayan HER kurum için canlı resmî-kaynak
   araması. Asıl "her yer" motoru; offline korpus CI/mock için deterministik omurga.

## Yeni kurum ekleme (kod değişikliği YOK)

`data/teskilat/<kurum-slug>/birimler.txt` oluştur (slug = `kurum_kimlik._slug` çıktısı, ör.
`istanbul-buyuksehir-belediyesi`), sonra `uv run python scripts/seed_teskilat.py`.

## Dosya formatı

```
@KURUM: <kanonik ad>
@BELGE: <kaynak belge başlığı>
@KAYNAK_KIMLIK: <yerel belge kimliği veya resmî URL>
@ERISIM: <YYYY-AA-GG>
@KAYNAK_TURU: resmi_yonetmelik | resmi_teskilat | resmi_hizmet | resmi_karar
@DOGRULAMA: resmi

BİRİM: <birim adı>
GÖREV: <görev tanımı — anahtar-kelime yoğun, tek paragraf>
```

Görev tanımları kamuya açık mevzuat/görev-çalışma yönetmeliklerinden alınır (şartname §6.5
uyumlu; mevcut `data/mevzuat/` korpusu gibi). Uydurma madde/URL yazma — doğrulanmamışsa yerel
belge kimliği kullan.
