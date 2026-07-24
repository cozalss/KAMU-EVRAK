# Kurum Sicili — veri sözleşmesi ve güven politikası

> Spec. Uygulama: `backend/core/sicil.py` + `backend/scripts/uret_sicil.py` → `data/teskilat/sicil.json`.
> İlgili: [02-evrak-taksonomi-routing.md](02-evrak-taksonomi-routing.md), `data/teskilat/README.md`,
> `data/teskilat/DOGRULAMA.md`.

## 1. Amaç

Teşkilat korpusu bugün **201 kuruma özel** kayıt taşıyor; Türkiye'de ~3.000+ kamu kurumu var.
Eksik olan **birim bilgisi değil, kurum tanıma**: korpusta dizini olmayan bir kurum adı
(`Sosyal Güvenlik Kurumu`, `UEDAŞ`, `Karayolları Genel Müdürlüğü`) bugün `tur="diger"`e
düşüyor ve yanlış jenerik havuzda (belediye + il müdürlüğü şablonları) aranıyor.

Sicil bu boşluğu kapatır: **her kurum tanınır, kanonik adı ve TÜRÜ bilinir** → doğru tip
şablonu seçilir, kısaltması çözülür. Birim listesi ÜRETMEZ.

**Kullanıcı:** route ajanı (`agents/nodes/route_birim.py` → `birim_ara`) ve kurum kimliği
katmanı (`agents/kurum_kimlik.py`).

**Başarı = kapsam:** bugün tanınmayan kurum tipleri (üst kurul, KİT, ajans, dağıtım şirketi,
taşra müdürlüğü) tanınır hâle gelir; yanlış jenerik havuza düşme oranı ölçülerek azalır.

## 2. Sınır — sicil neyi YAPMAZ (en kritik bölüm)

Sicil **türetilmiş/ikincil** veridir; `DOGRULAMA.md`'deki 6 koşulu sağlamaz. Bu nedenle:

| INV | Değişmez kural | Neden |
|---|---|---|
| **INV-1** | Sicil kaydı `kurum_korpusta_var()` sonucunu **asla** `True` yapmaz. | Otomatik birim havalesi yalnız hash-kilitli, insan-doğrulamalı kaynağa dayanır. |
| **INV-2** | Sicil kaydı `uclu_grounding()`'i **geçemez**; `kaynak_tipi` en iyi ihtimalle `aday`. | Uydurma birim/kurum eşleşmesi üretmesin. |
| **INV-3** | Sicilden gelen hiçbir kayıt `kaynak_guven="resmi_dogrulanmis"` taşımaz. | `seed_teskilat._kaynak_guveni` sözleşmesi bozulmasın. |
| **INV-4** | Sicil **birim adı** ve **görev tanımı** içermez. | Birim uydurma yasağı (CLAUDE.md §1). |
| **INV-5** | Çakışan kısaltma (ASKİ → Ankara/Adana) alias haritasından **düşürülür**. | Belirsiz kısaltma yanlış kuruma havale üretmesin (mevcut `seed_teskilat` guard'ının aynısı). |

Sicilin ürettiği tek davranış değişikliği: **doğru tip şablonuna yönlendirme + kanonik ad/tür
tespiti**. Havale kararı ve grounding zinciri aynen kalır.

## 3. Veri şeması — `data/teskilat/sicil.json` v1

```jsonc
{
  "version": 1,
  "uretim_tarihi": "2026-07-24",
  "girdi_kaynaklari": [
    {"ad": "il_ilce", "url": "https://...", "erisim": "2026-07-24", "sha256": "..."}
  ],
  "kurum_sayisi": 0,
  "tur_dagilimi": {"belediye": 0, "universite": 0},
  "aliaslar": {"uedas": "uludag-elektrik-dagitim-a-s"},
  "cakisan_aliaslar": ["aski", "saski"],
  "kurumlar": [
    {
      "slug": "adana-buyuksehir-belediyesi",   // kurum_kimlik._slug çıktısıyla BİREBİR
      "ad": "Adana Büyükşehir Belediyesi",     // kanonik resmî ad
      "tur": "belediye",                        // §4 kapalı kümesi
      "alt_tur": "buyuksehir",                 // opsiyonel
      "il": "Adana",
      "ilce": "",
      "aliaslar": ["adana-bb"],
      "web": "adana.bel.tr",                   // yalnız kaynakta görülmüşse
      "ust_kurum": "",                          // bağlı olduğu kurumun slug'ı
      "kaynak_guveni": "turetilmis",           // turetilmis | ikincil | resmi
      "kaynak_url": "https://...",
      "erisim": "2026-07-24"
    }
  ]
}
```

**`kaynak_guveni` üç değer alır** ve hiçbiri `resmi_dogrulanmis` değildir (INV-3):

- `resmi` — kayıt resmî bir kaynakta (`.gov.tr`/`.bel.tr`/`.edu.tr`) **adıyla görüldü**.
- `ikincil` — yalnız ikincil kaynakta görüldü (ansiklopedi vb.).
- `turetilmis` — adlandırma mevzuatından üretildi (5393 m.3 "X Belediyesi", 5442 "X Valiliği",
  "X Kaymakamlığı"); kurumun kendi kaynağı görülmedi.

## 4. Tür taksonomisi (kapalı küme)

`bakanlik` · `bagli_kurulus` · `ilgili_kurulus` · `iliskili_kurulus` · `ust_kurul` · `kit` ·
`kalkinma_ajansi` · `cumhurbaskanligi_ofis_kurul` · `valilik` · `kaymakamlik` · `il_mudurlugu` ·
`defterdarlik` · `belediye` · `il_ozel_idare` · `universite` · `bassavcilik` ·
`elektrik_dagitim` · `dogalgaz_dagitim` · `su_kanalizasyon` · `diger`

Kapalı küme dışındaki değer üretim betiğinde **hata** verir (sessizce `diger`'e düşmez).

## 5. Çözümleme önceliği (`teskilat_ara`)

Mevcut sıra korunur, sicil **araya değil sonuna** girer:

1. Korpus kurum-özel dizin (birebir slug) — *doğrulanmış hedef üretebilir*
2. Korpus `@ALIAS` haritası
3. İl-adı-kırpma (`ankara-sosyal-guvenlik-il-mudurlugu` → ulusal kayıt)
4. **[YENİ] Bağlaç normalizasyonu** — `kurum_kimlik._slug` "ve"/"ile" bağlacını atar
   (`aile-sosyal-hizmetler-bakanligi`), korpus dizini ise içerebilir
   (`aile-ve-sosyal-hizmetler-bakanligi`). 1-3 boş dönerse bağlaçsız anahtarla eşleşme
   denenir; iki dizin aynı normale düşerse belirsizlik sayılır ve çözümlenmez.
5. **[YENİ] Sicil: slug/alias → kanonik ad + tür** — *hedef üretmez, yalnız TÜR verir*
6. Tür → jenerik şablon (aday)

Sicil, 6. adımın **doğru şablonu** seçmesini sağlar; 1-4 sonuç verdiyse hiç devreye girmez.

> 4. adım bir HATA DÜZELTMESİDİR: bağlaç uyuşmazlığı yüzünden 15 insan-küratörlü kurum
> (AFAD, Çevre-Şehircilik, Hazine ve Maliye, Gençlik ve Spor…) evraktan erişilemiyordu;
> yalnız elle `@ALIAS` yazılmış olanlar çözümleniyordu (2026-07-24 çapraz doğrulama bulgusu).

## 5b. Girdi kaynakları ve birleştirme kuralları

Üretim beş girdiden beslenir (`data/teskilat/girdi/` + korpusun kendisi):

| Girdi | İçerik | Güven |
|---|---|---|
| `il_ilce.json` | 81 il · 973 ilçe · 30 büyükşehir | ikincil (Vikipedi) → kayıtlar `turetilmis` |
| `universiteler.json` | 205 yükseköğretim kurumu | resmi/ikincil |
| `merkezi_teskilat.json` | bakanlıklar · üst kurullar · taşra şablonları | resmi/ikincil |
| `edevlet_kurumlar.json` | e-Devlet kurum dizini A–Z (~180 kurum) | resmi |
| `data/teskilat/<kurum>/` | insan-küratörlü korpus künyeleri (köprü) | ikincil (INV-3: damga taşınmaz) |

Üç birleştirme kuralı (hepsi test edilmiştir):

1. **Tekilleştirme** — aynı slug + çelişmeyen il (boş il = joker) → tek kayıt, yüksek güven kazanır.
2. **Varyant birleştirme** — aynı kısaltma + ön-ek ilişkili slug (`… Kurumu` / `… Kurumu
   Başkanlığı`) → tek kayıt; düşen varyantın slug'ı alias olur.
3. **Bağlaç varyantı** — `_bagsiz` normali aynı olan slug'lar tek kuruma indirilir; korpus
   dizini olan yazım kanonik kabul edilir.

Gerçek belirsizlik (iki ilde aynı adlı ilçe belediyesi) bu kuralların hiçbirine girmez ve
`belirsiz` işaretlenir → çözümlenmez.

## 6. Komutlar

```bash
uv run python scripts/uret_sicil.py          # sicil.json üret (deterministik)
uv run python scripts/seed_teskilat.py       # birim indeksi (sicilden BAĞIMSIZ)
uv run python scripts/veri_kalite_kapisi.py  # yayın öncesi kapı
uv run pytest tests/ -q                      # 1811 + yeni testler
```

## 7. Test stratejisi

| Seviye | Kapsam |
|---|---|
| Birim | slug üretimi ↔ `kurum_kimlik._slug` birebir aynı; tür kapalı-kümesi; alias çakışma guard'ı |
| **Politika (guard)** | **INV-1..INV-5** — sicilde olan ama korpusta olmayan kurum için `kurum_korpusta_var()` False; `kaynak_guven` asla `resmi_dogrulanmis` değil |
| Regresyon | mevcut route/teşkilat testleri (1811 backend) davranış değiştirmez |
| Eval | kapsam + isabet (N≈50 örneklem, canlı resmî kaynağa karşı) |

## 8. Sınırlar

- **Her zaman:** üretimden sonra `veri_kalite_kapisi.py`; kapalı-küme tür doğrulaması;
  Türkçe karakter korunumu (UTF-8).
- **Önce sor:** yeni `_genel-*` tip şablonu eklemek (birim taksonomisi = kaynak gerektirir);
  mevcut çözümleme sırasını değiştirmek.
- **Asla:** kaynakta görülmemiş kurum adı / DETSİS no / URL yazmak; sicili doğrulanmış kaynak
  gibi sunmak; sicile birim+görev koymak.

## 9. Başarı ölçütleri — ÖLÇÜLEN sonuçlar (2026-07-24)

| # | Ölçüt | Sonuç |
|---|---|---|
| 1 | Sicil üretilir, tür dağılımı raporlanır | **4.066 kurum** (hedef ~3.000+), 449 alias, 94 belirsiz |
| 2 | INV-1..INV-5 guard testleri | **21/21 yeşil** (`tests/test_sicil.py`) |
| 3 | Mevcut backend testleri regresyonsuz | tam paket yeşil |
| 4 | `veri_kalite_kapisi.py` | **GEÇTİ** (oturum başında KALDI — bayat indeks) |
| 5 | İsabet ölçümü | çapraz doğrulama **%99,5** (191/192 korpus kurumu sicilde) |

Ölçüm aracı: `uv run python scripts/eval_sicil_kapsam.py`.

> **Metrik dürüstlüğü:** korpus sicile köprülendiği için çapraz doğrulama artık bağımsız bir
> isabet ölçüsü DEĞİLDİR (kapsam "inşa gereği" yüksektir). Bağımsız sinyal, köprü eklenmeden
> önceki ölçümdür: %57,8 → (bağlaç düzeltmesiyle) %65,1. Kalan fark ad varyantı ve eksik
> kategorilerden geliyordu; köprü bunu kapattı.

## 10. Bilinen boşluklar (açık)

- **Tip şablonu olmayan türler:** `elektrik_dagitim`, `su_kanalizasyon`, `ust_kurul`, `kit`,
  `kalkinma_ajansi`, `cumhurbaskanligi_ofis_kurul`, `diger` — bu kurumlar tanınır ama
  jenerik birim şablonları yoktur (§8 "önce sor": şablon = birim taksonomisi, kaynak ister).
  Çözümlenebilir kurumların **%93,2**'si bir tip şablonuna düşüyor.
- **Belde belediyeleri** (~388) girdi tablosunda yok; belediye kapsamı 1.004 kayıtla sınırlı.
- **`kurum_kimlik` sınırı:** "… A.Ş. Genel Müdürlüğü" adlarında tip kalıbı adın ortasını
  yakalıyor (slug `genel-mudurlugu`). Sicil üretiminde guard'landı (`_sicil_slug`), ancak
  EVRAKTAN gelen aynı biçimli hitap hâlâ yanlış slug üretir; kısaltma alias'ı (TEDAŞ, TEİAŞ…)
  bu durumu pratikte kurtarır. Kalıcı çözümü `kurum_kimlik._AD` düzeyinde ayrı bir iştir.
- **Doğalgaz dağıtım** yalnız 5 şirket (EPDK lisans listesi tamamlanmadı).
