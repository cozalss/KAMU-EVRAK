"""Kamu-evrak taksonomileri ve eşleme tabloları.

Araştırma kaynağı: docs/02-evrak-taksonomi-routing.md (Resmî Yazışma Yön. 2646,
3071 Dilekçe Hakkı, 4982 Bilgi Edinme, 7201 Tebligat, SDP 2005/7, CİMER 5690).

ÖNEMLİ (şartname uyumu): Şartname sabit sınıf/birim listesi VERMEZ. Buradaki kümeler
resmî kaynaklara dayandırılmıştır; gold-set blind etiketleme ile kurulmalı (etik §13.1).
Stub node'lar bu tabloları kullanır; üretimde few-shot LLM / RAG ile değiştirilir.
"""

from __future__ import annotations

import os

# .env otomatik yükle (LLM_MODE/OPENAI_API_KEY vb.). config her yerde import edilir →
# env değişkenleri okunmadan ÖNCE .env yüklenmiş olur. find_dotenv cwd'den yukarı yürür
# (backend/ → proje kökü). python-dotenv yoksa sessizce geç (zorunlu değil).
try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(usecwd=True))
except Exception:
    pass

# --- Görev 1: Evrak türü sınıfları (18 + belirsiz) ---
EVRAK_TURLERI: tuple[str, ...] = (
    "dilekce", "basvuru", "sikayet", "ihbar", "talep", "bilgi_edinme", "cimer",
    "ust_yazi", "cevabi_yazi", "tebligat", "dava_evraki", "icra_evraki",
    "muzekkere", "fatura", "tutanak", "rapor", "gorus_mutalaa",
    "genelge_talimat_olur", "belirsiz",
)

# Türkçe etiketler (UI/özet için)
EVRAK_TURU_TR: dict[str, str] = {
    "dilekce": "Dilekçe", "basvuru": "Başvuru", "sikayet": "Şikâyet", "ihbar": "İhbar",
    "talep": "Talep", "bilgi_edinme": "Bilgi Edinme Başvurusu", "cimer": "CİMER Başvurusu",
    "ust_yazi": "Üst Yazı", "cevabi_yazi": "Cevabi Yazı", "tebligat": "Tebligat",
    "dava_evraki": "Dava Evrakı", "icra_evraki": "İcra Evrakı", "muzekkere": "Müzekkere",
    "fatura": "Fatura / Ödeme Belgesi", "tutanak": "Tutanak", "rapor": "Rapor",
    "gorus_mutalaa": "Görüş / Mütalaa", "genelge_talimat_olur": "Genelge / Talimat / Olur",
    "belirsiz": "Belirsiz",
}

# --- Görev 1: Operasyonel-eşdeğer sınıf grupları (taksonomi belirsizliği) ---
# NEDEN: 18-sınıflı taksonomi bazı yerlerde insan etiketleyicinin bile karıştırdığı
# kadar ince (held-out hata analizi, docs/benchmark/llm-heldout.md): talep≈başvuru≈
# dilekçe = "vatandaş talebi"; müzekkere≈genelge≈üst yazı = "resmî yazı ailesi".
# Bu çiftler arası hatalar RASTGELE değil — LLM SAVUNULABİLİR seçim yapar ve çoğu
# AYNI birime havale olur (operasyonel olarak doğru). Sıkı macro-F1 bu nüansı
# cezalandırır; "operasyonel doğruluk" (tahmin, gerçeğin eşdeğer-grubunda mı?) dürüst
# bir İKİNCİ metriktir — sıkı metriğin YERİNE değil, YANINDA raporlanır (eval/).
#
# DÜRÜST GRUPLAMA İLKESİ (jüriye savunulabilir; aşırı-birleştirme YOK):
#  - Gruplar yalnız GERÇEKTEN bulanık sınır + AYNI operasyonel sonuç (havale/işlem)
#    paylaşan türleri birleştirir; gevşek "hepsi yazı" birleştirmesi YAPILMAZ.
#  - bilgi_edinme AYRI tutulur: 4982 ayrı süre rejimi (15 iş günü, m.16-17 red, BEDK
#    itirazı) → dilekçe/talep ile operasyonel olarak DEĞİŞTİRİLEMEZ (docs/02 §4).
#  - ihbar AYRI: soruşturma/denetim tetikler (teftiş); şikâyet'ten ayrı sonuç doğurur.
#  - fatura/tutanak/rapor/tebligat: ayrık operasyonel sonuç → kendi grubu (singleton).
EVRAK_ESDEGER: dict[str, tuple[str, ...]] = {
    # Vatandaş talebi: serbest istek/başvuru kanalları — ilk havale aynı (halkla
    # ilişkiler/ilgili daire), işlem aynı (kayıt→havale→cevabi yazı, 3071/30 gün).
    # bilgi_edinme DAHİL DEĞİL (ayrı 4982 rejimi). cimer DAHİL (3071 türü başvuru).
    "vatandas_talebi": ("dilekce", "talep", "basvuru", "cimer"),
    # Resmî yazı ailesi: kurum→kurum yazışma; üst yazı/cevabi/müzekkere/genelge sınırı
    # bulanık (hepsi resmî format + Yazı İşleri akışı). gorus_mutalaa DAHİL DEĞİL
    # (hukuki kanaat = ayrı işlem, hukuk müşavirliği esas içerik).
    "resmi_yazi": ("ust_yazi", "cevabi_yazi", "muzekkere", "genelge_talimat_olur"),
    # İcra/dava: yargı-icra evrakı; süreli + hukuk müşavirliği savunma/işlem (ayrık sonuç).
    "yargi_icra": ("dava_evraki", "icra_evraki"),
}

# Tür → eşdeğer-grup adı (singleton türler kendi adıyla; hızlı ters-arama).
_EVRAK_GRUP: dict[str, str] = {
    turu: grup for grup, turler in EVRAK_ESDEGER.items() for turu in turler
}


def esdeger_grup(turu: str) -> str:
    """Evrak türü → operasyonel-eşdeğer grup adı.

    Gruba ait değilse türün KENDİSİ grup sayılır (singleton) → operasyonel metrik
    aşırı-birleştirmez; yalnız tanımlı bulanık-sınır çiftlerinde tolerans gösterir.
    'belirsiz' her zaman singleton (abstention; hiçbir grupla eşdeğer değil).
    """
    return _EVRAK_GRUP.get(turu, turu)


def ayni_esdeger_grup(a: str, b: str) -> bool:
    """İki tür operasyonel-eşdeğer mi? 'belirsiz' hiçbir şeyle eşdeğer DEĞİL (sıkı abstention)."""
    if a == "belirsiz" or b == "belirsiz":
        return a == b
    return esdeger_grup(a) == esdeger_grup(b)


# --- Görev 2: Birim yönlendirme (havale) etiketleri ---
BIRIMLER: tuple[str, ...] = (
    "yazi_isleri_evrak", "hukuk_musavirligi", "insan_kaynaklari", "mali_strateji_sgb",
    "bilgi_islem", "destek_idari_hizmetler", "basin_halkla_iliskiler_cimer",
    "teftis_ic_denetim", "ilgili_teknik_daire",
)
BIRIM_TR: dict[str, str] = {
    "yazi_isleri_evrak": "Yazı İşleri / Genel Evrak Müdürlüğü",
    "hukuk_musavirligi": "Hukuk Müşavirliği",
    "insan_kaynaklari": "İnsan Kaynakları / Personel Dairesi",
    "mali_strateji_sgb": "Strateji Geliştirme / Mali İşler",
    "bilgi_islem": "Bilgi İşlem Dairesi",
    "destek_idari_hizmetler": "Destek / İdari Hizmetler Dairesi",
    # NOT: Bu kova dilekçe + bilgi-edinme + CİMER başvurularını birlikte tutar (EVRAK_TO_BIRIM).
    # Etiket "CİMER"i ARTIK KOŞULSUZ İDDİA ETMEZ — düz dilekçe CİMER'den gelmediği hâlde her
    # dilekçede "CİMER Birimi" görünüyordu (yanlış). Varsayılan hiçbir zaman-yanlış olmayan
    # halkla ilişkiler/başvuru-kayıt kanalıdır; CİMER/Bilgi-Edinme ETİKETİ yalnız evrak GERÇEKTEN
    # o türdeyse gösterilir (frontend BIRIM_GOSTER). Kod/rota (basin_halkla_iliskiler_cimer) sabit.
    "basin_halkla_iliskiler_cimer": "Basın-Halkla İlişkiler / Başvuru-Kayıt",
    "teftis_ic_denetim": "Teftiş / İç Denetim",
    "ilgili_teknik_daire": "İlgili Teknik / Ana Hizmet Dairesi",
}

# --- Görev 2: Resmî yazı türleri ---
YAZI_TURLERI: tuple[str, ...] = (
    "ust_yazi", "cevabi_yazi", "bilgilendirme", "olur", "muzekkere", "gorus_mutalaa",
)
YAZI_TURU_TR: dict[str, str] = {
    "ust_yazi": "Üst Yazı", "cevabi_yazi": "Cevabi Yazı",
    "bilgilendirme": "Bilgilendirme Yazısı", "olur": "Olur / Onay Yazısı",
    "muzekkere": "Müzekkere", "gorus_mutalaa": "Görüş / Mütalaa",
}

# --- Eksik bilgi tespiti: bir evrakta olması gereken zorunlu alanlar (3071 m.4) ---
ZORUNLU_ALANLAR: tuple[str, ...] = (
    "gonderen_ad_soyad", "tckn_veya_kurum", "tarih", "konu", "talep", "iletisim_adres", "imza",
)

# --- Evrak türü → tipik havale edilen birim (araştırma §3) ---
EVRAK_TO_BIRIM: dict[str, str] = {
    "dilekce": "basin_halkla_iliskiler_cimer",
    "basvuru": "ilgili_teknik_daire",
    # Şikâyet/ihbar bir başvuru BİÇİMİDİR; sorumlu birim konuya göre belirlenir.
    # Teftiş yalnız belediye personeli/işlemi hakkında usulsüzlük-disiplin sinyali varsa
    # içerik yönlendirmesiyle öne çıkar. Salt "şikâyet" sözcüğü iç denetim anlamına gelmez.
    "sikayet": "ilgili_teknik_daire",
    "ihbar": "ilgili_teknik_daire",
    "talep": "ilgili_teknik_daire",
    "bilgi_edinme": "basin_halkla_iliskiler_cimer",
    "cimer": "basin_halkla_iliskiler_cimer",
    "ust_yazi": "yazi_isleri_evrak",
    "cevabi_yazi": "yazi_isleri_evrak",
    "tebligat": "hukuk_musavirligi",
    "dava_evraki": "hukuk_musavirligi",
    "icra_evraki": "hukuk_musavirligi",
    "muzekkere": "hukuk_musavirligi",
    "fatura": "mali_strateji_sgb",
    "tutanak": "yazi_isleri_evrak",
    "rapor": "teftis_ic_denetim",
    "gorus_mutalaa": "hukuk_musavirligi",
    "genelge_talimat_olur": "yazi_isleri_evrak",
    "belirsiz": "yazi_isleri_evrak",
}

# --- Yenilikçilik (Görev 2 — arşivleme): Evrak türü → kaba SDP konu kodu (2005/7) ---
# Standart Dosya Planı (Başbakanlık Genelgesi 2005/7) kod aralıkları:
#   000-099 ortak konular · 100-599 ana hizmet · 600-999 yardımcı/danışma/denetim.
# NOT (CLAUDE.md §1): SDP genelgesi MADDE yerine KOD ARALIKLARI ile düzenlidir; aşağıdaki
# kodlar 2005/7 ortak/yardımcı konu başlıklarının KABA eşlemesidir — kuruma özgü ana hizmet
# kodları (100-599) belge konusuna göre değişir. Spesifik kod şüpheli → [DOĞRULA:].
EVRAK_TO_SDP: dict[str, str] = {
    "dilekce": "010",                 # Mevzuat/dilekçe-genel işlemler (ortak)
    "basvuru": "100",                 # Ana hizmet başvuruları (kuruma özgü; kaba)
    "sikayet": "622",                 # Şikâyet/inceleme (yardımcı-denetim)
    "ihbar": "622",                   # İhbar/inceleme (yardımcı-denetim)
    "talep": "100",                   # Ana hizmet talepleri (kaba)
    "bilgi_edinme": "622.03",         # Bilgi edinme başvuruları (4982)
    "cimer": "622.04",                # CİMER başvuruları (halkla ilişkiler)
    "ust_yazi": "010",                # Genel yazışma (ortak)
    "cevabi_yazi": "010",             # Genel yazışma (ortak)
    "tebligat": "640",                # Hukuk işleri / tebligat (yardımcı)
    "dava_evraki": "640",             # Hukuk müşavirliği — dava (yardımcı)
    "icra_evraki": "640",             # Hukuk müşavirliği — icra (yardımcı)
    "muzekkere": "640",               # Hukuk müşavirliği — müzekkere (yardımcı)
    "fatura": "841",                  # Bütçe/ödeme/tahakkuk (yardımcı-mali, 5018)
    "tutanak": "000",                 # Genel/ortak tutanak (ortak)
    "rapor": "040",                   # Rapor (ortak konular)
    "gorus_mutalaa": "045",           # Görüş/mütalaa (ortak konular)
    "genelge_talimat_olur": "020",    # Genelge/talimat/olur (ortak)
    "belirsiz": "000",                # Sınıflanamayan → genel/ortak
}

# --- Evrak türü → saklama (muhafaza) süresi — SDP/DAGM saklama planı (kaba kategori) ---
# NOT: Kesin süreler kurum Saklama Süreli Standart Dosya Planı'nda belirlenir; aşağıdakiler
# tür-bazlı tipik kategorilerdir. Hukuk/mali evrak uzun, genel yazışma orta, geçici kısa.
EVRAK_TO_SAKLAMA: dict[str, str] = {
    "dava_evraki": "10 yıl",
    "icra_evraki": "10 yıl",
    "muzekkere": "10 yıl",
    "tebligat": "10 yıl",
    "gorus_mutalaa": "10 yıl",
    "fatura": "10 yıl",               # mali belge (5018; denetim süresi)
    "sikayet": "5 yıl",
    "ihbar": "5 yıl",
    "rapor": "5 yıl",
    "tutanak": "5 yıl",
    "genelge_talimat_olur": "Süresiz (devamlı)",  # düzenleyici işlem
    "dilekce": "5 yıl",
    "basvuru": "5 yıl",
    "talep": "5 yıl",
    "bilgi_edinme": "5 yıl",
    "cimer": "5 yıl",
    "ust_yazi": "5 yıl",
    "cevabi_yazi": "5 yıl",
    "belirsiz": "[DOĞRULA: saklama süresi tür belirsiz]",
}
_SAKLAMA_VARSAYILAN = "5 yıl"

# --- Görev 1 (yenilikçilik): Yasal cevap süresi / SLA triyaj tablosu ---
# (gün, iş_günü_mü, mevzuat_referansı). NOT (CLAUDE.md §1 — süre UYDURMA): yalnız
# mevzuatta AÇIKÇA tanımlı, doğrulanabilir süreler. Diğer türlerde süre kuruma/işleme
# göre değişir → tabloda YOK → triyaj "tanımsız" döner (uydurma süre üretilmez).
#   - 3071 s. Dilekçe Hakkı Kanunu m.7: "...en geç otuz gün içinde..." → 30 takvim günü.
#   - 4982 s. Bilgi Edinme Hakkı Kanunu m.11: "...on beş iş günü içinde..." → 15 iş günü.
# CİMER/şikâyet/talep/başvuru/ihbar = 3071 kapsamı vatandaş başvurusu → 30 gün.
EVRAK_TO_SURE: dict[str, tuple[int, bool, str]] = {
    "dilekce": (30, False, "3071 s.K. m.7 (otuz gün)"),
    "basvuru": (30, False, "3071 s.K. m.7 (otuz gün)"),
    "sikayet": (30, False, "3071 s.K. m.7 (otuz gün)"),
    "talep": (30, False, "3071 s.K. m.7 (otuz gün)"),
    "ihbar": (30, False, "3071 s.K. m.7 (otuz gün)"),
    "cimer": (30, False, "3071 s.K. genel başvuru (otuz gün)"),
    "bilgi_edinme": (15, True, "4982 s.K. m.11 (on beş iş günü)"),
}

# --- Yetkisizlik (devir) dayanağı: evrak muhatabın görev alanı dışındaysa hangi hükümle
# yetkili kuruma GÖNDERİLİR.
#   3071 m.5 ("Gönderilen makamda hata"): "Dilekçe, konusuyla ilgili olmayan bir idari makama
#     verilmesi durumunda, bu makam tarafından yetkili idari makama gönderilir ve ayrıca
#     dilekçe sahibine de bilgi verilir."  → devir hükmü BUDUR.
#   4982 m.7 → 4982_bilgi_edinme_kanunu.txt (maddenin SON cümlesi)
# DÜZELTME (2026-07-24): burada m.8 yazıyordu — YANLIŞTI. Gerçek m.8 TBMM Dilekçe Komisyonu
# sürelerini (60/30 gün) düzenler, devri değil. Hata korpus dosyasından kopyalanmıştı
# (3071 korpusunda m.5 ve m.8 içerikleri yer değişmişti; korpus da bu commit'te düzeltildi).
# Birincil doğrulama: mevzuat.gov.tr 1.5.3071 + ovacik.gov.tr resmî kanun metni.
# CLAUDE.md §1: madde no uydurulmaz — anahtarı olmayan tür dayanak CÜMLESİ ALMAZ, devir
# yine yapılır ama yazı hükme atıf yapmaz. Anahtar kümesi EVRAK_TO_SURE ile bilinçli aynı.
EVRAK_TO_DEVIR_DAYANAK: dict[str, str] = {
    t: "3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanunun 5 inci maddesi"
    for t in ("dilekce", "basvuru", "sikayet", "talep", "ihbar", "cimer")
} | {
    "bilgi_edinme": "4982 sayılı Bilgi Edinme Hakkı Kanununun 7 nci maddesi",
}

# --- Evrak türü → ilgili mevzuat (araştırma §2; üretimde RAG ile zenginleştirilir) ---
# NOT (CLAUDE.md §1): madde no'ları mevzuat.gov.tr'de DOĞRULANMALI; şüpheli → [DOĞRULA:].
# KAPSAM: 18 üretilen türün TAMAMI eşlenir (eski 7 → 18). Boost anahtarı olmayan tür,
# hem retrieval boost'undan (mevzuat_oner._beklenen_kanun_nolari) hem de gold üretiminden
# (gen_synthetic beklenen_mevzuat) düşüyordu → eval o türü hiç ölçemiyordu (kapalı-döngü
# kör nokta). Aşağıdaki madde no'lar data/mevzuat/ korpusundan (31 mevzuat / 210 chunk)
# ÇAPRAZ DOĞRULANDI. 2026-06 genişletme: KVKK 6698, e-imza 5070, VUK 213, İmar 3194,
# İcra 2004, HMK 6100, Belediye 5393, Kamulaştırma 2942, İş 4857 vb. korpusa eklendi (uydurma yok).
EVRAK_TO_MEVZUAT: dict[str, list[str]] = {
    # Vatandaş talebi ailesi → 3071 Dilekçe Hakkı (korpus: 3071; m.4 ve m.7 doğrulandı).
    "dilekce": ["3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun m.4 (zorunlu unsurlar)"],
    "basvuru": ["3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun m.4 (zorunlu unsurlar)"],
    "talep": ["3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun m.4 (zorunlu unsurlar)"],
    "sikayet": ["3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun m.7 (otuz gün içinde gerekçeli cevap)"],
    "ihbar": ["3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun m.3-7 (başvuru ve sonucun bildirimi)"],
    "bilgi_edinme": ["4982 sayılı Bilgi Edinme Hakkı Kanunu (15 iş günü; m.16-17 red sebepleri)"],
    # 5690 = Cumhurbaşkanı KARARI sayısı (CİMER Yönetmeliği, RG 04.06.2022/31856) —
    # Kararname (CBK) DEĞİL; korpus dosyası 5690_cimer_cb_kararnamesi.txt ile uyumlu.
    "cimer": ["Cumhurbaşkanlığı İletişim Merkezi (CİMER) Yönetmeliği (CB Kararı 5690)"],
    # Yargı/icra/tebliğ → 2577 İYUK (korpus: m.7) + 2004 İİK (korpus: m.60/62/78 — 2026-06
    # genişletme ile eklendi, doğrulandı) + 7201 tebliğ (korpus: 7201).
    "dava_evraki": ["2577 sayılı İdari Yargılama Usulü Kanunu m.7 (dava açma süresi; idare mah. altmış gün)"],
    "icra_evraki": [
        "2004 sayılı İcra ve İflas Kanunu m.60 (ödeme emri), m.62 (itiraz), m.78 (haciz)",
        "7201 sayılı Tebligat Kanunu (icra evrakının tebliği)",
    ],
    # 2026-07 boşluk taraması: tebligat ANAHTARSIZDI → boost/domain-genişletme almıyor,
    # eval kaçışlarının 7/10'u bu türdeydi (7201 korpusta olduğu hâlde gürültü altında).
    "tebligat": [
        "7201 sayılı Tebligat Kanunu (tebliğ usulü)",
        "Elektronik Tebligat Yönetmeliği (e-tebligat)",
    ],
    # Mali evrak → 5018 (korpus: m.33-34 gerçekleştirme/ödeme emri doğrulandı).
    "fatura": ["5018 sayılı Kamu Malî Yönetimi ve Kontrol Kanunu m.33-34 (gerçekleştirme ve ödeme emri belgesi)"],
    # Resmî yazı ailesi → format dayanağı Yön. 2646 (korpus: 2646, 13 chunk).
    "ust_yazi": ["Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)"],
    "cevabi_yazi": ["Resmî Yazışma Yönetmeliği m.15 (İlgi atfı)"],
    # DÜZELTME (2026-07): "müzekkere"/"görüş-mütalaa" ÖNCEDEN yanlışlıkla Yön. 2646'ya
    # bağlanmıştı — tam metin taranarak doğrulandı: "müzekkere" kelimesi 2646'da HİÇ
    # geçmiyor; "görüş" yalnız m.33'te (görüş talebine cevap süresi) geçiyor, ayrı bir
    # yazı-türü/format maddesi yok. docs/02-evrak-taksonomi-routing.md zaten doğru kaynağı
    # biliyordu (müzekkere: "usul"/teamül, gorus_mutalaa: "Hukuk Müş. Yön.") — burada
    # sessizce 2646'ya sadeleştirilmişti (mevzuat referansı uydurma, CLAUDE.md §1 ihlali).
    "muzekkere": ["[DOĞRULA: özel usul/teamül — CB 2646/2020 metninde 'müzekkere' tanımlı değil]"],
    "tutanak": ["Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)"],
    "rapor": ["Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)"],
    "gorus_mutalaa": ["[DOĞRULA: Hukuk Müşavirliği Yönetmeliği ilgili maddesi — CB 2646/2020 m.33 yalnız görüş talebine cevap süresini düzenler, ayrı yazı türü/format tanımlamaz]"],
    "genelge_talimat_olur": ["Resmî Yazışma Yönetmeliği m.20 (Olur/Onay)"],
}

# --- İzin (dinlenme) hakkı — jurisdiksiyon-duyarlı içerik sinyali ---
# SORUN (2026-07-17 ekran-görüntüsü + adversarial bulgu): "Yıllık izin talebi" biçimsel
# olarak "dilekçe" sınıflanır → dilekçe domain-genişletmesi ("Dilekçe Hakkı Kanunu zorunlu
# unsurlar" ×3) sorguyu kirletip 5690/5176/3071'i şişirir, doğru izin kanununu (657 m.102)
# top-3 dışına iter; panelde hepsi "düşük güven" görünür. Ama aynı "yıllık izin" ifadesi
# BİRDEN ÇOK kanunda geçer — 657 (memur) · 4857 (işçi) · 854 (denizci) — dolayısıyla körlemesine
# 657'ye bağlamak, bir işçi/denizci uyuşmazlığında doğru kanunu (4857/854) ezerdi.
#
# ÇÖZÜM: içerikte izin terimi varsa jurisdiksiyon AYIRT EDİLİR. Bu bir KAMU evrak sistemi
# olduğundan VARSAYILAN memurdur (657); yalnız içerikte açık iş-hukuku ya da deniz-iş sinyali
# varsa 4857/854'e yönlendirilir. Doğru kanun boost'lanır (mevzuat_oner._apply_boost) VE izin
# tespit edilince yanıltıcı tür-domain kirliliği bastırılır (mevzuat_oner._retrieval_query).
# Terimler korpus + 657/4857/854 lafzıyla doğrulanmıştır (grep); tek "izin" kelimesi GİRMEZ
# (çevre izni / yapı kullanma izni yanlış-pozitif alırdı).
# Nitelik + izin. Türkçe iyelik/hâl ekleri "izin" kökündeki dar ünlüyü DÜŞÜRÜR
# (izin→izni/iznimi/iznini/izne/izninde). Doğal dilekçe dili neredeyse hep çekimlidir
# ("yıllık iznimi kullanmak istiyorum") → yalın "yıllık izin" substring'i bunu KAÇIRIR
# (adversarial bulgu, 2026-07-17). Bu yüzden her nitelik hem yalın ("... izin") hem de
# ünlü-düşmüş çekim kökü ("... izn": izni/iznimi/izne/… hepsini yakalar) olarak saklanır.
_IZIN_NITELIK: tuple[str, ...] = (
    "yıllık", "yıllık ücretli", "mazeret", "ücretsiz", "aylıksız",
    "hastalık", "refakat", "doğum", "süt",
)
IZIN_TERIMLERI: tuple[str, ...] = tuple(
    f"{nitelik} {ek}" for nitelik in _IZIN_NITELIK for ek in ("izin", "izn")
)
# İş-hukuku sinyali → 4857; deniz-iş sinyali → 854; hiçbiri yoksa varsayılan 657 (memur).
IZIN_ISCI_SINYAL: tuple[str, ...] = ("işçi", "iş sözleşmesi", "işveren", "kıdem", "4857 sayılı")
IZIN_DENIZ_SINYAL: tuple[str, ...] = ("gemi adamı", "deniz iş", "armatör", "854 sayılı")

# --- Evrak türü → üretilmesi gereken resmî yazı türü (araştırma §2) ---
# TÜM 18 tür AÇIKÇA eşlenir (sessiz cevabi_yazi default'u yok — M6). YAZI_TURLERI:
# ust_yazi (iletim: muhatap = HEDEF BİRİM, gönderen değil — yazi_taslak.py) ·
# cevabi_yazi (gönderene karşılık) · bilgilendirme · olur · muzekkere · gorus_mutalaa.
#
# 2026-07-09 düzeltme (kullanıcı canlı demoda yakaladı): fatura/icra/dava/tebligat
# önceden cevabi_yazi'ydi → sistem ödeme talebine "gönderen kurumun antetine cevap"
# yazıyordu (saçma). Doğrusu: bu belgeler gönderene YANITLANMAZ, sorumlu birime
# İLETİM üst yazısı alır (fatura→mali tahakkuk; icra/dava/tebligat→hukuk müşavirliği;
# hukuki karşılık — itiraz/savunma — otomasyonun değil müşavirliğin işidir).
EVRAK_TO_YAZI: dict[str, str] = {
    # Vatandaş talebi ailesi → karşılık/bilgilendirme
    "dilekce": "cevabi_yazi", "basvuru": "cevabi_yazi", "talep": "cevabi_yazi",
    "bilgi_edinme": "bilgilendirme", "cimer": "bilgilendirme",
    "sikayet": "cevabi_yazi",                    # hizmet şikâyeti → inceleme sonrası başvurana cevap
    "ihbar": "olur",                             # somut ihbar → inceleme/soruşturma oluru gerekebilir
    # Kurum→kurum resmî yazı ailesi
    "ust_yazi": "cevabi_yazi", "cevabi_yazi": "cevabi_yazi",
    "muzekkere": "cevabi_yazi",                   # kayıt/belge celbine karşılık (celbedilen kayıt gönderilir)
    "genelge_talimat_olur": "olur",               # düzenleyici işlem → olur/onay
    # Yargı/icra → hukuk müşavirliğine İLETİM (üst yazı; muhatap=hedef birim)
    "tebligat": "ust_yazi", "dava_evraki": "ust_yazi", "icra_evraki": "ust_yazi",
    "gorus_mutalaa": "gorus_mutalaa",             # görüş TALEBİ → görüş/mütalaa yazısıyla yanıtlanır
    # Mali / belge-işlemi → sorumlu birime iletim
    "fatura": "ust_yazi",                         # ödeme talebi → mali birime tahakkuk iletimi
    "tutanak": "ust_yazi", "rapor": "ust_yazi",   # tespit/inceleme çıktısı → iletim
    "belirsiz": "cevabi_yazi",                    # güvenli varsayılan
}

# --- S6: KVKK / on-prem modu — "veri kurumdan çıkmaz" profili ---
# Dayanak: 2019/12 sayılı CB Genelgesi (kritik veri yurtiçinde) + KVKK Üretken YZ
# Rehberi (Kas 2025, hassas veri için yerinde açık model önerisi). KVKK_MODU=1 →
# LLM istekleri LOKAL OpenAI-uyumlu sunucuya zorlanır (Ollama varsayılanı
# http://localhost:11434/v1; KVKK_BASE_URL/KVKK_MODEL ile değiştirilebilir). Bulut
# base-url .env'de tanımlı olsa bile EZİLİR — mod açıkken dışarı istek çıkmaz.
# Mevcut LLM_MODE=openai yolu yeniden kullanılır (profil, kod dalı değil); Ollama
# anahtar istemez → OPENAI_API_KEY yoksa dolgu değer konur (bulut anahtarı gerekmez).
#
# KAPSAM UYARISI (bilinçli cross-cutting etki): OPENAI_BASE_URL/OPENAI_API_KEY,
# core.openai_compat üzerinden LLM'e EK OLARAK bulut OCR/STT/TTS istemcileri
# tarafından da okunur → KVKK modu açıkken BÜTÜN bulut çağrıları lokale döner.
# Bu bir yan etki değil, modun amacıdır ("hiçbir istek kurumdan çıkmaz").
# Davranış İLK IMPORT anında sabitlenir (config her yerde import edilir; süreç
# başına bir kez) — test kapsamı: tests/test_kvkk_modu.py subprocess senaryosu.
KVKK_MODU = os.getenv("KVKK_MODU", "0") == "1"
if KVKK_MODU:
    os.environ["OPENAI_BASE_URL"] = os.getenv("KVKK_BASE_URL", "http://localhost:11434/v1")
    os.environ["OPENAI_LLM_MODEL"] = os.getenv("KVKK_MODEL", "llama3.1:8b")
    os.environ.setdefault("OPENAI_API_KEY", "ollama-lokal")
    os.environ.setdefault("LLM_MODE", "openai")

# --- LLM modu (ADALET ile aynı desen) ---
LLM_MODE = os.getenv("LLM_MODE", "mock").lower()  # mock | openai | llamacpp


def llm_profil() -> str:
    """UI rozeti için işleme profili: kvkk-onprem | mock | bulut (S6 şeffaflık)."""
    if KVKK_MODU:
        return "kvkk-onprem"
    if LLM_MODE == "mock":
        return "mock"
    return "bulut"

# --- S3: Vitrin (jüri demo) modu — TEK anahtar: özellikler + hız birlikte ---
# VITRIN_MODU=1 → (a) kapalı hazineler açılır: clarifier (dur-ve-sor) + HITL onay
# kapısı + CRAG + atıf genişletme; (b) hız profili devreye girer: danışma LLM
# çağrıları atlanır (LLM_ATLA_NODELAR) + node timeout 15 sn. Yalnız MODEL
# BAĞIMLILIĞI OLMAYANLAR vitrine girer (RERANK/NLI ağır model ister → bireysel
# bayrak). Bireysel ENV HER ZAMAN kazanır: VITRIN_MODU=1 + HITL_ENABLED=0 → HITL
# kapalı. Varsayılan 0 → baseline/CI birebir korunur (bayraksız topoloji test-sabit).
VITRIN_MODU = os.getenv("VITRIN_MODU", "0") == "1"


def _bayrak(ad: str, *, vitrin_acik: bool, env=os.environ) -> bool:
    """ENV bayrağı çözümü: bireysel değer > vitrin varsayılanı > kapalı (SAF, test edilir)."""
    return env.get(ad, "1" if vitrin_acik else "0") == "1"


def _csv_kume(deger: str) -> frozenset[str]:
    """Virgüllü ENV listesi → temiz küme (SAF, test edilir)."""
    return frozenset(p.strip() for p in deger.split(",") if p.strip())


# --- Vitrin modunun HIZ profili (TEK MOD: vitrin = özellikler + hız birlikte) ---
# Gerçek LLM'de (DeepSeek 7-57 sn/çağrı ölçüldü) belge ~2-3 dk sürüyordu. Vitrin modu
# yalnız DANIŞMA niteliğindeki çağrıları deterministiğe düşürür:
#   - route_birim: LLM önerisi zaten danışmaydı (loglarda deterministik hedef kazandı)
#   - finalize: bilgilendirme metni — deterministik şablon yeterli
# Kalite-kritik node'lar (sınıflandır · çıkar · özetle · yazı gövdesi · decompose)
# LLM'DE KALIR. LLM_ATLA_NODELAR bireysel ENV ile ezilebilir ("" = hiçbirini atlama).
LLM_ATLA_NODELAR: frozenset[str] = _csv_kume(
    os.getenv("LLM_ATLA_NODELAR", "route_birim,finalize" if VITRIN_MODU else "")
)
if VITRIN_MODU:
    # Node LLM timeout 20→15 sn (ölçüm: sağlayıcı yoğunken timeout'a düşen çağrılar
    # ZATEN deterministiğe iniyordu — aynı kaliteye 5 sn erken düşer, israf kısalır).
    # setdefault → açık ENV her zaman kazanır. _llm_extract import'unda okunur;
    # config her node'dan önce import edilir (KVKK bloğuyla aynı desen).
    os.environ.setdefault("EVRAK_LLM_TIMEOUT_S", "15.0")


# --- Görev 2: doğrulama (verify) + dur-ve-sor (clarifier) ENV bayrakları ---
# verify_node grafta her zaman var; KAPATILIRSA no-op passthrough (state bozulmaz).
VERIFY_ENABLED = os.getenv("VERIFY_ENABLED", "1") == "1"
# Karar/inceleme grounding: taslakta tamamlanmış "incelenmiştir/uygun bulunmuştur/
# reddedilmiştir" iddiası kaynakta yoksa deterministik KIRMIZI veto (agents.karar_grounding).
# _uydurma_veto'nun soyut-taahhüt boşluğunu kapatır; deterministik → mock/CI'da da çalışır.
KARAR_GROUNDING_ENABLED = os.getenv("KARAR_GROUNDING_ENABLED", "1") == "1"
# clarifier dur-ve-sor dalı: baseline KAPALI; vitrin modunda AÇIK (şartname Görev 2.5
# "eksik bilgi isteme" maddesinin dur-ve-sor karşılığı — demo/jüri akışında açık olmalı).
CLARIFY_STOP_ENABLED = _bayrak("CLARIFY_STOP_ENABLED", vitrin_acik=VITRIN_MODU)

# HITL (human-in-the-loop) memur onay kapısı: LangGraph interrupt() ile DURUR; memur
# ONAYLA/DÜZENLE/REDDET. interrupt() bir checkpointer ister. VARSAYILAN KAPALI → baseline
# (checkpointer'sız, kesintisiz) compile + akış birebir korunur. Açıkken onay_kapisi node'u
# verify/risk_guard SONRASINA girer (memur riski görerek onaylar); RISK_GUARD ile KOŞULLU
# (yeşil otomatik geçer, sarı/kırmızı durur); graf InMemorySaver ile derlenir.
HITL_ENABLED = _bayrak("HITL_ENABLED", vitrin_acik=VITRIN_MODU)

# --- Yenilikçilik: ENV-gated SOTA öz-düzeltme node'ları (CRAG + Self-RAG) ---
# İKİSİ DE VARSAYILAN KAPALI → baseline akış birebir korunur (141 test değişmez).
# Ablation harness'i (eval/ablation_eval.py) bu bayrakları A/B için açıp kapatır.
#
# CRAG (Corrective RAG): mevzuat_oner retrieval güveni düşükse (top skor < eşik veya
# 0 sonuç) sorguyu genişletip BM25'i yeniden çağırır → daha iyi mevzuat önerisi.
CRAG_ENABLED = _bayrak("CRAG_ENABLED", vitrin_acik=VITRIN_MODU)
# GraphRAG-lite (S7): BM25 top sonuçlarının METNİNDEN atıf verilen kanunlara 1-hop
# genişletme ("önerilen madde, atıf verdiği mevzuatla gelir"). Deterministik/modelsiz →
# vitrine dahil; baseline'da kapalı (retrieval eval sabit kalır).
ATIF_GENISLET_ENABLED = _bayrak("ATIF_GENISLET_ENABLED", vitrin_acik=VITRIN_MODU)
# CRAG düzeltme eşiği: normalize güven (0..1) bu değerin altındaysa düzeltme tetiklenir.
CRAG_CONF_ESIK = float(os.getenv("CRAG_CONF_ESIK", "0.55"))
# Ham BM25 referans eşiği: top raw_score bu değere ulaşırsa "tam güven" (1.0) sayılır;
# altındaysa oransal düşer (mutlak retrieval kalitesi sinyali). Gold dağılımı: güçlü
# eşleşmeler raw≈17-40; zayıf/gürültülü sorgu raw<~7 → düzeltme tetiklenir.
CRAG_RAW_ESIK = float(os.getenv("CRAG_RAW_ESIK", "12.0"))
#
# Self-RAG (reflection): finalize öncesi çıktının tamlığını öz-değerlendirir
# (evrak_turu + hedef_birim + ozet + mevzuat var mı?). Eksikse not düşer (şeffaflık).
SELF_RAG_ENABLED = os.getenv("SELF_RAG_ENABLED", "0") == "1"

# Self-consistency abstention (Wang 2023, ENV-gated): N>1 → sınıflandırma N kez bağımsız
# örneklenir; örnekler arası UZLAŞI yoksa (oran < _CONSENSUS_ESIK) dürüst "belirsiz" döner —
# "zor" vakalarda gerçek abstention. VARSAYILAN 1 (KAPALI → ek LLM çağrısı/maliyet YOK).
# Demo/jüri için SELF_CONSISTENCY_N=3 yeter; N çağrı = N× maliyet (mock'ta etkisiz).
# Vitrin (tek mod) N=1 kalır — 3× sınıflandırma demoda en büyük gecikmeydi; N=3
# yalnız açık ENV ile (eval/ablation harness'i zaten kendi set eder).
SELF_CONSISTENCY_N = int(os.getenv("SELF_CONSISTENCY_N", "1"))
SELF_CONSISTENCY_ESIK = float(os.getenv("SELF_CONSISTENCY_ESIK", "0.6"))

# Çok-konulu evrak ayrıştırma (decompose) — tek dilekçedeki birden çok istek alt-taleplere
# bölünür; her alt-talep ayrı tür+birim+yazı-türü+yasal-süre alır → otomatik havale önerisi.
# ADDITIVE: birincil tür/birim/yönlendirme/özet/taslak DEĞİŞMEZ, yalnız alt_talepler eklenir.
# VARSAYILAN AÇIK (vitrin özelliği); DECOMPOSE_ENABLED=0 ile baseline ablation (node grafta yok).
DECOMPOSE_ENABLED = os.getenv("DECOMPOSE_ENABLED", "1") == "1"

# Risk bandı (trafik ışığı) — verify sonrası üretilen yazıya YEŞİL/SARI/KIRMIZI bandı atar:
#   yeşil  = yayın-hazır (kaynaktan, format tam, şüphe yok)
#   sarı   = memur incelesin (format eksik / [DOĞRULA] / düşük güven / eksik zorunlu alan)
#   kırmızı= uydurma şüphesi (verify metinde olmayan somut tarih/sayı yakaladı)
# DETERMİNİSTİK (verify sinyallerinden türetilir, LLM yok). ADDITIVE: yalnız risk_metadata ekler.
# VARSAYILAN AÇIK (vitrin); RISK_GUARD_ENABLED=0 → node grafta yok (baseline birebir).
RISK_GUARD_ENABLED = os.getenv("RISK_GUARD_ENABLED", "1") == "1"
# Düşük sınıflandırma güveni eşiği — altında SARI bandı (memur incelesin).
RISK_GUVEN_ESIK = float(os.getenv("RISK_GUVEN_ESIK", "0.5"))

# İçerik odaklı, talep bazlı mevzuat önerisi (agents/mevzuat_mesele + mevzuat_yargic):
# LLM katalogdan mesele/dosya seçer, korpus maddeyi getirir, alaka yargıcı boş dönebilir.
# Gerçek LLM varken VARSAYILAN AÇIK; mock/LLM'siz yolda hiç denenmez (eski BM25 yolu).
# Kapatılırsa (MEVZUAT_MESELE=0) eski tür odaklı BM25 yolu birebir çalışır.
MEVZUAT_MESELE_ENABLED = os.getenv("MEVZUAT_MESELE", "1") == "1"

# Cross-encoder reranking (iki-aşamalı retrieve-then-rerank): mevzuat_oner BM25 top-N
# adayı bge-reranker-v2-m3 ile yeniden sıralar → +nDCG (gerçek soru-belge alakası).
# VARSAYILAN KAPALI → baseline saf-BM25 birebir korunur (mock/CI/demo ağır model gerektirmez).
# Açıkken model/lib (sentence-transformers, rag extra) yoksa GRACEFUL BM25'e düşer (WARN log).
# Ablation: RERANK_ENABLED=0/1 ile retrieval_eval Recall@1 A/B. Reddetme eşiği reranker.RERANK_SCORE_MIN.
RERANK_ENABLED = os.getenv("RERANK_ENABLED", "0") == "1"
# BM25'in rerank'e besleyeceği aday sayısı (recall aşaması); reranker bunları top-K'ya süzer.
RERANK_CAND_N = int(os.getenv("RERANK_CAND_N", "30"))

# NLI atıf-gerekçelendirme (entailment grounding): önerilen mevzuat maddesi (premise) ile
# evrak talebi (hypothesis) arasında ANLAMSAL DESTEK var mı? Yoksa öneri [DOĞRULA] işaretlenir →
# verify'ın yüzeysel string vetosunun üstüne SEMANTİK uydurma-önleme (CLAUDE.md §1 ölçülebilir).
# VARSAYILAN KAPALI → baseline mevzuat_oner birebir korunur. Açıkken model/lib (transformers,
# rag extra) yoksa GRACEFUL passthrough (WARN). mDeBERTa-v3-xnli (MIT, Türkçe dahil, CPU).
NLI_ENABLED = os.getenv("NLI_ENABLED", "0") == "1"
NLI_MODEL = os.getenv("NLI_MODEL", "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli")
# Entailment olasılığı bu eşiğin altındaysa öneri "desteklenmiyor" → [DOĞRULA] işareti.
NLI_ESIK = float(os.getenv("NLI_ESIK", "0.5"))

# --- DeepSeek güçlendirme dalgası (2026-07) — LLM destekli ek katmanlar ---
# TÜMÜ deterministik-fallback sözleşmesine uyar: LLM yok/mock/hata/timeout → mevcut
# davranış BİREBİR (CI mock'ta hepsi no-op; testler deterministik geçer). Additive
# katmanlar (yalnız bilgi EKLER) varsayılan AÇIK; her biri tek bayrakla kapatılabilir.

# (1) OCR sonrası LLM imla/diakritik düzeltmesi — yalnız taranmış/düşük güvenli motor
# yolunda tetiklenir (ölçülü gerekçe: RapidOCR WER %51.4, eval/runs/ocr_eval.json).
# Sayı/tarih/TCKN'ye dokunmama kuralı prompt + deterministik son-kontrolle güvenceye alınır.
OCR_LLM_DUZELT = os.getenv("OCR_LLM_DUZELT", "1") == "1"

# (3) Kademeli model (tiered routing): sınıflandırma güveni eşiğin altında veya tür
# "belirsiz" ise deepseek-reasoner'dan İKİNCİ görüş alınır (yalnız zor vaka → maliyet
# sınırlı). Reasoner da düşük güven verirse dürüst "belirsiz" kalır (abstention korunur).
SINIFLANDIR_ESKALASYON = os.getenv("SINIFLANDIR_ESKALASYON", "1") == "1"
# NOT: eski varsayılan "deepseek-reasoner" API'den KALDIRILDI (HTTP 400) → eskalasyon
# yolu sessizce ölüydü. Güçlü model artık "deepseek-v4-pro" (2026-07-24).
ESKALASYON_MODEL = os.getenv("ESKALASYON_MODEL", "deepseek-v4-pro")
ESKALASYON_TIMEOUT_S = float(os.getenv("ESKALASYON_TIMEOUT_S", "60.0"))

# (4) Risk bandı doğal dil açıklaması — bant/skor/gerekçe DETERMİNİSTİK kalır; LLM
# yalnız SARI/KIRMIZI'da memura "neden + ilk adım" cümlesi üretir (additive alan).
RISK_ACIKLAMA_LLM = os.getenv("RISK_ACIKLAMA_LLM", "1") == "1"

# (5) LLM istemci güçlendirme: bozuk JSON'da geri-bildirimli TEK yeniden deneme +
# süreç-içi LRU yanıt cache'i (sha256(model+system+user); temp 0 çağrılar için güvenli;
# demo'da aynı örneğe ikinci tıklama ağ turu ödemez).
LLM_JSON_RETRY = os.getenv("LLM_JSON_RETRY", "1") == "1"
LLM_CACHE_ENABLED = os.getenv("LLM_CACHE_ENABLED", "1") == "1"
LLM_CACHE_BOYUT = int(os.getenv("LLM_CACHE_BOYUT", "256"))

# (5b) RETRY YALNIZ "DOLU AMA BOZUK" CEVAPTA — gecikme denetimi bulgusu (2026-08-07).
# Retry'ın işi modelin JSON'u markdown/açıklamayla sarmasını kurtarmaktır. Cevap BOŞ ya da
# KESİK (finish_reason == "length") geldiğinde ise sorun biçim değil BÜTÇEDİR: düşünme
# token'ları çıktı bütçesini bitirmiş, cevaba yer kalmamıştır. Aynı bütçe + aynı sıcaklıkla
# tekrar sormak mekanik olarak aynı sonucu verir, üstelik retry mesajı prompt'u uzatıp cevap
# alanını daha da daraltır (ölçüldü: tokens_in 714 -> 775).
# ÖLÇÜM: decompose ve route_ajan'da 4/4 retry başarısız; uçtan uca 44,9 sn'nin ~15 sn'si
# ÇIKTISI ZATEN ATILAN ikinci çağrılara gidiyordu. Node çıktıları DEĞİŞMEDEN düşer.
# 0 = eski davranış (boş/kesik cevapta da yeniden dene).
LLM_RETRY_SADECE_BOZUK = os.getenv("LLM_RETRY_SADECE_BOZUK", "1") == "1"

# (5c) KESİK CEVABIN DÜŞÜNMESİZ KURTARILMASI — decompose'a özel (ÇIKARIM işi).
# Ölçüldü (A/B): decompose'un çağrısı bütçe tavanına dayanıp kesiliyor; eski kod aynı
# bütçeyle yeniden soruyordu ve 4 denemenin 3'ü yine kesildi, 1'i şans eseri tuttu — yani
# kurtarma vardı ama yazı-turaydı ve deneme başına ~11 sn'ye mal oluyordu. Düşünme
# kapatılınca bütçenin tamamı cevaba kalır: kurtarma güvenilir ve ~3 sn.
# YALNIZ decompose: segmentasyon + kapalı-küme tur/birim seçimi ÇIKARIM'dır
# (bkz. LLM_DUSUNME_CIKARIMDA_KAPALI taksonomisi). route_ajan'ın yetki kararı YARGI'dır ve
# orada deterministik yol ölçülmüş üstündür (Top-1 0,907) — oraya BAĞLANMAZ.
DECOMPOSE_KESIKTE_DUSUNMESIZ = os.getenv("DECOMPOSE_KESIKTE_DUSUNMESIZ", "1") == "1"

# (5d) DECOMPOSE KAYNAK ÇAPASI — LLM segmentinin metni kaynakta gerçekten geçiyor mu.
# `tur`/`birim` kapalı-küme ile doğrulanıyordu ama serbest-metin `metin` alanı yalnız
# uzunluk kontrolünden geçiyordu; oysa o metin çok-konulu evrakta her alt-taslağın Konu
# satırına ve gövde tohumuna giriyor ve 2..N taslakları verify'ın uydurma vetosunu
# GÖRMÜYOR. Eşiğin altında kalan segment düşer; 2'nin altına inilirse LLM segmenti tümden
# reddedilir ve heuristik yol çalışır. 0 = guard kapalı (eski davranış).
DECOMPOSE_CAPA_ESIGI = float(os.getenv("DECOMPOSE_CAPA_ESIGI", "0.7"))

# (5e) RESMÎ YAZI GÖVDESİ — düşünme kapalı. Bu çağrı (yazi_render) `_chat_dene` katmanını
# ATLIYOR, yani ne düşünme marjı ne düşünme kapatma alıyordu. ÖLÇÜLDÜ (2026-08-07): çok-konulu
# koşumda üç gövde çağrısının ÜÇÜ de `tokens_out=320` = TAM TAVAN; bütçenin tamamı muhakemeye
# gidip `content` boş kalıyor ve üç resmî yazının gövdesi de sessizce şablona düşüyordu.
# Bu bir hız ayarı DEĞİL, hız çalışmasında bulunmuş bir KALİTE hatasının düzeltmesidir.
# Marj eklemek (+700) süreyi ~3× artırırdı; düşünmeyi kapatmak gecikmeyi nötr bırakır.
# İş cinsi uygun: tür/konu/talepler/kanıt paketi HAZIR verilir, iş resmî üslupla cümleye
# dökmektir. Emniyet ağı yerinde (kanit_etiketlerini_coz uydurma atıfı reddeder).
YAZI_GOVDE_DUSUNME_KAPALI = os.getenv("YAZI_GOVDE_DUSUNME_KAPALI", "1") == "1"

# (6) DÜŞÜNME MARJI — deepseek-v4-* modelleri "reasoning" üretir ve düşünme token'ları
# `max_tokens` bütçesinden düşer. Node'ların CEVAP için ayırdığı dar bütçeler (140-400)
# bu modellerde tamamen düşünmeye gidiyor → içerik BOŞ dönüyor ve node sessizce
# deterministik yedeğe düşüyordu (2026-07-24 bulgusu: 28 çağrının 13'ü boş).
# Çözüm tek noktada: istemciye giden bütçeye marj EKLENİR; her node'un kendi cevap
# bütçesi (anlamı: "cevap bu kadar kısa olsun") korunur. 0 = kapalı (eski davranış).
LLM_DUSUNME_MARJI = int(os.getenv("LLM_DUSUNME_MARJI", "700"))

# (2) Yön. 2646 lint bulgularının LLM düzeltme önerisi — düzeltilmiş taslak YENİDEN
# lint + uydurma-veto'dan geçirilir (deterministik doğrulama); iyileşme yoksa öneri
# düşürülür. Additive: lint_duzeltme_md alanı; mevcut taslak asla otomatik değişmez.
LINT_AUTOFIX = os.getenv("LINT_AUTOFIX", "1") == "1"

# (6) İddia-düzeyi grounding (uydurma-veto ikinci görüş): taslaktaki kurum/kişi/madde-no/
# tutar iddiaları kaynağa dayanıyor mu? GÜVENLİK ASİMETRİSİ: LLM bandı yalnız
# SERTLEŞTİREBİLİR (ek uyarı ekler); deterministik veto tek başına asla silinmez.
VERIFY_GROUNDING_LLM = os.getenv("VERIFY_GROUNDING_LLM", "1") == "1"

# SDP (Standart Dosya Planı) konu-kodu önerisi — Yön. 2646 m.11 Sayı satırının konu-kodu
# bileşenini evrak türü + konudan DETERMİNİSTİK seçer (yazi/sdp_plani, 2005/7 Genelge Ortak
# Alanlar). Taslak Sayı'sı "EBYS-TASLAK" placeholder'ından m.11-yapılı gerçek koda kavuşur.
# Kapalı-küme + deterministik → kapatılırsa (SDP_ONERI=0) render bugünküyle BİREBİR aynı.
SDP_ONERI = os.getenv("SDP_ONERI", "1") == "1"

# m.16 kademe fallback'i: tablo çözemeyen muhatap makamın kademesini LLM kapalı-küme
# (1-8) tahmin eder. TERS ASİMETRİ: tahmin YALNIZ 'bilgi' notu üretir, asla 'uyari'/
# SARI — yanlış tahmin yanlış NOT olur, yanlış BANT olamaz. Mock/anahtar yok → susar.
MAKAM_LLM = os.getenv("MAKAM_LLM", "1") == "1"

# Servis/hizmet müdürlüğü önerisi (agents.servis_birim — "gerçek" 11 belediye müdürlüğü,
# 5393 s.K. taksonomisi) LLM BİRİNCİL, kök-anahtar eşleşmesi fallback. Kapalı-küme (arsiv.py
# _sdp_llm_secimi deseniyle aynı): LLM yalnız SERVIS_BIRIM_TR havuzundan seçer, havuz-dışı/
# boş/mock/hata → None → deterministik oner_servis_birimi devreye girer (uydurma müdürlük
# ÜRETİLMEZ). NOT: ölçülen 9-birim yönlendirmesi (hedef_birim/route_birim) bu bayraktan
# ETKİLENMEZ — o alanda LLM'e serbest bırakma held-out A/B'de Top-1'i 0.91→0.54'e düşürmüştü
# (route_birim.py:132 docstring); bilinçli olarak dokunulmadı.
SERVIS_BIRIM_LLM = os.getenv("SERVIS_BIRIM_LLM", "1") == "1"

# KAYNAK-DOĞRULAMALI YÖNLENDİRME AJANI (route_birim): sabit kapalı-küme yerine DeepSeek
# evrak konusunu anlar → resmî teşkilat kaynağında (data/teskilat BM25 + opsiyonel web) birim
# arar → görev tanımlarını karşılaştırır → ÜÇLÜ grounding'le (kurum+birim+görev-konu) doğrular.
# Kaynak-doğrulanamazsa DÜRÜST fallback: hedef_birim=None + hedef_kategori(eski 9-set) +
# insan_onayi_gerekli=True (uydurma/başka-kurum birimi ASLA otomatik çıkmaz). Yok/mock/anahtarsız/
# korpus-yok → mevcut _route_deterministik. ROUTE_AJAN=0 → eski davranış birebir (tam geri-dönüş).
ROUTE_AJAN = os.getenv("ROUTE_AJAN", "1") == "1"
ROUTE_AJAN_MAX_TUR = int(os.getenv("ROUTE_AJAN_MAX_TUR", "2"))  # muhatap→yetkili yükseltme turu
# Hibrit arama web yedeği (REVİZYON 5): kuruma-özel offline kaynak yoksa canlı resmî-kaynak
# araması ('her yer' motoru). VARSAYILAN KAPALI — offline/CI/mock ilkesi korunur; açıkça açılır.
ROUTE_WEB_YEDEK = os.getenv("ROUTE_WEB_YEDEK", "0") == "1"

# (7) Rerank sağlayıcısı: "deepseek" (listwise, model indirmez → vitrine girebilir) |
# "cross-encoder" (bge-reranker, rag extra + ~1.1GB model). RERANK_ENABLED mevcut
# ana anahtar olarak kalır (varsayılan 0 — baseline saf-BM25 birebir).
RERANK_PROVIDER = os.getenv("RERANK_PROVIDER", "deepseek")

# (8) CRAG LLM güçlendirme: retrieval evaluator (correct/ambiguous/incorrect) + mevzuat
# dilinde sorgu yeniden yazımı — yalnız CRAG_ENABLED açıkken ve düşük güven dalında.
CRAG_LLM = os.getenv("CRAG_LLM", "1") == "1"

# (10) SDP kapalı-küme LLM seçici: deterministik ön-eleme adayları DIŞINA çıkamaz
# (halüsinasyon imkânsız); sayıdan-okuma önceliği ve [DOĞRULA] bayrağı aynen üstte.
SDP_LLM_SECICI = os.getenv("SDP_LLM_SECICI", "1") == "1"

# (12) NLI sağlayıcısı: "deepseek" (model indirmez, llm_json entailment) | "model"
# (mDeBERTa, rag extra). NLI_ENABLED ana anahtarı değişmedi (varsayılan 0).
NLI_PROVIDER = os.getenv("NLI_PROVIDER", "deepseek")

# (13) Sohbet asistanı: çok-adımlı araç döngüsü (function-calling) + konuşma-geçmişli
# kompozisyon. Kapalıyken/LLM yokken mevcut tek-tur niyet+şablon akışı birebir.
SOHBET_ARAC_DONGUSU = os.getenv("SOHBET_ARAC_DONGUSU", "1") == "1"
SOHBET_MAX_TUR = int(os.getenv("SOHBET_MAX_TUR", "3"))

# (14) Anlama fan-out: siniflandir ∥ cikar paralel dalları (cikar yalnız evrak_text okur —
# veri bağımlılığı yok; belge başına 1 LLM çağrısı süresi kazanılır). 0 → seri baseline.
PARALEL_ANLAMA = os.getenv("PARALEL_ANLAMA", "1") == "1"

# (15) Hız dalgası (2026-07-16) — KALİTE SABİT, gecikme düşer: LLM çağrılarının sayısı,
# prompt'ları ve karar mantığı DEĞİŞMEZ; yalnız birbirinin çıktısını okumayan çağrıların
# sıralı beklemesi kaldırılır. Hepsi ENV-gated; 0 → baseline topoloji/davranış birebir
# (mock'ta iki modun sonucu alan bazında AYNI — tests/test_paralel_hiz.py).
#
# (15a) Triyaj fan-out: kanit_baglama/decompose tür OKUMAZ (yalnız evrak_text + unsurlar)
# → siniflandir'ı beklemeden koşar; tür okuyan danışma çağrıları (eksik takip-sorusu +
# mevzuat + özet) ile servis-birimi önerisi TEK fan-out'ta paralel (fan-in route_birim).
PARALEL_TRIYAJ = os.getenv("PARALEL_TRIYAJ", "1") == "1"
# (15b) Kapanış fan-out: arsiv (SDP seçimi) yazı/risk çıktısı OKUMAZ → risk_guard dalıyla
# paralel (fan-in sla_triyaj); HITL onay kapısı sla SONRASINA kayar (bant kararı yine
# verify sinyallerinden — arşiv/SLA METADATA üretimi onay kararını etkilemez).
PARALEL_KAPANIS = os.getenv("PARALEL_KAPANIS", "1") == "1"
# (15c) Yazı planı ∥ gövde: gövde statik türle plana paralel üretilir; plan FARKLI tür
# seçerse gövde o türle YENİDEN üretilir → çıktı seri yolla birebir; tipik yolda
# (plan statik türü doğrular) bir tam LLM-çağrısı süresi kazanılır.
YAZI_PLAN_PARALEL = os.getenv("YAZI_PLAN_PARALEL", "1") == "1"
# (15d) Verify içi paralel: LLM grounding ∥ (makam-kademe → lint → autofix) zinciri —
# iki dal birbirinin çıktısını okumaz; uyarı listesi sırası seri yolla aynı tutulur.
VERIFY_PARALEL = os.getenv("VERIFY_PARALEL", "1") == "1"

# (16) Hız dalgası 2 (2026-08-07) — DÜŞÜNME BÜTÇESİ. Paralellik (15) çağrıları yan yana
# koydu; bu madde çağrının KENDİSİNİ kısaltır.
#
# ÖLÇÜLEN SORUN: `deepseek-v4-flash` bir reasoning modelidir ve her çağrıda muhakeme
# token'ı üretir. Bu token'lar `max_tokens`'tan düştüğü için node bütçelerine
# LLM_DUSUNME_MARJI (700) EKLENİYOR — ve log'da `tokens_out=1000..1300` görünüyor.
# Üretim ardışık olduğundan süre doğrudan buradan gelir (~10 ms/token): "bu evrağı 19
# türden hangisine koyayım" gibi KAPALI KÜMELİ bir iş için 1000 token muhakeme israftır.
#
# AYRIM — düşünme İŞİN CİNSİNE göre kapatılır, her yerde değil:
#   ÇIKARIM/BİÇİM işleri: metinde geçen alanı bul, kapalı kümeden kod seç, verilmiş bir
#     kararı Türkçe cümleye dök. Muhakeme ölçülebilir katkı sağlamaz → KAPALI.
#   YARGI işleri: aday birimler arasından seçim + yetki içeride/dışarıda kararı, uydurma
#     vetosu (grounding), CRAG öz-düzeltme. Muhakeme işin kendisidir → AÇIK KALIR.
#
# GÜVENLİK AĞI: sınıflandırmada düşünme kapalıyken güven düşerse SINIFLANDIR_ESKALASYON
# zaten güçlü modele ikinci görüş sorar, o da emin değilse dürüst "belirsiz" döner —
# yani hız için doğruluk feda edilmez, belirsizlik görünür kalır.
#
# =0 → tüm düğümlerde düşünme açık (baseline davranış birebir geri gelir).
LLM_DUSUNME_CIKARIMDA_KAPALI = os.getenv("LLM_DUSUNME_CIKARIMDA_KAPALI", "1") == "1"

# Resmî yazı taslağında bulunması beklenen zorunlu bölüm başlıkları (format-compliance).
# Yön. 2646 / 3071: T.C. başlığı + Sayı + Konu + imza (ad-soyad) blokları.
YAZI_ZORUNLU_BOLUMLER: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("T.C. başlığı", ("t.c.", "t.c",)),
    ("Sayı", ("sayı", "sayi")),
    ("Konu", ("konu",)),
    ("İmza/Ad-Soyad", ("imza", "arz ederim", "rica ederim", "ad soyad")),
)

# Dilekçe için 3071 m.4 KRİTİK alanlar — eksikse evrak incelenmez (dur-ve-sor tetikler).
# NOT: yalnız DETERMİNİSTİK güvenilir tespit edilen alanlar (imza/adres anahtar-sözcükle
# yakalanır). 'gonderen_ad_soyad' LLM-yapısal alandır; mock modda her dilekçede eksik
# görünür → kritik kabul edilmez (yanlış-pozitif dur-ve-sor önlenir, clarify_questions'ta
# zaten istenir). İmza VEYA adres yoksa evrak gerçekten eksik/imzasızdır → dur-ve-sor.
CLARIFY_KRITIK_ALANLAR: tuple[str, ...] = ("imza", "iletisim_adres")


def evrak_turu_tr(key: str) -> str:
    return EVRAK_TURU_TR.get(key, key)


def birim_tr(key: str | None) -> str:
    """Birim kodu → Türkçe ad. Bilinmeyen kod/serbest-metin birim adı → kendisi (passthrough).

    Kaynak-doğrulamalı ajan hedef_birim'i artık serbest-metin gerçek birim adı olabilir
    (kapalı-küme kodu değil) → passthrough onu olduğu gibi gösterir. None → "" (None-güvenli).
    9-set dışındaki servis-müdürlüğü kodları ("park_bahceler") da çözülür — ham kod resmî
    yazı antedine/muhatabına asla basılmaz (2026-07-18 kalite bulgusu). Lazy import:
    servis_birim config'i import eder, döngü olmaz.
    """
    if not key:
        return ""
    if key in BIRIM_TR:
        return BIRIM_TR[key]
    from agents.servis_birim import TAM_BIRIM_KATALOG
    return TAM_BIRIM_KATALOG.get(key, key)


def birim_goster(hedef_birim: str, evrak_turu: str) -> str:
    """Hedef birim (deterministik 9-set) İÇERİK-DUYARLI gösterim etiketi — yalnız BİLDİRİM/ÖZET.

    basin_halkla_iliskiler_cimer kovası dilekçe + bilgi-edinme + CİMER'i birlikte tutar. Kullanıcı
    kuralı: "CİMER yalnızca dilekçe CİMER'den geldiyse". Varsayılan etiket (birim_tr) artık hiçbir
    zaman-yanlış olmayan halkla ilişkiler/başvuru-kayıt kanalıdır; evrak GERÇEKTEN cimer/bilgi_edinme
    türündeyse etiket o kanala YÜKSELTİLİR. Ölçülen hedef_birim KODU/rotası DEĞİŞMEZ.

    GÜVENLİK: yalnız kullanıcıya gösterilen bildirim/özet metninde kullanılır. Üretilen YAZI gövdesi
    (yazi_taslak muhatabı) ve verify grounding allow-set'i (BIRIMLER üzerinden birim_tr) DAİMA nötr
    birim_tr kullanır — böylece taslaktaki birim adı grounding kümesiyle birebir tutar (yükseltilmiş
    etiket yazıya hiç girmez; zaten CİMER kovası ust_yazi'ya rota almaz). Frontend BIRIM_GOSTER eşi.
    """
    if hedef_birim == "basin_halkla_iliskiler_cimer":
        if evrak_turu == "cimer":
            return "CİMER / Halkla İlişkiler Birimi"
        if evrak_turu == "bilgi_edinme":
            return "Bilgi Edinme / Halkla İlişkiler Birimi"
    return birim_tr(hedef_birim)


def etkili_birim(state: dict) -> str:
    """Gösterim/metadata için etkili birim adı — kaynak-doğrulamalı ajan köprüsü.

    Öncelik: doğrulanmış gerçek birim → kaynak adayından birim önerisi → içerikten bulunan
    hizmet müdürlüğü → kaba kategori. Böylece karar kartı, taslak, arşiv ve sonuç bildirimi
    aynı birim adını kullanır; doğrulanmamış önerinin onay durumu ayrıca state'te korunur.
    """
    hb = state.get("hedef_birim")
    if hb:
        return birim_tr(hb)
    oneri = state.get("hedef_birim_oneri")
    if oneri:
        return birim_tr(oneri)
    servis = state.get("servis_birimi") or {}
    if isinstance(servis, dict) and servis.get("ad"):
        return str(servis["ad"])
    if isinstance(servis, str) and servis:
        return birim_tr(servis)
    kategori = state.get("hedef_kategori") or "yazi_isleri_evrak"
    return birim_goster(kategori, state.get("evrak_turu", "") or "")


def sdp_kodu(turu: str) -> str:
    """Evrak türü → kaba SDP konu kodu (2005/7). Bilinmeyen tür → genel '000'."""
    return EVRAK_TO_SDP.get(turu, "000")


def saklama_suresi(turu: str) -> str:
    """Evrak türü → tipik saklama (muhafaza) süresi kategorisi."""
    return EVRAK_TO_SAKLAMA.get(turu, _SAKLAMA_VARSAYILAN)
