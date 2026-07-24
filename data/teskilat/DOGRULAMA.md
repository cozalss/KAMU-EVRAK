# Korpus Doğrulama Politikası

Bir kayıt otomatik birim havalesine temel olabilmek için aşağıdaki dört koşulu birlikte
sağlar:

1. Kaynak kimliği HTTPS ile erişilen resmî bir alan adıdır: .gov.tr, .bel.tr, .edu.tr
   veya .tsk.tr.
2. Kaynağın türü resmi_yonetmelik, resmi_teskilat, resmi_hizmet ya da resmi_karar
   olarak işaretlenmiştir.
3. Kaydın başlığında @DOGRULAMA: resmi bulunur.
4. Kaynak metni kurum adı, birim adı ve konu ile ilişkili görevi aynı kaynakta açıkça gösterir.
5. İnceleyen kişi, tarih ve yöntem kaynak_manifest.json dosyasına yazılmıştır.
6. Yerel kaynak dosyasının SHA-256 özeti manifestle aynıdır.

Bu koşullardan biri eksik olan eski kayıtlar aday sayılır. Arama sonucunda görünürler, fakat
otomatik havale üretmezler; memur onayı gerekir. Bu kural, veri kümesini büyütürken şablon veya
eski kaynağın gerçek birim gibi sunulmasını engeller.

Korpus güncellemesinde önce resmî kaynağın erişilebilirliği ve birim-görev bağının elle
doğrulanması, sonra kaynak_kaydet.py ile hash-kilitli kaydın ve
uv run python scripts/seed_teskilat.py ile indeksin yenilenmesi gerekir. Son adımda
uv run python scripts/veri_kalite_kapisi.py başarılı olmadan veri yayımlanmaz.
