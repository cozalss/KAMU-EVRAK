"""Hakem bulgularini icerik.json'a BILDIRIMSEL ve DOGRULANABILIR bicimde uygular.

Neden bu betik var: klasordeki tek-kullanimlik duzeltme betikleri (son_uc, v5/v6_birlestir,
numara_kapat ...) eslesme basarisiz oldugunda cogu zaman uyari basip DEVAM ediyordu. Bir
duzeltme sessizce uygulanmayinca belge, "uygulandi" sanilan bir kusurla teslime gidiyor.
Burada sozlesme tersine cevrildi:

  * her duzeltme (alan, eski, yeni) uclusudur ve ESKI metin birebir bulunmak ZORUNDADIR;
  * bulunamazsa ya da birden cok kez geciyorsa betik HATA ile durur, dosyaya DOKUNMAZ;
  * yazma atomiktir (gecici dosya + os.replace), boylece yarim dosya asla olusmaz;
  * --kuru-calistir ile hicbir sey yazmadan tum eslesmeler denetlenebilir.

TABAN DOSYA — bu betik `icerik.taban.json` uzerinde calisir, `icerik.json` uzerinde
DEGIL. Taban, duzeltmelerin uygulandigi baslangic surumudur ve betikle AYNI klasorde
tutulur. Neden: bir denetim, tabanin yalnizca gecici bir klasorde durdugunu ve
`git checkout -- uretim/icerik.json` calistirilmasi halinde nihai metnin GERI
DONDURULEMEZ bicimde kaybolacagini gosterdi. Taban artik depoda.

Kullanim:
    python duzeltmeler_uygula.py icerik.taban.json --cikti icerik.json --kuru-calistir
    python duzeltmeler_uygula.py icerik.taban.json --cikti icerik.json
Tek argumanla cagrilirsa dosya YERINDE donusturulur (eski davranis).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from dataclasses import dataclass

sys.stdout.reconfigure(encoding="utf-8")


@dataclass(frozen=True)
class Duzeltme:
    """Tek bir metin degisikligi. `alan` bir metin alani ya da JSON blogu olabilir."""
    kod: str            # hakem bulgusunun kodu (izlenebilirlik icin)
    alan: str
    eski: str
    yeni: str
    gerekce: str


# ---------------------------------------------------------------------------
# BULGULAR: ajan denetiminde bulunup ana oturumda kaynaktan DOGRULANAN celiskiler.
# Kod sutunu, bulgunun hangi denetimden geldigini gosterir.
# ---------------------------------------------------------------------------
DUZELTMELER: tuple[Duzeltme, ...] = (

    # --- Ozet: "tamami sentetik" iddiasi 2.2'deki uc katmanli veri modelini yalanliyor.
    #     Ozetin kendisi iki paragraf once "gercek taranmis belgeler" diyor.
    Duzeltme(
        kod="T-ozet-1",
        alan="ozet",
        eski="Ölçüm birimi belge ve belgeden çıkarılan iddiadır; kullanılan evrakın "
             "tamamı sentetiktir ve kişisel veri işlenmez.",
        yeni="Ölçüm birimi belge ve belgeden çıkarılan iddiadır. D1-D3 ana deneyleri ile "
             "replikasyon sınaması tümüyle sentetik belgeler üzerinde yürütülür; H1 ve "
             "H5'in genellenebilirliği İP5'te kamuya açık ve kişisel veri içermeyen 60 "
             "gerçek belgede ön-kayıtlı dış geçerlilik analiziyle sınanır. Hiçbir belge "
             "katmanında kişisel veri işlenmez.",
        gerekce="2.2 üç katman tanımlıyor: (2) ve (3) gerçek yayımlanmış belge. "
                "AYRICA E-5'ten sonra 'hipotez sınamasının tamamı sentetik' de yanlış "
                "oldu: H1 ve H5 60 GERÇEK belgede onaylayıcı sınanıyor. İkisi birden "
                "kapatıldı.",
    ),

    # --- Ozet: n=240 H2 icin guc olcutunu KARSILAMIYOR (metnin kendisi n≈860 diyor).
    Duzeltme(
        kod="T-ozet-2",
        alan="ozet",
        eski="Örneklem büyüklükleri güç simülasyonuyla belirlenmiştir: ana küme 240 "
             "belge, replikasyon kümesi 120 belge, kör değerlendirmeye açılacak iddia "
             "sayısı 300'dür.",
        yeni="Örneklem büyüklükleri güç simülasyonuyla değerlendirilmiştir: ana küme 240 "
             "belge, replikasyon kümesi 120 belge, kör değerlendirmeye açılacak iddia "
             "sayısı 300'dür. Büyüklük, etkileşim hipotezi dışında yeterlidir; orada "
             "sınır saptanabilir en küçük etkileşim olarak ilan edilir.",
        gerekce="2.6: '0,80 güce n≈860 gerekir, ulaşılamaz'. 'Belirlenmiştir' bu "
                "hipotez için doğru değil; kaynak kısıtıyla sabitlenmiş.",
    ),

    # --- 2.1: maliyet pilotu bes yerde IP2'nin ilk haftasinda, burada IP1'de.
    Duzeltme(
        kod="T-2",
        alan="bolum_2",
        eski="Kaynak dayanıklılığı: İP1'deki 20 belgelik pilot, belge başına "
             "gerçekleşen maliyeti ölçer ve bütçe tavanını sabitler.",
        yeni="Kaynak dayanıklılığı: İP2'nin ilk haftasındaki 20 belgelik pilot, belge "
             "başına gerçekleşen maliyeti ölçer ve bütçe tavanını sabitler.",
        gerekce="Bütçe gerekçesi, İP2 faaliyetleri, riskler ve 1.2 hepsi İP2 diyor. "
                "Tek aykırı yer burasıydı.",
    ),

    # --- 2.1: korunan cekirdek H5'i kapsiyor, ama H5'in bagimsiz degiskeni (esik
    #     supurmesi) azaltma sirasinin 2. maddesinde daraltiliyor.
    Duzeltme(
        kod="T-6",
        alan="bolum_2",
        eski="Korunan çekirdek: D1'in 240 x 4 x 3 gövdesi ile D2'nin 300 iddialık kör "
             "değerlendirmesi hiçbir koşulda küçültülmez; H1-H5 bu iki gövdeye dayanır.",
        yeni="Korunan çekirdek: D1'in 240 x 4 x 3 gövdesi ile D2'nin 300 iddialık kör "
             "değerlendirmesi hiçbir koşulda küçültülmez; H1-H4 bu iki gövdeye dayanır. "
             "Azaltma H5'in eşik süpürmesini seyreltebilir; açık/kapalı birincil "
             "kontrastı her koşulda korunur.",
        gerekce="H5 D3'e bağlı ve azaltma sırası (2) onun süpürmesini 9'dan 5 noktaya "
                "indiriyor; aynı hipotez hem dokunulmaz hem daraltılabilir olamaz.",
    ),

    # --- 2.6 tablosu: H4'un birincil karar kurali 2.5 ile celisiyor.
    Duzeltme(
        kod="T-3",
        alan="bolum_2",
        eski="H4 | D2 | (ölçüm geçerliliği) | Otomatik-uzman uyumu | Kümelenmiş "
             "önyüklemeli Krippendorff alfa; alt sınır > 0,75 | İP3",
        yeni="H4 | D2 | (ölçüm geçerliliği) | Otomatik-uzman uyumu | Kümelenmiş "
             "önyüklemeli normalize uyum oranı; %95 alt sınır > 0,75 (Krippendorff alfa "
             "alt sınırı 0,67 zayıflatma tavanıdır) | İP3",
        gerekce="2.5: 'birincil ölçüt, normalize uyum oranının %95 alt sınırının 0,75'i "
                "aşmasıdır'. Tablo bu rolü yanlışlıkla alfaya veriyordu.",
    ),

    # --- 2.6 tablosu: H5 yanlis-veto testi tabloda TOST, hemen altindaki metinde
    #     tek yonlu asmazlik. Ikisi farkli hipotez ve farkli alfa harcamasi.
    Duzeltme(
        kod="T-4",
        alan="bolum_2",
        eski="H5 | D3 | Kapı (açık/kapalı; 9 eşik) | Dayanaksızlık oranı; yanlış-veto | "
             "Kesin McNemar; yanlış-vetoda TOST (delta = 0,05) | İP4",
        yeni="H5 | D3 | Kapı (açık/kapalı; 9 eşik) | Dayanaksızlık oranı; yanlış-veto | "
             "Kesin McNemar; yanlış-vetoda tek yönlü aşmazlık (sınır 0,05) | İP4",
        gerekce="Aynı bölümün düz metni 'tek yönlü aşmazlık sınamasıdır' diyor; "
                "tablo eski TOST kurgusundan kalmıştı.",
    ),

    # --- 2.6 duyarlilik: H6'nin bagimli degiskeni sayim; Cochran Q yalniz 0/1 icin
    #     tanimli. B3'teki "ikililestirmede" niteleyicisi yeniden yazimda dusmus.
    Duzeltme(
        kod="T-10",
        alan="bolum_2",
        eski="H6'da Cochran Q ve karma Poisson",
        yeni="H6'da ikilileştirilmiş bulgu göstergesinde Cochran Q, sayımda karma Poisson",
        gerekce="Cochran Q ikili sonuç testi; H6'nın DV'si sayım. Niteleyici olmadan "
                "test-değişken uyumsuzluğu görünüyordu.",
    ),

    # --- 2.3: (10) hicbir kumeye konmamis, ama H6'nin BIRINCIL sonuc olcusu.
    Duzeltme(
        kod="T-12",
        alan="bolum_2",
        eski="Tamamı otomatik defterlenir; (1)-(4) birincil, (5)-(9) ikincildir.",
        yeni="Tamamı otomatik defterlenir; (1)-(4) ve (10) birincil, (5)-(9) ikincildir.",
        gerekce="(10) H6'nın birincil sonuç ölçüsü; sınıflamada yokken ön-kayıt "
                "kilidinde tanımsız değişken kalıyordu.",
    ),

    # --- 2.6 guc analizi: H4'un gucu analiz planinda kullanilmayan bir istatistikle
    #     (kappa) ve kullanilmayan bir esikle (0,60) hesaplanmis.
    Duzeltme(
        kod="T-13",
        alan="bolum_2",
        eski="H4 (H0: kappa <= 0,60'a karşı 0,80, taban yaygınlık 0,25): DEFF = 1,80 ile "
             "etkin örneklem 167, güç 0,998; planlanan 300 iddia yeterlidir.",
        yeni="H4 (yaklaşık güç vekili olarak kappa; H0: kappa <= 0,60'a karşı 0,80, taban "
             "yaygınlık 0,25): DEFF = 1,80 ile etkin örneklem 167, güç 0,998; birincil "
             "karar kuralı normalize uyum oranının alt sınırıdır.",
        gerekce="Raporlanan güç, analiz planında kullanılmayan bir ölçüte aitti; "
                "vekil olduğu yazılmadan sayı yanıltıcıydı.",
    ),

    # --- riskler: tedbir, hiyerarsik kapi yapisinin izin vermedigi bir bagimsizlik
    #     vaat ediyor (Kapi 3 = H4, Kapi 4 = H5; H4 kararsizsa Kapi 4 acilmaz).
    Duzeltme(
        kod="T-8",
        alan="riskler",
        eski="İP4'ün kapısı H4'ün eşiğine değil altın kümenin tamamlanmasına bağlıdır.",
        yeni="İP4'ün koşumları H4'ün sonucundan bağımsız yürür; ancak H4 kararsız ilan "
             "edilirse H5 onaylayıcı değil keşifsel raporlanır.",
        gerekce="Seri kapıda H4 kararsızsa Kapı 4 açılamaz; tedbirin vaat ettiği "
                "bağımsızlık analiz planında yoktu.",
    ),

    # --- takvim IP3: "bes iddia sinifinda sinanmasi" bes test demek; aile 11 testte
    #     kilitli ve Kapi 3 tek testli.
    Duzeltme(
        kod="T-14",
        alan="calisma_takvimi",
        eski="H4'ün beş iddia sınıfında sınanması.",
        yeni="H4'ün sınanması; beş iddia sınıfı için duyarlılık-özgüllüğün betimleyici "
             "raporlanması.",
        gerekce="1.2 Hedef 4 zaten betimleyici diyor; takvim ifadesi aile büyüklüğünü "
                "bozuyordu.",
    ),

    # --- butce: 6.800 x 0,63 = 4.284 TL, kalem 4.300 TL. Iceride 1.440 ek kosumluk
    #     (907 TL) pay YOK; 16 TL bosluk var.
    Duzeltme(
        kod="T-1",
        alan="butce",
        eski="Kalemin içinde, H2 genişletme koşulu devreye girerse gereken 1.440 ek "
             "koşum için beklenmedik durum payı ayrılmıştır.",
        yeni="Kalemde ayrı bir pay tutulmaz: 6.800 koşum bu tavanı doldurur. H2 "
             "genişletme koşulu devreye girerse gereken 1.440 ek koşum, azaltma "
             "sırasının ilk üç maddesiyle serbest kalan 1.320 koşum ve premium katman "
             "payının daraltılmasıyla aynı tavan içinde karşılanır.",
        gerekce="Aritmetik: 6.800 x 0,63 = 4.284; kalem 4.300. Ek 1.440 koşum 907 TL "
                "eder, yer yok. Pay iddiası karşılıksızdı.",
    ),

    # --- yaygin etki: 120 belgelik replikasyon kumesi 3. ayda muhurlenip 10-12. aya
    #     kadar acilmayacak, ama 4. ayda acik arsivde yayimlanacagi ilan edilmis.
    Duzeltme(
        kod="T-5a",
        alan="yaygin_etki",
        eski="- Açık erişimli değerlendirme veri tabanı - 360 belge (240 ana + 120 "
             "replikasyon) - 4. ayda ilk, 12. ayda nihai sürüm.",
        yeni="- Açık erişimli değerlendirme veri tabanı - 4. ayda 240 belgelik ana küme, "
             "12. ayda 120 belgelik replikasyon kümesi eklenerek 360 belge.",
        gerekce="Mühür 4. ayda kırılsaydı replikasyon sınaması ve 'ana kümede hiç "
                "kullanılmamış' koşulu anlamını yitirirdi.",
    ),
    Duzeltme(
        kod="T-5b",
        alan="yaygin_etki",
        eski="Kabul ölçütü: 360 belgenin iki bağımsız kaynakta etiketlenip kalıcı "
             "tanımlayıcılı açık arşive yüklenmesi.",
        yeni="Kabul ölçütü: 360 belgenin iki bağımsız kaynakta etiketlenmesi ve 12. ayda "
             "kalıcı tanımlayıcılı açık arşive yüklenmiş olması.",
        gerekce="Kabul ölçütü de mühür takvimine bağlanmalı.",
    ),

    # --- 5. bolum: "kisisel veri toplanmaz/kaydedilmez/saklanmaz" beyani, 2.6'daki
    #     "asgari uc yillik deneyim yazili taahhutle belgelenir" ile celisiyor.
    #     Etik muafiyeti tam da bu beyana dayandigi icin kritik.
    Duzeltme(
        kod="T-16",
        alan="bolum_5_diger",
        eski="Değerlendiriciler hakkında kişisel veri toplanmaz, kaydedilmez ve "
             "saklanmaz; mesleki deneyim, yaş, cinsiyet, öğrenim ya da kurum bilgisi "
             "kontrol değişkeni olarak kullanılmaz.",
        yeni="Değerlendiricilere ilişkin hiçbir kişisel veri araştırma veri kümesine "
             "girmez; yaş, cinsiyet, öğrenim ve kurum bilgisi hiç toplanmaz. Mesleki "
             "deneyim yalnız hizmet alımı sözleşmesinin ekinde teyit edilir, araştırma "
             "verisi olarak kaydedilmez ve hiçbir çözümlemede kullanılmaz.",
        gerekce="Nitelik taahhüdü bir kayıttır; 'hiç saklanmaz' beyanı onu "
                "karşılamıyordu. Muafiyet gerekçesi bu ayrımla korunuyor.",
    ),

    # --- olanaklar: butcede uc ayri "Hizmet alimi" kalemi var.
    Duzeltme(
        kod="T-18",
        alan="olanaklar",
        eski="Ekip dışından iki kalemde hizmet satın alınacaktır: kör değerlendirmenin "
             "ücretli değerlendiricisi ve yeniden üretim paketinin bağımsız "
             "koşturulması.",
        yeni="Ekip dışından üç kalemde hizmet satın alınacaktır: kör değerlendirmenin "
             "ücretli değerlendiricisi, bulut model erişimi ve yeniden üretim paketinin "
             "bağımsız koşturulması.",
        gerekce="Bütçedeki en büyük kalem (bulut erişimi) de 'Hizmet alımı' sınıfında; "
                "sayım tabloyla uyuşmuyordu.",
    ),

    # =======================================================================
    # 2. DALGA — KAPI DIZILIMI.
    # Kusur: gucu onceden 0,314 ilan edilmis ve "sonucsuz raporlanir" denmis H2,
    # SERI kapi zincirinin 2. halkasindaydi. Kapi ancak onceki kapinin TUM
    # birincil testleri karar kuralini karsilarsa acildigi icin H4, H5, H6 ve H8
    # onaylayici olarak hic sinanamayabilirdi: cekirdek program tek zayif testin
    # arkasinda kilitliydi.
    # Bagimsiz sceptic incelemesi (bu oturum) uc seyi olctu:
    #   - Seri gatekeeping'de FWER kaniti SIRALAMADAN BAGIMSIZ; 0,05 aynen korunur.
    #   - Kapi 3'un acilma olasiligi ~0,17 -> ~0,54; beklenen onaylayici test
    #     sayisi 5,69 -> 7,26 (+%28). Bedeli yalniz H8 oder (alfa 0,05 -> 0,025).
    #   - Alternatifler (H2'yi aileden cikarma, Kapi 6, agirlikli Holm, alfa geri
    #     kazanimi) ya daha kotu ya istatistiksel olarak gecersiz. Bu tek cozum.
    # Aile 11 testte, kapi sayisi 5'te KORUNUR: boylece "on bir test" / "bes kapi"
    # diyen sekiz ayri yer bozulmaz.
    # =======================================================================
    Duzeltme(
        kod="K-1",
        alan="bolum_2",
        eski="Kapı 2 = H2, H3, H7; Kapı 3 = H4; Kapı 4 = H5 (2 test); Kapı 5 = H6, H8.",
        yeni="Kapı 2 = H3, H7 (2 test); Kapı 3 = H4; Kapı 4 = H5 (2 test); "
             "Kapı 5 = H6, H8, H2 (3 test).",
        gerekce="H2 zincirin sonuna alınır; hiçbir testi engellemez. Aile 11 test, "
                "kapı 5 olarak korunur.",
    ),
    Duzeltme(
        kod="K-2",
        alan="bolum_2",
        eski="ailesel hata on bir testte 0,05'te tutulur, en katı basamak üç testli "
             "Kapı 1'dedir (alfa = 0,0167).",
        yeni="ailesel hata on bir testte 0,05'te tutulur, en katı basamak üç testli "
             "Kapı 1 ve Kapı 5'tedir (alfa = 0,0167). Kapı sırası veri görülmeden, "
             "kilit öncesinde ve yalnız simülasyona bakılarak belirlenmiştir: kapının "
             "işlevi zinciri durdurmaktır, durdurma ise ancak reddedilmeme "
             "yorumlanabildiğinde anlamlıdır; H2'nin reddedilmemesi sonuçsuz ilan "
             "edildiği için H2 bekçi olamaz, son kapıdadır ve hiçbir testi engellemez. "
             "Kapı 5 açılmasa bile H2'nin etkileşim kestirimi, %95 aralığı ve 0,19 "
             "eşiğine göre yorumu ikincil analizlerde düzeltmesiz raporlanır.",
        gerekce="Kapı 2 de üç testliydi, iddia zaten yanlıştı. Sıralama gerekçesi "
                "yazılmazsa değişiklik 'güçsüz testi gizleme' diye okunur; ikinci "
                "cümle olmadan §2.6 ile riskler[9] çelişir.",
    ),

    # --- B5 (istatistik hakemi): "gereken n bu sinirlarla hesaplanip BURADA
    #     raporlanir" denmisti; H5 ve H8 icin hicbir sayi yoktu. Bu oturumda ayni
    #     Monte Carlo tohumuyla (20260808) olculdu: guc_h5_h8.py / guc_h5_h8.json.
    Duzeltme(
        kod="B5",
        alan="bolum_2",
        # Capa, kendisinden SONRAKI paragraf basini da kapsar. Yoksa yeni metin ayni
        # cumleyle basladigi icin capa uygulandiktan sonra da eslesir ve ikinci
        # kosum eklemeyi tekrarlar (idempotens sinavi bunu yakaladi).
        eski="H7 (küme dışı alt grup etkileşimi): 48 belgelik alt kümede güç 0,870."
             "\n\nH2'nin gücü sınırlıdır",
        yeni="H7 (küme dışı alt grup etkileşimi, Kapı 2'nin Holm düzeyinde): 48 "
             "belgelik alt kümede güç 0,779, %30'luk alt kümede 0,881; alfa "
             "bölüştürmesinin bedeli budur ve sınır ön-kayıtta ilan edilir. "
             "H5 (yanlış-veto aşmazlığı, sınır 0,05): taban oran 0,03-0,10 "
             "süpürüldüğünde gereken n 100-240, ana kümeden gelen 240 iddiada güç "
             "0,812-0,994. "
             "H8 (TOST, log ölçekte ±%20): eşleşmiş log farkın standart sapması "
             "0,15-0,45 süpürüldüğünde gereken n 20-60; n = 240'ta ve Kapı 5'in en katı "
             "basamağında güç 1,00."
             "\n\nH2'nin gücü sınırlıdır",
        gerekce="Aşmazlık/eşdeğerlik sınırları ilan edilmiş ama gereken n hiç "
                "verilmemişti. Ayrıca K-1 sonrası H8'in alfası 0,025'e iniyor; "
                "ölçüm bunun gücü kırmadığını gösteriyor.",
    ),

    # --- Sayfa butcesi SIFIR. Yukaridaki eklemelerin karsiligi buradan cikar:
    #     bu paragraf riskler[9] ile ~%80 birebir tekrar (860 belge / n=480 /
    #     1.440 kosum / "karar veriye degil, kilit oncesi, tarih damgali").
    #     Ayrica "İP1 pilot olcumu" ifadesi T-2 ile celisiyordu: pilot artik İP2'de.
    Duzeltme(
        kod="S-1",
        alan="bolum_2",
        eski="H2 için ön-kayıtlı genişletme koşulu: H2 yalnız iki mimari kolunu (b2 ve "
             "c) üç bozulma seviyesiyle, altı koşulda kullanır. İP1'de yeniden koşulan "
             "tabanda etkileşim eğilimi 0,19'un altında fakat sıfırdan uzak görünürse, "
             "alt desen 240 ek sentetik belgeyle n = 480'e çıkarılır; bu 1.440 ek model "
             "çağrısı demektir ve bütçenin beklenmedik durum payından karşılanır. "
             "Genişletmeyle saptanabilir en küçük etkileşim 0,19'dan 0,13'e iner "
             "(ölçülmüştür). H2'nin tek geçerli planı budur; karar veriye değil İP1 "
             "pilot ölçümüne bakılarak ve ön-kayıt kilidinden önce verilir, uygulanan "
             "seçenek tarih damgalıdır.",
        yeni="H2 için ön-kayıtlı genişletme koşulu: İP1'de yeniden koşulan tabanda "
             "eğilim 0,19'un altında fakat sıfırdan uzak görünürse alt desen 240 ek "
             "sentetik belgeyle n = 480'e çıkarılır (1.440 ek koşum) ve saptanabilir en "
             "küçük etkileşim 0,13'e iner (ölçülmüştür). H2'nin tek geçerli planı budur; "
             "karar veriye değil bu taban ölçüme bakılarak, kilit öncesinde verilir ve "
             "tarih damgalıdır.",
        gerekce="Tekrar sıkıştırıldı (~47 kelime kazanç) ve T-2 ile tutarlı hâle "
                "getirildi: maliyet pilotu İP2'de, taban yeniden koşumu İP1'de.",
    ),
    Duzeltme(
        kod="S-2",
        alan="bolum_2",
        eski=" Bu eşiğin sayısal ilanı başlı başına alana katkıdır.",
        yeni="",
        gerekce="Öz-övgü cümlesi; bilgi taşımıyor ve panelist değerlendirmesini "
                "başvurunun kendisi yapamaz. Sayfa bütçesine katkı.",
    ),

    # =======================================================================
    # 3. DALGA — SAYFA BUTCESI + IKINCI DALGANIN YANKILARI.
    # 2. dalgadan sonra belge 21 sayfaya cikti (sinir 20). Kesilecek yer
    # tahminle degil OLCUMLE secildi: bolumler arasi cumle benzerligi taranip
    # %62 uzerindeki 10 cift bulundu. Asagidakiler gercek tekrarlar; biri
    # (etik cumlesi) iki bolumde BIREBIR ayni.
    # Ayrica K-1/T-6 bir yanki birakmisti: bolum_3 hala "H1-H5" diyordu.
    # =======================================================================
    Duzeltme(
        kod="S-3",
        alan="bolum_2",
        eski="(3) Değerlendiriciler hakkında veri toplanmadığı için çalışmanın insan "
             "katılımcılı araştırma tanımına girmediği değerlendirilmektedir; ancak bu "
             "değerlendirme başvuruya değil kurumun yetkili etik kuruluna aittir. Proje "
             "başlamadan ve hiçbir değerlendirme verisi toplanmadan önce ilgili etik "
             "kuruldan resmî görüş alınacak, kurulun kararına göre onay ya da muafiyet "
             "belgesi temin edilerek dosyaya eklenecektir.",
        yeni="(3) Kurul kararı alınmadan hiçbir değerlendirme verisi toplanmaz; resmî "
             "görüş proje başlamadan alınır (5. bölüm).",
        gerekce="İkinci cümle 5. bölümdeki cümlenin BİREBİR aynısıydı (benzerlik 1,00, "
                "26 kelime). Karar kurula bırakma sözleşmesi ('yetkili etik kurul') "
                "korunuyor, tekrar gidiyor; kalan ifade de iki satır kısaltıldı.",
    ),
    Duzeltme(
        kod="S-4",
        alan="riskler",
        eski="Güç varsayılmamış, başvuru öncesinde simülasyonla ölçülmüş ve sınır "
             "gizlenmeden ilan edilmiştir. 0,80 güç için gereken yaklaşık 860 belge on "
             "iki ayda ve bu bütçede ulaşılamaz. Bu nedenle H2 için saptanabilir en "
             "küçük etkileşim ön-kayıtta 0,19 olarak ilan edilir; altında kalan bir "
             "gözlem 'anlamlı fark yoktur' diye değil, güç sınırlı ve sonuçsuz olarak, "
             "etki büyüklüğü ve %95 aralığıyla raporlanır. İP1'de yeniden koşulan "
             "tabanda eğilim 0,19'un altında fakat sıfırdan uzak görünürse H2'nin alt "
             "deseni 240 ek sentetik belgeyle n = 480'e çıkarılır; 1.440 ek koşum "
             "beklenmedik durum payından karşılanır ve saptanabilir en küçük etkileşim "
             "0,13'e iner. Karar veriye değil İP1 pilotuna bakılarak, ön-kayıt "
             "kilidinden önce ve tarih damgalı verilir. Bozulma faktörü her koşulda üç "
             "seviyelidir; onaylayıcı ailenin büyüklüğü ve kapı yapısı değişmez.",
        yeni="Güç varsayılmamış, başvuru öncesinde simülasyonla ölçülmüş ve sınır "
             "gizlenmeden ilan edilmiştir: saptanabilir en küçük etkileşim ön-kayıtta "
             "0,19'dur, altında kalan gözlem 'anlamlı fark yoktur' diye değil güç "
             "sınırlı ve sonuçsuz olarak raporlanır. Ön-kayıtlı genişletme koşulu, "
             "tetikleyicisi ve maliyeti 2.6'da tanımlıdır. H2 onaylayıcı ailenin son "
             "kapısındadır; sonuçsuz kalması diğer hipotezlerin sınanmasını engellemez.",
        gerekce="2.6 ile %75 örtüşüyordu (120 kelime). Ayrıca iki yeni düzeltmeyle "
                "çelişiyordu: 'İP1 pilotu' (pilot artık İP2'de) ve 'beklenmedik durum "
                "payı' (T-1: ayrı pay yok). Son cümle K-1'i risk tablosuna işler.",
    ),
    Duzeltme(
        kod="S-5",
        alan="bolum_3_yonetim_girisi",
        eski="Çekirdek katman vazgeçilmezdir; D1'in 240 x 4 x 3 gövdesi ile D2'nin 300 "
             "iddialık kör değerlendirmesinden oluşur, H1-H5 bu iki gövdeye dayanır ve "
             "hiçbir koşulda küçültülmez.",
        yeni="Çekirdek katman vazgeçilmezdir ve hiçbir koşulda küçültülmez; kapsamı "
             "2.1'de tanımlıdır.",
        gerekce="T-6 çekirdeği H1-H4'e daralttı; burada H1-H5 kalmıştı — kendi "
                "düzeltmemin yankısı. Kapsam artık tek yerde (2.1) tanımlı.",
    ),
    Duzeltme(
        kod="S-6",
        alan="bolum_5_diger",
        eski="Bulut erişim kalemi tahminî tavandır; İP2 başındaki 20 belgelik pilotta "
             "ölçülen belge başına maliyete bağlanır ve yalnız-ekleme harcama "
             "defteriyle sınırlanır.",
        yeni="Bulut erişim kalemi tahminî tavandır; bütçe gerekçesinde tanımlanan pilot "
             "ölçüme bağlanır.",
        gerekce="Bütçe kaleminin açıklamasıyla %75 örtüşüyordu; ayrıntı orada duruyor.",
    ),
    Duzeltme(
        kod="T-15",
        alan="riskler",
        eski="H1'in birincil karşılaştırması iki kolun da geçerli çıktı ürettiği alt "
             "kümede tekrarlanır (Katman B); A'daki üstünlük B'de kaybolursa bulgu "
             "biçim dayatması sayılır.",
        yeni="H1'in birincil karşılaştırması, iki kolun da geçerli çıktı ürettiği alt "
             "kümede keşifsel olarak tekrarlanır; üstünlük bu alt kümede kaybolursa "
             "bulgu biçim dayatması olarak nitelendirilir. Nitelendirme betimleyicidir "
             "ve niyet-tedavi ilkesiyle kurulan birincil sonucu geçersiz kılmaz.",
        gerekce="'Katman B' etiketi 2.5'ten çıkarılmıştı, tanımsız kalmıştı; ayrıca "
                "keşifsel bir alt küme analizine birincil bulguyu çürütme yetkisi "
                "veriyordu. İkisi de kapatıldı.",
    ),

    # =======================================================================
    # 4. DALGA — DUL SAYFA. Belge 21 sayfada kaldi, ama sebep HACIM DEGIL:
    # sayfa dokumu (sayfa_dokum.ps1) 9. sayfanin yalniz 262 karakter tasidigini
    # gosterdi — etik paragrafi tek basina orada kalmis, hemen ardindaki buyuk
    # takvim tablosu sigmayinca sayfanin gerisi bosa gitmis. §2'den o kadar
    # karakter kirpilinca butun akis bir sayfa yukari kayar.
    # Kirpma yerleri tahminle degil olcumle secildi; hicbiri hakem bulgusunu
    # geri almaz, hepsi ya tekrar ya da bilgi tasimayan ifadedir.
    # =======================================================================
    Duzeltme(
        kod="P-1",
        alan="bolum_2",
        eski="kısıtsız kolda 0,537-0,593; daha yeni bir sürümde aynı yönde 0,889'a "
             "karşı 0,584.",
        yeni="kısıtsız kolda 0,537-0,593 ölçülmüştür.",
        gerekce="İkinci bayat ölçüm ilkiyle aynı yönü gösteriyor ve zaten 'başarım "
                "iddiası değildir' deniyor; iki bayat sayı yerine biri yeter.",
    ),
    Duzeltme(
        kod="P-2",
        alan="bolum_2",
        eski="Güncel kod tabanında bugün koşulan ölçüm: Model çağrısı içermeyen "
             "deterministik erişim yolu yeniden koşulmuştur. Madde bazında",
        yeni="Güncel kod tabanında koşulan tek ölçüm: model çağrısı içermeyen "
             "deterministik erişim yolu yeniden koşulmuş, madde bazında",
        gerekce="'bugün' teslimde yanlışa döner (tarih tuzağı). İki cümle birleşti.",
    ),
    Duzeltme(
        kod="P-3",
        alan="bolum_2",
        eski=" Önerideki tek güncel ölçüm budur; altyapının çalışır ve tekrarlanabilir "
             "olduğunu gösterir. Örneklem küçük",
        yeni=" Örneklem küçük",
        gerekce="'Tek güncel ölçüm' bilgisi P-2'de cümlenin başına taşındı; "
                "'altyapı çalışıyor' değerlendirmesi öz-övgü.",
    ),
    Duzeltme(
        kod="P-4",
        alan="bolum_2",
        eski="2.7.1 ÖN ÇALIŞMADA MEVCUT OLAN İLE BU ARAŞTIRMADA ÜRETİLECEK OLANIN AYRIMI",
        yeni="2.7.1 MEVCUT OLAN İLE ÜRETİLECEK OLANIN AYRIMI",
        gerekce="Başlık iki satır kaplıyordu; kısaltma anlamı değiştirmiyor.",
    ),
    Duzeltme(
        kod="P-5",
        alan="bolum_2",
        eski="Ön çalışma ürün değil, ölçüm aracıdır. Mevcut olan, kurulu bir graf ve "
             "ön-kayıtsız, körlemesiz, tek koşullu bir betikle 108 belgede alınmış tek "
             "değişkenli, sızıntı denetimsiz bir gözlemdir.",
        yeni="Ön çalışma ürün değil, ölçüm aracıdır: kurulu bir graf ve ön-kayıtsız, "
             "körlemesiz, tek koşullu bir betikle 108 belgede alınmış, sızıntı "
             "denetimsiz tek değişkenli bir gözlem.",
        gerekce="İki cümle birleşti; içerik aynı.",
    ),
    # --- 4. dalganin devami: 154 karakterlik tasma kaldi. §2.8'in ilk paragrafi
    #     hem calisma takvimi tablosunu hem 2.6'nin IP sutununu tekrarliyordu.
    #     Ayrica K-1'in yankisini tasiyordu: "İP2 ...; H1, H2, H3, H7" — oysa
    #     H2'nin onaylayici hukmu artik Kapi 5'te, yani İP4'te veriliyor.
    Duzeltme(
        kod="P-7",
        alan="bolum_2",
        eski="İP1 (1-3. ay): ön-kayıt kilidi, güç simülasyonu, katmanlı küme, bağımsız "
             "altın etiketler, sızıntı denetimi, bozma kalibrasyonu, bayat ölçümlerin "
             "koşumu. İP2 (3-5. ay): 4 x 3 faktöriyel deney; H1, H2, H3, H7. İP3 "
             "(4-7. ay): kör etiketleme ve ölçüm geçerliliği; H4. İP4 (6-9. ay): eşik "
             "süpürmesi, müzakere ablasyonu, bedel ölçümü; H5, H6, H8. İP5 (10-12. ay): "
             "replikasyon ve dış geçerlilikte doğrulayıcı sınama, bağımsız koşum.",
        yeni="Hipotez-iş paketi eşlemesi 2.6 tablosunun İP sütunundadır: veri İP2-İP4'te "
             "üretilir, onaylayıcı hüküm kapı sırasına göre verilir ve H2'nin hükmü "
             "Kapı 5 ile İP4'e düşer. İP1 (1-3. ay) ön-kayıt kilidi, güç simülasyonu, "
             "katmanlı küme, bağımsız altın etiketler, sızıntı denetimi ve bozma "
             "kalibrasyonunu; İP5 (10-12. ay) replikasyon, dış geçerlilik ve bağımsız "
             "koşumu kapsar.",
        gerekce="Takvim tablosu ile 2.6 İP sütununun üçüncü kopyasıydı. Sıkıştırma "
                "K-1'in takvim yankısını da kapatıyor.",
    ),
    Duzeltme(
        kod="P-9",
        alan="bolum_2",
        eski="(1) Araştırma insan katılımcı içermez; ölçüm birimi belge ve metindeki "
             "iddiadır, deneyler makine tarafında yürütülür. (2) Hipotez sınamasında "
             "kullanılan evrakın tamamı sentetik ve kurgudur; 2.2'deki diğer iki katman "
             "kamuya açık yayımlanmış ve kişisel veri içermeyen belgelerden derlenir. "
             "Hiçbir katmanda kişisel veri işlenmez.",
        yeni="(1) Araştırma insan katılımcı içermez; ölçüm birimi belge ve metindeki "
             "iddiadır. (2) Veri katmanları ile sentetik/kamuya açık ayrımı 2.2'de "
             "tanımlıdır; hiçbir belge katmanında kişisel veri işlenmez ve "
             "değerlendiricilere ilişkin kişisel veri araştırma veri kümelerine girmez.",
        gerekce="2.2'nin üç katman tanımının üçüncü kopyasıydı (benzerlik 0,76). "
                "Sayfa bütçesi; sözleşme 2.2'de tam duruyor.",
    ),
    Duzeltme(
        kod="P-10",
        alan="ozet",
        eski="Hukuki sonuç doğuran bir alanda sorun hız değildir. Bir cümlenin hangi "
             "belgeye dayandığı gösterilemiyorsa hızlı üretim riski büyütür.",
        yeni="Hukuki sonuç doğuran bir alanda sorun hız değildir: bir cümlenin hangi "
             "belgeye dayandığı gösterilemiyorsa hızlı üretim riski büyütür.",
        gerekce="İki cümle birleşti; özet T-ozet-1/2 ile büyümüştü, bir satır geri "
                "alınıyor.",
    ),

    # --- T-ozet-1 ile ayni celiski 5. bolumde de duruyordu ve orada DAHA AGIR:
    #     etik muafiyet gerekcesi tam da bu beyana dayaniyor. Duzeltilmis
    #     dis_geri_bildirim.py probu buldu (eski prob buyuk/kucuk harf duyarli
    #     oldugu icin goremiyordu).
    Duzeltme(
        kod="T-19",
        alan="bolum_5_diger",
        eski="(2) Kullanılan evrakın tamamı sentetik ve kurgudur.",
        yeni="(2) Ana deneyler ile replikasyon sınaması tümüyle sentetik ve kurgu evrak "
             "üzerinde yürütülür; H1 ve H5'in genellenebilirliği ayrıca 60 gerçek belgede "
             "sınanır (2.2).",
        gerekce="2.2 katman (3) gerçek yayımlanmış yazışmadır; koşulsuz 'tamamı "
                "sentetik' beyanı onu yalanlıyor ve muafiyet gerekçesini zayıflatıyordu.",
    ),

    # --- B6 (istatistik hakemi): "H2'nin hedeflenen etkileşim buyuklugu ETKILESIM
    #     ODDS ORANI ve puan cinsinden karsiligiyla ilan edilir" denmisti; metin
    #     yalniz olasilik farkini veriyordu. Oran uydurulmadi, tasarimin ILAN
    #     EDILMIS hucre degerlerinden turetildi (taban 0,62; kol etkisi 0,10;
    #     yuksek bozulmada -0,15): MDES 0,19 -> OR 2,266 ; 0,13 -> OR 1,670.
    Duzeltme(
        kod="B6",
        alan="bolum_2",
        eski="Dolayısıyla H2 için saptanabilir en küçük etkileşim ön-kayıtta 0,19 "
             "olarak ilan edilir:",
        yeni="Dolayısıyla H2 için saptanabilir en küçük etkileşim ön-kayıtta 0,19 "
             "olasılık puanı, karşılığı 2,27 etkileşim odds oranı olarak ilan edilir "
             "(genişletmeden sonra 0,13 ve 1,67):",
        gerekce="Etki büyüklüğü tek ölçekte veriliyordu; hakem iki ölçekte de ilan "
                "istemişti. Oran türetilmiştir, ölçüm değildir.",
    ),

    # =======================================================================
    # 5. DALGA — KULLANICI GERI BILDIRIMI (8 Agu, ikinci tur).
    # Bes madde + kucuk duzeltmeler. Hepsi metinden dogrulandi.
    # =======================================================================

    # --- (1) "Arastirma insan katilimci icermez" UC YERDE kesin hukum veriyordu.
    #     Uc bagimsiz kisiden arastirma amaciyla yargi aliniyor; muafiyet karari
    #     etik kurulundur. Basvurunun kurulun yerine karar vermesi gereksiz risk.
    Duzeltme(
        kod="E-1a",
        alan="ozet",
        eski="Araştırma insan katılımcı içermez. Ölçüm birimi belge ve belgeden "
             "çıkarılan iddiadır.",
        yeni="D1 ve D3 deneyleri makine tarafında yürütülür ve insan katılımcı içermez; "
             "ölçüm birimi belge ve belgeden çıkarılan iddiadır. D2'de üç bağımsız "
             "değerlendiriciden belge-iddia çiftlerine ilişkin uzman yargısı "
             "alınacaktır; bu aşamanın etik statüsünü yetkili etik kurul belirleyecek, "
             "kurul kararı alınmadan değerlendirme verisi toplanmayacaktır.",
        gerekce="Etik kurulun kararını başvuru veremez. Beyanın devamı zaten kurula "
                "bırakıyordu; ilk cümle onunla çelişiyordu.",
    ),
    Duzeltme(
        kod="E-1b",
        alan="bolum_2",
        eski="Etik: (1) Araştırma insan katılımcı içermez; ölçüm birimi belge ve "
             "metindeki iddiadır.",
        yeni="Etik: (1) D1 ve D3 kapsamındaki makine deneyleri insan katılımcı içermez; "
             "ölçüm birimi belge ve metindeki iddiadır. D2'de değerlendiricilerden "
             "uzman yargısı alınır ve bu aşamanın etik statüsüne yetkili etik kurul "
             "karar verir; ayrıntı 5. bölümdedir.",
        gerekce="Aynı gerekçe; yöntem bölümündeki kopya. Tam beyan özette ve 5. bölümde "
                "duruyor — üç yerde birebir tekrar (benzerlik 0,88-0,93) ölçüldü, "
                "buradaki kopya çapraz atıfa indirildi.",
    ),
    Duzeltme(
        kod="E-1c",
        alan="bolum_5_diger",
        eski="(1) Araştırma insan katılımcı içermez. Gözlem ve ölçüm birimi belgedir ve "
             "belgeden çıkarılan metin içi iddiadır.",
        yeni="(1) D1 ve D3 kapsamındaki makine deneyleri insan katılımcı içermez; gözlem "
             "ve ölçüm birimi belgedir ve belgeden çıkarılan metin içi iddiadır. D2 "
             "kapsamında üç bağımsız değerlendiriciden belge-iddia çiftlerine ilişkin "
             "uzman yargısı alınacaktır; bu aşamanın etik statüsü yetkili etik kurul "
             "tarafından belirlenecek, kurul kararı alınmadan değerlendirme verisi "
             "toplanmayacaktır.",
        gerekce="Aynı gerekçe; etik beyanındaki kopya — en kritik olanı burasıydı.",
    ),
    Duzeltme(
        kod="E-1d",
        alan="bolum_5_diger",
        eski="(4) Etik kurul görüşü: Kişi hakkında veri toplanmadığı için çalışmanın "
             "insan katılımcılı araştırma tanımına girmediği değerlendirilmekte ve bu "
             "gerekçe dosyada açıkça sunulmaktadır; ölçüm birimi belge ve metindeki "
             "iddiadır. Ancak bu değerlendirme başvuruya değil, kurumun yetkili etik "
             "kuruluna aittir.",
        yeni="(4) Etik kurul görüşü: D2'de değerlendiricilerden yalnız belge-iddia "
             "çiftlerine ilişkin uzman yargısı alınır, kişi hakkında veri toplanmaz; bu "
             "gerekçe dosyada açıkça sunulmaktadır. Çalışmanın insan katılımcılı "
             "araştırma tanımına girip girmediğine karar vermek başvuruya değil, "
             "kurumun yetkili etik kuruluna aittir.",
        gerekce="Aynı kesin hüküm 5. bölümün (4) maddesinde de vardı; karar kurula "
                "bırakıldı.",
    ),

    # --- (2) H5 icin IKI FARKLI yontem yaziyordu. Tablo dogru (tek yonlu asmazlik),
    #     Hedef 5 yanlis (esdegerlik/TOST). Yanlis-veto orani icin UST SINIR sinamasi
    #     dogru olandir; esdegerlik cift tarafli bir iddiadir ve burada gereksiz.
    #     NOT: bolum_1_1'deki "iki tek yönlü test" H8'e (gecikme) aittir ve orada
    #     TOST DOGRUDUR — ona dokunulmadi.
    Duzeltme(
        kod="E-2a",
        alan="bolum_1_2",
        eski="seçilen çalışma noktasında yanlış-veto oranının %95 üst sınırı en fazla "
             "0,05, eşdeğerlik iki tek yönlü testle gösterilir;",
        yeni="seçilen çalışma noktasında yanlış-veto oranının %95 güven aralığı üst "
             "sınırının 0,05'i aşmadığı tek yönlü aşmazlık sınamasıyla gösterilir;",
        gerekce="Hedef 5 ile 2.6 tablosu farklı yöntem söylüyordu; aşmazlık doğru olan.",
    ),
    Duzeltme(
        kod="E-2b",
        alan="calisma_takvimi",
        eski="yanlış-veto için eşdeğerlik sınaması (H5)",
        yeni="yanlış-veto için tek yönlü aşmazlık sınaması (H5)",
        gerekce="Takvimdeki yöntem adı da hizalandı.",
    ),
    Duzeltme(
        kod="E-2c",
        alan="calisma_takvimi",
        eski="yanlış-veto %95 üst sınırı 0,05 veya altında; eşdeğerlik kararı açık "
             "yazılmış.",
        yeni="yanlış-veto %95 üst sınırı 0,05 veya altında; aşmazlık kararı açık "
             "yazılmış.",
        gerekce="Başarı ölçütündeki karar adı da hizalandı.",
    ),
    Duzeltme(
        kod="E-2d",
        alan="bolum_2",
        eski="eşik süpürmesi ve eşdeğerlik sınaması; yakınsamanın ölçümü",
        yeni="eşik süpürmesi, aşmazlık ve eşdeğerlik sınamaları; yakınsamanın ölçümü",
        gerekce="Bu liste hem H5 (aşmazlık) hem H8 (eşdeğerlik) sınamasını kapsıyor; "
                "tek adla anılması H5'i yanlış yöntemle etiketliyordu.",
    ),

    # --- (3) "Sifirdan uzak gorunurse" bir karar kurali DEGIL. Kullanicinin en sade
    #     ve guvenli secenegi uygulandi: kosullu genisletme KALDIRILDI, n = 240 sabit,
    #     H2 guc sinirli olarak raporlanir. Adaptif tasarimin getirdigi butun
    #     belirsizlik (tetikleyici, pilot bagimsizligi, ek kosum butcesi) da dusuyor.
    Duzeltme(
        kod="E-3a",
        alan="bolum_2",
        eski="H2 için ön-kayıtlı genişletme koşulu: İP1'de yeniden koşulan tabanda "
             "eğilim 0,19'un altında fakat sıfırdan uzak görünürse alt desen 240 ek "
             "sentetik belgeyle n = 480'e çıkarılır (1.440 ek koşum) ve saptanabilir en "
             "küçük etkileşim 0,13'e iner (ölçülmüştür). H2'nin tek geçerli planı budur; "
             "karar veriye değil bu taban ölçüme bakılarak, kilit öncesinde verilir ve "
             "tarih damgalıdır.",
        yeni="H2'nin örneklemi n = 240'ta sabittir ve koşullu genişletme öngörülmez: "
             "veriye ya da ara ölçüme bakılarak desen değiştirilmez. Güç sınırı, "
             "ön-kayıtta ilan edilen saptanabilir en küçük etkileşimle yönetilir ve "
             "bulgu her hâlükârda bu sınırla birlikte raporlanır.",
        gerekce="'Sıfırdan uzak görünmek' ölçülebilir bir eşik değil; araştırmacıya "
                "göre değişir. Sabit desen hem denetlenebilir hem daha basit.",
    ),
    Duzeltme(
        kod="E-3b",
        alan="bolum_1_2",
        eski=", İP1 pilot ölçümüne göre alt desen 240 ek belgeyle n = 480'e "
             "genişletilebilir.)",
        yeni=" ve örneklem n = 240'ta sabit tutulur.)",
        gerekce="Hedef 2'deki genişletme yankısı.",
    ),
    Duzeltme(
        kod="E-3c",
        alan="riskler",
        eski="Ön-kayıtlı genişletme koşulu, tetikleyicisi ve maliyeti 2.6'da tanımlıdır.",
        yeni="Örneklem n = 240'ta sabittir; koşullu genişletme öngörülmez.",
        gerekce="Risk tablosundaki genişletme yankısı.",
    ),
    Duzeltme(
        kod="E-3d",
        alan="butce",
        eski="Kalemde ayrı bir pay tutulmaz: 6.800 koşum bu tavanı doldurur. H2 "
             "genişletme koşulu devreye girerse gereken 1.440 ek koşum, azaltma "
             "sırasının ilk üç maddesiyle serbest kalan 1.320 koşum ve premium katman "
             "payının daraltılmasıyla aynı tavan içinde karşılanır.",
        yeni="Kalemde ayrı bir pay tutulmaz: 6.800 x 0,63 = 4.284 TL bu tavanı doldurur. "
             "H2 için koşullu genişletme öngörülmediğinden ek koşum yükü yoktur; tavan "
             "yine de aşılırsa 2.1'deki azaltma sırası uygulanır.",
        gerekce="Genişletme kalkınca 1.440/1.320 dengesi ve açıkta kalan 120 çağrılık "
                "fark da ortadan kalktı; aritmetik artık birebir gösteriliyor.",
    ),
    Duzeltme(
        kod="E-3e",
        alan="bolum_2",
        eski="olasılık puanı, karşılığı 2,27 etkileşim odds oranı olarak ilan edilir "
             "(genişletmeden sonra 0,13 ve 1,67):",
        yeni="olasılık puanı, karşılığı 2,27 etkileşim odds oranı olarak ilan edilir:",
        gerekce="Genişletme kalktığı için 0,13 / 1,67 değerleri artık geçersiz.",
    ),

    # --- (4) H1'in sonuca bakip ustunlukten esdegerlige cevrilmesi, on-kayittan once
    #     olsa bile "on sonuclara bakip ana hipotez degistiriliyor" itirazina acikti.
    #     H1 bastan sona ustunluk; esdegerlik ikincil ve kesifsel analiz oldu.
    Duzeltme(
        kod="E-4",
        alan="bolum_2",
        eski="H1 için de bağlayıcı bir kural vardır: İP1 tabanında (c)-(b2) farkının "
             "nokta tahmini 0,10'un altında kalırsa H1'in çerçevesi, kilit öncesinde "
             "üstünlükten TOST eşdeğerliğine (delta = 0,10) çevrilir; iddia \"kısıtın "
             "kazancı güncel üreteçlerde eşdeğerlik bandına daralmıştır\" olur.",
        yeni="H1 baştan sona üstünlük hipotezidir ve çerçevesi hiçbir koşulda "
             "değiştirilmez; Kapı 1'in anlamı ile güç hesabı da böylece sabit kalır. "
             "Kısıtın kazancının eşdeğerlik bandına daralıp daralmadığı, H1'in "
             "sonucundan bağımsız biçimde ikincil ve keşifsel bir eşdeğerlik analiziyle "
             "(delta = 0,10) raporlanır.",
        gerekce="Uyarlanabilir çerçeve, ön-kayıt öncesi olsa bile pilot veri bağımsız "
                "değilse ciddi eleştiri alır. Sabit çerçeve + keşifsel eşdeğerlik "
                "aynı bilgiyi risksiz verir.",
    ),

    # --- (5) 2.2 "hipotez sinamalarinin tamami YALNIZ bu iki kumede" diyordu; Hedef 6
    #     ise dis gecerlilik kumesinde H1 ve H5'i ONAYLAYICI siniyor. Ayrica H5'in
    #     birimi belge degil IDDIA; dis kumeden kac iddia gelecegi yaziliyordu.
    #     Butce 300 iddiaya sabit (4.200 TL) oldugu icin ek iddia URETILMEZ:
    #     300'un 60'i dis gecerlilik belgelerinden secilir. Boylece sayi belirli,
    #     butce degismiyor.
    Duzeltme(
        kod="E-5",
        alan="bolum_2",
        eski="(1) Ana küme (240 belge) ile replikasyon kümesi (120 belge) tümüyle "
             "sentetik ve kurgudur; hipotez sınamalarının tamamı yalnız bu iki küme "
             "üzerinde yapılır.",
        yeni="(1) Ana küme (240 belge) ile replikasyon kümesi (120 belge) tümüyle "
             "sentetik ve kurgudur; D1-D3 kapsamındaki ana hipotez sınamaları bu iki "
             "kümede yürütülür. H1 ve H5'in genellenebilirliği ayrıca İP5'te 60 belgelik "
             "dış geçerlilik kümesinde ön-kayıtlı doğrulayıcı analizle sınanır; H5 "
             "iddia düzeyinde ölçüldüğünden 300 iddialık kör değerlendirme kümesinin "
             "60'ı bu belgelerden, 240'ı ana kümeden seçilir. Dış alt kümede H5'in gücü "
             "yalnız düşük taban oranlarında yeterlidir ve bulgu bu sınırla raporlanır.",
        gerekce="'Yalnız bu iki küme' ile Hedef 6 çelişiyordu. H5'in iddia sayısı "
                "belirsizdi; 300'ün içinden tahsis bütçeyi değiştirmeden sayıyı sabitler.",
    ),

    # --- Kucuk duzeltmeler.
    Duzeltme(
        kod="E-5c",
        alan="calisma_takvimi",
        eski="İddia düzeyinde çapa çıkarımı; en az 60 belgeden, belge başına en fazla 6 "
             "iddia seçilerek 300 iddialık kör değerlendirme kümesinin kurulması.",
        yeni="İddia düzeyinde çapa çıkarımı; ana kümeden en az 50 belgeden 240 iddia ve "
             "dış geçerlilik kümesindeki 60 belgeden 60 iddia olmak üzere, belge başına "
             "en fazla 6 iddia seçilerek 300 iddialık kör değerlendirme kümesinin "
             "kurulması.",
        gerekce="E-5 ile kör kümenin 60'ı dış geçerlilik belgelerine tahsis edildi; "
                "takvimdeki örnekleme kuralı bunu yansıtmalı (240 + 60 = 300).",
    ),
    Duzeltme(
        kod="E-6",
        alan="bolum_2",
        eski="H1-H4 bu iki gövdeye dayanır.",
        yeni="H1-H4 ve H7 bu iki gövdeye dayanır.",
        gerekce="H7 de D1 gövdesine dayanıyor; çekirdek eşlemesi eksikti.",
    ),
    Duzeltme(
        kod="E-7",
        alan="bolum_2",
        eski="Hipotez-iş paketi eşlemesi 2.6 tablosunun İP sütunundadır: veri İP2-İP4'te "
             "üretilir, onaylayıcı hüküm kapı sırasına göre verilir ve H2'nin hükmü "
             "Kapı 5 ile İP4'e düşer.",
        yeni="Hipotez-iş paketi eşlemesi 2.6 tablosunun İP sütunundadır: H2 verisi "
             "İP2'de üretilir, onaylayıcı istatistiksel kararı Kapı 5 açıldığında "
             "verilir; kapı sırası iş paketi sorumluluğunu değiştirmez.",
        gerekce="Tabloda H2'nin İP'si İP2 iken metin 'İP4'e düşer' diyordu; sorumluluk "
                "ile karar anı ayrıldı.",
    ),

    # =======================================================================
    # 6. DALGA — REVIZYON ARTIKLARI.
    # Ikinci tur duzeltmeleri (E-*) uc yerde ESKI SOZLESMEYI anlatan cumleler
    # birakti. Bir on-kayit disiplinini mansete tasiyan basvuruda ic tutarsizlik
    # orantisiz zarar verir: panelist "duzeltilen sozlesmenin eski hali hala
    # dosyada okunuyor" diye not dustu.
    # =======================================================================
    Duzeltme(
        kod="R-1",
        alan="bolum_1_2",
        eski="Taban ölçümler, ön-kayıt kilidinden önce İP1'de güncel sürümle yeniden "
             "üretilir; H1'in çerçevesi bu ölçümün sonucuna bağlı bağlayıcı kuralla "
             "belirlenir (2.6).",
        yeni="Taban ölçümler, ön-kayıt kilidinden önce İP1'de güncel sürümle yeniden "
             "üretilir; H1'in çerçevesi bu ölçümden bağımsızdır ve üstünlük sınaması "
             "olarak sabittir (2.6).",
        gerekce="E-4 H1'i sabit üstünlük yaptı; burada eski koşullu kural hâlâ "
                "anlatılıyordu — 2.6 ile doğrudan çelişki.",
    ),
    Duzeltme(
        kod="R-2",
        alan="bolum_1_1",
        eski="Evrak tamamen sentetiktir, ölçüm birimi metindir;",
        yeni="Ana deneylerin evrakı tümüyle sentetiktir ve ölçüm birimi metindir; "
             "genellenebilirlik ayrıca 60 gerçek belgede sınanır;",
        gerekce="E-5 sonrası koşulsuz 'tamamen sentetik' beyanı yanlış: H1 ve H5 "
                "60 gerçek belgede onaylayıcı sınanıyor.",
    ),
    Duzeltme(
        kod="R-3",
        alan="bolum_5_diger",
        eski="Üç deneyin koşumu da makine tarafındadır: kişi üzerinde gözlem, anket, "
             "görüşme veya deneysel işlem yapılmaz; tepki süresi, karar ya da öznel puan "
             "kaydedilmez.",
        yeni="D1 ve D3'ün koşumu makine tarafındadır: kişi üzerinde gözlem, anket, "
             "görüşme veya deneysel işlem yapılmaz. D2'de yalnız belge-iddia çiftine "
             "verilen sınıflama yargısı kaydedilir; değerlendiricilerin tepki süresi, "
             "demografik özellikleri, kişisel görüşleri ya da performans puanları "
             "araştırma verisi olarak toplanmaz.",
        gerekce="Cümle kendi içinde çelişiyordu: 'karar kaydedilmez' derken D2'de "
                "kaydedilen şey tam olarak uzman kararı. Ayrıca 'üç deneyin koşumu da "
                "makine tarafındadır' D2 için doğru değil.",
    ),
    Duzeltme(
        kod="R-4",
        alan="bolum_2",
        eski="replikasyon kümesi yalnız son sınamada açılır [10]. Hacim 6.800 koşumdur.",
        yeni="replikasyon kümesi yalnız son sınamada açılır [10]. Üç deneyin toplam "
             "hacmi 6.800 model çağrılı koşumdur; kalemlere ayrımı bütçe gerekçesindedir.",
        gerekce="6.800 tüm projenin hacmi, yalnız D3'ün değil; cümle D3 paragrafının "
                "sonunda durduğu için D3'e aitmiş gibi okunuyordu.",
    ),

    # =======================================================================
    # 7. DALGA — PANEL BULGULARI (rubrik panelisti + dusman hakem + taze goz).
    # Istatistiksel yeniden tasarim GEREKTIRMEYEN, olculebilir kazanc getiren
    # maddeler. Kapi yapisi ayri degerlendirilir; burada yok.
    # =======================================================================

    # --- Taze goz: "Katman A/B" 2.5'ten cikarilmisti, takvimde tanimsiz kalmis.
    #     riskler'deki gecisi T-15'te kapatilmisti; bu ikinci gecis kacmis.
    Duzeltme(
        kod="R-5",
        alan="calisma_takvimi",
        eski="H1, H2, H3 ve H7'un ön-kayıtlı testlerle sınanması; Katman A/B "
             "raporlaması; kırılma eşiğinin profil-olabilirlikle kestirilmesi.",
        yeni="H1, H2, H3 ve H7'un ön-kayıtlı testlerle koşulması; niyet-tedavi "
             "çözümlemesinin yanı sıra geçerli çıktı alt kümesinde keşifsel tekrarın "
             "raporlanması; kırılma eşiğinin profil-olabilirlikle kestirilmesi.",
        gerekce="'Katman A/B' etiketi metinde hiçbir yerde tanımlı değil — silinmiş bir "
                "tanımın kalıntısı. Yerine yaptığı iş açıkça yazıldı.",
    ),

    # --- Panelist #3: dis gecerlilik kumesine IKI onaylayici hipotez baglanmis
    #     ama boyle 60 belgenin bulunabilecegine dair hicbir kanit yok; ayrica
    #     "hedef birim" altin etiketinin kaynagi belirsiz — 1.1 kurumlarin ic
    #     birim yapisinin ancak dortte birinin makine-okunur oldugunu soyluyor.
    Duzeltme(
        kod="P7-1",
        alan="calisma_takvimi",
        eski="Ön-kaydın kilitlenmesi: hipotezler, on bir testlik onaylayıcı aile,",
        yeni="Dış geçerlilik kümesinin kurulabilirliği kanıtlanır: 12 kurum türünden 10 "
             "belgelik ön tarama yapılır; erişilebilir ve kişisel veri içermeyen belge "
             "oranı %50'nin altında kalırsa küme 40 belgeye indirilir ve karar "
             "ön-kayıtta ilan edilir. Ön-kayıt kilidi: hipotezler, on bir testlik "
             "onaylayıcı aile,",
        gerekce="İki onaylayıcı hipotez var olduğu kanıtlanmamış bir kümeye bağlıydı. "
                "Ön tarama + geri çekilme kuralı riski ölçülebilir yapar.",
    ),
    Duzeltme(
        kod="P7-2",
        alan="bolum_2",
        eski="(3) Dış geçerlilik kümesi (60 belge)",
        yeni="(3) Dış geçerlilik kümesi (60 belge; kurulabilirliği İP1 ön taramasıyla "
             "kanıtlanır, altın etiketleri kurumun kendi teşkilat şemasına çapalanarak "
             "iki bağımsız kaynakta kurulur)",
        gerekce="Panelist: 'hedef birim' altınının kaynağı yazılmamıştı; 1.1 birim "
                "yapısının çoğunlukla makine-okunur olmadığını söylüyor.",
    ),

    # --- Panelist #4: onaylayici bir kapinin omurgasi ucretsiz gonullu emege
    #     dayaniyor; gonullu duserse yerine alacak butce kalemi yok (aktarim
    #     kurali yalniz UCRETLI degerlendirici icin tanimliydi).
    Duzeltme(
        kod="P7-3",
        alan="butce",
        eski="tutar yetmezse iddia sayısı 300'den aşağı ÇEKİLMEZ, sarf kaleminden "
             "aktarım yapılır ve kural ön-kayıtta sabittir.",
        yeni="tutar yetmezse iddia sayısı 300'den aşağı çekilmez; sarf kaleminden "
             "aktarım yapılır ve kural ön-kayıtta sabittir. Gönüllü değerlendiricilerden "
             "biri ayrılır ve danışmanın bölümünden yerine biri bulunamazsa üçüncü "
             "değerlendirici bütçeden karşılanamaz: desen üç değerlendiriciden ikiye "
             "iner, uyum Krippendorff alfa yerine Cohen kappa ile raporlanır ve H4 "
             "keşifsel etiketlenir. Bu sonuç ön-kayıtta sabittir.",
        gerekce="Önceki hâli 'yerine ücretli alınır' diyordu ama ARİTMETİK TUTMUYOR: "
                "4.200 TL tam 300 yargıyı karşılıyor, ek 300 yargı 4.200 TL daha "
                "gerektirir, sarf ise 1.000 TL. Karşılıksız vaat yerine gerçek sonuç "
                "yazıldı.",
    ),

    # --- Panelist #5: H1'in birincil kontrasti (c)-(b2). Taban kolun samanadam
    #     olmadigini gosterecek "bagimsiz kabul testi" metinde VAR ama hicbir
    #     is paketi faaliyetinde ve hicbir basari olcutunde YOK.
    Duzeltme(
        kod="P7-4",
        alan="calisma_takvimi",
        eski="Paketin ilk haftasında 20 belgelik maliyet pilotuyla belge başına "
             "maliyet tavanının ölçülmesi.",
        yeni="Paketin ilk haftasında 20 belgelik maliyet pilotuyla belge başına maliyet "
             "tavanının ve (b2) taban kolunun kabul testinin koşulması: geri getirme "
             "ile öz-eleştiri tetiklenme oranları ilan edilen alt sınırla "
             "karşılaştırılır, altında kalan koşum b2 sayılmaz ve yeniden koşulur.",
        gerekce="H1'in birincil kontrastının geçerliliği bu teste bağlı. Önce İP3'e "
                "konmuştu ama İP2 (3-5. ay) b2'yi İP3'ten (4-7. ay) ÖNCE tüketiyor: "
                "taban kolun geçerliliği onu kullanan deneyden sonra sınanamaz.",
    ),

    # --- Dusman hakem, EN GUCLU ret gerekcesi: kuram "kisitin ERKEN baglanmasi"
    #     ama D1'de "gec baglanma" (uretim sonrasi kisit) kolu YOK; dolayisiyla
    #     erken/gec karsitligi tasarimda TANIMLANABILIR DEGIL. Yanlislama yuku
    #     ise gucsuz oldugu ilan edilmis H2'ye binmis durumda.
    #     Cozum ek MODEL COKUMU GEREKTIRMEZ: kisit, (b2)'nin SAKLANAN ciktilarina
    #     uretim sonrasi deterministik olarak uygulanir. Bu turetilmis kosul
    #     karsitligi tanimlar, butceyi ve faktoriyel deseni degistirmez.
    Duzeltme(
        kod="P7-5",
        alan="bolum_2",
        eski="H1'in birincil kontrastı (c)-(b2)'dir; (b) kısıtın toplam etkisini "
             "gösterir.",
        yeni="H1'in birincil kontrastı (c)-(b2), (b) ise kısıtın toplam etkisidir. "
             "Erken bağlanmanın payını ayırmak için türetilmiş bir "
             "geç bağlanma koşulu tanımlanır: (b2)'nin saklanan çıktılarına aynı kapalı "
             "küme üretim sonrasında deterministik uygulanır (b2-geç); ek model çağrısı "
             "gerektirmez. (c)-(b2-geç) karşıtlığı erken bağlanmanın süzgeçlemenin "
             "ötesindeki katkısını ölçer; ön-kayıtta kilitlenir, düzeltmesiz raporlanır "
             "ve onaylayıcı ailenin üyesi değildir.",
        gerekce="Düşman hakemin en güçlü ret gerekçesi: kuram erken/geç bağlanma "
                "karşıtlığı üzerine ama tasarımda geç bağlanma kolu yok, dolayısıyla "
                "karşıtlık tanımlanabilir değil. Türetilmiş koşul bunu sıfır maliyetle "
                "kapatır ve yanlışlama yükünü tek başına H2'den alır.",
    ),

    # --- Sayfa butcesi: 7. dalga belgeyi 22 sayfaya cikardi (sinir 21). Tasan
    #     sayfanin icerigi BUTCE GEREKCELERIDIR, o yuzden kesim orada yapilir.
    #     Kesilen her sey yontemde zaten yazili olan tekrardir.
    Duzeltme(
        kod="S-7",
        alan="butce",
        eski="Ücretli hizmet iddia başına birim bedelle, 100'erlik üç partide alınır; "
             "yüklenici, ücretli değerlendiricinin 2.2'de aranan deneyimini yazılı "
             "taahhütle belgeler; gönüllü ikisinin niteliği danışmanca teyit edilir.",
        yeni="Ücretli hizmet 100'erlik üç partide alınır; nitelik belgelemesi 2.2'dedir.",
        gerekce="Değerlendirici niteliği 2.2'de tam yazılı; bütçe gerekçesinde tekrarı "
                "gereksiz.",
    ),
    Duzeltme(
        kod="S-8",
        alan="butce",
        eski="Tutar, İP2 başındaki 20 belgelik pilotla ölçülecek maliyete bağlanacak "
             "ÜST SINIRDIR ve yalnız-ekleme harcama defteriyle sınırlanır.",
        yeni="Tutar, İP2 başındaki pilotla ölçülecek maliyete bağlanan üst sınırdır ve "
             "yalnız-ekleme harcama defteriyle sınırlanır.",
        gerekce="Kısaltma + 'ÜST SINIRDIR' büyük harf vurgusu kaldırıldı (panelist "
                "gözünde bağırma etkisi yapıyor).",
    ),
    Duzeltme(
        kod="S-9",
        alan="butce",
        eski="1.080 (eşik süpürmesi; dokuz nokta, sabit 120 belgelik alt kümede) + 840 "
             "(müzakere ablasyonu; yedi koşul, aynı 120 belgede)",
        yeni="1.080 (eşik süpürmesi) + 840 (müzakere ablasyonu)",
        gerekce="Aynı bilgi, iki satır kısa.",
    ),
    Duzeltme(
        kod="S-10",
        alan="butce",
        eski="— GEREKÇE: 360 belgelik küme, 4.320 artefakt ve 300 iddialık altın kümenin "
             "yedekli saklanması yeniden üretilebilirliğin; baskı-tarama gideri ise "
             "bozma çapasının gerçek taranmış belgelerde ölçülmesinin ön koşuludur.",
        yeni="— GEREKÇE: Yedekli saklama yeniden üretilebilirliğin, baskı-tarama ise "
             "bozma çapasının ön koşuludur.",
        gerekce="Aynı gerekçe, bir satır kısa.",
    ),

    # --- Govde kisaltmasi: butce tablosunun son iki satiri 22. sayfaya tasiyor ve
    #     tablo satirlari bolunemedigi icin ancak GOVDE kisalinca yukari kayiyorlar.
    #     Kesim yerleri rastgele degil: okunabilirlik denetiminin "en yogun paragraf"
    #     dedigi B1-B6 blogu ve 2.7 ile olculmus tekrarlar.
    Duzeltme(
        kod="S-11",
        alan="bolum_1_1",
        eski="Zararı ön çalışmada ölçülmüştür: daima \"yüksek güven\" gösteren gösterge "
             "ile mevzuat erişiminde ilk-sıra isabeti 0,598 idi (204 belge); sinyal "
             "ölçümle seçilince ayırt edicilik 0,877'den 0,964'e, bant isabetleri 0,971 "
             "ile 0,058 arasına ayrışmıştır.",
        yeni="Zararı ön çalışmada ölçülmüştür: sinyal ölçümle seçilince ayırt edicilik "
             "0,877'den 0,964'e çıkmıştır (ayrıntı 2.7'de).",
        gerekce="Kalibrasyon sayıları 2.7'de zaten tam veriliyor; B1-B6 bloğu "
                "okunabilirlik denetiminde 'en kötü paragraf' işaretlenmişti.",
    ),
    Duzeltme(
        kod="S-12",
        alan="bolum_1_1",
        eski="(B5) İnsan gözetimi normatif savunulur [16][17]; ön koşulu olan "
             "denetlenebilir çıktı - kaynağa geri izlenebilir çapa ve kalibre güven "
             "bandı - üretimde zorunlu kılınıp kör uzman ölçütüne karşı sınanmamıştır.",
        yeni="(B5) İnsan gözetimi normatif savunulur [16][17]; ön koşulu olan "
             "denetlenebilir çıktı üretimde zorunlu kılınıp kör uzman ölçütüne karşı "
             "sınanmamıştır.",
        gerekce="Parantez içi tanım (çapa + güven bandı) 2.4 ve 2.5'te tanımlı; "
                "boşluk listesinde tekrar gerekmiyor.",
    ),
    Duzeltme(
        kod="S-13",
        alan="bolum_1_1",
        eski="(B3) Çok-ajanlı yönlendirmede hedef küme kapalı varsayılır; kamu "
             "teşkilatında açık uçludur ve doğan hata sınıfı (yanlış kurumla "
             "özdeşleştirme) ölçülmemiştir.",
        yeni="(B3) Çok-ajanlı yönlendirmede hedef küme kapalı varsayılır; kamu "
             "teşkilatında açık uçludur ve doğan hata sınıfı ölçülmemiştir.",
        gerekce="Hata sınıfının tanımı H7'de zaten var.",
    ),
    Duzeltme(
        kod="S-14",
        alan="bolum_1_1",
        eski="Bu öneri B4'ü tümüyle kapatmaz: kapı sıkılığının ödünleşim eğrisi ve "
             "ayırt edicilik ölçümü (H5, İP4) yalnız gözlem tabanlı sinyal için ilk "
             "adımı verir; epistemik tür ayrıştırmasının kalibrasyonu 4. bölümde ilan "
             "edilen izleyen projeye bırakılmıştır.",
        yeni="Bu öneri B4'ü tümüyle kapatmaz: H5 ve İP4 yalnız gözlem tabanlı sinyal "
             "için ilk adımı verir; epistemik tür ayrıştırmasının kalibrasyonu izleyen "
             "projeye bırakılmıştır (4. bölüm).",
        gerekce="Aynı sınır beyanı, iki satır kısa.",
    ),

    Duzeltme(
        kod="S-15",
        alan="butce",
        eski="biri ekip dışından hizmet alımıyla ücretlendirilir (300 yargı), ikisi "
             "danışmanın bölümünden gönüllü katkı verir, bütçeye gider yazılmaz.",
        yeni="biri ücretlendirilir (300 yargı), ikisi gönüllü katkı verir.",
        gerekce="Değerlendiricilerin kim olduğu 2.2 ve Olanaklar'da yazılı.",
    ),
    Duzeltme(
        kod="S-16",
        alan="butce",
        eski="üç sağlayıcıdan alınan yazılı ön fiyat teklifi ortalamasıyla belirlenmiş",
        yeni="üç yazılı ön fiyat teklifinin ortalamasıyla belirlenmiş",
        gerekce="Aynı bilgi, kısa.",
    ),
    Duzeltme(
        kod="S-17",
        alan="butce",
        eski="Tavan, koşum başına 0,63 TL üst sınırı varsayar; birincil sağlayıcı düşük "
             "maliyetli katmandan seçilir, premium katman yalnız bir blok seviyesinde "
             "ve 80 belgelik alt kümede kullanılır.",
        yeni="Tavan koşum başına 0,63 TL varsayar; premium katman yalnız bir blok "
             "seviyesinde ve 80 belgelik alt kümede kullanılır.",
        gerekce="Birincil sağlayıcının düşük maliyetli katmandan seçilmesi 2.4'te var.",
    ),
    Duzeltme(
        kod="S-18",
        alan="butce",
        eski="Ölçülen uçtan uca süre belge başına ~84 saniye, toplam makine süresi "
             "200-500 saat aralığındadır; koşumlar gözetimsizdir.",
        yeni="Ölçülen uçtan uca süre belge başına ~84 saniye, makine süresi 200-500 "
             "saat; koşumlar gözetimsizdir.",
        gerekce="Aynı iki sayı, bir satır kısa.",
    ),
    Duzeltme(
        kod="S-19",
        alan="butce",
        eski="— GEREKÇE: İP5'nın başarı ölçütü (deterministik metriklerin en fazla %1 "
             "sapmayla yeniden üretilmesi)",
        yeni="— GEREKÇE: İP5'in başarı ölçütü (deterministik metriklerin %1'den az "
             "sapmayla yeniden üretilmesi)",
        gerekce="Dilbilgisi: 'İP5'nın' -> 'İP5'in'. Ayrıca kısaldı.",
    ),
    Duzeltme(
        kod="S-20",
        alan="butce",
        eski="Veri saklama ve yedekleme ortamı (yedekleme diski); karakter hata oranı "
             "ölçümü için 50 belgenin baskı ve tarama gideri; kör değerlendirme "
             "materyalinin çoğaltılması, kılavuz baskısı ve kırtasiye.",
        yeni="Veri saklama ve yedekleme ortamı; 50 belgenin baskı-tarama gideri; kör "
             "değerlendirme materyalinin çoğaltılması ve kırtasiye.",
        gerekce="Aynı kalemler, bir satır kısa.",
    ),

    # =======================================================================
    # 8. DALGA — AZAMI TUR. Kalan bulgularin tamami.
    # =======================================================================

    # --- Panelistin ve fizibilite hakeminin ORTAK isaret ettigi en buyuk acik:
    #     3 ogrenci 12 ayda bu isi bitirir mi? Dosyada adam-ay hesabi HIC YOKTU.
    #     Sayilar uydurulmadi: kapasite 3 x 0,35 FTE x 12 ay = 12,6 adam-ay ve
    #     takvimin KENDI katki yuzdeleri bu kapasitenin dagilimidir (toplam 100).
    #     Asil savunma ise su: hacmin buyuk bolumu ogrenci emegi DEGIL.
    Duzeltme(
        kod="F-1",
        alan="bolum_3_yonetim_girisi",
        eski="Yürütme sabit bir izleme yordamına bağlanmıştır.",
        yeni="İş gücü planı: üç öğrencinin haftada ortalama on dört saatlik katkısı on "
             "iki ayda 12,6 adam-ay eder; takvimdeki katkı yüzdeleri bu kapasitenin iş "
             "paketlerine dağılımıdır (İP1 2,1 · İP2 3,2 · İP3 2,9 · İP4 2,6 · İP5 1,8 "
             "adam-ay; toplam 12,6). Hacmin büyük bölümü öğrenci emeği değildir: 6.800 koşum "
             "gözetimsiz makine zamanıdır (200-500 saat), kör değerlendirme ile "
             "bağımsız koşum hizmet alımıyla dışarıdan sağlanır. Öğrenci emeği tasarım, "
             "etiketleme, çözümleme ve yazımda yoğunlaşır. Gerçekleşen efor kapasiteyi "
             "aşarsa 2.1'deki azaltma sırası kapsama uygulanır; takvim de bunun için "
             "İP3-İP4 arasında iki aylık örtüşme payı bırakır.\n\nYürütme sabit bir "
             "izleme yordamına bağlıdır.",
        gerekce="Fizibilite hakemi %152 doluluk ölçmüştü ve dengelendiği hiçbir yerde "
                "gösterilmiyordu. Panelistin de en sert soracağı yer burasıydı.",
    ),

    # --- Panelistin en buyuk puan kirimi (-3): seri kapi zinciri TUM onaylayici
    #     programi Kapi 1'in uc testine rehin veriyor (ucunun birden acilma
    #     olasiligi ~0,65). Cozum ALFA BOLUSTURMESI: olcum gecerliligi (H4)
    #     kendi ailesine alinir. Mantiksal gerekce guclu — olcutun gecerliligi
    #     mimarinin ustunlugunden ONCE gelen bir on kosuldur, dolayisiyla onun
    #     ardina dizilmesi zaten yanlisti.
    #     OLCULDU (ayni tohum): H4 alfa 0,01'de guc 0,987 (0,05'te 0,998 idi).
    #     H1 alfa 0,0133'te guc 0,832 (0,0167'de 0,855 idi). Bedel kucuk;
    #     karsiliginda H4 her kosulda sinanir VE asagidaki testlerin onunden
    #     bir kapi tumuyle kalkar. FWER 0,04 + 0,01 = 0,05 korunur.
    Duzeltme(
        kod="K-3",
        alan="bolum_2",
        eski="Aile on bir testtir ve beş kapıya dizilir: Kapı 1 = H1 (üç bağımlı "
             "değişkende birincil kontrast, 3 test); Kapı 2 = H3, H7 (2 test); "
             "Kapı 3 = H4; Kapı 4 = H5 (2 test); Kapı 5 = H6, H8, H2 (3 test).",
        yeni="Aile on bir testtir ve iki bağımsız kola ayrılır. Mekanizma kolu "
             "(alfa = 0,04) dört seri kapıdır: Kapı 1 = H1 (üç bağımlı değişkende "
             "birincil kontrast, 3 test); Kapı 2 = H3, H7 (2 test); Kapı 3 = H5 "
             "(2 test); Kapı 4 = H6, H8, H2 (3 test). Ölçüm geçerliliği kolu "
             "(alfa = 0,01) tek testtir: H4. Ayrım mantıksaldır: ölçütün geçerliliği "
             "mimarinin üstünlüğünden önce gelen bir ön koşuldur, dolayısıyla onun "
             "ardına dizilemez; ayrılma H4'ün her koşulda sınanmasını da güvence "
             "altına alır.",
        gerekce="Seri zincir tüm programı Kapı 1'in üç testine rehin veriyordu. "
                "Alfa bölüştürmesi FWER'i bozmaz (0,04 + 0,01 = 0,05).",
    ),
    Duzeltme(
        kod="K-4",
        alan="bolum_2",
        eski="ailesel hata on bir testte 0,05'te tutulur, en katı basamak üç testli "
             "Kapı 1 ve Kapı 5'tedir (alfa = 0,0167).",
        yeni="ailesel hata iki kolun toplamında 0,04 + 0,01 = 0,05'te tutulur; en katı "
             "basamak üç testli Kapı 1 ve Kapı 4'tedir (alfa = 0,0133).",
        gerekce="K-3'ün alfa muhasebesi.",
    ),
    Duzeltme(
        kod="K-5",
        alan="bolum_2",
        eski="Kapı 5 açılmasa bile H2'nin etkileşim kestirimi",
        yeni="Kapı 4 açılmasa bile H2'nin etkileşim kestirimi",
        gerekce="K-3 yankısı: H2 artık Kapı 4'te.",
    ),
    Duzeltme(
        kod="K-6",
        alan="bolum_2",
        eski="Kapı 1'in üç testi için alfa = 0,0167'de n = 240'ta güç 0,857",
        yeni="Kapı 1'in üç testi için alfa = 0,0133'te n = 240'ta güç 0,833",
        gerekce="Alfa bölüştürmesinin H1'e maliyeti ÖLÇÜLDÜ (aynı tohum, 3.000 tekrar): "
                "0,855 -> 0,832.",
    ),
    Duzeltme(
        kod="K-7",
        alan="bolum_2",
        eski="DEFF = 1,80 ile etkin örneklem 167, güç 0,998",
        yeni="DEFF = 1,80 ile etkin örneklem 167, kendi kolunda alfa = 0,01'de güç 0,987",
        gerekce="H4 artık ayrı ailede ve alfa 0,01; güç yeniden hesaplandı.",
    ),
    Duzeltme(
        kod="K-8",
        alan="bolum_2",
        eski="n = 240'ta ve Kapı 5'in en katı basamağında güç 1,00.",
        yeni="n = 240'ta ve Kapı 4'ün en katı basamağında güç 1,00.",
        gerekce="K-3 yankısı.",
    ),
    Duzeltme(
        kod="K-9",
        alan="bolum_2",
        eski="onaylayıcı istatistiksel kararı Kapı 5 açıldığında verilir",
        yeni="onaylayıcı istatistiksel kararı Kapı 4 açıldığında verilir",
        gerekce="K-3 yankısı (2.8).",
    ),
    Duzeltme(
        kod="K-10",
        alan="ozet",
        eski="Sekiz hipotez, beş kapılı hiyerarşik yordamla denetlenen on bir testlik "
             "bir onaylayıcı aile içinde sınanır.",
        yeni="Sekiz hipotez on bir testlik onaylayıcı ailede sınanır: dört kapılı "
             "mekanizma kolu ve ayrı bir ölçüm geçerliliği kolu.",
        gerekce="K-3 yankısı (özet).",
    ),
    Duzeltme(
        kod="K-11",
        alan="calisma_takvimi",
        eski="on bir testlik onaylayıcı aile, beş kapılı hiyerarşi,",
        yeni="on bir testlik onaylayıcı aile, dört kapılı mekanizma hiyerarşisi ile "
             "ayrı ölçüm geçerliliği kolu,",
        gerekce="K-3 yankısı (takvim).",
    ),
    Duzeltme(
        kod="K-12",
        alan="yaygin_etki",
        eski="on bir testlik aile, beş kapılı hiyerarşi,",
        yeni="on bir testlik aile, dört kapılı mekanizma hiyerarşisi ile ayrı ölçüm "
             "geçerliliği kolu,",
        gerekce="K-3 yankısı (yaygın etki).",
    ),

    # --- Dusman hakem: "300 iddia SECILEREK kuruluyor ama secim kurali tanimsiz;
    #     sistemin hic iddia saymadigi cumleler olculemez." Ikisi de kapatildi.
    Duzeltme(
        kod="H-1",
        alan="calisma_takvimi",
        eski="belge başına en fazla 6 iddia seçilerek 300 iddialık kör değerlendirme "
             "kümesinin kurulması.",
        yeni="belge başına en fazla 6 iddia sabit tohumlu rastgele örneklemeyle "
             "seçilerek 300 iddialık kör değerlendirme kümesinin kurulması; seçim "
             "betiği ön-kayıt ekindedir. Sistemin hiç iddia çıkarmadığı belgeler ayrı "
             "sayılır ve kapsam sınırı olarak raporlanır.",
        gerekce="Seçim kuralı tanımsızdı (araştırmacı seçimi şüphesi) ve sıfır-iddialı "
                "belgeler ölçüm dışı kalıyordu; ikisi de hakemin itirazıydı.",
    ),

    # --- Taze panelistin bulduklari (9. dalga).
    Duzeltme(
        kod="G-1",
        alan="bolum_1_1",
        eski=", bulgu başka bir sürümde tekrarlanmıştır (0,889'a karşı 0,584).",
        yeni=".",
        gerekce="0,889 hiçbir yerde tanımlı değil — P-1'de kesilen bayat ölçümün "
                "ikinci kalıntısı. Tanımsız sayı, panelistin geri dönüp aradığı şeydir.",
    ),
    Duzeltme(
        kod="G-2",
        alan="bolum_2",
        eski="(3) Dış geçerlilik kümesi (60 belge; kurulabilirliği İP1 ön taramasıyla "
             "kanıtlanır,",
        yeni="(3) Dış geçerlilik kümesi (İP1 ön taraması yeterli belge bulunamadığını "
             "gösterirse 40'a inen 60 belge; iddia tahsisi de aynı oranda düşer,",
        gerekce="İP1'e '40'a indirilir' kuralı eklenmişti ama 2.2, İP3 ve İP5 hâlâ "
                "koşulsuz 60 varsayıyordu — kendi düzeltmemin kırık zinciri.",
    ),
    Duzeltme(
        kod="G-3",
        alan="calisma_takvimi",
        eski="Maliyet tavanı pilotla ölçülmüş.",
        yeni="Maliyet tavanı pilotla ölçülmüş; (b2) kabul testi geçilmiş ve oranları "
             "raporlanmış.",
        gerekce="Kabul testi İP2'ye taşındı; başarı ölçütünde karşılığı olmadan "
                "sorumlusu da olmuyordu.",
    ),
    Duzeltme(
        kod="G-4",
        alan="calisma_takvimi",
        eski="Yetkili etik kurula ilk ay içinde resmî görüş başvurusunun yapılması;",
        yeni="Yetkili etik kuruldan ilk ay içinde resmî görüş istenmesi; "
             "karar İP3 başına kadar gelmezse İP4'ün model koşumları öne alınır ve kör "
             "değerlendirme kurul kararından sonra başlar, takvim kayması iki ayı "
             "aşmaz;",
        gerekce="Kurul kararı İP3-İP4-İP5 zincirinin ön koşulu ama gecikme senaryosu "
                "on riskin hiçbirinde yoktu.",
    ),

    Duzeltme(
        kod="G-5",
        alan="bolum_2",
        eski="(2) OCR kalibrasyon materyali (en az 50 görüntü), resmî kurum sitelerinde "
             "yayımlanmış, kamuya açık ve kişisel veri içermeyen taranmış belge "
             "görüntüleridir;",
        yeni="(2) OCR kalibrasyon materyali (en az 50 görüntü), metni bilinen sentetik "
             "ve kamuya açık belgelerin ekipçe basılıp taranmasıyla üretilir; yer "
             "doğrusu metin bu yolla elde edilir;",
        gerekce="ÇELİŞKİ: indirilen taranmış görüntünün yer-doğrusu metni yoktur, "
                "dolayısıyla karakter hata oranı HESAPLANAMAZ — oysa bütçe 50 belgenin "
                "baskı-tarama giderini, olanaklar da tarayıcıyı zaten içeriyordu. "
                "Ölçülebilir olan yol seçildi.",
    ),
    Duzeltme(
        kod="G-6",
        alan="bolum_2",
        eski="küme üretim sonrasında deterministik uygulanır (b2-geç); ek model çağrısı "
             "gerektirmez.",
        yeni="küme üretim sonrasında deterministik uygulanır (b2-geç); eşleme, ön-kayıt "
             "ekindeki en-yakın-eşleşme betiğidir ve (b2) için tanımlanan aslına "
             "uygunluk kabul testi (b2-geç)'e de aynen uygulanır. Ek model çağrısı "
             "gerektirmez.",
        gerekce="Hakem: 'deterministik eşleme' tanımsızdı ve ekip yazacaktı; (b2)'ye "
                "konan kabul testi türetilmiş kola uygulanmıyordu — aynı samanadam "
                "riski geç bağlanma kolunda tekrar doğuyordu.",
    ),
    Duzeltme(
        kod="G-7",
        alan="bolum_2",
        eski="Örnekleme, 19 elemanlı kapalı tür kümesinde katmanlıdır",
        yeni="Örnekleme 19 elemanlı kapalı tür kümesinde katmanlıdır; hedef birim "
             "kümesi kurumların kendi yayımladığı teşkilat şemalarından türetilir ve "
             "aynı anda kilitlenir",
        gerekce="Hakem: tür kümesi çapalıydı ama HEDEF BİRİM kümesinin kaynağı hiçbir "
                "yerde yazmıyordu; kapalı-küme avantajı orada tasarım artefaktı olabilir.",
    ),
    Duzeltme(
        kod="G-8",
        alan="bolum_2",
        eski="Model hatası ve zaman aşımı geçersiz sayılır; değerlendirici eksiği "
             "doldurulmaz, eksik veri raporlanır.",
        yeni="Model hatası ve zaman aşımı geçersiz sayılır; değerlendirici eksiği "
             "doldurulmadan eksik veri olarak raporlanır. H4 sistemin çıkardığı iddialara "
             "koşulludur: hiç çıkarılmamış dayanaksız iddia ölçüm alanının dışındadır "
             "ve bu, geçerlilik sınırı olarak beyan edilir.",
        gerekce="Hakem: birimleme güvenilirliği ölçülmüyor; H4 koşullu bir uyum "
                "kestiriyor. Ölçülemeyeni ölçüyormuş gibi göstermek yerine sınır ilan "
                "edildi.",
    ),

    # =======================================================================
    # 10. DALGA — TUTARLILIK AJANININ YANKI TARAMASI (9 kesin + secili olasi).
    # Sekiz dalganin biriktirdigi dikisler. Cogu BENIM onceki dalgalarimin
    # yankisi; her biri iki alintiyla gosterildi.
    # =======================================================================
    Duzeltme(
        kod="Y-1",
        alan="riskler",
        eski="Bir değerlendirici düşerse kodlama kılavuzuyla eğitilen bir yedek alınır; "
             "devir noktası uyum hesabında ayrı raporlanır. Desen, ölçüt ve hipotez "
             "değişmez;",
        yeni="Bir değerlendirici düşerse önce kodlama kılavuzuyla eğitilen bir yedek "
             "aranır ve devir noktası uyum hesabında ayrı raporlanır; yedek "
             "bulunamazsa bütçe gerekçesindeki iki değerlendiricili desen devreye "
             "girer. Ölçüt ve hipotez listesi değişmez;",
        gerekce="Bütçe 'desen üçten ikiye iner' derken risk tablosu 'desen değişmez' "
                "diyordu — aynı olayı zıt yöneten iki kural.",
    ),
    Duzeltme(
        kod="Y-2",
        alan="bolum_2",
        eski="40'a inen 60 belge; iddia tahsisi de aynı oranda düşer,",
        yeni="40'a inen 60 belge; bu durumda dış alt kümeden gelen iddia payı ana "
             "kümeden tamamlanır ve kör değerlendirme 300 iddiada sabit kalır,",
        gerekce="'İddia tahsisi düşer' ile '300 iddia hiçbir koşulda küçültülmez' "
                "çelişiyordu; 300 sabit, kaynak değişiyor.",
    ),
    Duzeltme(
        kod="Y-3",
        alan="bolum_2",
        eski="(3) Kurul kararı alınmadan hiçbir değerlendirme verisi toplanmaz; resmî "
             "görüş proje başlamadan alınır (5. bölüm).",
        yeni="(3) Kurul kararı alınmadan hiçbir değerlendirme verisi toplanmaz; resmî "
             "görüş İP1'in ilk ayında istenir ve kör değerlendirme, karar dosyaya "
             "girmeden başlamaz (5. bölüm).",
        gerekce="'Proje başlamadan alınır' ile takvimdeki 'karar İP3 başına kadar "
                "gelmezse' senaryosu çelişiyordu.",
    ),
    Duzeltme(
        kod="Y-4",
        alan="bolum_5_diger",
        eski="Proje başlamadan ve hiçbir değerlendirme verisi toplanmadan önce ilgili "
             "etik kuruldan resmî görüş alınacak,",
        yeni="Hiçbir değerlendirme verisi toplanmadan önce ilgili etik kuruldan resmî "
             "görüş alınacak,",
        gerekce="Y-3 ile aynı çelişkinin 5. bölümdeki kopyası.",
    ),
    Duzeltme(
        kod="Y-5",
        alan="yaygin_etki",
        eski="güven göstergesi daima yüksek görünürken mevzuat erişiminde ölçülen "
             "ilk-sıra isabeti 0,598 idi (204 belge)",
        yeni="güven göstergesi daima yüksek görünürken üç güven bandının isabeti 204 "
             "belgede yalnız 0,598 tabanında kalmıştı (2.7)",
        gerekce="0,598 iki farklı ölçüye atfedilmişti; 2.7'de mevzuat erişiminin "
                "ilk-sıra isabeti 0,750'dir.",
    ),
    Duzeltme(
        kod="Y-6",
        alan="bolum_1_1",
        eski="sinyal ölçümle seçilince ayırt edicilik 0,877'den 0,964'e çıkmıştır "
             "(ayrıntı 2.7'de).",
        yeni="sinyal ölçümle seçilince ayırt edicilik (ROC alanı) 0,877'den 0,964'e "
             "çıkmıştır.",
        gerekce="Askıda çapraz atıf: bu iki sayı 2.7'de HİÇ yok (S-11 onları 'zaten "
                "orada' sanıp buradan çıkarmıştı).",
    ),
    Duzeltme(
        kod="Y-7",
        alan="bolum_2",
        eski="bulguları düşen / direnen / yeni doğan olarak defterler (D3).",
        yeni="bulguları kapanan / direnen / yeni doğan olarak defterler (D3).",
        gerekce="Aynı defterin iki adı: bir yerde 'düşen', dört yerde 'kapanan'.",
    ),
    Duzeltme(
        kod="Y-8",
        alan="bolum_2",
        eski="(10) müzakerede belge başına açık bulgu sayısı - süreç ölçüsüdür, tanımı "
             "D3'tedir,",
        yeni="(10) müzakerede belge başına açık bulgu sayısı - süreç ölçüsüdür; açık "
             "bulgu, revizyon sonrası yeniden ölçümde direnen ya da yeni doğan "
             "bulgudur (2.4);",
        gerekce="Tanım D3'e havale ediliyordu ama D3 tek cümle ve tanım içermiyor.",
    ),
    Duzeltme(
        kod="Y-10",
        alan="bolum_1_2",
        eski="mimari x bozulma etkileşimi iki yöntemde de aynı yönde ve alfa = 0,05 "
             "düzeyinde",
        yeni="mimari x bozulma etkileşimi iki yöntemde de aynı yönde ve Kapı 4'ün Holm "
             "düzeltmeli düzeyinde (alfa = 0,0133)",
        gerekce="Hedef başarı ölçütü kapı içindeki gerçek alfayı değil 0,05'i "
                "söylüyordu.",
    ),
    Duzeltme(
        kod="Y-11",
        alan="bolum_2",
        eski="H1-H4 ve H7 bu iki gövdeye dayanır.",
        yeni="H1-H5 ve H7 bu iki gövdeye dayanır.",
        gerekce="H5'in gücü tam da korunan 240 iddiadan hesaplanıyor; dışarıda "
                "bırakılması yanlıştı.",
    ),
    Duzeltme(
        kod="Y-12",
        alan="ozet",
        eski="Bozulma düzeyi, gerçek taranmış belgelerde ölçülen karakter hata oranına "
             "çapalanır.",
        yeni="Bozulma düzeyi, basılıp taranan belgelerde ölçülen karakter hata oranına "
             "çapalanır.",
        gerekce="G-5 2.2'yi düzeltti ama özet eski ifadeyle kaldı.",
    ),
    Duzeltme(
        kod="Y-13",
        alan="bolum_2",
        eski="Gözlemlerin 720'si deterministik, 3.600'ü model çağrılıdır.",
        yeni="Gözlemlerin 720'si deterministik, 3.600'ü model çağrılıdır; türetilmiş "
             "(b2-geç) koşulu bu gövdeye 240 x 3 = 720 deterministik puanlama daha "
             "ekler ve ek model çağrısı gerektirmez.",
        gerekce="b2-geç gözlem defterinde hiç sayılmıyordu.",
    ),

    # --- Ozet, E-1a'dan sonra 447/450 kelimeye cikti. Uc kelimelik pay kirilgan:
    #     ozette yapilacak en kucuk duzenleme siniri asar. Dort yerden olculu
    #     kirpma ile pay 20 kelimeye cikarilir; hicbiri bilgi kaybi degil.
    Duzeltme(
        kod="E-8a",
        alan="ozet",
        eski="zorunlu bilgi unsurlarını çıkarmak, eksiğini görmek, dayanağını bulmak, "
             "doğru birime yöneltmek ve cevap taslağını yazmak bugün ağırlıklı olarak "
             "el emeğiyle yürütülür.",
        yeni="zorunlu bilgi unsurlarını çıkarmak, eksiğini görmek, dayanağını bulmak, "
             "doğru birime yöneltmek ve cevap taslağını yazmak bugün el emeğiyle "
             "yürütülür.",
        gerekce="'ağırlıklı olarak' niteleyicisi cümleye bilgi katmıyor.",
    ),
    Duzeltme(
        kod="E-8b",
        alan="ozet",
        eski="Dört seviye kural katmanı, kısıtsız tek geçişli üretim, geri getirmeyle "
             "güçlendirilmiş literatür tabanı ve kanıt-alıntı kısıtlı hibrittir.",
        yeni="Dört seviye, salt kural katmanından kanıt-alıntı kısıtlı hibride uzanır.",
        gerekce="Kolların tam listesi Şekil 1'de ve 2.1'de var; özette ölçek yeter.",
    ),
    Duzeltme(
        kod="E-8c",
        alan="ozet",
        eski="Sınama alanı olarak idari yazışma seçilmiştir; çünkü cevap uzayı kapalı "
             "tanımlanabilir",
        yeni="İdari yazışma seçilmiştir; çünkü cevap uzayı kapalı tanımlanabilir",
        gerekce="Bağlam zaten sınama alanını belli ediyor.",
    ),
    Duzeltme(
        kod="E-8d",
        alan="ozet",
        eski="ana küme 240 belge, replikasyon kümesi 120 belge, kör değerlendirmeye "
             "açılacak iddia sayısı 300'dür.",
        yeni="ana küme 240, replikasyon kümesi 120 belge, kör değerlendirme 300 iddiadır.",
        gerekce="Aynı üç sayı, dört kelime az.",
    ),

    # --- _meta belgeye RENDER EDILMEZ (doldur.py bu anahtari okumaz); yalniz
    #     ic izlenebilirlik kaydidir. Turu burada guncellenir ki yedekten yeniden
    #     kosuldugunda da dogru kalsin.
    Duzeltme(
        kod="M-1",
        alan="_meta",
        eski="Altı hakemli denetim turu (rubrik · ön inceleme · şüpheci · tutarlılık · "
             "istatistik · fizibilite) sonrası",
        yeni="Altı hakemli denetim turu (rubrik · ön inceleme · şüpheci · tutarlılık · "
             "istatistik · fizibilite) + 8 Ağustos çapraz tutarlılık turu sonrası. "
             "Son turda uygulanan düzeltmeler duzeltmeler_uygula.py içinde kod, çapa ve "
             "gerekçesiyle birlikte durur; metin oradan yeniden üretilebilir.",
        gerekce="İzlenebilirlik: hangi turun çıktısı olduğu tek yerden okunsun.",
    ),
)


def _uygula(ic: dict, d: Duzeltme) -> tuple[bool, str]:
    """Tek duzeltmeyi uygular. (basarili, mesaj) doner; dosyayi YAZMAZ."""
    if d.alan not in ic:
        return False, f"alan yok: {d.alan}"

    deger = ic[d.alan]
    metin_mi = isinstance(deger, str)
    metin = deger if metin_mi else json.dumps(deger, ensure_ascii=False)

    sayi = metin.count(d.eski)
    if sayi == 0:
        # "Zaten uygulanmis" ile "capa kaybolmus" ayni sey DEGILDIR: ilki normal
        # (betik idempotent kosulabilmeli), ikincisi metnin altimizdan kaydigi
        # anlamina gelir ve durmayi gerektirir.
        if not d.yeni:                       # saf silme: yokluk = uygulanmış
            return True, "zaten uygulanmış (silme)"
        if d.yeni in metin:
            return True, "zaten uygulanmış"
        return False, "ESKİ metin bulunamadı"
    if sayi > 1:
        return False, f"ESKİ metin {sayi} kez geçiyor — belirsiz, elle ayrıştırın"

    yeni_metin = metin.replace(d.eski, d.yeni)
    ic[d.alan] = yeni_metin if metin_mi else json.loads(yeni_metin)
    return True, "uygulandı"


def _atomik_yaz(yol: str, ic: dict) -> None:
    """Gecici dosyaya yazip yerine tasir: yarim dosya olusamaz."""
    klasor = os.path.dirname(os.path.abspath(yol)) or "."
    gecici = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=klasor,
                                         delete=False, suffix=".tmp") as f:
            gecici = f.name
            json.dump(ic, f, ensure_ascii=False, indent=1)
        os.replace(gecici, yol)
        gecici = None
    finally:
        if gecici and os.path.exists(gecici):
            os.unlink(gecici)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("icerik", help="TABAN dosya (icerik.taban.json)")
    ap.add_argument("--cikti", default=None,
                    help="sonucun yazılacağı dosya; verilmezse taban YERİNDE değişir")
    ap.add_argument("--kuru-calistir", action="store_true",
                    help="hiçbir şey yazma, yalnız eşleşmeleri denetle")
    args = ap.parse_args()

    with open(args.icerik, encoding="utf-8") as f:
        ic = json.load(f)

    kelime_once = sum(len(v.split()) for v in ic.values() if isinstance(v, str))

    print("=" * 78)
    print(f"HAKEM DÜZELTMELERİ — {len(DUZELTMELER)} madde"
          f"{'  [KURU ÇALIŞTIRMA]' if args.kuru_calistir else ''}")
    print("=" * 78)

    basarisiz: list[tuple[Duzeltme, str]] = []
    sonuclar: list[tuple[Duzeltme, str]] = []
    for d in DUZELTMELER:
        ok, mesaj = _uygula(ic, d)
        print(f"  [{'OK  ' if ok else 'HATA'}] {d.kod:<10} {d.alan:<22} {mesaj}")
        sonuclar.append((d, mesaj))
        if not ok:
            basarisiz.append((d, mesaj))

    if basarisiz:
        print("-" * 78)
        # Bu betik PRISTINE icerik.json'u (git HEAD surumu) donusturur. Ayni dosya
        # ikinci kez verilirse zincirlenmis duzenlemelerin capalari dogal olarak
        # bulunamaz: A bir metin uretir, B onu degistirir; ikinci kosumda ne A'nin
        # capasi ne A'nin ciktisi ortada olur. Bu bir HATA DEGIL, yanlis girdidir —
        # ve ayirt edilmezse operator gercek bir capa kaymasini da ayni mesajla
        # gorup onemsemeye baslar. Iki durum burada ayrilir.
        # Ayirt edici sinyal, BASARILARIN TURUdur: dosya zaten donusturulmusse
        # basarilar "zaten uygulanmis" der. Dosya pristine ise basarilar taze
        # uygulanir ve bir capa hatasi GERCEK hatadir. Ilk surum yalniz
        # "kac tanesi gecti" sayiyordu ve tek bir gercek capa hatasini
        # "zaten donusturulmus" diye etiketledi (olculdu).
        zaten = sum(1 for _, m in sonuclar if "zaten uygulanmış" in m)
        hepsi_capa = all("bulunamadı" in m for _, m in basarisiz)
        if hepsi_capa and zaten >= len(basarisiz):
            print("Bu dosya ZATEN DÖNÜŞTÜRÜLMÜŞ görünüyor — dosyaya dokunulmadı.")
            print(f"  {zaten} düzeltme yerinde, {len(basarisiz)} tanesinin çapası yok.")
            print("  Betik pristine icerik.json üzerinde çalışır (zincirlenmiş "
                  "düzeltmeler\n  ikinci koşumda çapasız kalır). Yeniden uygulamak için "
                  "git HEAD sürümünden\n  başlayın:  git checkout -- uretim/icerik.json")
            return 2
        print(f"{len(basarisiz)} düzeltme uygulanamadı — DOSYAYA DOKUNULMADI.")
        for d, mesaj in basarisiz:
            print(f"  {d.kod}: {mesaj}\n     aranan: {d.eski[:110]}…")
        return 1

    # --- IDEMPOTENS SINAVI (zorunlu).
    # Zincirlenmis duzenlemeler sinsi bir hata sinifi uretir: A duzeltmesi bir
    # metin ekler, B onu sikistirir; A'nin capasi HALA eslestigi icin betigin
    # ikinci kosumu ekleme islemini TEKRARLAR ve metni sessizce bozar. Olculdu:
    # B5/P-6 ve S-3/P-8 ciftleri tam olarak boyleydi. Artik betik kendi ciktisi
    # uzerinde yeniden kosup hicbir seyin degismedigini DOGRULAMADAN yazmaz.
    ikinci = json.loads(json.dumps(ic))
    tekrar = [d.kod for d in DUZELTMELER
              if _uygula(ikinci, d) == (True, "uygulandı")]
    if tekrar:
        print("-" * 78)
        print("İDEMPOTENS İHLALİ — DOSYAYA DOKUNULMADI.")
        print(f"  Şu düzeltmelerin çapası uygulandıktan sonra HÂLÂ eşleşiyor: "
              f"{', '.join(tekrar)}")
        print("  Bu, ikinci koşumda metnin bozulacağı anlamına gelir. Genellikle "
              "sebebi\n  zincirlenmiş düzenlemedir (biri ekler, diğeri sıkıştırır); "
              "ikisini tek\n  Duzeltme'de birleştirin.")
        return 1

    kelime_sonra = sum(len(v.split()) for v in ic.values() if isinstance(v, str))
    print("-" * 78)
    print(f"Metin alanları kelime sayısı: {kelime_once} → {kelime_sonra} "
          f"({kelime_sonra - kelime_once:+d})  ·  idempotens: TAMAM")

    if args.kuru_calistir:
        print("KURU ÇALIŞTIRMA: dosya değiştirilmedi.")
        return 0

    hedef = args.cikti or args.icerik
    _atomik_yaz(hedef, ic)
    print(f"YAZILDI (atomik): {hedef}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
