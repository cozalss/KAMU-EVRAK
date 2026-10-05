"""Görev 1 — Bilgi unsuru çıkarma node'u: gelen evrak kimliği + TEK talep kümesi + PII.

Akış: TEK LLM çağrısı (düşünme kapalı, kapalı küme JSON) belgenin anlamını çıkarır —
gönderen, kısa resmî konu, gelen evrak modeli (belge cinsi / gönderen türü / idareler) ve
TALEP KÜMESİ (her ayrı istek: birebir kanıt + kısa özet + tür + birim ipucu). Deterministik
katman: PII maskeleme, etiketli alanlar (Sayı/Başvuru No/Konu/Tarih), kanıt çapası, imza
durumu. LLM yok/mock/hata → aynı yapılar deterministik üretilir (anahtarsız demo çalışır).

TEK DOĞRULUK KAYNAĞI (teşhis 2026-10-05): talepler yalnız burada çıkarılır; eski
`talepler` (list[str]) ve decompose'un `alt_talepler`i bu kümeden TÜRETİLİR — iki ajanın
talep sayısında çelişmesi yapısal olarak imkânsızdır, decompose ikinci LLM çağrısı yapmaz.

PII GÜVENLİĞİ (CLAUDE.md §2): TCKN/telefon ASLA ham saklanmaz/döndürülmez. LLM'e yalnız
mask_for_llm metni gider; LLM'in serbest-metin alanları PII-tarayıcıdan geçer.
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from agents.config import BIRIMLER
from agents.nodes._llm_extract import llm_json
from agents.talep_kumesi import (
    heuristik_talep_kumesi,
    kanit_kaynakta,
    talep_kumesi_dogrula,
    talep_metinleri,
)
from api.pii import mask_for_llm
from yazi.gelen_evrak import BELGE_CINSLERI, GONDEREN_TURLERI, GelenEvrak, gelen_evrak_cikar

log = structlog.get_logger()

_RE_TARIH = re.compile(r"\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")          # E-45678257-622.03-12345 vb.
_RE_TCKN = re.compile(r"\b[1-9]\d{10}\b")                 # 11 haneli — MASKELENİR
_RE_TEL = re.compile(r"\b0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")
_RE_KONU = re.compile(r"konu\s*[:：]\s*(.+)", re.IGNORECASE)
_RE_TALEP = re.compile(r"(talep ederim|rica ederim|arz ederim|gereğini|bilgilerinize)", re.IGNORECASE)
# İmzanın METİNDE görünür izi: 'İmza' satırı, e-imza / elektronik imza beyanı, KEP.
_RE_IMZA = re.compile(r"\b(imza|e-imza|elektronik imza|güvenli elektronik imza|"
                      r"elektronik olarak imzalan\w*|e-imzal\w*)\b", re.IGNORECASE)

# Konu ÖZ olmalı (Yön. 2646 m.13): tam cümle/paragraf değil kısa başlık.
_KONU_KESME = re.compile(r"[.;,]|\s(?:olup|için|ancak|çünkü|zira|nedeniyle|dolayısıyla)\s")
_KONU_MAX_KELIME = 8
_KONU_MAX_KR = 64
_CIKAR_MAX_TOKENS = 1400   # 8 talep × ~70 + künye; düşünme kapalı → gerçek cevap boyu


def _konu_kisa(ham: str) -> str:
    """Uzun konu ifadesini kısa öz'e indir (case korunur — özel ad/kısaltma bozulmasın)."""
    k = re.sub(r"\s+", " ", ham or "").strip().rstrip(".;,: ")
    if not k:
        return k
    if len(k) <= _KONU_MAX_KR and len(k.split()) <= _KONU_MAX_KELIME:
        return k
    parca = _KONU_KESME.split(k, maxsplit=1)[0].strip()
    kelimeler = parca.split()
    if len(kelimeler) > _KONU_MAX_KELIME:
        parca = " ".join(kelimeler[:_KONU_MAX_KELIME])
    return parca.rstrip(".;,: ") or k[:_KONU_MAX_KR]


def _talepleri_cikar(text: str) -> list[str]:
    """Geriye uyum: deterministik talep kümesinin kanıt cümleleri (list[str])."""
    return talep_metinleri(heuristik_talep_kumesi(text))


# Gönderen ad-soyad: "Ad-Soyad: <İsim>" / "Adı Soyadı: <İsim>" satırı (aynı satırda kalır).
_RE_AD_SOYAD = re.compile(
    r"ad[ıi]?[ \t-]*soyad[ıi]?[ \t]*[:：][ \t]*"
    r"([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:[ \t]+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)",
    re.IGNORECASE,
)

_PII_SCAN: tuple[re.Pattern[str], ...] = (_RE_TCKN, _RE_TEL)

_SYSTEM = (
    "Sen kamu evrakını yapılandıran bir asistansın. Verilen evrak metninden aşağıdaki JSON'u "
    "çıkar. Metinde GÖRÜNMEYENİ yazma (null bırak), UYDURMA.\n"
    "- gonderen: evrakı gönderen kişinin adı-soyadı ya da tüzel kişinin adı (yalnız metinde "
    "açıkça yazıyorsa).\n"
    "- konu: belgenin TEK kısa resmî konusu; en çok 8 kelimelik isim öbeği (ör. 'Yol "
    "çukurunun kapatılması'). Belgenin kendi 'Konu:' satırı varsa onu kullan.\n"
    "- gelen_evrak: belge_cinsi YALNIZ şunlardan biri: " + ", ".join(BELGE_CINSLERI)
    + "; gonderen_turu YALNIZ şunlardan biri: " + ", ".join(GONDEREN_TURLERI)
    + "; gonderen_idare: belgeyi bir kamu idaresi gönderdiyse antetindeki idare adı, değilse "
    "null; muhatap_idare: belgenin hitap ettiği idare.\n"
    "- talepler: gönderenin muhataptan istediği HER AYRI iş için bir madde (en çok 8). "
    "kanit = metinden BİREBİR kopyalanmış istek ifadesi (parafraz YOK); ozet = 2-6 kelimelik "
    "isim öbeği (resmî Konu satırına uygun); tur YALNIZ: talep, sikayet, ihbar, bilgi_edinme, "
    "basvuru; birim_ipucu YALNIZ şunlardan biri ya da null: " + ", ".join(BIRIMLER) + ".\n"
    "  * Aynı konuya bağlı işlemler TEK maddedir (ör. 'sayacın kontrolü ve fazla tutarın "
    "iadesi'; 'onarılması, olmazsa yenisinin konması').\n"
    "  * Farklı konular ayrı maddedir; bağlaç ('ayrıca') olmasa da.\n"
    "  * Durum anlatımı ve kalıp kapanış ('gereğinin yapılmasını arz ederim', 'bilgilerinize') "
    "tek başına madde DEĞİLDİR. Kapanış bir durumun giderilmesini istiyorsa madde o durumdur, "
    "kanıtı durum cümlesidir.\n"
    "  * Kurum yazısındaki (icra, mahkeme, genelge, resmî yazı) istekler de maddedir.\n"
    "- iletisim_adres: {\"deger\": bool, \"kanit\": birebir alıntı|null}; yalnız iş veya "
    "ikametgâh ADRESİ varsa true (telefon adres değildir).\n"
    "- TCKN, telefon, tarih, sayı çıkarma; bunlar ayrıca işlenir.\n\n"
    "Çıktı SADECE şu biçimde JSON, başka metin YOK:\n"
    '{"gonderen": null, "konu": null, "gelen_evrak": {"belge_cinsi": "dilekce", '
    '"gonderen_turu": "gercek_kisi", "gonderen_idare": null, "muhatap_idare": null}, '
    '"talepler": [{"kanit": "...", "ozet": "...", "tur": "talep", "birim_ipucu": null}], '
    '"iletisim_adres": {"deger": false, "kanit": null}}'
)


def _mask(s: str) -> str:
    """PII maskesi — ilk 3 + son 2 görünür, ortası yıldız."""
    if len(s) <= 5:
        return "*" * len(s)
    return f"{s[:3]}{'*' * (len(s) - 5)}{s[-2:]}"


def _scrub_pii(value: str) -> str:
    """Serbest-metin alanındaki ham TCKN/telefon'u maskele (LLM sızıntısına karşı)."""
    out = value
    for pat in _PII_SCAN:
        out = pat.sub(lambda m: _mask(re.sub(r"\s", "", m.group(0))), out)
    return out


def _regex_unsurlar(text: str) -> dict[str, Any]:
    """Deterministik tespit: PII maskeleme ÖNCE + tarih/sayı/konu + adres/imza/talep.

    PII (TCKN/telefon) ÖNCE tespit edilir ve metinden REDAKTE edilir; sayı/konu çıkarımı bu
    redakte metinde koşar → açgözlü 'sayi' regex'i TCKN'yi ham yakalayamaz (sızıntı önlenir).
    """
    unsurlar: dict[str, Any] = {}
    if tckn := _RE_TCKN.search(text):
        unsurlar["tckn_maskeli"] = _mask(tckn.group(0))
        unsurlar["pii_var"] = True
    if tel := _RE_TEL.search(text):
        unsurlar["telefon_maskeli"] = _mask(re.sub(r"\s", "", tel.group(0)))
        unsurlar["pii_var"] = True
    redacted = _scrub_pii(text)

    if m := _RE_TARIH.search(redacted):
        unsurlar["tarih"] = m.group(0)
    if m := _RE_SAYI.search(redacted):
        unsurlar["sayi"] = m.group(0)
    if m := _RE_KONU.search(redacted):
        unsurlar["konu"] = _konu_kisa(m.group(1))          # ham satır değil kısa öz (Yön. m.13)
    if m := _RE_AD_SOYAD.search(redacted):
        unsurlar["gonderen"] = m.group(1).strip()[:80]
    if _RE_TALEP.search(text):
        unsurlar["talep"] = True
    if re.search(r"\b(adres|mahalle|mah\.|cadde|cad\.|sokak|sok\.|no:)\b", text, re.IGNORECASE):
        unsurlar["iletisim_adres"] = True
    if _RE_IMZA.search(text):
        unsurlar["imza"] = True
    return unsurlar


def _kanit_gecerli(kanit: Any, text: str) -> bool:
    """Kanıt span'ı kaynak metinde GERÇEKTEN geçiyor mu? (uydurma-karşıtı doğrulama).

    ≥15 karakter + ≥2 kelime: kısa alıntılar kaynakta tesadüfen geçer (sahte topraklama).
    """
    return kanit_kaynakta(kanit, text)


def _merge_llm(unsurlar: dict[str, Any], obj: dict[str, Any], text: str) -> None:
    """LLM yapısal alanlarını birleştir (regex'i ezmeden; serbest-metin PII-scrub'lanır).

    talep/iletisim_adres/imza: {"deger", "kanit"} biçimi — kanıt kaynakta GERÇEKTEN
    geçiyorsa true sayılır (recall-öncelikli, uydurma asla kabul edilmez).
    """
    for key in ("gonderen", "kurum"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip() and not unsurlar.get(key):
            unsurlar[key] = _scrub_pii(val.strip()[:160])
    llm_konu = obj.get("konu")
    if isinstance(llm_konu, str) and llm_konu.strip():
        aday = _konu_kisa(_scrub_pii(llm_konu.strip()))
        mevcut = unsurlar.get("konu") or ""
        if not mevcut or (len(mevcut) > _KONU_MAX_KR and len(aday) < len(mevcut)):
            unsurlar["konu"] = aday
    for key in ("talep", "iletisim_adres", "imza"):
        if unsurlar.get(key):
            continue
        alan = obj.get(key)
        if isinstance(alan, dict):
            if _kanit_gecerli(alan.get("kanit"), text):
                unsurlar[key] = True
        elif alan is True:  # eski çıplak-boolean şekli — geriye uyum
            unsurlar[key] = True
            log.warning("cikar_kanitsiz_boolean_fallback", alan=key)


def _talep_kumesi_kur(obj: dict[str, Any] | None, llm_metin: str,
                      text: str) -> tuple[list[dict[str, Any]], str]:
    """LLM kümesi (kanıt çapalı) → yoksa/boşsa deterministik küme. (küme, kaynak)."""
    if obj is not None:
        kume = talep_kumesi_dogrula(obj.get("talepler"), llm_metin)
        if kume:
            return kume, "llm"
        if isinstance(obj.get("talepler"), list) and obj["talepler"]:
            log.info("cikar_talep_capa_reddi", n=len(obj["talepler"]))
    return heuristik_talep_kumesi(mask_for_llm(text, None)), "heuristik"


def _imza_durumu(unsurlar: dict[str, Any], gelen: GelenEvrak) -> str:
    """'var' | 'dogrulanamadi'. Düz metin/OCR'dan ıslak imzanın YOKLUĞU kanıtlanamaz.

    'yok' yalnız imza alanının boş olduğunu açıkça raporlayan bir kanaldan gelebilir
    (görsel katmanın imza tespiti henüz yok) — metinden asla türetilmez.
    """
    if unsurlar.get("imza") or gelen.elektronik_kanal:
        return "var"
    return "dogrulanamadi"


def _konu_tamamla(unsurlar: dict[str, Any], kume: list[dict[str, Any]]) -> None:
    """Konu yoksa talep kümesinden türet (tek kaynak): 1 talep → özeti; ≥2 → ilk ikisi."""
    if unsurlar.get("konu") or not kume:
        return
    ozetler = [o["ozet"] for o in kume[:2] if o.get("ozet")]
    if ozetler:
        unsurlar["konu"] = _konu_kisa(" ve ".join(ozetler))


async def cikar_node(state: dict[str, Any]) -> dict[str, Any]:
    """Yapısal bilgi unsurları + gelen evrak modeli + talep kümesi (TEK LLM çağrısı)."""
    text = state.get("evrak_text", "") or ""
    unsurlar = _regex_unsurlar(text)  # PII maskeleme HER ZAMAN deterministik

    # KVKK: dış servise (DeepSeek) ham TCKN/telefon/IBAN GİTMEZ.
    llm_metin = mask_for_llm(text, None)
    obj = await llm_json(_SYSTEM, llm_metin[:6000], max_tokens=_CIKAR_MAX_TOKENS,
                         dusunme_kapali=True) if text.strip() else None
    if obj is not None:
        _merge_llm(unsurlar, obj, text)

    kume, kaynak = _talep_kumesi_kur(obj, llm_metin, text)
    unsurlar["talep_kumesi"] = kume
    unsurlar["talep_kumesi_kaynagi"] = kaynak
    if kume:
        unsurlar["talepler"] = talep_metinleri(kume)
        unsurlar["talep"] = True
    _konu_tamamla(unsurlar, kume)

    llm_gelen = obj.get("gelen_evrak") if obj is not None else None
    gelen = gelen_evrak_cikar(text, llm_gelen, unsurlar.get("gonderen"))
    # Serbest metin alanları PII süzgecinden (etiketli numaralar — Sayı/Başvuru No — kalır).
    gelen = GelenEvrak.from_dict({**gelen.to_dict(), **{
        k: _scrub_pii(v) for k, v in gelen.to_dict().items()
        if k in ("gonderen_ad", "konu_satiri", "gonderen_idare", "muhatap_idare") and v}})
    unsurlar["gelen_evrak"] = gelen.to_dict()
    if not unsurlar.get("kurum") and (gelen.muhatap_idare or gelen.gonderen_idare):
        unsurlar["kurum"] = gelen.muhatap_idare or gelen.gonderen_idare
    unsurlar["imza_durumu"] = _imza_durumu(unsurlar, gelen)

    log.info("cikar", alanlar=list(unsurlar), pii=bool(unsurlar.get("pii_var")),
             source="llm+regex" if obj is not None else "regex",
             n_talep=len(kume), talep_kaynak=kaynak, belge_cinsi=gelen.belge_cinsi)
    return {"bilgi_unsurlari": unsurlar}


__all__ = ("cikar_node",)
