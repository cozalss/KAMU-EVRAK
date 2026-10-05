"""e2e_gercek_gold.jsonl üreticisi (scripts/) — her satır elle yazılmış senaryodur.

Doğrulama: beklenen/kabul/yasak mevzuat önekleri data/mevzuat'ta GERÇEK dosyaya eşlenmeli
(eşlenmezse betik durur); birim kabul kökleri teskilat korpusunda aranır, yoksa uyarı basılır.
"""
import json
import sys
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
KOK = Path(__file__).resolve().parents[1]
MEV = KOK / "data" / "mevzuat"
TES = KOK / "data" / "teskilat"
CIKTI = KOK / "data" / "synthetic" / "e2e_gercek_gold.jsonl"

AD = "Ayşe Yılmaz"
TCKN = "10000000146"
TEL = "0555-123-4567"


def imza_blok(adres: str, tarih: str, imza: bool = True, iletisim: bool = True,
              tckn: bool = True) -> str:
    satirlar = [f"\n{tarih}\n", AD]
    if tckn:
        satirlar.append(f"T.C. Kimlik No: {TCKN}")
    if iletisim:
        satirlar.append(f"Tel: {TEL}")
        satirlar.append(f"Adres: {adres}")
    if imza:
        satirlar.append("İmza")
    return "\n".join(satirlar)


def D(**kw):  # beklenen sözlüğü — varsayılanlarla
    b = {
        "evrak_turu": kw.pop("tur"),
        "evrak_turu_kabul": kw.pop("tur_kabul", []),
        "muhatap_kurum": kw.pop("muhatap"),
        "muhatap_kabul": kw.pop("muhatap_kabul"),
        "yetki": kw.pop("yetki", "ICERIDE"),
        "yetkili_kurum": kw.pop("yetkili", None),
        "yetkili_kurum_kabul": kw.pop("yetkili_kabul", []),
        "talep_sayisi": None,
        "talepler": [],
        "talep_detay": kw.pop("talepler"),
        "birim_kabul_edilebilir": kw.pop("birim"),
        "konu_anahtar": kw.pop("konu"),
        "ilgi_turu": kw.pop("ilgi_turu", "dilekce"),
        "ilgi_gonderen": kw.pop("ilgi_gonderen", AD),
        "ilgi_gonderen_kabul": kw.pop("ilgi_kabul", [AD]),
        "beklenen_mevzuat_herhangi": kw.pop("mev"),
        "mevzuat_kabul": kw.pop("mev_kabul", []),
        "alakasiz_mevzuat_yasak": kw.pop("yasak", ["5176", "5690"]),
        "eksikler": kw.pop("eksik", []),
        "kurum_tipi": kw.pop("kurum_tipi"),
        "kanal": kw.pop("kanal", "dilekce"),
    }
    assert not kw, kw
    b["talep_sayisi"] = len(b["talep_detay"])
    b["talepler"] = [t["ozet"] for t in b["talep_detay"]]
    for t in b["talep_detay"]:
        t.setdefault("yetki", "ICERIDE")
        t.setdefault("yetkili_kurum_kabul", [])
    return b


def T(ozet, anahtar, birim, yetki="ICERIDE", yetkili_kabul=None):
    return {"ozet": ozet, "anahtar": anahtar, "birim_kabul": birim, "yetki": yetki,
            "yetkili_kurum_kabul": yetkili_kabul or []}


ASKI = ["ASKİ", "Ankara Su ve Kanalizasyon"]
EDAS_ANK = ["Başkent EDAŞ", "Başkent Elektrik", "Elektrik Dağıtım", "EDAŞ"]
FEN = ["Fen İşleri", "Yol Bakım", "Yol Yapım", "Altyapı"]
DILEKCE_MEV_KABUL = ["3071", "5393"]
S = []  # (id, metin, beklenen)

# ---------------------------------------------------------------- İLÇE BELEDİYELERİ
S.append(("ilce_kecioren_cukur_su", """T.C.
KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Keçiören ilçesi, Bağlarbaşı Mahallesi, Gül Sokak No: 12 adresinde ikamet etmekteyim. Sokağımızda iki aydır büyük bir çukur bulunmakta, araçlar ve yayalar için tehlike oluşturmaktadır. Çukurun en kısa sürede kapatılmasını talep ediyorum.

Ayrıca Eylül 2026 dönemine ait su faturam olağan tüketimimin çok üzerinde, 1.850 TL olarak gelmiştir. Sayacımın kontrol edilmesini ve fazla tahsil edilen tutarın iadesini arz ederim.
""" + imza_blok("Bağlarbaşı Mah. Gül Sok. No:12 Keçiören/ANKARA", "02.10.2026"),
    D(tur="dilekce", tur_kabul=["talep", "sikayet"], muhatap="Keçiören Belediyesi",
      muhatap_kabul=["Keçiören Belediye"], yetki="DISARIDA", yetkili="ASKİ Genel Müdürlüğü",
      yetkili_kabul=ASKI,
      talepler=[T("Sokaktaki çukurun kapatılması", ["çukur"], FEN),
                T("Su faturası itirazı, sayaç kontrolü ve iade", ["fatura", "sayaç"],
                  ASKI + ["Abone"], "DISARIDA", ASKI)],
      birim=FEN, konu=["çukur", "yol", "su fatura"],
      mev=["3071", "5393"], mev_kabul=["2560", "5216"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_cankaya_gurultu", """T.C.
ÇANKAYA BELEDİYE BAŞKANLIĞINA
(Zabıta Müdürlüğü)

Konu: İşyerinden kaynaklanan gürültü şikâyeti

Kızılay Mahallesi, Lale Sokak No: 7'deki apartmanımızın zemin katında faaliyet gösteren kafe, her gece saat 01.00'e kadar yüksek sesle müzik yayını yapmaktadır. Apartman sakinleri olarak uyuyamıyoruz. İşyerinin denetlenmesini ve gerekli yaptırımın uygulanmasını arz ederim.
""" + imza_blok("Kızılay Mah. Lale Sok. No:7/4 Çankaya/ANKARA", "28.09.2026"),
    D(tur="sikayet", tur_kabul=["dilekce"], muhatap="Çankaya Belediyesi",
      muhatap_kabul=["Çankaya Belediye"],
      talepler=[T("Kafeden kaynaklanan gece gürültüsünün denetlenmesi", ["gürültü", "müzik", "denetle", "işyeri"],
                  ["Zabıta", "Ruhsat ve Denetim"])],
      birim=["Zabıta", "Ruhsat ve Denetim"], konu=["gürültü"],
      mev=["cevresel_gurultu_kontrol_yonetmeligi", "5326", "5393"],
      mev_kabul=["3071", "isyeri_acma_calisma_ruhsatlari_yonetmeligi", "2872"],
      kurum_tipi="ilce_belediyesi")))

S.append(("ilce_mamak_park_lamba", """T.C.
MAMAK BELEDİYE BAŞKANLIĞINA

Mamak ilçesi Ege Mahallesi'nde oturmaktayım. Mahallemizdeki Çınar Parkı'nda çocuk oyun gruplarının salıncakları kırık ve çocuklar için tehlikeli durumdadır; parkın bakımının yapılmasını istiyorum.

Ayrıca parkın önündeki Selvi Sokak'ta üç sokak lambası bir aydır yanmamakta, akşamları sokak tamamen karanlık kalmaktadır. Lambaların onarılması için gereğini arz ederim.
""" + imza_blok("Ege Mah. Selvi Sok. No:3 Mamak/ANKARA", "25.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "sikayet"], muhatap="Mamak Belediyesi",
      muhatap_kabul=["Mamak Belediye"], yetki="DISARIDA", yetkili="Başkent EDAŞ",
      yetkili_kabul=EDAS_ANK,
      talepler=[T("Parktaki kırık oyun gruplarının bakımı", ["park", "salıncak", "oyun"],
                  ["Park ve Bahçeler"]),
                T("Yanmayan sokak lambalarının onarılması", ["lamba", "aydınlatma"],
                  EDAS_ANK + ["Genel Aydınlatma"], "DISARIDA", EDAS_ANK)],
      birim=["Park ve Bahçeler"], konu=["park", "oyun", "lamba", "aydınlatma"],
      mev=["3071", "5393"], mev_kabul=["6446"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_yenimahalle_cop", """YENİMAHALLE BELEDİYE BAŞKANLIĞINA

Batıkent'te Kardelen Mahallesi 2. Cadde üzerinde bulunan çöp konteynerleri on gündür boşaltılmamaktadır. Konteynerlerin çevresinde çöp yığınları oluşmuş, kötü koku ve haşere sorunu başlamıştır. Çöplerin düzenli olarak toplanmasını ve bölgenin ilaçlanmasını rica ederim.
""" + imza_blok("Kardelen Mah. 2. Cad. No:41 Yenimahalle/ANKARA", "29.09.2026"),
    D(tur="sikayet", tur_kabul=["dilekce", "talep"], muhatap="Yenimahalle Belediyesi",
      muhatap_kabul=["Yenimahalle Belediye"],
      talepler=[T("Çöplerin toplanması ve ilaçlama", ["çöp", "konteyner", "ilaç"],
                  ["Temizlik İşleri"])],
      birim=["Temizlik İşleri"], konu=["çöp", "temizlik", "atık"],
      mev=["5393", "atik_yonetimi_yonetmeligi"], mev_kabul=["3071", "2872", "1593"],
      kurum_tipi="ilce_belediyesi")))

S.append(("ilce_etimesgut_ruhsat", """T.C.
ETİMESGUT BELEDİYE BAŞKANLIĞINA
Ruhsat ve Denetim Müdürlüğüne

Konu: İşyeri açma ve çalışma ruhsatı başvurusu

Etimesgut ilçesi Piyade Mahallesi, Atatürk Bulvarı No: 88/B adresinde "Yılmaz Kırtasiye" unvanıyla kırtasiye işyeri açmak istiyorum. İşyeri açma ve çalışma ruhsatı düzenlenmesi için gereğini arz ederim.

Ekler:
1- Kira sözleşmesi
2- Vergi levhası
3- Yapı kullanma izin belgesi fotokopisi
""" + imza_blok("Piyade Mah. Atatürk Bulv. No:88/B Etimesgut/ANKARA", "01.10.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="Etimesgut Belediyesi",
      muhatap_kabul=["Etimesgut Belediye"],
      talepler=[T("Kırtasiye için işyeri açma ve çalışma ruhsatı", ["ruhsat"],
                  ["Ruhsat ve Denetim", "Ruhsat"])],
      birim=["Ruhsat ve Denetim", "Ruhsat"], konu=["ruhsat"],
      mev=["isyeri_acma_calisma_ruhsatlari_yonetmeligi"], mev_kabul=["5393", "3071", "2464"],
      kurum_tipi="ilce_belediyesi")))

S.append(("ilce_kadikoy_agac_kaldirim", """KADIKÖY BELEDİYE BAŞKANLIĞINA

Caferağa Mahallesi Moda Caddesi No: 140 önündeki çınar ağacının dalları balkonlara ve elektrik tellerine değmektedir; fırtınada kırılma tehlikesi vardır. Ağacın budanmasını istiyorum.

Aynı adresin önündeki kaldırım taşları yerinden oynamış, yaşlılar ve bebek arabaları için yürünemez hâle gelmiştir. Kaldırımın onarılmasını da talep ederim.

Gereğini bilgilerinize arz ederim.
""" + imza_blok("Caferağa Mah. Moda Cad. No:140/6 Kadıköy/İSTANBUL", "30.09.2026"),
    D(tur="dilekce", tur_kabul=["talep"], muhatap="Kadıköy Belediyesi",
      muhatap_kabul=["Kadıköy Belediye"],
      talepler=[T("Çınar ağacının budanması", ["ağaç", "budan"], ["Park ve Bahçeler"]),
                T("Bozuk kaldırımın onarılması", ["kaldırım"], FEN)],
      birim=["Park ve Bahçeler"] + FEN, konu=["ağaç", "budama", "kaldırım"],
      mev=["3071", "5393"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_kadikoy_su_kesintisi", """KADIKÖY BELEDİYE BAŞKANLIĞINA

Fenerbahçe Mahallesi'nde son bir haftada habersiz olarak üç kez uzun süreli su kesintisi yaşanmıştır. Kesintiler önceden duyurulmamakta, ana borudaki arıza bir türlü giderilmemektedir. Su kesintilerinin sebebinin araştırılmasını ve ana borunun onarılmasını talep ederim.
""" + imza_blok("Fenerbahçe Mah. Kalamış Cad. No:22 Kadıköy/İSTANBUL", "27.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep"], muhatap="Kadıköy Belediyesi",
      muhatap_kabul=["Kadıköy Belediye"], yetki="DISARIDA", yetkili="İSKİ Genel Müdürlüğü",
      yetkili_kabul=["İSKİ", "İstanbul Su ve Kanalizasyon"],
      talepler=[T("Su kesintisi ve ana boru arızası", ["su kesinti", "boru", "kesinti"],
                  ["İSKİ", "Yazı İşleri", "Halkla İlişkiler", "Kurumsal İletişim"],
                  "DISARIDA", ["İSKİ", "İstanbul Su ve Kanalizasyon"])],
      birim=["İSKİ", "Yazı İşleri", "Halkla İlişkiler", "Kurumsal İletişim"],
      konu=["su", "kesinti"], mev=["3071", "2560"], mev_kabul=["5216", "5393"],
      kurum_tipi="ilce_belediyesi")))

S.append(("ilce_nilufer_dogalgaz", """NİLÜFER BELEDİYE BAŞKANLIĞINA

Görükle Mahallesi'nde yeni tamamlanan binamıza doğal gaz bağlantısı yapılması için üç aydır bekliyoruz. Servis hattı çekilmedi ve abonelik işlemlerimiz başlatılamadı. Binamıza doğal gaz servis hattının çekilmesi için gereğinin yapılmasını arz ederim.
""" + imza_blok("Görükle Mah. Kayalı Sok. No:9 Nilüfer/BURSA", "26.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Nilüfer Belediyesi",
      muhatap_kabul=["Nilüfer Belediye"], yetki="DISARIDA", yetkili="Bursagaz",
      yetkili_kabul=["Bursagaz", "Bursa Şehiriçi Doğal Gaz", "Doğal Gaz Dağıtım"],
      talepler=[T("Doğal gaz servis hattı ve abonelik", ["doğal gaz", "dogalgaz", "servis hatt"],
                  ["Bursagaz", "Yazı İşleri", "Halkla İlişkiler", "Abone"], "DISARIDA",
                  ["Bursagaz", "Doğal Gaz Dağıtım"])],
      birim=["Bursagaz", "Yazı İşleri", "Halkla İlişkiler", "Abone"],
      konu=["doğal gaz", "dogalgaz"], mev=["3071", "4646"], mev_kabul=["5393"],
      kurum_tipi="ilce_belediyesi")))

S.append(("ilce_muratpasa_sokak_kopek", """MURATPAŞA BELEDİYE BAŞKANLIĞINA

Şirinyalı Mahallesi 1520 Sokak çevresinde sahipsiz köpekler sürü hâlinde dolaşmakta, sabahları okula giden çocuklara saldırma girişiminde bulunmaktadır. Hayvanların toplanarak rehabilitasyon merkezine götürülmesini, aşılarının ve kısırlaştırmalarının yapılmasını talep ediyorum.
""" + imza_blok("Şirinyalı Mah. 1520 Sok. No:4 Muratpaşa/ANTALYA", "24.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep", "ihbar"], muhatap="Muratpaşa Belediyesi",
      muhatap_kabul=["Muratpaşa Belediye"],
      talepler=[T("Sahipsiz köpeklerin toplanması ve rehabilitasyonu", ["köpe", "hayvan"],
                  ["Veteriner", "Sağlık İşleri"])],
      birim=["Veteriner", "Sağlık İşleri"], konu=["köpe", "hayvan"],
      mev=["5199"], mev_kabul=["3071", "5393"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_konak_kacak_yapi", """T.C.
KONAK BELEDİYE BAŞKANLIĞINA

Alsancak Mahallesi 1453 Sokak No: 15'te bulunan binanın çatı katında son iki haftadır ruhsatsız olarak ilave kat inşaatı yapıldığını gözlemledim. Yapıda herhangi bir ruhsat levhası bulunmamaktadır. Kaçak yapının yerinde incelenmesini ve yasal işlem yapılmasını bilgilerinize arz ederim.
""" + imza_blok("Alsancak Mah. 1453 Sok. No:17 Konak/İZMİR", "23.09.2026"),
    D(tur="ihbar", tur_kabul=["sikayet", "dilekce"], muhatap="Konak Belediyesi",
      muhatap_kabul=["Konak Belediye"],
      talepler=[T("Ruhsatsız çatı katı inşaatının denetlenmesi", ["kaçak", "ruhsatsız", "inşaat"],
                  ["İmar ve Şehircilik", "Yapı Kontrol", "Zabıta"])],
      birim=["İmar ve Şehircilik", "Yapı Kontrol", "Zabıta"], konu=["kaçak yapı", "ruhsatsız", "inşaat"],
      mev=["3194"], mev_kabul=["3071", "5393", "planli_alanlar_imar_yonetmeligi",
                              "yapi_ruhsati_yapi_kullanma_izni_islemleri", "4708"],
      kurum_tipi="ilce_belediyesi")))

S.append(("ilce_sincan_sosyal_yardim", """SİNCAN BELEDİYE BAŞKANLIĞINA

Eşim geçen ay işini kaybetti ve üç çocuğumla birlikte geçimimizi sağlamakta zorlanıyoruz. Kış yaklaşırken yakacak ve gıda yardımından yararlanmak istiyorum. Durumumun incelenerek sosyal yardım yapılmasını saygılarımla arz ederim.
""" + imza_blok("Pınarbaşı Mah. 23. Sok. No:6 Sincan/ANKARA", "03.10.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Sincan Belediyesi",
      muhatap_kabul=["Sincan Belediye"],
      talepler=[T("Yakacak ve gıda yardımı", ["yardım", "yakacak", "gıda"],
                  ["Sosyal Yardım", "Sosyal Hizmetler"])],
      birim=["Sosyal Yardım", "Sosyal Hizmetler"], konu=["sosyal yardım", "yardım"],
      mev=["5393"], mev_kabul=["3071", "3294", "2828"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_polatli_elektrik", """POLATLI BELEDİYE BAŞKANLIĞINA

Cumhuriyet Mahallesi'nde son on gündür neredeyse her akşam elektrikler kesilmektedir. Kesintiler nedeniyle buzdolabımız ve çamaşır makinemiz arızalandı. Kesintilerin giderilmesini ve zararımın karşılanmasını talep ederim.
""" + imza_blok("Cumhuriyet Mah. İstiklal Cad. No:31 Polatlı/ANKARA", "29.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep"], muhatap="Polatlı Belediyesi",
      muhatap_kabul=["Polatlı Belediye"], yetki="DISARIDA", yetkili="Başkent EDAŞ",
      yetkili_kabul=EDAS_ANK,
      talepler=[T("Elektrik kesintileri ve cihaz hasarının karşılanması",
                  ["elektrik", "kesinti"], EDAS_ANK + ["Yazı İşleri", "Halkla İlişkiler"],
                  "DISARIDA", EDAS_ANK)],
      birim=EDAS_ANK + ["Yazı İşleri", "Halkla İlişkiler"], konu=["elektrik", "kesinti"],
      mev=["6446", "3071"], mev_kabul=["6502"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_bornova_emlak_vergisi", """BORNOVA BELEDİYE BAŞKANLIĞINA

Kazımdirik Mahallesi'ndeki 85 m² dairem için 2026 yılı emlak vergisi, dairenin gerçek alanı yerine 185 m² üzerinden tahakkuk ettirilmiştir. Bildirimimdeki alan bilgisinin düzeltilerek vergimin yeniden hesaplanmasını ve fazla ödediğim ilk taksitin iadesini arz ederim.
""" + imza_blok("Kazımdirik Mah. 372. Sok. No:11 Bornova/İZMİR", "22.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "sikayet"], muhatap="Bornova Belediyesi",
      muhatap_kabul=["Bornova Belediye"],
      talepler=[T("Emlak vergisi tahakkukunun düzeltilmesi ve iade", ["emlak vergi", "vergi"],
                  ["Mali Hizmetler", "Malî Hizmetler", "Gelirler"])],
      birim=["Mali Hizmetler", "Malî Hizmetler", "Gelirler"], konu=["emlak vergisi", "vergi"],
      mev=["1319"], mev_kabul=["3071", "2464", "213", "5393"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_selcuklu_uclu", """SELÇUKLU BELEDİYE BAŞKANLIĞINA

Bosna Hersek Mahallesi'nde ikamet ediyorum. Mahallemizle ilgili üç sorunu bilgilerinize sunarım:
1) Kumru Sokak'ta asfaltta oluşan derin çukur nedeniyle iki araç lastiği patladı; çukurun onarılmasını,
2) Sokağımızdaki çöp konteynerinin bir haftadır boşaltılmamasının giderilmesini,
3) Kumru Sokak'taki sokak lambalarının iki haftadır yanmadığından onarılmasını
talep ederim.
""" + imza_blok("Bosna Hersek Mah. Kumru Sok. No:14 Selçuklu/KONYA", "01.10.2026"),
    D(tur="dilekce", tur_kabul=["talep", "sikayet"], muhatap="Selçuklu Belediyesi",
      muhatap_kabul=["Selçuklu Belediye"], yetki="DISARIDA", yetkili="Meram Elektrik Dağıtım",
      yetkili_kabul=["Meram Elektrik", "MEDAŞ", "Elektrik Dağıtım", "EDAŞ"],
      talepler=[T("Asfalttaki çukurun onarılması", ["çukur", "asfalt"], FEN),
                T("Çöp konteynerinin boşaltılması", ["çöp", "konteyner"], ["Temizlik İşleri"]),
                T("Sokak lambalarının onarılması", ["lamba", "aydınlatma"],
                  ["Meram Elektrik", "Elektrik Dağıtım", "Genel Aydınlatma"], "DISARIDA",
                  ["Meram Elektrik", "MEDAŞ", "Elektrik Dağıtım", "EDAŞ"])],
      birim=FEN + ["Temizlik İşleri"], konu=["çukur", "asfalt", "çöp", "lamba", "mahalle"],
      mev=["3071", "5393"], mev_kabul=["6446"], kurum_tipi="ilce_belediyesi")))

# ---------------------------------------------------------------- BÜYÜKŞEHİR
S.append(("bb_ankara_sinyalizasyon", """T.C.
ANKARA BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA

Dikmen Caddesi ile Turan Güneş Bulvarı kavşağındaki trafik ışıkları bir haftadır arızalıdır; sabah ve akşam saatlerinde kavşakta ciddi kaza riski oluşmaktadır. Sinyalizasyon sisteminin onarılmasını talep ederim.
""" + imza_blok("Dikmen Mah. Dikmen Cad. No:210 Çankaya/ANKARA", "30.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep"], muhatap="Ankara Büyükşehir Belediyesi",
      muhatap_kabul=["Ankara Büyükşehir"],
      talepler=[T("Arızalı trafik ışıklarının onarılması", ["trafik ışı", "sinyalizasyon"],
                  ["Ulaşım", "Trafik", "Fen İşleri"])],
      birim=["Ulaşım", "Trafik", "Fen İşleri"], konu=["trafik", "sinyalizasyon", "ışık"],
      mev=["5216", "2918", "karayollari_trafik_yonetmeligi"], mev_kabul=["3071"],
      kurum_tipi="buyuksehir_belediyesi")))

S.append(("bb_istanbul_yol_cokme", """İSTANBUL BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA

Ümraniye ilçesinden geçen Alemdağ Caddesi'nin Çakmak Mahallesi kesiminde yol çökmüş, şerit daralmış ve uzun araç kuyrukları oluşmaktadır. Çökmenin ana arterde olması nedeniyle onarımın acilen yapılmasını arz ederim.
""" + imza_blok("Çakmak Mah. Alemdağ Cad. No:301 Ümraniye/İSTANBUL", "28.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep", "ihbar"], muhatap="İstanbul Büyükşehir Belediyesi",
      muhatap_kabul=["İstanbul Büyükşehir"],
      talepler=[T("Ana arterdeki yol çökmesinin onarılması", ["çök", "yol"],
                  ["Yol Yapım", "Yol Bakım", "Fen İşleri", "Altyapı"])],
      birim=["Yol Yapım", "Yol Bakım", "Fen İşleri", "Altyapı"], konu=["yol", "çökme"],
      mev=["5216"], mev_kabul=["3071", "5393"], kurum_tipi="buyuksehir_belediyesi")))

S.append(("bb_izmir_itfaiye_rapor", """İZMİR BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA
İtfaiye Dairesi Başkanlığına

Konu: İtfaiye uygunluk raporu başvurusu

Karşıyaka ilçesi Bostanlı Mahallesi Cemal Gürsel Caddesi No: 500 adresinde açmayı planladığım 120 m² kapalı alanlı restoran için yangın güvenliği yönünden itfaiye uygunluk raporu düzenlenmesini arz ederim. Yangın tüpü ve acil çıkış planı ekte sunulmuştur.
""" + imza_blok("Bostanlı Mah. Cemal Gürsel Cad. No:500 Karşıyaka/İZMİR", "02.10.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="İzmir Büyükşehir Belediyesi",
      muhatap_kabul=["İzmir Büyükşehir"],
      talepler=[T("Restoran için itfaiye uygunluk raporu", ["itfaiye", "yangın"], ["İtfaiye"])],
      birim=["İtfaiye"], konu=["itfaiye", "yangın", "uygunluk"],
      mev=["binalarin_yangindan_korunmasi_yonetmeligi"],
      mev_kabul=["5216", "3071", "isyeri_acma_calisma_ruhsatlari_yonetmeligi"],
      kurum_tipi="buyuksehir_belediyesi")))

S.append(("bb_ankara_su_faturasi", """ANKARA BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA

Yenimahalle'deki evimin Ağustos 2026 su faturası 2.340 TL gelmiştir. Evde yalnız yaşıyorum ve önceki aylarda faturam 300 TL civarındaydı. Sayaçta arıza olduğunu düşünüyorum. Sayacın test edilmesini ve faturanın düzeltilmesini arz ederim.

Abone No: 4410023
""" + imza_blok("Demetevler Mah. 402. Cad. No:18 Yenimahalle/ANKARA", "21.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep"], muhatap="Ankara Büyükşehir Belediyesi",
      muhatap_kabul=["Ankara Büyükşehir"], yetki="DISARIDA", yetkili="ASKİ Genel Müdürlüğü",
      yetkili_kabul=ASKI,
      talepler=[T("Su faturası itirazı ve sayaç testi", ["fatura", "sayaç"],
                  ASKI + ["Abone"], "DISARIDA", ASKI)],
      birim=ASKI + ["Abone"], konu=["su fatura", "sayaç"],
      mev=["2560", "3071"], mev_kabul=["5216"], kurum_tipi="buyuksehir_belediyesi")))

S.append(("bb_bursa_mezarlik_cop", """BURSA BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA

1) Geçen hafta vefat eden babamın Emirsultan Mezarlığı'nda annemin yanına defnedilebilmesi için aile kabri yer tahsisi yapılmasını,
2) Osmangazi ilçesi Hamitler Mahallesi Papatya Sokak'ta çöplerin üç gündür toplanmamasıyla ilgili gereğinin yapılmasını
arz ederim.
""" + imza_blok("Hamitler Mah. Papatya Sok. No:5 Osmangazi/BURSA", "04.10.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Bursa Büyükşehir Belediyesi",
      muhatap_kabul=["Bursa Büyükşehir"], yetki="DISARIDA", yetkili="Osmangazi Belediyesi",
      yetkili_kabul=["Osmangazi Belediye"],
      talepler=[T("Mezarlıkta aile kabri yer tahsisi", ["mezar", "kabir", "kabri", "defin", "defn"],
                  ["Mezarlık"]),
                T("Sokaktaki çöplerin toplanması", ["çöp"], ["Osmangazi", "Temizlik"],
                  "DISARIDA", ["Osmangazi Belediye"])],
      birim=["Mezarlık"], konu=["mezar", "kabir", "defin", "çöp"],
      mev=["5216", "3071"], mev_kabul=["5393", "1593"], kurum_tipi="buyuksehir_belediyesi")))

# ---------------------------------------------------------------- VALİLİK
S.append(("valilik_ankara_tapu", """T.C.
ANKARA VALİLİĞİNE

Babam geçen ay vefat etmiştir. Keçiören ilçesi Etlik Mahallesi 1234 ada 5 parselde kayıtlı dairenin mirasçılar adına intikalinin yapılması ve tapunun adıma çıkarılması için gereğini arz ederim. Veraset ilamı ekte sunulmuştur.
""" + imza_blok("Etlik Mah. Yunus Emre Cad. No:2 Keçiören/ANKARA", "29.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Ankara Valiliği",
      muhatap_kabul=["Ankara Valili"], yetki="DISARIDA", yetkili="Keçiören Tapu Müdürlüğü",
      yetkili_kabul=["Tapu"],
      talepler=[T("Mirasçılar adına tapu intikali", ["intikal", "tapu", "miras"],
                  ["Tapu", "İl Yazı İşleri"], "DISARIDA", ["Tapu"])],
      birim=["Tapu", "İl Yazı İşleri", "Yazı İşleri"], konu=["intikal", "tapu", "miras"],
      mev=["2644", "3071"], mev_kabul=["4721", "tapu_sicili_tuzugu", "7338", "5442"],
      kurum_tipi="valilik")))

S.append(("valilik_ankara_dernek", """T.C.
ANKARA VALİLİĞİNE
(İl Sivil Toplumla İlişkiler Müdürlüğü)

Konu: Dernek kuruluş bildirimi

Kurucu üyesi bulunduğum "Keçiören Doğa Yürüyüşçüleri Derneği"nin kuruluş bildirimi, tüzüğü ve kurucu üyelere ait belgeler ekte sunulmuştur. Derneğimizin kütüğe kaydının yapılmasını arz ederim.
""" + imza_blok("Etlik Mah. Halil Sezai Erkut Cad. No:30 Keçiören/ANKARA", "01.10.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="Ankara Valiliği",
      muhatap_kabul=["Ankara Valili"],
      talepler=[T("Dernek kuruluş bildirimi ve kütük kaydı", ["dernek"],
                  ["Sivil Toplum", "Dernekler"])],
      birim=["Sivil Toplum", "Dernekler"], konu=["dernek", "kuruluş"],
      mev=["5253"], mev_kabul=["3071", "5442", "2709"], kurum_tipi="valilik")))

S.append(("valilik_konya_cimer_kopek", """T.C.
KONYA VALİLİĞİ
İl Basın ve Halkla İlişkiler Müdürlüğü

CİMER Başvuru No: 2026-0918-44721
Başvuru Tarihi: 18.09.2026
Başvuru Sahibi: Ayşe Yılmaz (T.C. Kimlik No: 10000000146)

Başvuru Metni:
Selçuklu ilçesi Yazır Mahallesi'nde sahipsiz köpekler çocuklara saldırıyor, kimse ilgilenmiyor. Köpeklerin toplanıp barınağa götürülmesini istiyorum.

İletişim: 0555-123-4567, Yazır Mah. Ilgaz Sok. No:7 Selçuklu/KONYA
""",
    D(tur="cimer", tur_kabul=["sikayet"], muhatap="Konya Valiliği", muhatap_kabul=["Konya Valili"],
      yetki="DISARIDA", yetkili="Selçuklu Belediyesi",
      yetkili_kabul=["Selçuklu Belediye", "Konya Büyükşehir"],
      talepler=[T("Sahipsiz köpeklerin toplanıp barınağa götürülmesi", ["köpe", "hayvan"],
                  ["Selçuklu", "Veteriner", "Basın ve Halkla", "Halkla İlişkiler"], "DISARIDA",
                  ["Selçuklu Belediye", "Konya Büyükşehir"])],
      birim=["Selçuklu", "Veteriner", "Basın ve Halkla", "Halkla İlişkiler"],
      konu=["köpe", "hayvan"], ilgi_turu="cimer", ilgi_kabul=[AD, "CİMER"],
      mev=["5199", "3071", "5690"], mev_kabul=["5393", "5216"], yasak=["5176"],
      eksik=["imza"], kurum_tipi="valilik", kanal="cimer")))

S.append(("valilik_bursa_yuruyus", """T.C.
BURSA VALİLİĞİNE

Konu: Toplantı ve gösteri yürüyüşü bildirimi

Bursa Çevre Gönüllüleri Platformu düzenleme kurulu başkanı olarak, 18.10.2026 Pazar günü saat 11.00-13.00 arasında Kent Meydanı ile Heykel arasında "Uludağ'ı koruyalım" temalı barışçıl yürüyüş düzenleyeceğimizi bildiririz. Düzenleme kurulu üyelerinin listesi ve güzergâh krokisi ektedir. Bildirimimizin kabulünü arz ederim.
""" + imza_blok("Kükürtlü Mah. Oylum Sok. No:3 Osmangazi/BURSA", "02.10.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="Bursa Valiliği",
      muhatap_kabul=["Bursa Valili"],
      talepler=[T("Toplantı ve gösteri yürüyüşü bildirimi", ["yürüyüş", "gösteri", "toplantı"],
                  ["İdare ve Denetim", "Emniyet", "İl Yazı İşleri", "Özel Kalem", "Güvenlik"])],
      birim=["İdare ve Denetim", "Emniyet", "İl Yazı İşleri", "Özel Kalem", "Güvenlik"],
      konu=["yürüyüş", "gösteri", "toplantı"], mev=["2911"], mev_kabul=["5442", "3071", "2709"],
      kurum_tipi="valilik")))

S.append(("valilik_ankara_bilgi_edinme", """T.C.
ANKARA VALİLİĞİNE
(Bilgi Edinme Birimi)

4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında, 2025 yılında Ankara ilinde Sosyal Yardımlaşma ve Dayanışma Vakıfları aracılığıyla kaç haneye yakacak yardımı yapıldığı bilgisinin tarafıma yazılı olarak verilmesini arz ederim.
""" + imza_blok("Kavaklıdere Mah. Tunus Cad. No:44 Çankaya/ANKARA", "24.09.2026"),
    D(tur="bilgi_edinme", muhatap="Ankara Valiliği", muhatap_kabul=["Ankara Valili"],
      talepler=[T("Yakacak yardımı yapılan hane sayısı bilgisi", ["yakacak", "hane"],
                  ["Bilgi Edinme", "Basın ve Halkla", "Halkla İlişkiler", "Sosyal Etüt"])],
      birim=["Bilgi Edinme", "Basın ve Halkla", "Halkla İlişkiler", "Açık Kapı"],
      konu=["bilgi edinme", "yakacak", "yardım"], ilgi_turu="bilgi_edinme",
      mev=["4982"], mev_kabul=["bilgi_edinme_uygulama_yonetmeligi", "3294"],
      kurum_tipi="valilik", kanal="bilgi_edinme")))

# ---------------------------------------------------------------- KAYMAKAMLIK
S.append(("kaymakamlik_etimesgut_sydv", """T.C.
ETİMESGUT KAYMAKAMLIĞINA
Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığına

Yaşlı ve yatağa bağımlı annemle birlikte yaşamaktayım, düzenli bir gelirim bulunmamaktadır. Vakfınızın sağladığı şartlı nakit ve barınma yardımlarından yararlanmak istiyorum. Hane ziyareti yapılarak durumumun değerlendirilmesini arz ederim.
""" + imza_blok("Topçu Mah. 2. Sok. No:11 Etimesgut/ANKARA", "30.09.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="Etimesgut Kaymakamlığı",
      muhatap_kabul=["Etimesgut Kaymakaml"],
      talepler=[T("SYDV nakit ve barınma yardımı", ["yardım"],
                  ["Sosyal Yardımlaşma", "SYDV"])],
      birim=["Sosyal Yardımlaşma", "SYDV"], konu=["yardım", "sosyal"],
      mev=["3294"], mev_kabul=["3071", "2022", "5442"], kurum_tipi="kaymakamlik")))

S.append(("kaymakamlik_kecioren_pasaport", """T.C.
KEÇİÖREN KAYMAKAMLIĞINA

Kızım Zeynep'in (8 yaşında) yurt dışı okul gezisine katılabilmesi için umuma mahsus pasaport çıkarılmasını istiyorum. Velayet bende olup babasının muvafakatnamesi ekte sunulmuştur. Randevu verilmesini ve işlemlerin başlatılmasını arz ederim.
""" + imza_blok("Kalaba Mah. Ankara Cad. No:50 Keçiören/ANKARA", "03.10.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="Keçiören Kaymakamlığı",
      muhatap_kabul=["Keçiören Kaymakaml"],
      talepler=[T("Çocuk için pasaport çıkarılması", ["pasaport"],
                  ["Nüfus"])],
      birim=["Nüfus"], konu=["pasaport"], mev=["5682"], mev_kabul=["5490", "3071", "4721"],
      kurum_tipi="kaymakamlik")))

S.append(("kaymakamlik_cankaya_cukur", """ÇANKAYA KAYMAKAMLIĞINA

Ayrancı Mahallesi Hoşdere Caddesi'ndeki rögar kapağı çökmüş, etrafında büyük bir çukur oluşmuştur. Geceleri araçların çukura girmesiyle kaza riski doğmaktadır. Gerekli onarımın yapılmasını arz ederim.
""" + imza_blok("Ayrancı Mah. Hoşdere Cad. No:77 Çankaya/ANKARA", "27.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep", "ihbar"], muhatap="Çankaya Kaymakamlığı",
      muhatap_kabul=["Çankaya Kaymakaml"], yetki="DISARIDA", yetkili="Çankaya Belediyesi",
      yetkili_kabul=["Çankaya Belediye", "Ankara Büyükşehir", "ASKİ"],
      talepler=[T("Çöken rögar kapağı ve çukurun onarılması", ["rögar", "çukur"],
                  ["Çankaya Belediye", "Fen İşleri", "ASKİ", "İlçe Yazı İşleri"], "DISARIDA",
                  ["Çankaya Belediye", "Ankara Büyükşehir", "ASKİ"])],
      birim=["Çankaya Belediye", "Fen İşleri", "ASKİ", "İlçe Yazı İşleri", "Yazı İşleri"],
      konu=["rögar", "çukur"], mev=["3071"], mev_kabul=["5393", "5216", "2560", "5442"],
      kurum_tipi="kaymakamlik")))

S.append(("kaymakamlik_kadikoy_okul_nufus", """T.C.
KADIKÖY KAYMAKAMLIĞINA

Ankara'dan Kadıköy'e taşındık. Aşağıdaki iki işlemin yapılmasını talep ediyorum:
- Oğlumun (4. sınıf öğrencisi) evimize en yakın ilkokula nakil kaydının yapılması,
- Adres değişikliğimiz nedeniyle yerleşim yeri kaydımızın güncellenerek adına yeni yerleşim yeri belgesi düzenlenmesi.

Gereğini arz ederim.
""" + imza_blok("Koşuyolu Mah. Muhittin Üstündağ Cad. No:12 Kadıköy/İSTANBUL", "22.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Kadıköy Kaymakamlığı",
      muhatap_kabul=["Kadıköy Kaymakaml"],
      talepler=[T("Öğrencinin ilkokula nakil kaydı", ["nakil", "nakl", "okul", "kayıt"],
                  ["Millî Eğitim", "Milli Eğitim"]),
                T("Yerleşim yeri kaydı güncelleme ve belge", ["yerleşim", "adres"], ["Nüfus"])],
      birim=["Millî Eğitim", "Milli Eğitim", "Nüfus", "İlçe Yazı İşleri"],
      konu=["nakil", "okul", "yerleşim", "adres"],
      mev=["3071"], mev_kabul=["1739", "5490", "5442", "meb_ortaogretim_kurumlari_yonetmeligi"],
      kurum_tipi="kaymakamlik")))

# ---------------------------------------------------------------- İL MÜDÜRLÜKLERİ
S.append(("ilmud_mem_nakil", """T.C.
ANKARA İL MİLLÎ EĞİTİM MÜDÜRLÜĞÜNE

Oğlum Keçiören'deki bir Anadolu lisesinin 10. sınıf öğrencisidir. Babasının tayini nedeniyle ailece Yenimahalle'ye taşındık. Oğlumun Yenimahalle'deki Anadolu liselerinden birine nakil işleminin yapılmasını arz ederim.
""" + imza_blok("Demetevler Mah. 401. Cad. No:6 Yenimahalle/ANKARA", "25.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Ankara İl Millî Eğitim Müdürlüğü",
      muhatap_kabul=["Millî Eğitim", "Milli Eğitim"],
      talepler=[T("Lise öğrencisinin nakli", ["nakil", "nakl", "lise"],
                  ["Ortaöğretim"])],
      birim=["Ortaöğretim"], konu=["nakil"],
      mev=["meb_ortaogretim_kurumlari_yonetmeligi"], mev_kabul=["1739", "3071"],
      kurum_tipi="il_mudurlugu")))

S.append(("ilmud_mem_ozel_okul", """T.C.
ANKARA İL MİLLÎ EĞİTİM MÜDÜRLÜĞÜNE

Kızımı kayıt yaptırdığım özel bir ilkokuldan, eğitim öğretim yılı başlamadan önce kaydını sildirdim. Okul, sözleşmede öngörülen kesinti dışında ödediğim 90.000 TL'nin iadesini reddetmektedir. Okulun ücret iadesine ilişkin mevzuata uygun hareket etmesinin sağlanmasını ve şikâyetimin incelenmesini arz ederim.
""" + imza_blok("Oran Mah. Kudüs Cad. No:25 Çankaya/ANKARA", "19.09.2026"),
    D(tur="sikayet", tur_kabul=["dilekce"], muhatap="Ankara İl Millî Eğitim Müdürlüğü",
      muhatap_kabul=["Millî Eğitim", "Milli Eğitim"],
      talepler=[T("Özel okul ücret iadesi şikâyeti", ["ücret", "iade", "özel okul"],
                  ["Özel Öğretim"])],
      birim=["Özel Öğretim"], konu=["özel okul", "ücret", "iade"],
      mev=["5580"], mev_kabul=["3071", "1739", "6502"], kurum_tipi="il_mudurlugu")))

S.append(("ilmud_saglik_hasta_sikayet", """T.C.
ANKARA İL SAĞLIK MÜDÜRLÜĞÜNE

21.09.2026 tarihinde Keçiören'deki bir devlet hastanesinin acil servisine annemle başvurduk. Yüksek ateşine rağmen annem dört saat muayene edilmeden bekletildi ve görevli personel tarafından kaba davranışa maruz kaldık. Konunun incelenmesini ve hasta haklarımızın korunmasını arz ederim.
""" + imza_blok("Ovacık Mah. Ali Fuat Cebesoy Cad. No:3 Keçiören/ANKARA", "23.09.2026"),
    D(tur="sikayet", tur_kabul=["dilekce"], muhatap="Ankara İl Sağlık Müdürlüğü",
      muhatap_kabul=["Sağlık Müdürlüğü"],
      talepler=[T("Acil serviste bekletilme ve kötü muamele şikâyeti", ["acil", "bekletil", "muayene"],
                  ["Hasta Hakları", "Kamu Hastane", "Sağlık Hizmetleri"])],
      birim=["Hasta Hakları", "Kamu Hastane", "Sağlık Hizmetleri"],
      konu=["acil", "hasta", "şikâyet", "sikayet"],
      mev=["hasta_haklari_yonetmeligi"], mev_kabul=["3359", "3071", "yatakli_tedavi_kurumlari_isletme_yonetmeligi"],
      kurum_tipi="il_mudurlugu")))

S.append(("ilmud_saglik_aile_hekimi", """T.C.
ANKARA İL SAĞLIK MÜDÜRLÜĞÜNE

Etimesgut'a taşınmamız nedeniyle Keçiören'deki aile hekimimden kaydımın alınarak yeni adresime yakın Etimesgut 12 No'lu Aile Sağlığı Merkezi'ndeki bir aile hekimine kaydımın yapılmasını arz ederim.
""" + imza_blok("Elvan Mah. 1925. Sok. No:4 Etimesgut/ANKARA", "28.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Ankara İl Sağlık Müdürlüğü",
      muhatap_kabul=["Sağlık Müdürlüğü"],
      talepler=[T("Aile hekimi değişikliği", ["aile hekim"],
                  ["Halk Sağlığı", "Aile Hekimliği", "Sağlık Hizmetleri"])],
      birim=["Halk Sağlığı", "Aile Hekimliği", "Sağlık Hizmetleri"], konu=["aile hekim"],
      mev=["5258"], mev_kabul=["3359", "3071"], kurum_tipi="il_mudurlugu")))

S.append(("ilmud_tarim_destek", """T.C.
ANKARA İL TARIM VE ORMAN MÜDÜRLÜĞÜNE

Polatlı ilçesi Yassıhüyük köyünde 60 dekar arazide buğday ekimi yapmaktayım. 2026 yılı Çiftçi Kayıt Sistemi (ÇKS) güncellememin yapılarak alan bazlı mazot ve gübre desteğinden yararlandırılmamı arz ederim. Tapu ve kira belgeleri ektedir.
""" + imza_blok("Yassıhüyük Köyü No:12 Polatlı/ANKARA", "17.09.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="Ankara İl Tarım ve Orman Müdürlüğü",
      muhatap_kabul=["Tarım ve Orman"],
      talepler=[T("ÇKS güncelleme ve mazot-gübre desteği", ["ÇKS", "destek", "mazot"],
                  ["Tarımsal", "Bitkisel Üretim", "Destek"])],
      birim=["Tarımsal", "Bitkisel Üretim", "Destek", "Kırsal Kalkınma"],
      konu=["destek", "çks", "çiftçi"], mev=["5488"], mev_kabul=["5648", "3071"],
      kurum_tipi="il_mudurlugu")))

S.append(("ilmud_tarim_hayvan_mera", """T.C.
ANKARA İL TARIM VE ORMAN MÜDÜRLÜĞÜNE

Haymana ilçesi Oyaca köyünde besicilik yapmaktayım.
1. Sürümdeki iki büyükbaş hayvanda şap hastalığı belirtileri (ağızda yara, salya, topallık) görülmüştür; acilen veteriner hekim gönderilerek gerekli tedbirlerin alınmasını,
2. Köyümüze ait meranın komşu köy tarafından izinsiz kullanıldığından mera komisyonunca tespit yapılmasını
arz ederim.
""" + imza_blok("Oyaca Köyü No:3 Haymana/ANKARA", "04.10.2026"),
    D(tur="dilekce", tur_kabul=["ihbar", "talep", "sikayet"], muhatap="Ankara İl Tarım ve Orman Müdürlüğü",
      muhatap_kabul=["Tarım ve Orman"],
      talepler=[T("Şap şüphesinde veteriner müdahalesi", ["şap", "hayvan", "veteriner"],
                  ["Hayvan Sağlığı", "Veteriner"]),
                T("Meranın izinsiz kullanımının tespiti", ["mera"], ["Mera", "Çayır", "Arazi"])],
      birim=["Hayvan Sağlığı", "Veteriner", "Mera", "Çayır"], konu=["şap", "hayvan", "mera"],
      mev=["5996", "4342"], mev_kabul=["3071", "5488"], kurum_tipi="il_mudurlugu")))

S.append(("yazi_mem_belediye_kasis", """T.C.
ANKARA VALİLİĞİ
İl Millî Eğitim Müdürlüğü

Sayı  : E-12345678-410.01-8812345
Konu  : Okul önü trafik güvenliği

KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Keçiören ilçesi Aktepe Mahallesi'nde bulunan Aktepe İlkokulu önündeki caddede araçların yüksek hızla seyretmesi nedeniyle öğrencilerin güvenliği tehlikeye girmektedir. Okul önüne yaya geçidi çizgisi, uyarı levhası ve hız kesici (kasis) yapılması hususunda gereğini rica ederim.

                                                    İl Millî Eğitim Müdürü a.
                                                    Şube Müdürü
                                                    (e-imzalıdır)
Tarih: 26.09.2026
""",
    D(tur="ust_yazi", tur_kabul=["genelge_talimat_olur", "cevabi_yazi"], muhatap="Keçiören Belediyesi",
      muhatap_kabul=["Keçiören Belediye"],
      talepler=[T("Okul önüne yaya geçidi, levha ve kasis", ["kasis", "yaya geçidi", "hız kesici", "levha"],
                  FEN + ["Ulaşım", "Trafik"])],
      birim=FEN + ["Ulaşım", "Trafik"], konu=["okul", "trafik", "kasis", "yaya"],
      ilgi_turu="yazi", ilgi_gonderen="Ankara İl Millî Eğitim Müdürlüğü",
      ilgi_kabul=["Millî Eğitim", "Milli Eğitim", "Ankara Valili"],
      mev=["2918", "5393", "karayollari_trafik_yonetmeligi"], mev_kabul=["2646"],
      kurum_tipi="il_mudurlugu", kanal="resmi_yazi")))

# ---------------------------------------------------------------- ÜNİVERSİTE
S.append(("uni_ankara_transkript", """T.C.
ANKARA ÜNİVERSİTESİ REKTÖRLÜĞÜNE
(Öğrenci İşleri Daire Başkanlığı)

Hukuk Fakültesi 2024 yılı mezunuyum. Yurt dışında yüksek lisans başvurusunda kullanmak üzere İngilizce transkript ve diploma eki (Diploma Supplement) verilmesini arz ederim.

Öğrenci No: 19010245
""" + imza_blok("Cebeci Mah. Talatpaşa Bulv. No:9 Çankaya/ANKARA", "30.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Ankara Üniversitesi",
      muhatap_kabul=["Ankara Üniversite"],
      talepler=[T("İngilizce transkript ve diploma eki", ["transkript", "diploma"],
                  ["Öğrenci İşleri"])],
      birim=["Öğrenci İşleri"], konu=["transkript", "diploma"],
      mev=["2547"], mev_kabul=["3071"], kurum_tipi="universite")))

S.append(("uni_gazi_kayit_yurt", """GAZİ ÜNİVERSİTESİ REKTÖRLÜĞÜNE

Mühendislik Fakültesi 3. sınıf öğrencisiyim (No: 21345678). Annemin ağır hastalığı nedeniyle;
a) 2026-2027 güz yarıyılı için kaydımın dondurulmasını,
b) bu dönem için devlet yurdundaki yatağımın saklı tutulması ve KYK bursumun kesilmemesi için gerekli işlemin yapılmasını
arz ederim. Sağlık kurulu raporu ektedir.
""" + imza_blok("Emek Mah. Bişkek Cad. No:70 Çankaya/ANKARA", "16.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Gazi Üniversitesi",
      muhatap_kabul=["Gazi Üniversite"], yetki="DISARIDA",
      yetkili="Gençlik ve Spor Bakanlığı (Yurt-Kur)",
      yetkili_kabul=["Gençlik ve Spor", "Kredi ve Yurtlar", "KYK", "Yurt-Kur", "Yurtkur"],
      talepler=[T("Kayıt dondurma", ["kayıt dondur", "dondur"], ["Öğrenci İşleri"]),
                T("Yurt yatağının saklanması ve KYK bursu", ["yurt", "burs", "KYK"],
                  ["Gençlik ve Spor", "Kredi ve Yurtlar", "Yurt", "Sağlık Kültür"], "DISARIDA",
                  ["Gençlik ve Spor", "Kredi ve Yurtlar", "KYK", "Yurt-Kur"])],
      birim=["Öğrenci İşleri"], konu=["kayıt dondurma", "dondur", "yurt", "burs"],
      mev=["2547"], mev_kabul=["351", "5102", "3071",
                               "yuksek_ogrenim_kredi_yurtlar_burs_kredi_yonetmeligi"],
      kurum_tipi="universite")))

S.append(("uni_hacettepe_gorevlendirme", """T.C.
ANKARA VALİLİĞİ
İl Sağlık Müdürlüğü

Sayı  : E-87654321-929-9123456
Konu  : Eğitim programında görevlendirme

HACETTEPE ÜNİVERSİTESİ REKTÖRLÜĞÜNE

Müdürlüğümüzce 12-14 Kasım 2026 tarihlerinde düzenlenecek "Afetlerde Acil Sağlık Hizmetleri" eğitim programında eğitici olarak görev yapmak üzere Üniversiteniz Tıp Fakültesi Acil Tıp Anabilim Dalı öğretim üyelerinden iki kişinin görevlendirilmesi hususunda gereğini arz ederim.

                                                    Vali a.
                                                    İl Sağlık Müdürü
                                                    (e-imzalıdır)
Tarih: 01.10.2026
""",
    D(tur="ust_yazi", tur_kabul=["cevabi_yazi"], muhatap="Hacettepe Üniversitesi",
      muhatap_kabul=["Hacettepe Üniversite"],
      talepler=[T("Eğitim programı için öğretim üyesi görevlendirilmesi", ["görevlendir", "eğitici"],
                  ["Personel", "Tıp Fakültesi", "Genel Sekreterlik", "Dekanlı"])],
      birim=["Personel", "Tıp Fakültesi", "Genel Sekreterlik", "Dekanlı"],
      konu=["görevlendirme", "eğitim"], ilgi_turu="yazi", ilgi_gonderen="Ankara İl Sağlık Müdürlüğü",
      ilgi_kabul=["Sağlık Müdürlüğü", "Ankara Valili"],
      mev=["2547"], mev_kabul=["657", "2646", "3359"], kurum_tipi="universite", kanal="resmi_yazi")))

S.append(("uni_ege_bilgi_edinme", """EGE ÜNİVERSİTESİ REKTÖRLÜĞÜNE
Bilgi Edinme Birimine

4982 sayılı Bilgi Edinme Hakkı Kanunu uyarınca;
1. Üniversitenizin merkezi yemekhanesinde 2026 yılında öğrenciye sunulan bir öğün yemeğin birim maliyetinin,
2. Yemek hizmeti alımı ihalesini kazanan firmanın adı ve sözleşme bedelinin
tarafıma bildirilmesini arz ederim.
""" + imza_blok("Kazımdirik Mah. 364. Sok. No:2 Bornova/İZMİR", "20.09.2026"),
    D(tur="bilgi_edinme", muhatap="Ege Üniversitesi", muhatap_kabul=["Ege Üniversite"],
      talepler=[T("Yemek birim maliyeti", ["maliyet", "öğün"],
                  ["Bilgi Edinme", "Sağlık Kültür", "Sağlık, Kültür", "Strateji"]),
                T("Yemek ihalesi firma ve sözleşme bedeli", ["ihale", "firma", "sözleşme"],
                  ["Bilgi Edinme", "Sağlık Kültür", "Sağlık, Kültür", "Strateji", "İdari ve Mali"])],
      birim=["Bilgi Edinme", "Sağlık Kültür", "Sağlık, Kültür", "Strateji", "Genel Sekreterlik"],
      konu=["bilgi edinme", "yemek", "ihale"], ilgi_turu="bilgi_edinme",
      mev=["4982"], mev_kabul=["bilgi_edinme_uygulama_yonetmeligi", "4734", "2547"],
      kurum_tipi="universite", kanal="bilgi_edinme")))

# ---------------------------------------------------------------- SGK
S.append(("sgk_hizmet_gss", """T.C.
SOSYAL GÜVENLİK KURUMU
ANKARA SOSYAL GÜVENLİK İL MÜDÜRLÜĞÜNE

1) 2003-2006 yılları arasında yurt dışında (Almanya) geçen çalışma sürelerimin borçlanma yoluyla hizmet dökümüme eklenmesini ve emeklilik tarihimin yeniden hesaplanmasını,
2) İşsiz kaldığım 2025 yılına ait genel sağlık sigortası prim borcumun gelir testi sonucuna göre yeniden değerlendirilerek terkin edilmesini
arz ederim.
""" + imza_blok("Bahçelievler Mah. 7. Cad. No:15 Çankaya/ANKARA", "18.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Ankara Sosyal Güvenlik İl Müdürlüğü",
      muhatap_kabul=["Sosyal Güvenlik"],
      talepler=[T("Yurt dışı borçlanması ve emeklilik hesabı", ["borçlanma", "yurt dışı", "emeklilik"],
                  ["Emeklilik", "Hizmet"]),
                T("GSS prim borcunun terkini", ["genel sağlık", "GSS", "prim"],
                  ["Genel Sağlık Sigortası", "Sigorta Primleri", "Prim"])],
      birim=["Emeklilik", "Genel Sağlık Sigortası", "Sigorta Primleri", "Hizmet"],
      konu=["borçlanma", "emeklilik", "genel sağlık", "prim"],
      mev=["5510"], mev_kabul=["3201", "5502", "3071", "sosyal_sigorta_islemleri_yonetmeligi"],
      kurum_tipi="sgk")))

S.append(("sgk_icra_maas_haczi", """T.C.
ANKARA 12. İCRA DAİRESİ

Dosya No : 2026/45123 Esas
Konu     : Maaş haczi (89/1 haciz ihbarnamesi)

SOSYAL GÜVENLİK KURUMU
ANKARA SOSYAL GÜVENLİK İL MÜDÜRLÜĞÜNE

Müdürlüğümüzün yukarıda numarası yazılı dosyasında borçlu Ayşe Yılmaz (T.C. Kimlik No: 10000000146) aleyhine yapılan takip kesinleşmiştir. Borçlunun Kurumunuzdan almakta olduğu emekli aylığının, 2004 sayılı İcra ve İflas Kanunu'nun 83. maddesi gözetilerek dörtte birinin haczi ile kesinti yapılarak dosyamıza gönderilmesi rica olunur.

                                                    İcra Müdürü
                                                    (e-imzalıdır)
Tarih: 24.09.2026
""",
    D(tur="icra_evraki", tur_kabul=["muzekkere", "tebligat"], muhatap="Ankara Sosyal Güvenlik İl Müdürlüğü",
      muhatap_kabul=["Sosyal Güvenlik"],
      talepler=[T("Emekli aylığına haciz kesintisi", ["haciz", "aylı", "kesinti"],
                  ["Emeklilik", "Hukuk", "Ödeme", "Kamu Görevlileri Ödemeler"])],
      birim=["Emeklilik", "Hukuk", "Ödeme", "Kamu Görevlileri Ödemeler"],
      konu=["haciz", "maaş", "aylık"], ilgi_turu="icra",
      ilgi_gonderen="Ankara 12. İcra Dairesi", ilgi_kabul=["İcra Daire", "İcra Müdürlüğü"],
      mev=["2004"], mev_kabul=["5510", "7201", "6100"], kurum_tipi="sgk", kanal="icra")))

S.append(("sgk_rapor_parasi", """SOSYAL GÜVENLİK KURUMU
KEÇİÖREN SOSYAL GÜVENLİK MERKEZİ MÜDÜRLÜĞÜNE

Özel sektörde çalışmaktayım. 01.08.2026-30.08.2026 tarihleri arasında aldığım istirahat raporuna ait geçici iş göremezlik ödeneğim, işverenim tarafından çalışmadığıma dair bildirim yapılmasına rağmen hâlâ ödenmemiştir. Ödeneğimin hesabıma yatırılmasını arz ederim.
""" + imza_blok("Kuşcağız Mah. Sanatoryum Cad. No:80 Keçiören/ANKARA", "26.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "sikayet"], muhatap="Keçiören Sosyal Güvenlik Merkezi",
      muhatap_kabul=["Sosyal Güvenlik"],
      talepler=[T("Geçici iş göremezlik ödeneğinin ödenmesi", ["iş göremezlik", "ödenek", "rapor"],
                  ["Kısa Vadeli", "Sigortalı", "Ödeme"])],
      birim=["Kısa Vadeli", "Sigortalı", "Ödeme"], konu=["iş göremezlik", "ödenek", "rapor"],
      mev=["5510"], mev_kabul=["3071", "5502", "sosyal_sigorta_islemleri_yonetmeligi"],
      kurum_tipi="sgk")))

S.append(("sgk_vergi_borcu", """SOSYAL GÜVENLİK KURUMU
ANKARA SOSYAL GÜVENLİK İL MÜDÜRLÜĞÜNE

Serbest meslek erbabı olarak kayıtlı olduğum gelir vergisi beyannamemde 2025 yılı için hesaplanan gelir vergisi tutarının hatalı olduğunu ve fazla tahakkuk ettirildiğini düşünüyorum. Gelir vergisi tarhiyatının düzeltilmesini ve fazla ödemenin iadesini arz ederim.
""" + imza_blok("Kızılay Mah. Ziya Gökalp Cad. No:12 Çankaya/ANKARA", "21.09.2026"),
    D(tur="dilekce", tur_kabul=["talep", "sikayet"], muhatap="Ankara Sosyal Güvenlik İl Müdürlüğü",
      muhatap_kabul=["Sosyal Güvenlik"], yetki="DISARIDA", yetkili="Vergi Dairesi (Gelir İdaresi Başkanlığı)",
      yetkili_kabul=["Vergi Daire", "Gelir İdaresi", "Defterdarl"],
      talepler=[T("Gelir vergisi tarhiyatının düzeltilmesi", ["vergi", "tarh"],
                  ["Vergi Daire", "Gelir İdaresi", "Evrak", "Yazı İşleri"], "DISARIDA",
                  ["Vergi Daire", "Gelir İdaresi", "Defterdarl"])],
      birim=["Vergi Daire", "Gelir İdaresi", "Evrak", "Yazı İşleri"], konu=["vergi"],
      mev=["213", "193"], mev_kabul=["3071"], kurum_tipi="sgk")))

# ---------------------------------------------------------------- TAPU
S.append(("tapu_kecioren_intikal", """T.C.
KEÇİÖREN TAPU MÜDÜRLÜĞÜNE

Annem adına kayıtlı, Keçiören ilçesi Ufuktepe Mahallesi 4567 ada 12 parsel 3 numaralı bağımsız bölümün, mirasçısı olduğum için adıma intikalinin yapılmasını istiyorum. Mirasçılık belgesi ve veraset ve intikal vergisi ödendi belgesi ektedir. Randevu verilmesini arz ederim.
""" + imza_blok("Ufuktepe Mah. Fatih Cad. No:20 Keçiören/ANKARA", "02.10.2026"),
    D(tur="basvuru", tur_kabul=["dilekce", "talep"], muhatap="Keçiören Tapu Müdürlüğü",
      muhatap_kabul=["Tapu Müdürlü"],
      talepler=[T("Miras yoluyla intikal tescili", ["intikal", "miras"], ["Tapu", "Tescil", "Müdür"])],
      birim=["Tapu", "Tescil", "Müdür"], konu=["intikal", "miras"],
      mev=["2644"], mev_kabul=["4721", "tapu_sicili_tuzugu", "7338", "3071"], kurum_tipi="tapu")))

S.append(("tapu_muzekkere_tedbir", """T.C.
ANKARA 5. ASLİYE HUKUK MAHKEMESİ

Esas No : 2026/812
Konu    : İhtiyati tedbir şerhi

ÇANKAYA TAPU MÜDÜRLÜĞÜNE

Mahkememizde görülmekte olan tapu iptali ve tescil davasında, Çankaya ilçesi Bahçelievler Mahallesi 2890 ada 7 parsel üzerindeki 5 numaralı bağımsız bölümün tapu kaydına dava sonuna kadar 6100 sayılı HMK'nın 389. maddesi gereğince ihtiyati tedbir şerhi konulmasına karar verilmiştir. Kararın tapu kaydına işlenerek sonucundan Mahkememize bilgi verilmesi rica olunur.

                                                    Hâkim
                                                    (e-imzalıdır)
Tarih: 25.09.2026
""",
    D(tur="muzekkere", tur_kabul=["dava_evraki", "ust_yazi"], muhatap="Çankaya Tapu Müdürlüğü",
      muhatap_kabul=["Tapu Müdürlü"],
      talepler=[T("Tapu kaydına ihtiyati tedbir şerhi", ["tedbir", "şerh"], ["Tapu", "Tescil", "Müdür"])],
      birim=["Tapu", "Tescil", "Müdür"], konu=["tedbir", "şerh"],
      ilgi_turu="muzekkere", ilgi_gonderen="Ankara 5. Asliye Hukuk Mahkemesi",
      ilgi_kabul=["Asliye Hukuk", "Mahkeme"],
      mev=["6100"], mev_kabul=["2644", "tapu_sicili_tuzugu", "4721"], kurum_tipi="tapu",
      kanal="mahkeme")))

S.append(("tapu_kat_mulkiyeti", """ÇANKAYA TAPU MÜDÜRLÜĞÜNE

Oturduğum apartmanın yöneticisi, kat malikleri kurulu kararı olmadan aidatları iki katına çıkarmış ve ödemediğim için bana gecikme tazminatı uygulamaktadır. Yöneticinin bu işleminin iptal edilmesini ve aidatın eski tutara indirilmesini talep ediyorum.
""" + imza_blok("Bahçelievler Mah. 3. Cad. No:44/8 Çankaya/ANKARA", "27.09.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep"], muhatap="Çankaya Tapu Müdürlüğü",
      muhatap_kabul=["Tapu Müdürlü"], yetki="DISARIDA", yetkili="Sulh Hukuk Mahkemesi",
      yetkili_kabul=["Sulh Hukuk", "Mahkeme", "Adliye"],
      talepler=[T("Aidat artışı kararının iptali", ["aidat", "yönetici"],
                  ["Sulh Hukuk", "Mahkeme", "Müdür", "Tapu"], "DISARIDA",
                  ["Sulh Hukuk", "Mahkeme", "Adliye"])],
      birim=["Sulh Hukuk", "Mahkeme", "Müdür", "Tapu"], konu=["aidat", "kat mülkiyeti", "yönetici"],
      mev=["634"], mev_kabul=["3071", "6100"], kurum_tipi="tapu")))

# ---------------------------------------------------------------- MAHKEME / İCRA / KURUM YAZILARI
S.append(("bel_icra_personel_haciz", """T.C.
ANKARA 3. İCRA DAİRESİ

Dosya No : 2026/30987 Esas
Konu     : Maaş haczi müzekkeresi

KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Dairemizin yukarıda yazılı dosyasında borçlu Ayşe Yılmaz (T.C. Kimlik No: 10000000146) aleyhine kesinleşen takip nedeniyle; borçlunun Belediyenizde memur olarak almakta olduğu maaşının 2004 sayılı İcra ve İflas Kanunu'nun 83. ve 355. maddeleri uyarınca dörtte birinin haczi ile kesilen tutarların her ay dosyamıza gönderilmesi, borçlunun maaşı üzerinde önceki hacizler bulunup bulunmadığının bildirilmesi rica olunur.

                                                    İcra Müdürü
                                                    (e-imzalıdır)
Tarih: 23.09.2026
""",
    D(tur="icra_evraki", tur_kabul=["muzekkere", "tebligat"], muhatap="Keçiören Belediyesi",
      muhatap_kabul=["Keçiören Belediye"],
      talepler=[T("Memur maaşına haciz kesintisi", ["haciz", "maaş"],
                  ["İnsan Kaynakları", "Mali Hizmetler", "Malî Hizmetler", "Hukuk", "Personel"])],
      birim=["İnsan Kaynakları", "Mali Hizmetler", "Malî Hizmetler", "Hukuk", "Personel"],
      konu=["haciz", "maaş"], ilgi_turu="icra", ilgi_gonderen="Ankara 3. İcra Dairesi",
      ilgi_kabul=["İcra Daire", "İcra Müdürlüğü"],
      mev=["2004"], mev_kabul=["657", "7201"], kurum_tipi="ilce_belediyesi", kanal="icra")))

S.append(("bel_mahkeme_imar_muzekkere", """T.C.
ANKARA 7. ASLİYE HUKUK MAHKEMESİ

Esas No : 2026/455
Konu    : Bilgi ve belge istemi

ÇANKAYA BELEDİYE BAŞKANLIĞINA

Mahkememizde görülmekte olan ortaklığın giderilmesi davasında; Çankaya ilçesi Birlik Mahallesi 27800 ada 3 parsele ait güncel imar durumu belgesinin ve parsel üzerindeki yapıya ait yapı ruhsatı ile yapı kullanma izin belgesinin onaylı örneklerinin 15 gün içinde Mahkememize gönderilmesi rica olunur.

                                                    Hâkim
                                                    (e-imzalıdır)
Tarih: 22.09.2026
""",
    D(tur="muzekkere", tur_kabul=["dava_evraki", "ust_yazi"], muhatap="Çankaya Belediyesi",
      muhatap_kabul=["Çankaya Belediye"],
      talepler=[T("İmar durumu ve yapı ruhsatı örneklerinin gönderilmesi", ["imar", "ruhsat"],
                  ["İmar ve Şehircilik", "Yapı Kontrol", "Hukuk"])],
      birim=["İmar ve Şehircilik", "Yapı Kontrol", "Hukuk"], konu=["imar", "ruhsat", "belge"],
      ilgi_turu="muzekkere", ilgi_gonderen="Ankara 7. Asliye Hukuk Mahkemesi",
      ilgi_kabul=["Asliye Hukuk", "Mahkeme"],
      mev=["6100", "3194"], mev_kabul=["5393", "yapi_ruhsati_yapi_kullanma_izni_islemleri"],
      kurum_tipi="ilce_belediyesi", kanal="mahkeme")))

S.append(("valilik_savcilik_yazisi", """T.C.
ANKARA CUMHURİYET BAŞSAVCILIĞI
Soruşturma Bürosu

Soruşturma No : 2026/88123
Konu          : Bilgi istemi

ANKARA VALİLİĞİNE
(İl Sivil Toplumla İlişkiler Müdürlüğü)

Başsavcılığımızca yürütülen soruşturma kapsamında, Keçiören ilçesinde faaliyet gösteren "Örnek Yardımlaşma Derneği"nin kuruluş tarihi, yönetim kurulu üyeleri ile son üç yıla ait yardım toplama izinlerine ilişkin bilgi ve belgelerin Başsavcılığımıza gönderilmesi rica olunur.

                                                    Cumhuriyet Savcısı
                                                    (e-imzalıdır)
Tarih: 29.09.2026
""",
    D(tur="muzekkere", tur_kabul=["ust_yazi", "dava_evraki"], muhatap="Ankara Valiliği",
      muhatap_kabul=["Ankara Valili"],
      talepler=[T("Dernek bilgi ve belgelerinin gönderilmesi", ["dernek", "bilgi"],
                  ["Sivil Toplum", "Dernekler", "Hukuk"])],
      birim=["Sivil Toplum", "Dernekler", "Hukuk"], konu=["dernek", "bilgi"],
      ilgi_turu="yazi", ilgi_gonderen="Ankara Cumhuriyet Başsavcılığı",
      ilgi_kabul=["Başsavcılı", "Savcılı"],
      mev=["5271", "5253"], mev_kabul=["2860", "5442"], kurum_tipi="valilik", kanal="savcilik")))

S.append(("yazi_abb_aykome", """T.C.
ANKARA BÜYÜKŞEHİR BELEDİYESİ
Altyapı Koordinasyon Dairesi Başkanlığı

Sayı  : E-11223344-754-7712345
Konu  : Kazı çalışması koordinasyonu

KEÇİÖREN BELEDİYE BAŞKANLIĞINA

ASKİ Genel Müdürlüğünce Keçiören ilçesi Kalaba Mahallesi Şehit Kubilay Caddesi'nde 13-24 Ekim 2026 tarihleri arasında içme suyu hattı yenileme çalışması yapılacaktır. Çalışma süresince Belediyenizce aynı güzergâhta planlanan asfalt kaplama çalışmasının ertelenmesi ve kazı sonrası yol üst yapısının eski hâline getirilmesine ilişkin koordinasyonun sağlanması hususunda bilgilerinizi ve gereğini rica ederim.

                                                    Genel Sekreter a.
                                                    Daire Başkanı
                                                    (e-imzalıdır)
Tarih: 30.09.2026
""",
    D(tur="ust_yazi", tur_kabul=["genelge_talimat_olur"], muhatap="Keçiören Belediyesi",
      muhatap_kabul=["Keçiören Belediye"],
      talepler=[T("Asfalt çalışmasının ertelenmesi ve kazı koordinasyonu", ["asfalt", "kazı"], FEN)],
      birim=FEN, konu=["kazı", "asfalt", "koordinasyon"],
      ilgi_turu="yazi", ilgi_gonderen="Ankara Büyükşehir Belediyesi",
      ilgi_kabul=["Ankara Büyükşehir", "Altyapı Koordinasyon"],
      mev=["5216"], mev_kabul=["5393", "2560", "2646"], kurum_tipi="ilce_belediyesi",
      kanal="resmi_yazi")))

S.append(("yazi_valilik_genelge", """T.C.
ANKARA VALİLİĞİ
İl Yazı İşleri Müdürlüğü

Sayı  : E-55667788-010.06-6612345
Konu  : Kış mevsimi hazırlıkları

DAĞITIM YERLERİNE
(Keçiören Kaymakamlığı dahil)

Kış mevsiminde yaşanabilecek yoğun kar yağışı ve buzlanma nedeniyle kamu hizmetlerinin aksamaması için ilçe kaymakamlıklarınca; ilçe afet koordinasyon toplantılarının Ekim ayı sonuna kadar yapılması, kar mücadelesine ilişkin iş makinesi envanterinin çıkarılması ve muhtarlıklarla iletişim planının hazırlanarak Valiliğimize bildirilmesi hususunda bilgilerinizi ve gereğini rica ederim.

                                                    Vali
                                                    (e-imzalıdır)
Tarih: 01.10.2026
""",
    D(tur="genelge_talimat_olur", tur_kabul=["ust_yazi"], muhatap="Keçiören Kaymakamlığı",
      muhatap_kabul=["Keçiören Kaymakaml", "Dağıtım"],
      talepler=[T("Kış hazırlıkları: koordinasyon toplantısı, envanter, iletişim planı",
                  ["kış", "kar", "afet"], ["İlçe Yazı İşleri", "Yazı İşleri", "Afet", "Sivil Savunma"])],
      birim=["İlçe Yazı İşleri", "Yazı İşleri", "Afet", "Sivil Savunma"],
      konu=["kış", "kar", "hazırlık"], ilgi_turu="yazi", ilgi_gonderen="Ankara Valiliği",
      ilgi_kabul=["Ankara Valili"],
      mev=["5442"], mev_kabul=["7126", "7269", "2646"], kurum_tipi="kaymakamlik",
      kanal="resmi_yazi")))

S.append(("yazi_sgk_cevabi", """T.C.
SOSYAL GÜVENLİK KURUMU BAŞKANLIĞI
Ankara Sosyal Güvenlik İl Müdürlüğü

Sayı  : E-99887766-205.99-5512345
Konu  : Prim borcu bilgisi
İlgi  : Keçiören Belediye Başkanlığının 15.09.2026 tarihli ve E-33445566-841-4412345 sayılı yazısı.

KEÇİÖREN BELEDİYE BAŞKANLIĞINA

İlgi yazınızla talep edilen, Belediyeniz adına kayıtlı 1234567 sicil numaralı işyerine ait 2026 yılı Haziran-Ağustos dönemi prim borcu toplam 412.350,00 TL olup borcun yasal süresinde ödenmemesi hâlinde 5510 sayılı Kanun'un 89. maddesi uyarınca gecikme cezası ve zammı uygulanacaktır. Bilgilerinizi rica ederim.

                                                    İl Müdürü
                                                    (e-imzalıdır)
Tarih: 29.09.2026
""",
    D(tur="cevabi_yazi", tur_kabul=["ust_yazi"], muhatap="Keçiören Belediyesi",
      muhatap_kabul=["Keçiören Belediye"],
      talepler=[T("SGK prim borcu bilgisi", ["prim", "borç"],
                  ["Mali Hizmetler", "Malî Hizmetler", "İnsan Kaynakları", "Strateji"])],
      birim=["Mali Hizmetler", "Malî Hizmetler", "İnsan Kaynakları", "Strateji"],
      konu=["prim", "borç"], ilgi_turu="yazi", ilgi_gonderen="Ankara Sosyal Güvenlik İl Müdürlüğü",
      ilgi_kabul=["Sosyal Güvenlik"],
      mev=["5510"], mev_kabul=["5018", "2646", "5393"], kurum_tipi="ilce_belediyesi",
      kanal="resmi_yazi")))

# ---------------------------------------------------------------- ÇOK TALEPLİ CİMER / 4982 / EKSİK BİLGİ
S.append(("cimer_etimesgut_hayvan_park", """T.C.
ETİMESGUT BELEDİYE BAŞKANLIĞI
Basın Yayın ve Halkla İlişkiler Müdürlüğü

CİMER Başvuru No: 2026-0925-55130
Başvuru Tarihi: 25.09.2026
Başvuru Sahibi: Ayşe Yılmaz (T.C. Kimlik No: 10000000146)

Başvuru Metni:
Eryaman 4. Etap'taki Akasya Parkı'nda iki sahipsiz köpek yaralı hâlde dolaşıyor, tedavi edilmeleri gerekiyor. Ayrıca aynı parktaki kaydırak kırık, çocuğum elini kesti; değiştirilsin.

İletişim: 0555-123-4567, Eryaman Mah. Akasya Sok. No:8 Etimesgut/ANKARA
""",
    D(tur="cimer", tur_kabul=["sikayet"], muhatap="Etimesgut Belediyesi",
      muhatap_kabul=["Etimesgut Belediye"],
      talepler=[T("Yaralı sahipsiz köpeklerin tedavisi", ["köpe", "hayvan"], ["Veteriner"]),
                T("Kırık kaydırağın değiştirilmesi", ["kaydıra", "oyun"], ["Park ve Bahçeler"])],
      birim=["Veteriner", "Park ve Bahçeler", "Basın", "Halkla İlişkiler"],
      konu=["köpek", "hayvan", "park", "kaydırak"], ilgi_turu="cimer", ilgi_kabul=[AD, "CİMER"],
      mev=["5199", "3071", "5690"], mev_kabul=["5393"], yasak=["5176"], eksik=["imza"],
      kurum_tipi="ilce_belediyesi", kanal="cimer")))

S.append(("bilgi_edinme_cankaya_cift", """ÇANKAYA BELEDİYE BAŞKANLIĞINA

4982 sayılı Bilgi Edinme Hakkı Kanunu çerçevesinde aşağıdaki bilgilerin tarafıma verilmesini talep ederim:
1. 2025 yılında Belediyenizce yapılan asfalt kaplama çalışmalarının toplam uzunluğu (km) ve harcanan toplam tutar,
2. 30.06.2026 itibarıyla Belediyenizde görev yapan kadrolu memur ve sözleşmeli personel sayısı.
""" + imza_blok("Ayrancı Mah. Güvenlik Cad. No:15 Çankaya/ANKARA", "19.09.2026"),
    D(tur="bilgi_edinme", muhatap="Çankaya Belediyesi", muhatap_kabul=["Çankaya Belediye"],
      talepler=[T("Asfalt kaplama uzunluğu ve harcaması", ["asfalt"],
                  ["Bilgi Edinme", "Basın", "Halkla İlişkiler", "Fen İşleri"]),
                T("Kadrolu ve sözleşmeli personel sayısı", ["personel"],
                  ["Bilgi Edinme", "Basın", "Halkla İlişkiler", "İnsan Kaynakları"])],
      birim=["Bilgi Edinme", "Basın", "Halkla İlişkiler"], konu=["bilgi edinme", "asfalt", "personel"],
      ilgi_turu="bilgi_edinme", mev=["4982"], mev_kabul=["bilgi_edinme_uygulama_yonetmeligi", "5393"],
      kurum_tipi="ilce_belediyesi", kanal="bilgi_edinme")))

S.append(("eksik_imza_kecioren_park", """KEÇİÖREN BELEDİYE BAŞKANLIĞINA

Aktepe Mahallesi'ndeki Gazi Parkı'nda akşam saatlerinde aydınlatma yetersiz ve banklar kırık durumdadır. Parkın bakımının yapılmasını ve kırık bankların yenilenmesini rica ederim.

Ayşe Yılmaz
T.C. Kimlik No: 10000000146
Tel: 0555-123-4567
Adres: Aktepe Mah. Gazi Cad. No:19 Keçiören/ANKARA
30.09.2026
""",
    D(tur="dilekce", tur_kabul=["talep", "sikayet"], muhatap="Keçiören Belediyesi",
      muhatap_kabul=["Keçiören Belediye"],
      talepler=[T("Park bankları ve bakım", ["bank", "park"], ["Park ve Bahçeler", "Fen İşleri"])],
      birim=["Park ve Bahçeler", "Fen İşleri"], konu=["park", "bank"],
      mev=["3071", "5393"], eksik=["imza"], kurum_tipi="ilce_belediyesi")))

S.append(("eksik_adres_mamak_cop", """MAMAK BELEDİYE BAŞKANLIĞINA

Mahallemizde çöpler düzenli toplanmıyor, konteynerler taşıyor. Gereğinin yapılmasını arz ederim.

Ayşe Yılmaz
İmza
""",
    D(tur="dilekce", tur_kabul=["sikayet", "talep"], muhatap="Mamak Belediyesi",
      muhatap_kabul=["Mamak Belediye"],
      talepler=[T("Çöplerin düzenli toplanması", ["çöp", "konteyner"], ["Temizlik İşleri"])],
      birim=["Temizlik İşleri"], konu=["çöp", "temizlik"],
      mev=["5393", "3071"], mev_kabul=["atik_yonetimi_yonetmeligi"],
      eksik=["tckn_veya_kurum", "tarih", "iletisim_adres"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_mem_okul_onu_cukur", """T.C.
KEÇİÖREN KAYMAKAMLIĞI
İLÇE MİLLÎ EĞİTİM MÜDÜRLÜĞÜNE

Çocuğumun okuduğu Ayvalı Ortaokulu'nun hemen önündeki yolda büyük bir çukur var ve yağmurda su dolup çocuklar içine düşüyor. Okul yönetimine söyledik ama bir şey yapılmadı. Çukurun kapatılmasını istiyorum.
""" + imza_blok("Ayvalı Mah. 211. Sok. No:6 Keçiören/ANKARA", "03.10.2026"),
    D(tur="dilekce", tur_kabul=["sikayet", "talep"], muhatap="Keçiören İlçe Millî Eğitim Müdürlüğü",
      muhatap_kabul=["Millî Eğitim", "Milli Eğitim", "Keçiören Kaymakaml"], yetki="DISARIDA",
      yetkili="Keçiören Belediyesi", yetkili_kabul=["Keçiören Belediye"],
      talepler=[T("Okul önündeki çukurun kapatılması", ["çukur"],
                  ["Keçiören Belediye", "Fen İşleri", "Destek Hizmetleri", "Yazı İşleri"], "DISARIDA",
                  ["Keçiören Belediye"])],
      birim=["Keçiören Belediye", "Fen İşleri", "Destek Hizmetleri", "Yazı İşleri", "İnşaat ve Emlak"],
      konu=["çukur", "okul", "yol"], mev=["3071"], mev_kabul=["5393", "1739"],
      kurum_tipi="il_mudurlugu")))

S.append(("ilce_cankaya_pasaport_disarida", """ÇANKAYA BELEDİYE BAŞKANLIĞINA

Yurt dışı seyahatim nedeniyle pasaportumun süresi doldu. Yeni pasaport çıkarılması için başvurumun alınmasını ve işlemlerin hızlandırılmasını rica ederim.
""" + imza_blok("Çukurambar Mah. 1453. Cad. No:5 Çankaya/ANKARA", "02.10.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru"], muhatap="Çankaya Belediyesi",
      muhatap_kabul=["Çankaya Belediye"], yetki="DISARIDA",
      yetkili="Çankaya İlçe Nüfus Müdürlüğü",
      yetkili_kabul=["Nüfus", "Kaymakaml"],
      talepler=[T("Pasaport yenileme başvurusu", ["pasaport"], ["Nüfus", "Yazı İşleri", "Halkla İlişkiler"],
                  "DISARIDA", ["Nüfus", "Kaymakaml"])],
      birim=["Nüfus", "Yazı İşleri", "Halkla İlişkiler"], konu=["pasaport"],
      mev=["5682", "3071"], mev_kabul=["5490"], kurum_tipi="ilce_belediyesi")))

S.append(("ilce_nilufer_imar_ruhsat_cop", """NİLÜFER BELEDİYE BAŞKANLIĞINA

İhsaniye Mahallesi'nde maliki olduğum arsa için;
- İmar durumu belgesi verilmesini,
- Aynı sokakta inşaat firmasının moloz ve hafriyat atıklarını yola bırakmasının önlenmesini ve molozun kaldırılmasını
arz ederim.
""" + imza_blok("İhsaniye Mah. Bülbül Sok. No:21 Nilüfer/BURSA", "05.10.2026"),
    D(tur="dilekce", tur_kabul=["talep", "basvuru", "sikayet"], muhatap="Nilüfer Belediyesi",
      muhatap_kabul=["Nilüfer Belediye"],
      talepler=[T("İmar durumu belgesi", ["imar"], ["İmar ve Şehircilik", "İmar"]),
                T("Moloz ve hafriyatın kaldırılması", ["moloz", "hafriyat"],
                  ["Zabıta", "Temizlik İşleri", "Çevre"])],
      birim=["İmar ve Şehircilik", "İmar", "Zabıta", "Temizlik İşleri"],
      konu=["imar", "moloz", "hafriyat"], mev=["3194", "3071"],
      mev_kabul=["5393", "atik_yonetimi_yonetmeligi", "5326", "planli_alanlar_imar_yonetmeligi"],
      kurum_tipi="ilce_belediyesi")))


# ================================================================ doğrulama
def norm(s: str) -> str:
    s = (s or "").replace("İ", "i").replace("I", "ı").lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("ı", "i")


mev_dosyalar = [p.stem for p in MEV.glob("*.txt")]


def mev_var(onek: str) -> bool:
    return any(d == onek or d.startswith(onek + "_") for d in mev_dosyalar)


teskilat_metin = norm(" ".join(p.read_text(encoding="utf-8", errors="ignore")
                               for p in TES.rglob("*.txt")))
import re


def belge_tarihi(metin: str) -> str | None:
    """Gelen evrakın KENDİ tarihi: 'Tarih:' satırı > 'Başvuru Tarihi:' > yalnız tarihten oluşan
    satır. Gövdedeki başka tarihler (ilgi, olay tarihi) bilinçli olarak alınmaz."""
    for desen in (r"^\s*Tarih\s*:\s*(\d{2}\.\d{2}\.\d{4})", r"^\s*Başvuru Tarihi\s*:\s*(\d{2}\.\d{2}\.\d{4})",
                  r"^\s*(\d{2}\.\d{2}\.\d{4})\s*$"):
        m = re.search(desen, metin, re.MULTILINE)
        if m:
            return m.group(1)
    return None


for _sid, _metin, _b in S:
    _b["ilgi_tarih"] = belge_tarihi(_metin)

hatalar, uyarilar = [], []
ids = set()
for sid, metin, b in S:
    assert sid not in ids, sid
    ids.add(sid)
    for alan in ("beklenen_mevzuat_herhangi", "mevzuat_kabul", "alakasiz_mevzuat_yasak"):
        for m in b[alan]:
            if not mev_var(m):
                hatalar.append(f"{sid}: {alan} '{m}' korpusta YOK")
    for k in b["birim_kabul_edilebilir"] + [x for t in b["talep_detay"] for x in t["birim_kabul"]]:
        if norm(k) not in teskilat_metin:
            uyarilar.append(f"{sid}: birim kökü teskilat korpusunda yok: {k}")
    if b["yetki"] == "DISARIDA":
        assert b["yetkili_kurum_kabul"], sid
    assert b["evrak_turu"] in {"dilekce", "basvuru", "sikayet", "ihbar", "talep", "bilgi_edinme",
                               "cimer", "ust_yazi", "cevabi_yazi", "tebligat", "dava_evraki",
                               "icra_evraki", "muzekkere", "fatura", "tutanak", "rapor",
                               "gorus_mutalaa", "genelge_talimat_olur", "belirsiz"}, sid
if hatalar:
    print("\n".join(hatalar))
    raise SystemExit(1)
print("\n".join(sorted(set(uyarilar))))
with CIKTI.open("w", encoding="utf-8", newline="\n") as f:
    for sid, metin, b in S:
        f.write(json.dumps({"id": sid, "metin": metin, "beklenen": b}, ensure_ascii=False) + "\n")
n = len(S)
dis = sum(1 for _, _, b in S if b["yetki"] == "DISARIDA")
dis_tam = sum(1 for _, _, b in S if b["yetki"] == "DISARIDA"
              and all(t["yetki"] == "DISARIDA" for t in b["talep_detay"]))
cok = sum(1 for _, _, b in S if b["talep_sayisi"] > 1)
print(f"\nYAZILDI {CIKTI} n={n} disarida={dis} (tamamen={dis_tam}) cok_talepli={cok}")
from collections import Counter
print(Counter(b["kurum_tipi"] for _, _, b in S))
print(Counter(b["evrak_turu"] for _, _, b in S))
