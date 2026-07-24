# Guvenilir Veri Akisi

Sistem korpus buyudukce retrieval kapsamini genisletir; fakat yeni veri kendiliginden
guvenilir sayilmaz. Iki ayri katman vardir:

- `aday`: Aramada gorunebilir ve memura inceleme onerisi olabilir. Otomatik havale veya
  LLM mevzuat kaniti olamaz.
- `resmi_dogrulanmis`: Resmi HTTPS kaynak, insan incelemesi, dogrulama tarihi/yontemi ve
  yerel dosya SHA-256 ozeti manifestte birlikte kayitlidir.

## Kaynak Secimi

Mevzuatta oncelik `mevzuat.gov.tr` ve `resmigazete.gov.tr` uzerindeki cari resmi
metindir. Teskilatta kurumun kendi resmi teskilat, gorev yonetmeligi veya hizmet
sayfasi kullanilir. Arama motoru ozeti, LLM cevabi, blog, haber veya ikincil hukuk
sitesi tek basina dogrulama kaynagi degildir.

## Ekleme Akisi

1. Kaynak dosyasini ilgili dizine ekleyin.
2. Resmi sayfayi acip her birim-gorev bagini veya her madde metnini elle karsilastirin.
3. Supheli kisimlari duzeltin. `[DOGRULA: ...]` kalan dosya dogrulanmis kaydedilemez.
4. Inceleme kaydini hash-kilitli manifeste alin:

```powershell
cd backend
uv run python scripts/kaynak_kaydet.py mevzuat ..\data\mevzuat\<dosya>.txt `
  --kaynak-turu kanun `
  --dogrulayan "Ad Soyad / Birim" `
  --dogrulama-yontemi "mevzuat.gov.tr cari PDF ile madde madde karsilastirma"
```

Teskilat dosyalarinda kaynak URL ve tur basliktan okunabilir:

```powershell
uv run python scripts/kaynak_kaydet.py teskilat ..\data\teskilat\<kurum>\<dosya>.txt `
  --dogrulayan "Ad Soyad / Birim" `
  --dogrulama-yontemi "kurumun resmi gorev sayfasi ile birim-gorev karsilastirma"
```

5. Indeksleri atomik olarak yenileyin:

```powershell
uv run python scripts/seed_mevzuat.py
uv run python scripts/seed_teskilat.py
```

6. Yayin oncesi kalite kapisini ve regresyon testlerini calistirin:

```powershell
uv run python scripts/veri_kalite_kapisi.py
uv run pytest tests/test_mevzuat_kanit.py tests/test_teskilat_kaynak_guveni.py
```

Indeks okuyuculari atomik dosya degisimini calisma aninda algilar; servis yeniden
baslatilmak zorunda degildir.

## Butunluk Kurali

Manifestteki dosya sonradan bir karakter bile degisirse SHA-256 eslesmez. Kayit otomatik
olarak `aday` durumuna duser. Degisiklik resmi kaynakla yeniden incelenip manifest kaydi
yenilenmeden LLM'e kanit veya otomatik havale temeli olamaz.

## Olcum

Korpus buyutmek tek basina dogruluk garantisi degildir. Her degisiklikten sonra:

- mevzuat retrieval icin `python -m eval.retrieval_eval`,
- birim yonlendirme icin kuruma ve konuya ozel altin testler,
- kalite kapisi raporundaki dogrulanmis/adayi sayilari

birlikte izlenir. Yeni veri mevcut altin sette gerileme yaratirsa yayinlanmaz.
