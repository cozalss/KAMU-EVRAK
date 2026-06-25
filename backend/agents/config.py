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
except Exception:  # noqa: BLE001 — .env yükleme best-effort; yoksa os env kullanılır
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
    "basin_halkla_iliskiler_cimer": "Basın-Halkla İlişkiler / CİMER Birimi",
    "teftis_ic_denetim": "Teftiş / İç Denetim",
    "ilgili_teknik_daire": "İlgili Teknik / Ana Hizmet Dairesi",
}

# --- Görev 2: Resmî yazı türleri ---
YAZI_TURLERI: tuple[str, ...] = ("ust_yazi", "cevabi_yazi", "bilgilendirme", "olur")
YAZI_TURU_TR: dict[str, str] = {
    "ust_yazi": "Üst Yazı", "cevabi_yazi": "Cevabi Yazı",
    "bilgilendirme": "Bilgilendirme Yazısı", "olur": "Olur / Onay Yazısı",
}

# --- Eksik bilgi tespiti: bir evrakta olması gereken zorunlu alanlar (3071 m.4) ---
ZORUNLU_ALANLAR: tuple[str, ...] = (
    "gonderen_ad_soyad", "tckn_veya_kurum", "tarih", "konu", "talep", "iletisim_adres", "imza",
)

# --- Evrak türü → tipik havale edilen birim (araştırma §3) ---
EVRAK_TO_BIRIM: dict[str, str] = {
    "dilekce": "basin_halkla_iliskiler_cimer",
    "basvuru": "ilgili_teknik_daire",
    "sikayet": "teftis_ic_denetim",
    "ihbar": "teftis_ic_denetim",
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

# --- Evrak türü → ilgili mevzuat (araştırma §2; üretimde RAG ile zenginleştirilir) ---
# NOT (CLAUDE.md §1): madde no'ları mevzuat.gov.tr'de DOĞRULANMALI; şüpheli → [DOĞRULA:].
EVRAK_TO_MEVZUAT: dict[str, list[str]] = {
    "dilekce": ["3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanun m.4 (zorunlu unsurlar)"],
    "bilgi_edinme": ["4982 sayılı Bilgi Edinme Hakkı Kanunu (15 iş günü; m.16-17 red sebepleri)"],
    "cimer": ["5690 sayılı CİMER Cumhurbaşkanlığı Kararnamesi"],
    "tebligat": ["7201 sayılı Tebligat Kanunu (e-tebligat 5. gün kuralı)"],
    "ust_yazi": ["Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)"],
    "cevabi_yazi": ["Resmî Yazışma Yönetmeliği m.15 (İlgi atfı)"],
    "genelge_talimat_olur": ["Resmî Yazışma Yönetmeliği m.20 (Olur/Onay)"],
}

# --- Evrak türü → üretilmesi gereken resmî yazı türü (araştırma §2) ---
EVRAK_TO_YAZI: dict[str, str] = {
    "dilekce": "cevabi_yazi", "basvuru": "cevabi_yazi", "bilgi_edinme": "bilgilendirme",
    "sikayet": "olur", "ihbar": "olur", "ust_yazi": "cevabi_yazi", "cevabi_yazi": "cevabi_yazi",
    "tebligat": "cevabi_yazi", "talep": "cevabi_yazi", "gorus_mutalaa": "cevabi_yazi",
}

# --- LLM modu (ADALET ile aynı desen) ---
LLM_MODE = os.getenv("LLM_MODE", "mock").lower()  # mock | openai | llamacpp

# --- Görev 2: doğrulama (verify) + dur-ve-sor (clarifier) ENV bayrakları ---
# verify_node grafta her zaman var; KAPATILIRSA no-op passthrough (state bozulmaz).
VERIFY_ENABLED = os.getenv("VERIFY_ENABLED", "1") == "1"
# clarifier dur-ve-sor dalı: VARSAYILAN KAPALI → baseline akış (taslak hep üretilir) korunur.
CLARIFY_STOP_ENABLED = os.getenv("CLARIFY_STOP_ENABLED", "0") == "1"

# --- Yenilikçilik: ENV-gated SOTA öz-düzeltme node'ları (CRAG + Self-RAG) ---
# İKİSİ DE VARSAYILAN KAPALI → baseline akış birebir korunur (141 test değişmez).
# Ablation harness'i (eval/ablation_eval.py) bu bayrakları A/B için açıp kapatır.
#
# CRAG (Corrective RAG): mevzuat_oner retrieval güveni düşükse (top skor < eşik veya
# 0 sonuç) sorguyu genişletip BM25'i yeniden çağırır → daha iyi mevzuat önerisi.
CRAG_ENABLED = os.getenv("CRAG_ENABLED", "0") == "1"
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


def birim_tr(key: str) -> str:
    return BIRIM_TR.get(key, key)


def sdp_kodu(turu: str) -> str:
    """Evrak türü → kaba SDP konu kodu (2005/7). Bilinmeyen tür → genel '000'."""
    return EVRAK_TO_SDP.get(turu, "000")


def saklama_suresi(turu: str) -> str:
    """Evrak türü → tipik saklama (muhafaza) süresi kategorisi."""
    return EVRAK_TO_SAKLAMA.get(turu, _SAKLAMA_VARSAYILAN)
