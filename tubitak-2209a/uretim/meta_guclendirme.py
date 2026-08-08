"""_meta'yi guclendirme turunun OLCULMUS sonuclariyla gunceller."""
import sys, json
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))
m = ic.get("_meta", {})

m["guclendirme_turu"] = {
    "guc_simulasyonu": {
        "durum": "FİİLEN KOŞULDU (Monte Carlo, sabit tohum 20260808, 1.200-2.000 tekrar)",
        "H1_fark_0.10": 0.857, "H1_MDES": 0.10,
        "H2_n240_etkilesim_0.10": 0.314, "H2_MDES_n240": 0.19,
        "H2_MDES_n480": 0.13, "H2_guc080_icin_gereken_n": 860,
        "H3_ana_etki": "0,99-1,00", "H4": 0.998, "H6": 1.00,
        "H7_altgrup_n48": 0.870, "H7_altgrup_n72": 0.939,
        "not": "Metin artık 'İP1'de koşulacak' TAAHHÜDÜ değil, ölçülmüş sayıları taşıyor. "
               "H2'nin sınırı gizlenmedi, MDES olarak İLAN EDİLDİ ve maliyeti hesaplanmış "
               "ön-kayıtlı genişletme koşulu tanımlandı (n=480, +1.440 koşum, MDES 0,13).",
    },
    "kaynak_dogrulama": {
        "durum": "21/21 DOĞRULANDI — uydurma atıf YOK",
        "yontem": "Crossref API · arXiv API · ACL Anthology · PMLR · OpenReview · "
                  "resmî kurum PDF'leri tek tek açıldı",
        "ozel_not": "Şüpheli görülen [5] ön baskısı arXiv API ile bağımsız teyit edildi "
                    "(başlık + üç yazar + tarih birebir). Etik ihlal riski bu başlıkta temiz.",
    },
    "cagri_teyidi": {
        "2026_cagrisi": "8 Ağustos 2026 itibarıyla HENÜZ AÇILMAMIŞ. Son çağrı 2025 "
                        "(13 Ekim → 12 Kasım 2025). Tarihsel örüntü: EKİM ayında açılıyor.",
        "destek_ust_limiti": "12.000 TL — resmî program sayfasından doğrulandı. UYARI: "
                             "tutar artık çağrı PDF'inde değil web sayfasında yaşıyor, "
                             "sessizce değişebilir; çağrı açılınca tekrar bakılmalı.",
        "degerlendirme_agirliklari": "%35 / %25 / %20 / %20 — DEĞİŞMEMİŞ",
        "form_surumu": "09102025 — elimizdekiyle aynı, 2026 formu yayımlanmamış",
        "donem_numaralandirmasi": "KALDIRILMIŞ. Çağrı artık '<yıl> Yılı Çağrısı' diye "
                                  "anılıyor. Kapaktaki '1. Dönem' ibaresi kaldırıldı.",
        "uyz_rehberi": "v04 (Ocak 2026). Başvuru anında ayrı beyan formu YOK; "
                       "ÜYZ Kaynakça Taahhütnamesi koşullu kabul sonrası alınıyor.",
    },
}

m["kalan_riskler"] = [
    "ÇAĞRI HENÜZ AÇILMADI — 2209-A'nın 2026 çağrısı 8 Ağustos itibarıyla yayımlanmamış. "
    "Tarihsel örüntü Ekim'i gösteriyor. Çağrı açılınca: (a) destek üst limitini web "
    "sayfasından tekrar teyit edin, (b) kapağa çağrının resmî adını yazın, (c) çağrı "
    "duyurusunun yeni sürümünü bu paketle karşılaştırın.",

    "KAPAK YIL/ÇAĞRI ADI — 'dönem' ibaresi kaldırıldı (2209-A'da artık yok). Yıl şu an "
    "2026 yazıyor; çağrı açıldığında resmî adıyla güncelleyin.",

    "+1 PUAN FIRSATI (m.5.2.7) — proje ekibinde özel gereksinimli bir birey varsa, başvuru "
    "sırasında 'Engelli Sağlık Raporu Referans Numarası' beyan edilirse değerlendirme "
    "toplam puanına 1 PUAN eklenir. Bu, başvuru sisteminde beyan edilir, metinde değil.",

    "ÖN ÇALIŞMA SAYILARI HÂLÂ BAYAT — bu turda YENİDEN ÖLÇÜLEMEDİ çünkü .env dosyasında "
    "LLM API anahtarı yok. Anahtar eklenirse sınıflandırma/yönlendirme/özet metrikleri "
    "güncel modelle tazelenebilir ve bu zayıflık TAMAMEN kapanır. Metin şu an bayatlığı "
    "açıkça beyan edip İP1'de yeniden ölçüleceğini taahhüt ediyor — dürüst ama ikinci en iyi.",

    "H2 GÜCÜ SINIRLI (ölçüldü: 0,314) — gizlenmedi, MDES 0,19 olarak ilan edildi ve "
    "ön-kayıtlı genişletme koşulu (n=480 → MDES 0,13) tanımlandı. Ana etkiler (H1 0,857, "
    "H3 0,99-1,00) sağlam; çalışma H2'den bağımsız olarak bilgi üretiyor.",

    "ÜYZ BEYANI — bu metin üretken yapay zekâ araçlarıyla hazırlandı. ÜYZ Rehberi v04 "
    "(Ocak 2026) 'önemli ölçüde' kullanımda şeffaf beyan istiyor; nihai sorumluluk "
    "akademik danışmanda. Danışmana bildirin.",

    "KATMANLI RAPORLAMA BLOĞU — sayfa sınırı için 2.5'ten çıkarıldı; Katman A/B ayrımının "
    "önceden bağlayıcı kuralı kaybedildi. Yer açılırsa geri konması önerilir.",

    "GÖNÜLLÜ DEĞERLENDİRİCİ — kör değerlendirmenin ikisi danışmanın bölümünden gönüllü "
    "akademik katkı. Bu iki kişi ilk ayda belirlenmeli; bulunamazsa bütçeden aktarımla "
    "ücretlendirme yoluna gidilecek (kural metinde yazılı).",

    "İŞ YÜKÜ — fizibilite hakemi %152 doluluk hesaplamıştı; iş devirleri ve kilometre "
    "taşlarıyla düşürüldü ama takvim sıkı. Danışmanla haftalık takip metinde taahhüt edilen "
    "yordamın kendisidir, süs değil.",
]

ic["_meta"] = m
json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"_meta güncellendi: {len(m['kalan_riskler'])} açık madde, güçlendirme turu işlendi")
