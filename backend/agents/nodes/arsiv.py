"""Görev 2 (yenilikçilik) — Arşivleme metadata node'u (Standart Dosya Planı 2005/7).

Şartname "arşivleme" teması: gelen/üretilen evrak kurumun Standart Dosya Planı'na
(Başbakanlık Genelgesi 2005/7) göre dosyalanır → aranabilirlik + saklama + arşiv.
Bu node pipeline çıktısından (evrak_turu + bilgi_unsurlari + hedef_birim) arşiv
metadata üretir: SDP konu kodu, saklama süresi, sayı, tarih, konu, birim.

Tasarım: DETERMİNİSTİK (config tabloları + çıkarılan unsurlar) → halüsinasyon riski yok.
SDP kodu/saklama süresi config.EVRAK_TO_SDP / EVRAK_TO_SAKLAMA'dan gelir; kuruma-özgü
ana hizmet kodu (100-599) belge konusuna göre değişebileceğinden kaba kod + [DOĞRULA:]
işareti taşır (CLAUDE.md §1 — şüpheli kod uydurulmaz).

Çıktı SÖZLEŞMESİ (frontend bununla eşleşir — anahtarlar SABİT):
    arsiv_metadata = {
        "sdp_kodu": str, "saklama_suresi": str, "konu": str,
        "sayi": str, "tarih": str, "birim": str,
        # S1 (2026-07) — içerik-tabanlı otomatik SDP atama (additive):
        "sdp_adi": str, "sdp_gerekce": str, "sdp_adaylari": list[dict],
    }

SDP seçim önceliği: evrak sayısından okunan kod > kapalı-küme LLM seçimi
(SDP_LLM_SECICI açık + gerçek LLM varsa; aday havuzu dışına ÇIKAMAZ) > içerik
eşleşmesi (sdp_katalog, gerekçeli + aday listeli) > config kaba kodu (fallback).
"""

from __future__ import annotations

from typing import Any

import structlog

from agents import config
from agents.config import (
    EVRAK_TO_SDP,
    LLM_DUSUNME_CIKARIMDA_KAPALI,
    etkili_birim,
    evrak_turu_tr,
    saklama_suresi,
    sdp_kodu,
)
from agents.nodes._llm_extract import llm_json, real_llm
from agents.sdp_katalog import llm_aday_havuzu, sdp_adi, sdp_onerileri

log = structlog.get_logger()

# SDP koduyla başlangıç sayı biçimi: <SDP-konu-kodu> (DETSİS+kayıt no kuruma özgü).
# Çıkarılan resmî sayıdan SDP konu kodu okunabiliyorsa (E-XXXX-622.03-YYY) o tercih edilir.
_KONU_BELIRSIZ = "[DOĞRULA: konu evraktan okunamadı]"
_TARIH_BELIRSIZ = "[DOĞRULA: tarih evrakta tespit edilemedi]"


def _sdp_from_sayi(sayi: str) -> str | None:
    """Resmî sayıdan SDP konu kodunu çıkar (E-<DETSİS>-<SDP>-<kayıt> → orta segment).

    Örn 'E-45678257-622.03-12345' → '622.03'. Segment 3+ haneli sayısal (nokta ile alt
    kod) ise SDP konu kodu kabul edilir; aksi halde None (config kaba koduna düşülür).
    """
    parts = [p for p in sayi.replace("E-", "").split("-") if p]
    for p in parts:
        core = p.replace(".", "")
        # DETSİS no genelde uzun (8 hane düz); SDP konu kodu 3-6 hane + nokta.
        if (core.isdigit() and 3 <= len(core) <= 7 and not p.startswith("0000")
                and ("." in p or 3 <= len(p) <= 6)):
            return p
    return None


def _sdp_kodu_for(turu: str, sayi: str) -> str:
    """SDP konu kodu: evrak sayısından okunabilirse o, değilse config kaba kodu.

    Kaba config kodu (kuruma-özgü ana hizmet 100-599) şüpheli olabileceğinden, türü
    config'de tanımlı olmayan ya da ana-hizmet aralığındaki kodlar [DOĞRULA:] ile işaretlenir.
    """
    if sayi and (okunan := _sdp_from_sayi(sayi)):
        return okunan
    kod = sdp_kodu(turu)
    # 100-599 ana hizmet aralığı kuruma özgüdür → kaba kod doğrulanmalı (uydurma değil, kaba).
    kok = kod.split(".")[0]
    if turu not in EVRAK_TO_SDP or (kok.isdigit() and 100 <= int(kok) <= 599):
        return f"{kod} [DOĞRULA: kuruma-özgü ana hizmet kodu]"
    return kod


def _konu_for(unsurlar: dict[str, Any]) -> str:
    konu = unsurlar.get("konu")
    if isinstance(konu, str) and konu.strip():
        return konu.strip()
    return _KONU_BELIRSIZ


_DOGRULA_ANA_HIZMET = " [DOĞRULA: kuruma-özgü ana hizmet kodu]"


def _sdp_llm_gerekli(adaylar: list[dict[str, Any]]) -> bool:
    """LLM'i yalnız birbirine yakın en az iki makul aday varsa devreye al."""
    if len(adaylar) < 2:
        return False
    ilk = float(adaylar[0].get("skor") or 0.0)
    ikinci = float(adaylar[1].get("skor") or 0.0)
    return ilk - ikinci < 1.0


async def _sdp_llm_secimi(
    parcalar: list[str], turu: str, adaylar: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Kapalı-küme LLM seçimi: aday havuzu dışındaki kod REDDEDİLİR → None (det. yol).

    Havuz = deterministik top-10 + tür kaba-kodu (eşleşme yoksa kaba kod + genel kodlar) —
    LLM yalnız bu küme içinden seçer, halüsinasyon kodu Python doğrulamasında elenir.
    Mock/anahtarsız/hata/timeout/bozuk-çıktı → None (mevcut deterministik seçim birebir).
    """
    if real_llm() is None:
        return None  # mock/anahtarsız → eski yol (CI testleri deterministik kalır)
    havuz = llm_aday_havuzu(parcalar, turu, sdp_kodu(turu))
    if not havuz:
        return None  # katalog yüklenememiş → mevcut graceful fallback zinciri
    liste = "\n".join(
        f"- {a['kod']}: {a['ad']} (anahtarlar: {', '.join(a['anahtar']) or '-'})"
        for a in havuz
    )
    icerik = " ".join(p for p in parcalar if p)[:900]
    obj = await llm_json(
        system=(
            "Sen bir kamu kurumunda Standart Dosya Planı (2005/7) uzmanısın. Evrak için "
            "SADECE aday listesindeki SDP kodlarından EN UYGUN olanı seç; liste dışına çıkma."
        ),
        user=(
            f"EVRAK TÜRÜ: {evrak_turu_tr(turu)}\n\nADAY SDP KODLARI (kod: ad):\n{liste}\n\n"
            f"EVRAK İÇERİĞİ (maskeli):\n{icerik}\n\n"
            'Yalnız şu JSON: {"kod":"<aday_kod>","gerekce":"<tek cümle Türkçe gerekçe>"}'
        ),
        max_tokens=160,
        # KAPALI KÜME seçimi: aday SDP kodları hazır listeleniyor, liste dışına çıkmak
        # zaten reddediliyor. Muhakeme katkı sağlamaz; liste-dışı kod gelirse deterministik
        # fallback devrede (aşağıda).
        dusunme_kapali=LLM_DUSUNME_CIKARIMDA_KAPALI,
    )
    kod = str((obj or {}).get("kod") or "").strip()
    kayit = next((a for a in havuz if a["kod"] == kod), None)
    if kayit is None:
        return None  # liste-dışı/boş kod → deterministik fallback
    gerekce = str(obj.get("gerekce") or "").strip() or kayit["ad"]
    log.info("arsiv_sdp_llm", turu=turu, kod=kod, havuz=len(havuz))
    # Ana-hizmet [DOĞRULA] bayrağı mevcut kuralla AYNEN uygulanır (CLAUDE.md §1).
    return {"kod": kod + (_DOGRULA_ANA_HIZMET if kayit["dogrula"] else ""),
            "ad": kayit["ad"], "gerekce": f"LLM seçimi: {gerekce}", "adaylar": adaylar}


async def _sdp_secimi(turu: str, sayi: str, state: dict[str, Any]) -> dict[str, Any]:
    """SDP kodu + ad + gerekçe + aday listesi (öncelik: sayıdan > LLM > içerik > kaba kod).

    İçerik girdileri MASKELİ alanlardan gelir (konu/talep/özet) → PII katalog eşlemesine
    (ve LLM prompt'una) sızmaz. Aday listesi her durumda döner (UI şeffaflığı: "neden bu kod?").
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    # NOT: unsurlar["talep"] bool işarettir (metin değil) → eşlemeye KATILMAZ
    # (str(True)="True" gürültüsü); sinyal konu + maskeli özetten gelir.
    parcalar = [str(unsurlar.get("konu") or ""), str(state.get("ozet") or "")]
    adaylar = sdp_onerileri(parcalar, turu)

    if sayi and (okunan := _sdp_from_sayi(sayi)):
        return {"kod": okunan, "ad": sdp_adi(okunan),
                "gerekce": "Evrak sayısından okundu (DETSİS-SDP-kayıt deseni).",
                "adaylar": adaylar}
    # Kapalı-küme LLM seçici (bayrak call-time okunur → test/ENV ile anahtarlanabilir).
    if (config.SDP_LLM_SECICI and _sdp_llm_gerekli(adaylar)
            and (secim := await _sdp_llm_secimi(parcalar, turu, adaylar))):
        return secim
    if adaylar:
        a = adaylar[0]
        kod = a["kod"] + (_DOGRULA_ANA_HIZMET if a["dogrula"] else "")
        if a["eslesen"]:
            gerekce = "Eşleşen ifade: " + ", ".join(a["eslesen"])
            if a["tur_uyumu"]:
                gerekce += f" · tür uyumu ({evrak_turu_tr(turu)})"
        else:
            gerekce = f"Anahtar ifade yok; tür eşlemesinden kaba kod ({evrak_turu_tr(turu)})."
        return {"kod": kod, "ad": a["ad"], "gerekce": gerekce, "adaylar": adaylar}
    return {"kod": _sdp_kodu_for(turu, sayi), "ad": "",
            "gerekce": "Katalog eşleşmesi yok; tür-bazlı kaba kod (config).", "adaylar": []}


async def arsiv_node(state: dict[str, Any]) -> dict[str, Any]:
    """SDP 2005/7 tabanlı arşiv metadata üret (additive — verify→arsiv→finalize)."""
    turu = state.get("evrak_turu", "belirsiz")
    unsurlar = state.get("bilgi_unsurlari") or {}
    # Kaynak-doğrulamalı ajan köprüsü: doğrulanmış birim adı, yoksa hedef_kategori etiketi.
    birim_ad = etkili_birim(state)

    sayi = str(unsurlar.get("sayi") or "")
    tarih = str(unsurlar.get("tarih") or "") or _TARIH_BELIRSIZ
    secim = await _sdp_secimi(turu, sayi, state)
    kod = secim["kod"]

    metadata: dict[str, Any] = {
        "sdp_kodu": kod,
        "sdp_adi": secim["ad"],
        "sdp_gerekce": secim["gerekce"],
        "sdp_adaylari": secim["adaylar"],
        "saklama_suresi": saklama_suresi(turu),
        "konu": _konu_for(unsurlar),
        "sayi": sayi or f"{kod} (DETSİS+kayıt no kurum sisteminde atanır)",
        "tarih": tarih,
        "birim": birim_ad,
    }
    log.info("arsiv", turu=turu, sdp=metadata["sdp_kodu"],
             saklama=metadata["saklama_suresi"], birim=birim_ad)
    return {"arsiv_metadata": metadata}


__all__ = ("arsiv_node",)
