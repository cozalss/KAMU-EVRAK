"""Kamu-evrak taksonomileri ve eşleme tabloları.

Araştırma kaynağı: docs/02-evrak-taksonomi-routing.md (Resmî Yazışma Yön. 2646,
3071 Dilekçe Hakkı, 4982 Bilgi Edinme, 7201 Tebligat, SDP 2005/7, CİMER 5690).

ÖNEMLİ (şartname uyumu): Şartname sabit sınıf/birim listesi VERMEZ. Buradaki kümeler
resmî kaynaklara dayandırılmıştır; gold-set blind etiketleme ile kurulmalı (etik §13.1).
Stub node'lar bu tabloları kullanır; üretimde few-shot LLM / RAG ile değiştirilir.
"""

from __future__ import annotations

import os

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


def evrak_turu_tr(key: str) -> str:
    return EVRAK_TURU_TR.get(key, key)


def birim_tr(key: str) -> str:
    return BIRIM_TR.get(key, key)
