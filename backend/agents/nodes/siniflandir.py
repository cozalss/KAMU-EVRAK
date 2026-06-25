"""Görev 1 — Evrak türü sınıflandırma node'u (LLM-birincil + keyword fallback).

Akış (CLAUDE.md v2.3): few-shot LLM JSON-schema çıktı BİRİNCİL (kapalı-küme
config.EVRAK_TURLERI); LLM yok/mock/hata → keyword-heuristik fallback (deterministik,
anahtarsız demo çalışır). Düşük güvende "belirsiz" (abstention — kendi-tanımlı
kapalı-küme F1 manipülasyon algısını önle; docs/02 §1).
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from agents.config import EVRAK_TURLERI, EVRAK_TURU_TR
from agents.nodes._llm_extract import llm_json
from core.text import tr_lower

log = structlog.get_logger()

# LLM güven eşiği — altında "belirsiz"e abstain (kapalı-küme manipülasyon koruması).
_ABSTAIN_THRESHOLD = 0.45
_VALID_TURLER = set(EVRAK_TURLERI)

_RE_KONU = re.compile(r"konu\s*[:：]\s*(.+)", re.IGNORECASE)
# Citizen sinyali: Ad-Soyad/TCKN bloğu (vatandaş evrakı; kurum→kurum yazıda yok).
_RE_CITIZEN = re.compile(r"(ad-?\s?soyad|t\.?c\.?\s?kimlik)", re.IGNORECASE)
# "İlgi" atfı (önceki yazıya cevap) — satır başı VEYA "ilgi sayılı/yazı/yazınıza".
_RE_ILGI = re.compile(r"(^|\n)\s*ilgi\b|ilgi\s*(sayılı|yazı|yazınıza|de kayıtlı)", re.IGNORECASE)

# 0) ÖNCELİKLİ gövde ifadeleri (Konu'dan ÖNCE) — gövde fiili türü Konu isminden daha
#    kesin belirlediği vakalar: cevabi yazı (önceki yazıya cevap), müzekkere (resmî bilgi-
#    celp), bilgi edinme (4982 mevcut-kayda erişim). Konu noun'u (ör. "başvuru sonucu",
#    "bilirkişi talebi") bu vakalarda yanıltır → öncelikli gövde markeri kazanmalı.
_GOVDE_ONCELIKLI: tuple[tuple[str, str], ...] = (
    # Bilgi edinme (4982): MEVCUT kayda/belgeye erişim talebi — ayırt edici fiiller.
    ("mevcut bilgi ve belge", "bilgi_edinme"),
    ("tarafıma iletilmesini istiyorum", "bilgi_edinme"),
    ("tarafıma verilmesini istiyorum", "bilgi_edinme"),
    ("bir örneğinin tarafıma", "bilgi_edinme"),
    ("kayıtların tarafıma", "bilgi_edinme"),
    ("belgeleri talep ediyorum", "bilgi_edinme"),
    # Cevabi yazı: önceki yazıya cevap markerları.
    ("yazınıza istinaden", "cevabi_yazi"),
    ("yazınızda belirtilen", "cevabi_yazi"),
    ("talebiniz değerlendiril", "cevabi_yazi"),
    ("cevabımız ektedir", "cevabi_yazi"),
    ("tarafınıza bildiril", "cevabi_yazi"),
    ("sonucu aşağıda arz olunur", "cevabi_yazi"),
    ("görüşü aşağıda sunul", "cevabi_yazi"),
    # Müzekkere: yalnız açık "müzekkere" sözcüğü (öncelikli). "celbi"/"rica olunur" gibi
    # markerlar icra ('borçluya ait kayıtların celbi') + görüş'ü çalıyordu → KONU katmanına
    # taşındı (icra Konu sözcükleri 'ödeme emri'/'icra takibi' orada müzekkere'den önce gelir).
    ("müzekkere", "muzekkere"),
)

# 1) KONU-satırı tür sözcükleri (en ayırt edici; Konu evrak türünü adlandırır).
#    İlk eşleşen kazanır → spesifik tür sözcükleri genel olanlardan ÖNCE.
_KONU_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("tutanağı", "tutanak"), ("tutanak", "tutanak"),
    ("raporu", "rapor"),
    ("davası", "dava_evraki"), ("itirazın iptali", "dava_evraki"),
    ("müzekkere", "muzekkere"),
    ("haciz", "icra_evraki"), ("ödeme emri", "icra_evraki"), ("icra takibi", "icra_evraki"),
    ("kambiyo", "icra_evraki"), ("kıymet takdiri", "icra_evraki"),
    ("celbi", "muzekkere"),  # 'kayıt celbi' Konu'su → müzekkere (icra Konu'ları üstte eşleşir)
    ("görüşü", "gorus_mutalaa"), ("mütalaa", "gorus_mutalaa"),
    ("hukuki değerlendirme", "gorus_mutalaa"),
    ("oluru", "genelge_talimat_olur"), ("genelge", "genelge_talimat_olur"),
    ("talimatı", "genelge_talimat_olur"),
    ("ihbarnamesi", "tebligat"), ("yıkım kararı", "tebligat"), ("tahliye kararı", "tebligat"),
    ("ruhsat iptali", "tebligat"),
    ("alımı", "fatura"), ("bedeli", "fatura"), ("fatura", "fatura"),
    ("bilgi edinme", "bilgi_edinme"),
    ("kaçak", "ihbar"), ("usulsüz", "ihbar"), ("kamu zararı", "ihbar"),
    ("ihlali", "ihbar"),
    ("başvuru", "basvuru"), ("kaydı", "basvuru"), ("izni", "basvuru"),
    ("talebi", "talep"),
)

# 2) Gövde anahtar sözcükleri (Konu eşleşmezse) — öncelik sıralı; ilk eşleşen kazanır.
#    NOT: 'talep ederim'/'arz ederim' KALDIRILDI — bunlar her resmî evrakta geçen kapalı-
#    biçim selamlamadır (catch-all), tür ayırt etmez; dilekçe'yi aşırı-tetikliyordu.
_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("bilgi edinme", "bilgi_edinme"), ("4982", "bilgi_edinme"),
    ("cimer", "cimer"),
    ("şikayet", "sikayet"), ("şikâyet", "sikayet"),
    ("ihbar ediyor", "ihbar"), ("ihbar ed", "ihbar"), ("usulsüzlük", "ihbar"),
    ("tebliğ edilir", "tebligat"), ("tebligat", "tebligat"),
    ("müzekkere", "muzekkere"),
    ("haciz", "icra_evraki"), ("icra dairesi", "icra_evraki"), ("ödeme emri", "icra_evraki"),
    ("duruşma", "dava_evraki"), ("davada", "dava_evraki"), ("mahkemenize", "dava_evraki"),
    ("dava dilekçe", "dava_evraki"),
    ("fatura", "fatura"), ("ödenmesi", "fatura"), ("tahakkuk", "fatura"),
    ("tutanak", "tutanak"),
    ("mütalaa", "gorus_mutalaa"), ("hukuki görüş", "gorus_mutalaa"),
    ("denetim raporu", "rapor"), ("faaliyet raporu", "rapor"),
    ("genelge", "genelge_talimat_olur"), ("talimatı", "genelge_talimat_olur"),
    ("oluru", "genelge_talimat_olur"),
    ("başvuru", "basvuru"),
    ("dilekçe", "dilekce"),
)

# Few-shot LLM prompt — kapalı-küme + abstention + AYIRT EDİCİ kurallar + örnekler.
# TASARIM (held-out genelleme): keyword DEĞİL ANLAM (intent/gönderen-rolü/eylem) üzerinden
# ayır → dolaylı/örtük ifadede de doğru sınıfla. Örnekler bilerek kısa ve ŞABLON-DIŞIDIR
# (gen_synthetic/heldout sözcüklerini ezberletmez; ayrımı ÖĞRETİR — OpenAI cookbook
# few-shot deseni). Her örnek farklı türden ve "anahtar sözcük yok" durumunu kapsar.
_SYSTEM = (
    "Sen Türk kamu kurumlarında gelen evrakı sınıflandıran bir uzman asistansın. "
    "Verilen evrak metnini SADECE şu kapalı listeden BİR türe ata:\n"
    f"{', '.join(EVRAK_TURLERI)}\n\n"
    "YÖNTEM — anahtar sözcüğe DEĞİL, şu üç sinyale bak:\n"
    "1) GÖNDEREN ROLÜ: vatandaş mı (Ad-Soyad/TCKN bloğu, 'istiyorum/rica ediyorum') "
    "yoksa kurum→kurum mu (imza bloğu, 'arz olunur/rica olunur')?\n"
    "2) NİYET/EYLEM: yeni bir hak/işlem mi isteniyor, mevcut bir belgeye mi erişiliyor, "
    "bir karar mı bildiriliyor, bir görüş mü soruluyor, para mı isteniyor?\n"
    "3) BAĞLAM: mahkeme/icra/tebliğ, mali, denetim/şikâyet, arşiv/tutanak?\n\n"
    "AYIRT EDİCİ KURALLAR (sık karışanlar):\n"
    "- dilekçe: vatandaşın SERBEST talebi/sorunu (yeni bir istek). bilgi_edinme: vatandaşın "
    "kurumda MEVCUT olan kayıt/belgeye erişim talebi (4982). basvuru: belirli bir izin/"
    "ruhsat/kayıt için resmi süreç başlatma.\n"
    "- sikayet: bir aksaklık/memnuniyetsizlik bildirimi (mağduriyet). ihbar: bir kişi/"
    "kurum hakkında usulsüzlük/suç bildirimi (denetim ister).\n"
    "- cimer: Cumhurbaşkanlığı iletişim/tek-kapı/çevrim içi başvuru kanalı vurgusu.\n"
    "- ust_yazi: kurumun BAŞLATTIĞI yeni yazışma (ek/belge sunumu). cevabi_yazi: önceki "
    "bir yazıya/talebe KARŞILIK ('yazınıza istinaden', 'incelendi, sonuç şudur').\n"
    "- tebligat: bir karar/yükümlülüğün muhataba RESMEN bildirimi. muzekkere: kurumun "
    "başka kurumdan bilgi/kayıt CELBİ. gorus_mutalaa: hukuki YORUM/değerlendirme isteği.\n"
    "- fatura: bir bedelin/hak edişin ÖDENMESİ talebi (para akışı). icra_evraki: zorla "
    "tahsil/haciz/malvarlığı. dava_evraki: mahkeme/yargılama beyanı.\n\n"
    "ÖRNEKLER (yalnız ayrımı göster; metni ezberleme):\n"
    'Metin: "Mahallemizdeki sorunun çözülmesini umuyorum. Ad-Soyad: ... TCKN: ..."\n'
    '→ {"evrak_turu": "dilekce", "tur_confidence": 0.8, "tur_reasoning": "vatandaş serbest talep"}\n'
    'Metin: "Kurumunuzda mevcut geçmiş kayıtların bir suretine erişmek istiyorum."\n'
    '→ {"evrak_turu": "bilgi_edinme", "tur_confidence": 0.85, "tur_reasoning": "mevcut kayda erişim (4982)"}\n'
    'Metin: "Daha önce gönderdiğiniz yazıda sorulan hususa ilişkin görüşümüz aşağıdadır."\n'
    '→ {"evrak_turu": "cevabi_yazi", "tur_confidence": 0.85, "tur_reasoning": "önceki yazıya karşılık"}\n\n'
    "Kurallar: Liste DIŞINDA tür UYDURMA. Emin değilsen 'belirsiz' + düşük güven (abstention).\n"
    "Çıktı SADECE şu JSON, başka metin YOK:\n"
    '{"evrak_turu": "<tür>", "tur_confidence": <0..1>, "tur_reasoning": "<kısa gerekçe>"}'
)


def _result(turu: str, conf: float, gerekce: str) -> dict[str, Any]:
    return {"evrak_turu": turu, "tur_confidence": conf,
            "tur_reasoning": f"{gerekce} [heuristik]"}


def _konu_satiri(text: str) -> str:
    """'Konu:' satırının küçük-harf içeriği (yoksa boş) — tür sözcüğü aranır."""
    m = _RE_KONU.search(text)
    return tr_lower(m.group(1)) if m else ""


# Vatandaş dilekçesi alt-sınıflandırıcı sinyalleri (citizen bloğu varsa, kurum/mali
# konu-noun'larından ÖNCE) — öncelik sıralı. CİMER/şikâyet/ihbar açık marker, kalan dilekçe.
_CITIZEN_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("cimer", "cimer"), ("cumhurbaşkanlığı iletişim", "cimer"),
    ("sistem üzerinden başvur", "cimer"), ("iletişim merkezi", "cimer"),
    ("şikayet", "sikayet"), ("şikâyet", "sikayet"),
    ("memnuniyetsiz", "sikayet"), ("süregelen", "sikayet"), ("rahatsız", "sikayet"),
    ("ihbar ed", "ihbar"), ("usulsüz", "ihbar"), ("kaçak", "ihbar"),
    ("bildiririm", "ihbar"), ("kamu zararı", "ihbar"),
)


def _citizen_petition(text: str, konu: str) -> dict[str, Any] | None:
    """Vatandaş bloğu (Ad-Soyad/TCKN) VARSA AÇIK petisyon markeri: cimer/şikâyet/ihbar.

    SADECE açık petisyon sinyali (CİMER kanalı, şikâyet/memnuniyetsizlik, ihbar/usulsüzlük)
    eşleşirse döner. Genel 'dilekçe/talep' fallback'i YOKTUR — citizen bloğu fatura/dava/
    tutanak/rapor/başvuru gibi türlerde de bulunur; o ayrımı konu/keyword katmanları yapar.
    """
    if not _RE_CITIZEN.search(text):
        return None
    for kw, turu in _CITIZEN_KEYWORDS:
        if tr_lower(kw) in text:
            return _result(turu, 0.58, f"vatandaş bloğu + '{kw}' → {turu}")
    # "fatura itirazı" gibi vatandaş İTİRAZI fatura DEĞİL dilekçedir (mali belge kurum üretir).
    if "itiraz" in konu and "fatura" in konu:
        return _result("dilekce", 0.55, "vatandaş bloğu + fatura itirazı → dilekçe")
    return None


def _yapisal(text: str) -> dict[str, Any] | None:
    """Konu/gövde eşleşmezse yapısal sinyal: İlgi→cevabi, kurum→kurum→ust_yazi, vatandaş→dilekçe.

    Resmî yazıda Ad-Soyad/TCKN bloğu YOKTUR (kurum→kurum); vatandaş evrakında (dilekçe/
    talep) VARDIR. İlgi atfı önceki yazıya cevaptır (cevabi_yazi). Bu yapısal kural
    'arz ederim'/'talep ederim' selamlamasından bağımsız ayrım yapar.
    """
    citizen = bool(_RE_CITIZEN.search(text))
    resmi_baslik = "t.c." in text and ("sayı" in text or "sayi" in text)
    if _RE_ILGI.search(text):
        return _result("cevabi_yazi", 0.55, "İlgi atfı → cevabi yazı")
    # Vatandaş bloğu VARSA bu kurum→kurum üst yazı değildir → vatandaş talebi (dilekçe).
    # Bu kontrol ust_yazi'den ÖNCE: "talep ediyorum/ederim", "rica ederim", "istiyorum",
    # "çözüme kavuşturul", "giderilmesini" gibi serbest vatandaş talebi fiilleri.
    if citizen:
        return _result("dilekce", 0.5, "vatandaş bloğu + resmî başlık → dilekçe (yapısal)")
    if resmi_baslik:
        # Kurum→kurum resmî yazı, İlgi yok, vatandaş bloğu yok → üst yazı (yeni yazışma).
        return _result("ust_yazi", 0.5, "resmî başlık + İlgi yok + vatandaş bloğu yok → üst yazı")
    return None


def _heuristik(text: str) -> dict[str, Any]:
    """Katmanlı heuristik (LLM-yok fallback): Konu-tür sözcüğü → gövde keyword → yapısal sinyal.

    Konu satırı evrak türünü en sık adlandırır (en ayırt edici) → önce o; sonra gövde
    anahtar sözcükleri; en son İlgi/kurum-vatandaş yapısal ayrımı. Hiçbiri yoksa 'belirsiz'.
    """
    for kw, turu in _GOVDE_ONCELIKLI:
        if tr_lower(kw) in text:
            return _result(turu, 0.62, f"öncelikli gövde ifadesi: '{kw}'")
    konu = _konu_satiri(text)
    # Vatandaş bloğu varsa petisyon alt-türü kurum/mali konu-noun'undan ÖNCE belirlenir.
    if (citizen := _citizen_petition(text, konu)) is not None:
        return citizen
    if konu:
        for kw, turu in _KONU_KEYWORDS:
            if tr_lower(kw) in konu:
                return _result(turu, 0.6, f"Konu tür sözcüğü: '{kw}'")
    for kw, turu in _KEYWORDS:
        if tr_lower(kw) in text:
            return _result(turu, 0.6, f"gövde anahtar sözcük: '{kw}'")
    if (yapisal := _yapisal(text)) is not None:
        return yapisal
    return _result("belirsiz", 0.3,
                   f"eşleşme yok (abstention); etiketler: {list(EVRAK_TURU_TR)[:5]}...")


def _from_llm(obj: dict[str, Any]) -> dict[str, Any] | None:
    """LLM JSON'unu doğrula → geçerli kapalı-küme türü + abstention; geçersiz → None."""
    turu = str(obj.get("evrak_turu", "")).strip()
    if turu not in _VALID_TURLER:
        return None
    try:
        conf = float(obj.get("tur_confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    reasoning = str(obj.get("tur_reasoning", "") or "LLM sınıflandırması").strip()[:240]
    if turu != "belirsiz" and conf < _ABSTAIN_THRESHOLD:  # abstention kapısı
        return {"evrak_turu": "belirsiz", "tur_confidence": conf,
                "tur_reasoning": f"düşük güven ({conf:.2f}) → belirsiz; LLM önerisi: {turu}"}
    return {"evrak_turu": turu, "tur_confidence": conf, "tur_reasoning": reasoning}


async def siniflandir_node(state: dict[str, Any]) -> dict[str, Any]:
    """Evrak türünü belirle — LLM-birincil (kapalı-küme + abstention), keyword fallback."""
    raw = state.get("evrak_text", "")
    text = tr_lower(raw)
    if not text.strip():
        return {"evrak_turu": "belirsiz", "tur_confidence": 0.0, "tur_reasoning": "boş metin"}

    obj = await llm_json(_SYSTEM, raw[:6000], max_tokens=200)
    if obj is not None and (result := _from_llm(obj)) is not None:
        log.info("siniflandir", turu=result["evrak_turu"],
                 conf=result["tur_confidence"], source="llm")
        return result

    result = _heuristik(text)
    log.info("siniflandir", turu=result["evrak_turu"], source="heuristik")
    return result


__all__ = ("siniflandir_node",)
