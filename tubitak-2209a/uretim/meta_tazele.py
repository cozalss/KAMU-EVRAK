"""_meta'yi bu turun (alti hakem) bulgulariyla yeniden kurar.

Eski _meta, insan katilimcili deney CIKARILMADAN ONCEKI tasarima aitti ve OKUBENI'yi
yaniltiyordu. Bayat kayit tamamen degistirilir.
"""
import sys, json
sys.stdout.reconfigure(encoding="utf-8")

yol = sys.argv[1]
ic = json.load(open(yol, encoding="utf-8"))

UYGULANAN = [
    "İnsan katılımcılı deney (D4 / İP5 / 32 katılımcı) tamamen çıkarıldı; H7, H8, H11 "
    "hipotezleri, AS6 araştırma sorusu ve gerekçe-düzeyi değişkeni kaldırıldı.",
    "Etik kurul bağımlılığı ortadan kaldırıldı: araştırma insan katılımcı içermiyor, ölçüm "
    "birimi belge ve metindeki iddia; onay gerekmiyor.",
    "İP3 yeniden konumlandırıldı: üç bağımsız DEĞERLENDİRİCİ metindeki iddia üzerinde kör "
    "uzman yargısı verir; haklarında kişisel veri toplanmaz. Dairesellik kırma iddiası korundu.",
    "Bağımlı değişken 13→9→10, bağımsız 6→5, onaylayıcı test ailesi 16→11, kapı 7→5 olarak "
    "yeniden hesaplandı ve bölümler arası senkronlandı.",
    "Özet baştan yazıldı (407 kelime): 'dört deney', 'on bir hipotez', 'katılımcı sayısı 32' "
    "gibi bayat ifadeler temizlendi.",
    "Araştırma Olanakları'ndaki iki katılımcı-deneyi kalıntısı silindi — iki hakem bunu "
    "'tek başına ret gerekçesi olabilir' diye işaretlemişti (etik beyanıyla açık çelişki).",
    "Numaralandırma dikişleri kapatıldı: H9→H7, H10→H8, İP6→İP5 (sayım korunumu doğrulandı).",
    "Kapı zinciri SERİ bağlandı: eski yapıda gerçek ailesel hata ≈0,19 idi; artık on bir "
    "testin bütününde 0,05'te tutuluyor. GEE/DeLong/karma Poisson aile dışına çıkarıldı.",
    "H3 testi düzeltildi: Jonckheere-Terpstra (bağımsız gruplar) → eşleştirilmiş Page eğilim testi.",
    "H6 testi düzeltildi: Cochran Q (ikili) → Friedman + Holm-Wilcoxon; bağımlı değişken "
    "sayım olduğu için. Ayrıca değişken kilitli listeye eklendi (10 oldu).",
    "H10 yön çelişkisi giderildi: 1.1 üstünlük diyordu, 2.6 TOST kullanıyordu; ikisi "
    "eşdeğerlik çerçevesinde birleştirildi.",
    "H5 yanlış-veto ve H10 için tek yönlü aşmazlık (non-inferiority) kurgusu ve sınır "
    "gerekçeleri eklendi.",
    "H2 etkileşim büyüklüğü ilanı, H9 alt grup gücü ve 80 belgelik blok gücü beyanları eklendi.",
    "H1 için bağlayıcı güç kuralı eklendi: taban yeniden ölçümünde fark 0,09'un altında "
    "kalırsa kilit öncesi TOST eşdeğerliğine geçilir.",
    "(b2) taban kolunun aslına uygunluğu bağımsız kabul testine bağlandı — ekip kendi taban "
    "kolunu zayıf kurarsa hibrit bedavaya kazanırdı.",
    "Kodlama kılavuzu, doğrulayıcının kural listesinden yapısal olarak ayrıldı (yapı "
    "daireselliği); sözlük örtüşmesi sayısal raporlanacak.",
    "Kör değerlendirme ekonomisi düzeltildi: 4,67 TL/yargı ile uzman bulunamazdı. Yeni "
    "kurgu bir ücretli (14 TL/yargı) + iki gönüllü akademik katkı; desen ve güç değişmedi.",
    "B4 boşluğunun kapsam dışı olduğu açıkça yazıldı — ameliyattan sonra hiçbir hipotez "
    "kalibrasyon ölçmüyordu, boşluk iddiası karşılıksızdı.",
    "PROJE YÖNETİMİ bölümüne izleme/koordinasyon yordamı eklendi (%20'lik blok üç tablodan "
    "ibaretti): toplantı düzeni, sürüm damgalı depo, sapma günlüğü, parti-teslim takvimi.",
    "Risk tablosuna ekip üyesi ayrılması riski eklendi — körlük şartı gereği altın etiketin "
    "ikinci kaynağı ekip içinden ikame edilemiyor, yedek kişi ilk ayda belirlenecek.",
    "İş yükü dengelendi (%152 doluluk): maliyet pilotu İP2'ye, dış geçerlilik kümesi İP3'e "
    "taşındı; İP1'e üç ara kilometre taşı kondu.",
    "İP3→İP4 ters bağımlılığı giderildi: İP4'ün 6-7. ayı yalnız koşum, puanlama 8. ayda.",
    "Bütçe gerekçesine koşum hacmi kırılımı (6.800 koşum), birim tavan ve makine süresi eklendi.",
    "Gizli maliyetler bütçelendi: 50 belgenin baskı-tarama gideri, olanaklara yazıcı-tarayıcı; "
    "dış geçerlilik kümesinin altın etiketlenmesi yordama bağlandı.",
    "Yaygın etki gerçekçileştirildi: bildiri kabul ölçütü 'yayımlanma'dan 'gönderim'e çevrildi "
    "(hakem kararı ekipte değil); uluslararası bildiri 12→11. aya alındı.",
    "Hedef 6 aşırı-iddiası düzeltildi: dış geçerlilik kümesinde yalnız H1 ve H5 sınanıyor.",
    "Şekil 2 altyazısındaki olmayan '3.1' başlığına atıf kaldırıldı; Risk 4'teki 'bir aylık "
    "örtüşme' fiilî iki aya düzeltildi.",
    "Anahtar kelime 'insan gözetimli karar destek' → 'denetlenebilir karar destek' "
    "(ölçülmeyen bir şeyi başlığa taşıyordu).",
]

KALAN = [
    "BÜTÇE ÜST LİMİTİ [DOĞRULA] — 12.000 TL değeri 2025 çağrısına aittir; 2026-1 dönemi "
    "rakamı programın internet sayfasında ayrıca ilan edilir. Başvurudan önce teyit edin. "
    "Öneri 11.000 TL'dir, düşüş olursa sarf ve bulut kalemlerinden kısılabilir.",
    "KAYNAK DOĞRULAMA — 21 künyenin her birini açıp teyit edin. Özellikle [5] hakem "
    "sürecinden geçmemiş bir ön baskıdır; erişilemezse metinden çıkarılmalı. Var olmayan "
    "atıf, çağrı m.5.2.3/8.2 uyarınca etik ihlali işlemi doğurur.",
    "GÜÇ SİMÜLASYONU — H2 (etkileşim) ve H9 için Monte Carlo simülasyonu BAŞVURUDAN ÖNCE "
    "koşulup sonuç sayısı 2.6'ya yazılırsa Yöntem puanı görünür biçimde yükselir. Metin şu "
    "an simülasyonun ön-kayıt kilidinden önce koşulacağını taahhüt ediyor.",
    "ÖN ÇALIŞMA SAYILARI BAYAT — metindeki tüm ön çalışma değerleri hizmet dışı bir model "
    "sürümüyle ve iki yüzü aşkın sürüm önce üretilmiştir. Metin bunu açıkça beyan ediyor ve "
    "İP1'de yeniden ölçüleceğini taahhüt ediyor. Hiçbir sunumda 'güncel başarım' diye "
    "alıntılanmamalıdır.",
    "GÖNÜLLÜ DEĞERLENDİRİCİ TEDARİKİ — kör değerlendirmenin ikisi danışmanın bölümünden "
    "gönüllü akademik katkıdır. Bu iki kişinin ilk ayda belirlenmesi gerekir; bulunamazsa "
    "bütçeden aktarımla ücretlendirme yoluna gidilmelidir.",
    "KATMANLI RAPORLAMA BLOĞU — sayfa sınırına sığmak için 2.5'ten çıkarıldı. Katman A/B "
    "ayrımının önceden bağlayıcı kuralı kaybedildi; ileride yer açılırsa geri konması önerilir.",
    "ETİK — araştırma insan katılımcı içermediği için etik kurul onayına tabi değildir. "
    "Hakem ya da kurum gerekli görürse MUAFİYET BELGESİ alınacağı metinde yazılıdır; bu "
    "talep gelirse süreç kısa sürer.",
    "ÜYZ BEYANI — bu metin üretken yapay zekâ araçlarıyla hazırlandı. Çağrı m.8.4/8.5 "
    "uyarınca nihai sorumluluk akademik danışmandadır; TÜBİTAK'ın güncel ÜYZ Rehberi "
    "okunmalı ve danışmana bildirilmelidir.",
    "İŞ YÜKÜ — fizibilite hakemi ilk hâli için %152 doluluk hesapladı; iş devirleri ve "
    "kilometre taşlarıyla düşürüldü ama takvim hâlâ sıkı. Danışmanla haftalık takip, "
    "metinde taahhüt edilen yordamın kendisidir.",
]

ic["_meta"] = {
    "tur": "Altı hakemli denetim turu (rubrik · ön inceleme · şüpheci · tutarlılık · "
           "istatistik · fizibilite) sonrası",
    "hakem_puanlari": {
        "rubrik_panelisti_100": 80,
        "yontem_25": 21,
        "proje_yonetimi_20": 14,
        "on_inceleme": "PANELE ULAŞIR — eleme sebebi 0",
        "supheci_tez": "‘Bu araştırma değil’ tezi ÇÜRÜTÜLDÜ",
        "not": "Bu puanlar DÜZELTMELER UYGULANMADAN ÖNCEKİ metne aittir; hakemler "
               "düzeltmeler sonrası yöntem 23-24 ve proje yönetimi 17-18 öngördü.",
    },
    "uygulanan_duzeltmeler": UYGULANAN,
    "kalan_riskler": KALAN,
    "dogrulanacak_adaylar": ic.get("_meta", {}).get("dogrulanacak_adaylar", []),
}

json.dump(ic, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"_meta tazelendi: {len(UYGULANAN)} uygulanan düzeltme, {len(KALAN)} açık risk")
