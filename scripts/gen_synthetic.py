#!/usr/bin/env python
"""Sentetik kamu-evrak veri üreteci — TEKNOFEST 2026 1. Senaryo (Kamu Evrak ve Yazışma).

Yarışma şartnamesi (§6.5): GERÇEK kamu verisi YASAK → tüm evraklar KURGU. Bu modül
18 evrak türü için şablon-tabanlı sahte resmî evrak üretir, **checksum-geçerli SAHTE
TCKN** + sahte telefon/adres ekler (CLAUDE.md §2: gerçek PII ASLA), zorluk
stratifikasyonu (kolay/orta/zor) ve eksik-alan enjeksiyonu uygular.

Aynı modül evaluation harness'ının ORTAK BİLGİ KAYNAĞIDIR (single source of truth):
  - 18 evrak türü taksonomisi + birimler + zorunlu alanlar
  - evrak→birim ve evrak→mevzuat eşlemeleri (Görev 2 yönlendirme/mevzuat önerisi)
  - DETERMİNİSTİK mock ajan boru hattı (LLM'siz) → eval scriptleri bunu çağırır,
    offline/CI'da koşar. Gerçek LangGraph pipeline mock-LLM'de evrak türü ÜRETMEZ
    (8 hukuk-domain'i sınıflar) → bu shim yarışma görevini temsil eder.

Çıktı (data/synthetic/):
  evrak_class_gold.jsonl   — Görev 1 sınıflandırma + özet + eksik-alan altın seti
  routing_gold.jsonl       — Görev 2 birim yönlendirme altın seti
  ozet_gold.jsonl          — özet anahtar-unsur (key-fact) altın seti
  yazi_taslak_gold.jsonl   — resmî yazı taslağı format-uyum altın seti
  eksik_bilgi_gold.jsonl   — eksik-bilgi tespit (set-P/R) altın seti
  e2e_scenarios.jsonl      — uçtan-uca senaryo (her iki görev birlikte)

Çalıştır (cd backend):
    python ../scripts/gen_synthetic.py [--per-type N] [--seed S] [--out DIR]
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path

# Deterministik tekrar-üretilebilirlik (jüri: aynı tohum = aynı veri).
DEFAULT_SEED = 20260625
DEFAULT_PER_TYPE = 7  # tür-başı; 18×7 ≈ 126 sınıf (docs/05 hedefi ~120+)

ZORLUK = ("kolay", "orta", "zor")


# ===========================================================================
# 1. TAKSONOMİ — 18 evrak türü (kamu yazışma gerçekliği)
# ===========================================================================
# Her tür: ana iş süreci. Şartname §6.4.1 "evrakın türünü belirleme".
EVRAK_TURLERI: tuple[str, ...] = (
    "dilekce",              # vatandaş dilekçesi
    "bilgi_edinme",         # 4982 bilgi edinme başvurusu
    "sikayet",              # şikâyet/ihbar
    "itiraz",               # idari işleme itiraz
    "basvuru_izin",         # ruhsat/izin başvurusu
    "ihale_teklif",         # ihale teklif/itiraz
    "personel_ozluk",       # atama/izin/özlük talebi
    "mali_odeme",           # ödeme/harcama/fatura talebi
    "resmi_yazi_gelen",     # kurumdan gelen üst/cevap yazısı
    "tebligat",             # tebligat evrakı
    "mahkeme_karari",       # mahkeme/icra müzekkeresi
    "saglik_raporu",        # sağlık/heyet raporu talebi
    "egitim_belge",         # öğrenci belge/transkript talebi
    "tapu_kadastro",        # tapu/kadastro işlem talebi
    "cevre_imar",           # çevre/imar/ruhsat şikâyet-başvuru
    "vergi_borc",           # vergi/borç yapılandırma başvurusu
    "sosyal_yardim",        # sosyal yardım başvurusu
    "genel_evrak",          # sınıflandırılamayan / belirsiz (abstention hedefi)
)

# Birimler — kamu kurumunda evrakın yönlendirileceği daire/müdürlük.
BIRIMLER: tuple[str, ...] = (
    "Yazı İşleri Müdürlüğü",
    "Bilgi İşlem Daire Başkanlığı",
    "Hukuk Müşavirliği",
    "İnsan Kaynakları ve Eğitim Daire Başkanlığı",
    "Mali Hizmetler Müdürlüğü",
    "İmar ve Şehircilik Müdürlüğü",
    "Çevre Koruma ve Kontrol Müdürlüğü",
    "Sağlık İşleri Müdürlüğü",
    "Sosyal Yardım İşleri Müdürlüğü",
    "Destek Hizmetleri (İhale) Müdürlüğü",
    "Tapu ve Kadastro Müdürlüğü",
    "Vergi Dairesi Müdürlüğü",
    "Halkla İlişkiler / Bilgi Edinme Birimi",
    "Eğitim Öğretim Hizmetleri Müdürlüğü",
)

# evrak türü → birincil + kabul edilebilir birimler (yönlendirme; soft-match).
# alternatifler = jüri "soft" kabul edebilir (Top-3 + kabul_edilebilir_birimler).
EVRAK_TO_BIRIM: dict[str, dict[str, object]] = {
    "dilekce":          {"birim": "Yazı İşleri Müdürlüğü",
                          "alt": ("Halkla İlişkiler / Bilgi Edinme Birimi", "Hukuk Müşavirliği")},
    "bilgi_edinme":     {"birim": "Halkla İlişkiler / Bilgi Edinme Birimi",
                          "alt": ("Yazı İşleri Müdürlüğü", "Hukuk Müşavirliği")},
    "sikayet":          {"birim": "Hukuk Müşavirliği",
                          "alt": ("Yazı İşleri Müdürlüğü", "Çevre Koruma ve Kontrol Müdürlüğü")},
    "itiraz":           {"birim": "Hukuk Müşavirliği",
                          "alt": ("Yazı İşleri Müdürlüğü", "Mali Hizmetler Müdürlüğü")},
    "basvuru_izin":     {"birim": "İmar ve Şehircilik Müdürlüğü",
                          "alt": ("Çevre Koruma ve Kontrol Müdürlüğü", "Yazı İşleri Müdürlüğü")},
    "ihale_teklif":     {"birim": "Destek Hizmetleri (İhale) Müdürlüğü",
                          "alt": ("Mali Hizmetler Müdürlüğü", "Hukuk Müşavirliği")},
    "personel_ozluk":   {"birim": "İnsan Kaynakları ve Eğitim Daire Başkanlığı",
                          "alt": ("Yazı İşleri Müdürlüğü", "Mali Hizmetler Müdürlüğü")},
    "mali_odeme":       {"birim": "Mali Hizmetler Müdürlüğü",
                          "alt": ("Destek Hizmetleri (İhale) Müdürlüğü", "Yazı İşleri Müdürlüğü")},
    "resmi_yazi_gelen": {"birim": "Yazı İşleri Müdürlüğü",
                          "alt": ("Hukuk Müşavirliği", "Halkla İlişkiler / Bilgi Edinme Birimi")},
    "tebligat":         {"birim": "Hukuk Müşavirliği",
                          "alt": ("Yazı İşleri Müdürlüğü",)},
    "mahkeme_karari":   {"birim": "Hukuk Müşavirliği",
                          "alt": ("Yazı İşleri Müdürlüğü",)},
    "saglik_raporu":    {"birim": "Sağlık İşleri Müdürlüğü",
                          "alt": ("İnsan Kaynakları ve Eğitim Daire Başkanlığı",)},
    "egitim_belge":     {"birim": "Eğitim Öğretim Hizmetleri Müdürlüğü",
                          "alt": ("İnsan Kaynakları ve Eğitim Daire Başkanlığı", "Yazı İşleri Müdürlüğü")},
    "tapu_kadastro":    {"birim": "Tapu ve Kadastro Müdürlüğü",
                          "alt": ("İmar ve Şehircilik Müdürlüğü",)},
    "cevre_imar":       {"birim": "Çevre Koruma ve Kontrol Müdürlüğü",
                          "alt": ("İmar ve Şehircilik Müdürlüğü", "Hukuk Müşavirliği")},
    "vergi_borc":       {"birim": "Vergi Dairesi Müdürlüğü",
                          "alt": ("Mali Hizmetler Müdürlüğü",)},
    "sosyal_yardim":    {"birim": "Sosyal Yardım İşleri Müdürlüğü",
                          "alt": ("Yazı İşleri Müdürlüğü",)},
    "genel_evrak":      {"birim": "Yazı İşleri Müdürlüğü",
                          "alt": ("Halkla İlişkiler / Bilgi Edinme Birimi",)},
}

# evrak türü → önerilecek mevzuat (Görev 1: "ilgili mevzuatı önerebilme").
EVRAK_TO_MEVZUAT: dict[str, tuple[str, ...]] = {
    "dilekce":          ("3071 sayılı Dilekçe Hakkı Kanunu",),
    "bilgi_edinme":     ("4982 sayılı Bilgi Edinme Hakkı Kanunu",),
    "sikayet":          ("3071 sayılı Dilekçe Hakkı Kanunu", "5326 sayılı Kabahatler Kanunu"),
    "itiraz":           ("2577 sayılı İdari Yargılama Usulü Kanunu",),
    "basvuru_izin":     ("3194 sayılı İmar Kanunu", "Resmî Yazışmalarda Uygulanacak Usul ve Esaslar"),
    "ihale_teklif":     ("4734 sayılı Kamu İhale Kanunu", "4735 sayılı Kamu İhale Sözleşmeleri Kanunu"),
    "personel_ozluk":   ("657 sayılı Devlet Memurları Kanunu",),
    "mali_odeme":       ("5018 sayılı Kamu Malî Yönetimi ve Kontrol Kanunu",),
    "resmi_yazi_gelen": ("Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik",),
    "tebligat":         ("7201 sayılı Tebligat Kanunu",),
    "mahkeme_karari":   ("2004 sayılı İcra ve İflas Kanunu", "6100 sayılı Hukuk Muhakemeleri Kanunu"),
    "saglik_raporu":    ("657 sayılı Devlet Memurları Kanunu", "Kamu Personeli Sağlık Raporları Yönergesi"),
    "egitim_belge":     ("2547 sayılı Yükseköğretim Kanunu",),
    "tapu_kadastro":    ("4721 sayılı Türk Medeni Kanunu", "2644 sayılı Tapu Kanunu"),
    "cevre_imar":       ("2872 sayılı Çevre Kanunu", "3194 sayılı İmar Kanunu"),
    "vergi_borc":       ("213 sayılı Vergi Usul Kanunu", "6183 sayılı Amme Alacaklarının Tahsil Usulü"),
    "sosyal_yardim":    ("3294 sayılı Sosyal Yardımlaşma ve Dayanışmayı Teşvik Kanunu",),
    "genel_evrak":      ("Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hakkında Yönetmelik",),
}

# evrak türü → üretilecek resmî yazı türü (Görev 2: "üst yazı/cevap yazısı/...").
EVRAK_TO_YAZI: dict[str, str] = {
    "dilekce": "cevap_yazisi", "bilgi_edinme": "cevap_yazisi", "sikayet": "ust_yazi",
    "itiraz": "cevap_yazisi", "basvuru_izin": "cevap_yazisi", "ihale_teklif": "ust_yazi",
    "personel_ozluk": "cevap_yazisi", "mali_odeme": "ust_yazi", "resmi_yazi_gelen": "ust_yazi",
    "tebligat": "ust_yazi", "mahkeme_karari": "ust_yazi", "saglik_raporu": "bilgilendirme",
    "egitim_belge": "cevap_yazisi", "tapu_kadastro": "cevap_yazisi", "cevre_imar": "ust_yazi",
    "vergi_borc": "cevap_yazisi", "sosyal_yardim": "bilgilendirme", "genel_evrak": "ust_yazi",
}

# evrak türünde BULUNMASI gereken zorunlu alanlar (Görev 1: "eksik bilgileri tespit").
# Ortak zorunlu alanlar + türe-özel alanlar. Eksik-bilgi eval'i bunu set olarak ölçer.
ORTAK_ZORUNLU = ("tarih", "ad_soyad", "konu")
ZORUNLU_ALANLAR: dict[str, tuple[str, ...]] = {
    "dilekce":          ORTAK_ZORUNLU + ("tckn", "adres", "imza"),
    "bilgi_edinme":     ORTAK_ZORUNLU + ("tckn", "iletisim", "talep_edilen_bilgi"),
    "sikayet":          ORTAK_ZORUNLU + ("adres", "sikayet_konusu"),
    "itiraz":           ORTAK_ZORUNLU + ("tckn", "itiraz_edilen_islem", "evrak_no"),
    "basvuru_izin":     ORTAK_ZORUNLU + ("tckn", "adres", "ada_parsel"),
    "ihale_teklif":     ORTAK_ZORUNLU + ("ihale_kayit_no", "teklif_bedeli", "firma_unvani"),
    "personel_ozluk":   ORTAK_ZORUNLU + ("sicil_no", "talep_turu"),
    "mali_odeme":       ORTAK_ZORUNLU + ("tutar", "iban", "fatura_no"),
    "resmi_yazi_gelen": ORTAK_ZORUNLU + ("sayi", "gonderen_kurum"),
    "tebligat":         ORTAK_ZORUNLU + ("tckn", "adres", "evrak_no"),
    "mahkeme_karari":   ORTAK_ZORUNLU + ("esas_no", "mahkeme"),
    "saglik_raporu":    ORTAK_ZORUNLU + ("tckn", "sicil_no"),
    "egitim_belge":     ORTAK_ZORUNLU + ("ogrenci_no", "talep_turu"),
    "tapu_kadastro":    ORTAK_ZORUNLU + ("tckn", "ada_parsel", "il_ilce"),
    "cevre_imar":       ORTAK_ZORUNLU + ("adres", "sikayet_konusu"),
    "vergi_borc":       ORTAK_ZORUNLU + ("tckn", "vergi_no", "tutar"),
    "sosyal_yardim":    ORTAK_ZORUNLU + ("tckn", "adres", "iletisim"),
    "genel_evrak":      ORTAK_ZORUNLU,
}


# ===========================================================================
# 2. SAHTE PII — CLAUDE.md §2: gerçek TCKN/telefon/isim ASLA. Hep sahte.
# ===========================================================================
_AD = ("Ayşe", "Mehmet", "Fatma", "Ali", "Zeynep", "Mustafa", "Elif", "Hüseyin",
       "Emine", "Ahmet", "Hatice", "İbrahim", "Meryem", "Hasan", "Şükran", "Cem")
_SOYAD = ("Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım",
          "Öztürk", "Aydın", "Özkan", "Arslan", "Doğan", "Kılıç", "Aslan")
_IL = ("Ankara", "İstanbul", "İzmir", "Bursa", "Konya", "Antalya", "Adana",
       "Gaziantep", "Kayseri", "Trabzon", "Eskişehir", "Samsun")
_MAHALLE = ("Cumhuriyet", "Fatih", "Yeni", "Bağlıca", "Çamlıca", "Gül", "Bahçelievler")


def fake_tckn(rng: random.Random) -> str:
    """Checksum-GEÇERLİ sahte TCKN (algoritma doğru ama kişi gerçek DEĞİL).

    Kural: 11 hane, ilk hane ≠ 0; d10 = ((tek-haneler*7)-(çift-haneler))%10;
    d11 = (ilk 10 hane toplamı)%10. Gerçek TCKN doğrulamasını GEÇER ama rastgele
    üretildiği için gerçek bir vatandaşa ait DEĞİLDİR (sahte-ama-format-doğru).
    """
    d = [rng.randint(1, 9)] + [rng.randint(0, 9) for _ in range(8)]
    odd = d[0] + d[2] + d[4] + d[6] + d[8]
    even = d[1] + d[3] + d[5] + d[7]
    d10 = (odd * 7 - even) % 10
    d.append(d10)
    d.append(sum(d) % 10)
    return "".join(str(x) for x in d)


def fake_phone(rng: random.Random) -> str:
    """Sahte cep telefonu — 05XX formatı, gerçek operatör bloğu değil (rastgele)."""
    return f"05{rng.randint(30, 59)}-{rng.randint(100, 999)}-{rng.randint(1000, 9999)}"


def fake_name(rng: random.Random) -> str:
    return f"{rng.choice(_AD)} {rng.choice(_SOYAD)}"


def fake_address(rng: random.Random) -> str:
    return (f"{rng.choice(_MAHALLE)} Mah. {rng.randint(1, 99)}. Sok. "
            f"No:{rng.randint(1, 120)} {rng.choice(_IL)}")


def fake_date(rng: random.Random) -> str:
    return f"{rng.randint(1, 28):02d}.{rng.randint(1, 12):02d}.2026"


def fake_evrak_no(rng: random.Random) -> str:
    return f"{rng.randint(2026000, 2026999)}-{rng.randint(1, 9999)}"


# ===========================================================================
# 3. ŞABLON ÜRETİCİLER — türe-özel gövde + zorluk + eksik-alan enjeksiyonu
# ===========================================================================
@dataclass
class EvrakOrnegi:
    """Üretilen tek sentetik evrak + altın etiketler."""

    id: str
    evrak_turu: str
    zorluk: str
    metin: str
    alanlar: dict[str, str]          # üretilen (mevcut) alanlar
    eksik_alanlar: list[str]         # enjekte edilen eksik zorunlu alanlar
    anahtar_unsurlar: list[str]      # özet key-fact'ler (summary_eval gold)
    beklenen_birim: str
    kabul_edilebilir_birimler: list[str]
    beklenen_mevzuat: list[str]
    beklenen_yazi_turu: str

    def to_record(self) -> dict:
        return {
            "id": self.id, "evrak_turu": self.evrak_turu, "zorluk": self.zorluk,
            "metin": self.metin, "alanlar": self.alanlar,
            "eksik_alanlar": self.eksik_alanlar, "anahtar_unsurlar": self.anahtar_unsurlar,
            "beklenen_birim": self.beklenen_birim,
            "kabul_edilebilir_birimler": self.kabul_edilebilir_birimler,
            "beklenen_mevzuat": self.beklenen_mevzuat,
            "beklenen_yazi_turu": self.beklenen_yazi_turu,
        }


# Türe-özel açılış/gövde cümleleri — zayıf-keyword ("zor") vs. güçlü-keyword ("kolay").
# kolay = belirgin tür-imzası; orta = orta; zor = örtük/karışık ifade (sınıflandırma zorlaşır).
_GOVDE: dict[str, dict[str, str]] = {
    "dilekce": {
        "kolay": "Aşağıda kimlik bilgileri yazılı dilekçe sahibi olarak, {konu} hakkındaki talebimin değerlendirilmesini arz ederim.",
        "orta": "Tarafıma ait {konu} konusundaki başvurumun ilgili birimce incelenmesini talep ediyorum.",
        "zor": "Bahsi geçen mesele ile ilgili gereğinin yapılmasını saygılarımla rica ederim.",
    },
    "bilgi_edinme": {
        "kolay": "4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında {konu} hakkında bilgi/belge talep ediyorum.",
        "orta": "Kurumunuzdan {konu} konusuna ilişkin bilgi edinmek istiyorum.",
        "zor": "Söz konusu işleme ait kayıtların tarafıma iletilmesini istiyorum.",
    },
    "sikayet": {
        "kolay": "{konu} nedeniyle mağdur olduğumu bildirir, gerekli işlemin yapılmasını şikâyeten bildiririm.",
        "orta": "{konu} ile ilgili yaşadığım olumsuzluğu şikâyet konusu yapıyorum.",
        "zor": "Komşu parselde süregelen durumun giderilmesini talep ediyorum.",
    },
    "itiraz": {
        "kolay": "Tarafıma tebliğ edilen {konu} konulu idari işleme süresi içinde itiraz ediyorum.",
        "orta": "{konu} hakkında tesis edilen işlemin yeniden değerlendirilmesini talep ederim.",
        "zor": "Söz konusu kararın kaldırılması yönündeki talebimin işleme alınmasını arz ederim.",
    },
    "basvuru_izin": {
        "kolay": "{konu} için gerekli ruhsat/iznin tarafıma verilmesini başvuru ile talep ediyorum.",
        "orta": "{konu} işlemi için başvuruda bulunuyorum.",
        "zor": "İlgili taşınmazda yapmak istediğim iş için gerekli onayı rica ederim.",
    },
    "ihale_teklif": {
        "kolay": "{konu} ihalesine ilişkin teklifimizi 4734 sayılı Kanun kapsamında sunuyoruz.",
        "orta": "{konu} alımına ait teklif dosyamız ekte sunulmuştur.",
        "zor": "Söz konusu alıma yönelik tekliflerimizi bilgilerinize sunarız.",
    },
    "personel_ozluk": {
        "kolay": "657 sayılı Kanun kapsamında {konu} talebimin özlük dosyama işlenmesini arz ederim.",
        "orta": "{konu} hakkındaki özlük talebimin değerlendirilmesini rica ederim.",
        "zor": "Durumuma ilişkin gerekli işlemin yapılmasını talep ederim.",
    },
    "mali_odeme": {
        "kolay": "{konu} kapsamında hak edişimin/ödememin ilgili IBAN'a aktarılmasını talep ederim.",
        "orta": "{konu} için ödeme işleminin gerçekleştirilmesini rica ederim.",
        "zor": "Alacağımın tarafıma ödenmesi hususunda gereğini arz ederim.",
    },
    "resmi_yazi_gelen": {
        "kolay": "İlgi sayılı yazınıza istinaden {konu} hakkında kurumumuz görüşü aşağıda sunulmuştur.",
        "orta": "{konu} konulu yazınız incelenmiş olup gereği için bilgilerinize sunulur.",
        "zor": "İlgide kayıtlı talebe ilişkin değerlendirmemiz ektedir.",
    },
    "tebligat": {
        "kolay": "7201 sayılı Tebligat Kanunu uyarınca {konu} hususu tarafınıza tebliğ olunur.",
        "orta": "{konu} konusu işbu yazı ile tarafınıza bildirilir.",
        "zor": "Aşağıda belirtilen hususun bilginize sunulması gerekmektedir.",
    },
    "mahkeme_karari": {
        "kolay": "{konu} esas sayılı dosyaya ilişkin müzekkere gereğinin yerine getirilmesi rica olunur.",
        "orta": "{konu} hakkındaki mahkeme kararının gereği için yazımız ektedir.",
        "zor": "İlgili dosya kapsamında gereğinin yapılması talep edilmektedir.",
    },
    "saglik_raporu": {
        "kolay": "{konu} nedeniyle sağlık kurulu/heyet raporu talebimin işleme alınmasını arz ederim.",
        "orta": "{konu} için sağlık raporu düzenlenmesini talep ediyorum.",
        "zor": "Sağlık durumuma ilişkin gerekli belgenin tarafıma verilmesini rica ederim.",
    },
    "egitim_belge": {
        "kolay": "Öğrencisi olduğum bölümden {konu} (öğrenci belgesi/transkript) talep ediyorum.",
        "orta": "{konu} belgemin düzenlenmesini rica ederim.",
        "zor": "Eğitimime ilişkin belgenin tarafıma verilmesini talep ederim.",
    },
    "tapu_kadastro": {
        "kolay": "Adıma kayıtlı {konu} taşınmaza ilişkin tapu/kadastro işleminin yapılmasını talep ederim.",
        "orta": "{konu} hakkındaki tapu işlemim için başvuruda bulunuyorum.",
        "zor": "Söz konusu parsele ilişkin işlemin tamamlanmasını rica ederim.",
    },
    "cevre_imar": {
        "kolay": "{konu} nedeniyle çevre/imar mevzuatına aykırılığın denetlenmesini şikâyetle bildiririm.",
        "orta": "{konu} ile ilgili imar/çevre durumunun incelenmesini talep ederim.",
        "zor": "Bölgedeki olumsuz durumun giderilmesi için gereğini arz ederim.",
    },
    "vergi_borc": {
        "kolay": "{konu} borcumun 6183 sayılı Kanun kapsamında yapılandırılmasını talep ediyorum.",
        "orta": "{konu} hakkındaki vergi borcuma ilişkin başvuruda bulunuyorum.",
        "zor": "Borç durumuma ilişkin kolaylık sağlanmasını rica ederim.",
    },
    "sosyal_yardim": {
        "kolay": "Ekonomik durumum nedeniyle {konu} sosyal yardımından faydalanmak için başvuruyorum.",
        "orta": "{konu} kapsamında sosyal yardım talebimin değerlendirilmesini rica ederim.",
        "zor": "İhtiyacım olan desteğin tarafıma sağlanmasını talep ederim.",
    },
    "genel_evrak": {
        "kolay": "Konuya ilişkin gereğinin yapılmasını arz/rica ederim.",
        "orta": "Bilgilerinize sunulur.",
        "zor": "Gereği için.",
    },
}

# Türe-özel "konu" örnekleri (anahtar-unsur + sınıflandırma sinyali kaynağı).
_KONULAR: dict[str, tuple[str, ...]] = {
    "dilekce": ("park yeri tahsisi", "yol bakımı", "su faturası itirazı", "kaldırım onarımı"),
    "bilgi_edinme": ("ihale sözleşme tutarı", "personel atama listesi", "harcama kalemleri"),
    "sikayet": ("gürültü kirliliği", "kaçak yapı", "çöp toplama aksaklığı", "park işgali"),
    "itiraz": ("idari para cezası", "ruhsat iptali", "imar uygulaması", "atama işlemi"),
    "basvuru_izin": ("inşaat ruhsatı", "iş yeri açma izni", "hafriyat izni", "tabela ruhsatı"),
    "ihale_teklif": ("temizlik hizmeti alımı", "kırtasiye malzemesi", "araç kiralama"),
    "personel_ozluk": ("yıllık izin", "naklen atama", "derece terfisi", "ücretsiz izin"),
    "mali_odeme": ("hak ediş ödemesi", "yolluk", "fatura ödemesi", "avans kapatma"),
    "resmi_yazi_gelen": ("görüş talebi", "bilgi paylaşımı", "ortak protokol"),
    "tebligat": ("ödeme emri", "yıkım kararı", "ceza tebliği"),
    "mahkeme_karari": ("haciz müzekkeresi", "tedbir kararı", "bilirkişi talebi"),
    "saglik_raporu": ("heyet raporu", "istirahat raporu", "engelli sağlık kurulu raporu"),
    "egitim_belge": ("öğrenci belgesi", "transkript", "diploma örneği"),
    "tapu_kadastro": ("ifraz işlemi", "tevhit işlemi", "cins tashihi", "tapu tescili"),
    "cevre_imar": ("kaçak yapı", "izinsiz hafriyat", "ÇED ihlali", "ruhsatsız işyeri"),
    "vergi_borc": ("emlak vergisi", "MTV borcu", "gecikme zammı", "ÖTV borcu"),
    "sosyal_yardim": ("yakacak yardımı", "gıda yardımı", "eğitim yardımı", "engelli aylığı"),
    "genel_evrak": ("muhtelif", "konu belirtilmemiş", "genel talep"),
}


def _build_alanlar(turu: str, rng: random.Random) -> dict[str, str]:
    """Türün TÜM zorunlu alanlarını sahte değerlerle doldur (eksik enjeksiyonu öncesi)."""
    konu = rng.choice(_KONULAR[turu])
    base: dict[str, str] = {
        "tarih": fake_date(rng), "ad_soyad": fake_name(rng), "konu": konu,
        "tckn": fake_tckn(rng), "adres": fake_address(rng), "iletisim": fake_phone(rng),
        "imza": "İmza", "evrak_no": fake_evrak_no(rng), "sayi": fake_evrak_no(rng),
        "tutar": f"{rng.randint(1, 250)}.{rng.randint(0, 999):03d} TL",
        "iban": f"TR{rng.randint(10**23, 10**24 - 1)}"[:26],
        "fatura_no": f"F-{rng.randint(100000, 999999)}",
        "ihale_kayit_no": f"2026/{rng.randint(100000, 999999)}",
        "teklif_bedeli": f"{rng.randint(10, 900)}.000 TL", "firma_unvani": "Örnek Ltd. Şti.",
        "sicil_no": f"{rng.randint(100000, 999999)}", "ogrenci_no": f"{rng.randint(10**8, 10**9)}",
        "vergi_no": f"{rng.randint(10**9, 10**10)}", "esas_no": f"2026/{rng.randint(1, 9999)}",
        "mahkeme": f"{rng.choice(_IL)} {rng.randint(1, 9)}. Asliye Hukuk Mahkemesi",
        "ada_parsel": f"{rng.randint(100, 9999)} ada {rng.randint(1, 99)} parsel",
        "il_ilce": f"{rng.choice(_IL)} / Merkez", "gonderen_kurum": f"{rng.choice(_IL)} Valiliği",
        "talep_turu": konu, "talep_edilen_bilgi": konu, "sikayet_konusu": konu,
        "itiraz_edilen_islem": konu,
    }
    return {k: base[k] for k in ZORUNLU_ALANLAR[turu] if k in base}


def _render_metin(turu: str, zorluk: str, alanlar: dict[str, str], rng: random.Random) -> str:
    """Resmî evrak metni — başlık + gövde + mevcut alanlar (eksik olanlar yazılmaz)."""
    konu = alanlar.get("konu", "muhtelif")
    govde = _GOVDE[turu][zorluk].format(konu=konu)
    lines = [f"T.C. {rng.choice(_IL)} BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞINA", ""]
    if "tarih" in alanlar:
        lines.append(f"Tarih: {alanlar['tarih']}")
    if "sayi" in alanlar:
        lines.append(f"Sayı: {alanlar['sayi']}")
    if "konu" in alanlar:
        lines.append(f"Konu: {alanlar['konu']}")
    lines += ["", govde, ""]
    # Kimlik/iletişim bloğu (yalnız mevcut alanlar)
    for key, label in (("ad_soyad", "Ad-Soyad"), ("tckn", "T.C. Kimlik No"),
                       ("adres", "Adres"), ("iletisim", "İletişim"), ("imza", "")):
        if key in alanlar:
            lines.append(f"{label}: {alanlar[key]}".strip(": ").strip())
    return "\n".join(lines)


def _inject_missing(turu: str, alanlar: dict[str, str], zorluk: str,
                    rng: random.Random) -> tuple[dict[str, str], list[str]]:
    """Zorluk'a göre zorunlu alan(lar)ı SİL → eksik-bilgi tespiti hedefi.

    kolay: %35 ihtimalle 0-1 eksik; orta: 1 eksik; zor: 1-2 eksik. ad_soyad/konu
    asla silinmez (sınıflandırma çökmesin); 'genel_evrak' eksik enjekte etmez.
    """
    if turu == "genel_evrak":
        return alanlar, []
    silinebilir = [a for a in ZORUNLU_ALANLAR[turu] if a not in ("ad_soyad", "konu")]
    if not silinebilir:
        return alanlar, []
    n = {"kolay": rng.choice([0, 0, 1]), "orta": 1, "zor": rng.choice([1, 2])}[zorluk]
    n = min(n, len(silinebilir))
    eksik = rng.sample(silinebilir, n) if n else []
    kalan = {k: v for k, v in alanlar.items() if k not in eksik}
    return kalan, sorted(eksik)


def make_evrak(turu: str, idx: int, rng: random.Random) -> EvrakOrnegi:
    """Tek sentetik evrak + altın etiketleri üret."""
    zorluk = ZORLUK[idx % 3]
    full = _build_alanlar(turu, rng)
    alanlar, eksik = _inject_missing(turu, full, zorluk, rng)
    metin = _render_metin(turu, zorluk, alanlar, rng)
    rinfo = EVRAK_TO_BIRIM[turu]
    # anahtar unsurlar = özetin kapsaması gereken çekirdek bilgiler
    unsurlar = [full["konu"]]
    if "tarih" in full:
        unsurlar.append(full["tarih"])
    if "ad_soyad" in full:
        unsurlar.append(full["ad_soyad"].split()[-1])  # soyad
    return EvrakOrnegi(
        id=f"{turu}_{idx:03d}", evrak_turu=turu, zorluk=zorluk, metin=metin,
        alanlar=alanlar, eksik_alanlar=eksik, anahtar_unsurlar=unsurlar,
        beklenen_birim=str(rinfo["birim"]),
        kabul_edilebilir_birimler=[str(rinfo["birim"]), *rinfo["alt"]],  # type: ignore[misc]
        beklenen_mevzuat=list(EVRAK_TO_MEVZUAT[turu]),
        beklenen_yazi_turu=EVRAK_TO_YAZI[turu],
    )


def generate(per_type: int, seed: int) -> list[EvrakOrnegi]:
    """18 tür × per_type → stratifiye sentetik evrak listesi (deterministik)."""
    rng = random.Random(seed)
    out: list[EvrakOrnegi] = []
    for turu in EVRAK_TURLERI:
        for i in range(per_type):
            out.append(make_evrak(turu, i, rng))
    return out


# ===========================================================================
# 4. DETERMİNİSTİK MOCK AJAN BORU HATTI (LLM'siz) — eval scriptleri çağırır
# ===========================================================================
# Gerçek LangGraph mock-LLM'de evrak türü üretmez (8 hukuk-domain sınıflar). Bu shim
# yarışmanın Görev 1+2 ajan davranışını TEMSİL eder ve offline koşar. Kontrollü
# gürültü ("zor" örneklerde) → mock metrikleri 1.0 değil gerçekçi düşük çıkar
# (önemli olan HARNESS çalışsın + ablation/CI regresyon kapısı kurulsun).

# Sınıflandırma için tür-imza anahtar kelimeleri (zorluk arttıkça örtük → kaçar).
_TUR_SINYAL: dict[str, tuple[str, ...]] = {
    "bilgi_edinme": ("bilgi edinme", "4982", "bilgi/belge talep"),
    "ihale_teklif": ("ihale", "teklif", "4734"),
    "tebligat": ("tebligat", "7201", "tebliğ olunur"),
    "mahkeme_karari": ("müzekkere", "esas sayılı", "mahkeme kararı", "haciz"),
    "saglik_raporu": ("sağlık", "heyet raporu", "istirahat"),
    "egitim_belge": ("öğrenci", "transkript", "diploma"),
    "tapu_kadastro": ("tapu", "kadastro", "parsel", "ifraz", "tevhit"),
    "cevre_imar": ("çevre", "imar", "kaçak yapı", "hafriyat", "ÇED"),
    "vergi_borc": ("vergi", "6183", "yapılandır", "borc"),
    "sosyal_yardim": ("sosyal yardım", "yakacak", "gıda yardımı"),
    "itiraz": ("itiraz", "yeniden değerlendir", "kaldırılması"),
    "sikayet": ("şikâyet", "mağdur", "aykırılık"),
    "basvuru_izin": ("ruhsat", "izin", "başvuru"),
    "personel_ozluk": ("özlük", "657", "izin talebi", "terfi", "naklen"),
    "mali_odeme": ("ödeme", "hak ediş", "IBAN", "alacağ"),
    "resmi_yazi_gelen": ("ilgi sayılı", "kurumumuz görüşü", "yazınız"),
    "dilekce": ("dilekçe", "arz ederim", "rica ederim"),
}


def mock_classify(metin: str) -> tuple[str, float]:
    """Anahtar-kelime oylaması ile evrak türü tahmini + güven (deterministik).

    Eşleşme yoksa 'genel_evrak' + düşük güven (abstention sinyali). Güven, eşleşen
    sinyal sayısına göre [0.4, 0.95]. 'zor' örneklerde örtük metin → çoğu sinyal
    yok → düşük güven / yanlış sınıf (gerçekçi mock hatası).
    """
    low = metin.lower().replace("i̇", "i")
    skor: dict[str, int] = {}
    for turu, sinyaller in _TUR_SINYAL.items():
        hit = sum(1 for s in sinyaller if s.lower() in low)
        if hit:
            skor[turu] = hit
    if not skor:
        return "genel_evrak", 0.40
    best = max(skor, key=lambda k: skor[k])
    conf = min(0.95, 0.55 + 0.13 * skor[best])
    return best, round(conf, 3)


def mock_extract_fields(metin: str, turu: str) -> set[str]:
    """Metinde GERÇEKTEN geçen zorunlu alanları tespit et (etiket-tabanlı regex-light)."""
    label_map = {
        "tarih": "tarih:", "ad_soyad": "ad-soyad:", "tckn": "kimlik no:",
        "adres": "adres:", "iletisim": "iletişim:", "konu": "konu:", "sayi": "sayı:",
    }
    low = metin.lower().replace("i̇", "i")
    bulunan = {a for a, lab in label_map.items() if lab in low}
    # imza her zaman gövdede ima edilir; gövdedeki "arz/rica ederim" varsa imza var say.
    if "ederim" in low or "olunur" in low:
        bulunan.add("imza")
    return bulunan


def mock_missing_fields(metin: str, turu: str) -> list[str]:
    """Eksik zorunlu alanları çıkar — zorunlu küme − tespit edilen küme.

    Etiketle tespit edilemeyen ama gövdede 'görünmeyen' türe-özel alanları da
    eksik sayar (recall-öncelikli: eksik olanı kaçırma > fazla işaretleme)."""
    zorunlu = set(ZORUNLU_ALANLAR[turu])
    bulunan = mock_extract_fields(metin, turu)
    low = metin.lower().replace("i̇", "i")
    # türe-özel alanların metinde görünür olup olmadığını kaba kontrol
    icerik_alanlari = {"talep_turu", "talep_edilen_bilgi", "sikayet_konusu",
                       "itiraz_edilen_islem", "ada_parsel", "tutar", "evrak_no",
                       "esas_no", "mahkeme", "sicil_no", "ogrenci_no", "vergi_no",
                       "iban", "fatura_no", "ihale_kayit_no", "teklif_bedeli",
                       "firma_unvani", "il_ilce", "gonderen_kurum"}
    for a in zorunlu & icerik_alanlari:
        # konu/gövdede ima ediliyorsa bulundu say (kaba): aksi halde eksik aday
        if a in ("talep_turu", "talep_edilen_bilgi", "sikayet_konusu", "itiraz_edilen_islem"):
            bulunan.add(a)  # gövde konuyu içerir → ima
    return sorted(zorunlu - bulunan)


def mock_route(turu: str) -> tuple[str, list[str]]:
    """Tür → birim yönlendirme (Top-1 + alternatifler). genel_evrak default Yazı İşleri."""
    info = EVRAK_TO_BIRIM.get(turu, EVRAK_TO_BIRIM["genel_evrak"])
    return str(info["birim"]), [str(info["birim"]), *info["alt"]]  # type: ignore[misc]


def mock_summary(metin: str, alanlar: dict) -> str:
    """Kısa öz — konu + tarih + ad (anahtar unsurları kapsayan, key-fact recall hedefi)."""
    parts = []
    if alanlar.get("konu"):
        parts.append(f"{alanlar['konu']} konulu evrak")
    if alanlar.get("tarih"):
        parts.append(f"{alanlar['tarih']} tarihli")
    if alanlar.get("ad_soyad"):
        parts.append(f"{alanlar['ad_soyad']} tarafından")
    return " ".join(parts) + " işleme alınmıştır." if parts else "Özet üretilemedi."


# Resmî yazı taslağı zorunlu format bileşenleri (draft_eval format-compliance).
YAZI_ZORUNLU_BILESENLER = ("T.C.", "Sayı", "Konu", "İlgi", "imza_bloku", "ek_satiri")


def mock_draft(turu: str, alanlar: dict, rng_seed: int = 0) -> str:
    """Resmî yazı taslağı (üst yazı/cevap) — YAZI_ZORUNLU_BILESENLER'i içerir."""
    konu = alanlar.get("konu", "ilgili konu")
    birim, _ = mock_route(turu)
    return "\n".join([
        "T.C.",
        f"{birim.upper()}",
        "",
        f"Sayı   : {alanlar.get('sayi', alanlar.get('evrak_no', '____'))}",
        f"Konu   : {konu}",
        f"İlgi   : {alanlar.get('tarih', '____')} tarihli başvurunuz.",
        "",
        f"İlgi'de kayıtlı {konu} konulu talebiniz incelenmiş olup gereği "
        "Müdürlüğümüzce değerlendirilmektedir. Sürecin sonucu hakkında "
        "tarafınıza bilgi verilecektir.",
        "",
        "Bilgilerinize rica ederim.",
        "",
        "(e-imza)",
        "Daire Başkanı",
        "EK: İlgili evrak (1 sayfa)",
    ])


# ===========================================================================
# 5. GOLD SET YAZIMI
# ===========================================================================
def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _e2e_record(e: EvrakOrnegi) -> dict:
    """Uçtan-uca senaryo (her iki görev): evrak metni + tüm beklenen çıktılar."""
    return {
        "id": e.id, "metin": e.metin, "evrak_turu": e.evrak_turu, "zorluk": e.zorluk,
        "beklenen_birim": e.beklenen_birim,
        "kabul_edilebilir_birimler": e.kabul_edilebilir_birimler,
        "beklenen_mevzuat": e.beklenen_mevzuat, "eksik_alanlar": e.eksik_alanlar,
        "anahtar_unsurlar": e.anahtar_unsurlar, "beklenen_yazi_turu": e.beklenen_yazi_turu,
    }


def write_all(samples: list[EvrakOrnegi], out_dir: Path) -> dict[str, int]:
    """Tüm gold setleri yaz → {dosya: satır_sayısı}."""
    counts: dict[str, int] = {}

    def emit(name: str, recs: list[dict]) -> None:
        _write_jsonl(out_dir / name, recs)
        counts[name] = len(recs)

    emit("evrak_class_gold.jsonl", [s.to_record() for s in samples])
    emit("routing_gold.jsonl", [
        {"id": s.id, "metin": s.metin, "evrak_turu": s.evrak_turu,
         "beklenen_birim": s.beklenen_birim,
         "kabul_edilebilir_birimler": s.kabul_edilebilir_birimler} for s in samples])
    emit("ozet_gold.jsonl", [
        {"id": s.id, "metin": s.metin, "evrak_turu": s.evrak_turu,
         "alanlar": s.alanlar, "anahtar_unsurlar": s.anahtar_unsurlar} for s in samples])
    emit("yazi_taslak_gold.jsonl", [
        {"id": s.id, "evrak_turu": s.evrak_turu, "alanlar": s.alanlar,
         "beklenen_yazi_turu": s.beklenen_yazi_turu,
         "zorunlu_bilesenler": list(YAZI_ZORUNLU_BILESENLER)} for s in samples])
    emit("eksik_bilgi_gold.jsonl", [
        {"id": s.id, "metin": s.metin, "evrak_turu": s.evrak_turu,
         "zorunlu_alanlar": list(ZORUNLU_ALANLAR[s.evrak_turu]),
         "eksik_alanlar": s.eksik_alanlar} for s in samples])
    emit("e2e_scenarios.jsonl", [_e2e_record(s) for s in samples])
    return counts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Sentetik kamu-evrak gold üreteci (TEKNOFEST 1. Senaryo)")
    ap.add_argument("--per-type", type=int, default=DEFAULT_PER_TYPE, help="tür-başı örnek (>=4)")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--out", type=str, default=None, help="çıktı dizini (default repo/data/synthetic)")
    args = ap.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]

    per = max(4, args.per_type)
    samples = generate(per, args.seed)
    out_dir = Path(args.out) if args.out else (Path(__file__).resolve().parent.parent / "data" / "synthetic")
    counts = write_all(samples, out_dir)

    print(f"\n  Sentetik kamu-evrak gold üretildi → {out_dir}")
    print(f"  {len(EVRAK_TURLERI)} tür × {per} = {len(samples)} evrak (seed={args.seed})")
    zorluk_dag: dict[str, int] = {z: sum(1 for s in samples if s.zorluk == z) for z in ZORLUK}
    eksikli = sum(1 for s in samples if s.eksik_alanlar)
    print(f"  Zorluk dağılımı: {zorluk_dag} · eksik-alanlı evrak: {eksikli}/{len(samples)}")
    for name, n in counts.items():
        print(f"    {name:28s} {n:4d} satır")
    return 0


if __name__ == "__main__":
    sys.exit(main())
