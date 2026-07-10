"""Görev 2 (yenilikçilik) — Risk bandı (trafik ışığı) + koşullu HITL kapısı.

Kamu gerçeği: kurum "yapay zeka çıktısını gözden geçirmeden gönderemeyiz" der. Bu node
üretilen resmî yazıya bir TRAFİK IŞIĞI atar ve koşullu onayı tetikler:

  🟢 YEŞİL  (yayın-hazır): her şey kaynaktan, format tam, şüphe yok → memur uğraşmaz.
  🟡 SARI   (memur incelesin): format eksik / [DOĞRULA] / düşük güven / eksik zorunlu alan.
  🔴 KIRMIZI(uydurma şüphesi): verify metinde OLMAYAN somut tarih/sayı yakaladı → onaysız gitmez.

Koşullu onay (graph._risk_route): YEŞİL otomatik geçer; SARI/KIRMIZI memur onayına (onay_kapisi
interrupt) düşer. Banka mantığı: küçük havale anında, büyük havale "emin misiniz?". Karar
hash-chain denetim izine (denetim_izi) düşer → "kim neyi onayladı" → denetlenebilir güven.

Tasarım: KARAR DETERMİNİSTİK — bandı `verify`'nin ürettiği sinyallerden (verify_uyari,
format_uyumlu) + eksik_alanlar + tür güveni + taslaktaki [DOĞRULA] sayısından türetir. Kararda
LLM YOK → halüsinasyon yok, banttan bant farklı çıkmaz. LLM yalnız SUNUMDA: SARI/KIRMIZI'da
memura sade dil 'aciklama' üretir (config.RISK_ACIKLAMA_LLM; fallback = oneri metni). ADDITIVE:
yalnız risk_metadata ekler (state'i bozmaz → denetim_izi hash-chain'i kırılmaz). ENV-gated
(RISK_GUARD_ENABLED); kapalı → no-op.

Çıktı SÖZLEŞMESİ (frontend RiskBandCard ile eşleşir — anahtarlar SABİT):
    risk_metadata = {
        "bant": "yesil"|"sari"|"kirmizi",
        "skor": float,              # 0..1 — ÖLÇÜLMÜŞ (risk_agirlik.noisy_or)
        "gerekceler": list[str],    # bandın NEDEN'leri (memura okunur)
        "katkilar": list[float],    # gerekceler[i]'nin KENDİ ağırlığı (çubuk yüksekliği)
        "kalibrasyon": str,         # "olculdu"|"kismi"|"onsel"|"temiz" — skorun statüsü
        "oneri": str,               # eylem önerisi
        "aciklama": str,            # sade dil açıklama (LLM sunum; LLM yoksa = oneri)
    }

SKOR ARTIK SABİT DEĞİL. Eskiden banda göre sabitti ({yesil:0.1, sari:0.5, kirmizi:0.9}) ve
arayüz onu gerekçe sayısına bölüyordu → kanıt arttıkça çubuk küçülüyor, hafif SARI belge
ağır KIRMIZI'dan büyük görünüyordu. Şimdi skor = noisy-OR(ciddiyet × ÖLÇÜLEN isabet);
ayrıntı + kalibrasyon yöntemi: `agents/risk_agirlik.py` + `eval/risk_calibration.py`.
BANT KARARI DEĞİŞMEDİ: aşağıdaki kural sırası (uydurma > eksik/belirsiz > temiz) aynen
korunur — skor bandı asla değiştirmez, yalnız onu ölçer.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents import config
from agents.config import RISK_GUARD_ENABLED, RISK_GUVEN_ESIK
from agents.nodes._llm_extract import llm_json
from agents.risk_agirlik import skor_ve_katkilar
from api.pii import mask_pii

log = structlog.get_logger()

# verify_uyari içindeki uydurma sinyalinin imzası (verify.py _uydurma_veto mesajı).
_UYDURMA_IMZA = "kaynak evrakta yok"
_EKSIK_IMZA = "Eksik bölüm"

# Memura DOĞRUDAN hitap eden eylem cümleleri (arayüzde "Ne yapmalısınız:" satırı). Jargon yok:
# 'yayın-hazır', 'HITL', 'grounding' gibi terimler burada geçmez — okuyucu yazılımcı değil memurdur.
_ONERI: dict[str, str] = {
    "yesil": "Bu taslak gönderilmeye hazır: bilgiler evraktan geldi, biçim kuralları tam. "
             "Ayrıca onaylamanıza gerek yok.",
    "sari": "Göndermeden önce taslağı bir kez okuyun: eksik veya belirsiz noktalar var. "
            "Aşağıdaki nedenleri tek tek kontrol edin.",
    "kirmizi": "Bu taslağı onaylamadan göndermeyin. Yapay zekâ, evrakta bulunmayan bilgiler "
               "eklemiş olabilir; aşağıdaki her maddeyi evrakla karşılaştırıp düzeltin.",
}
def _bant_sonuc(bant: str, gerekceler: list[str]) -> dict[str, Any]:
    """Bant + gerekçelerden ÖLÇÜLMÜŞ skor/katkı üret (bant kararı çağırana aittir).

    YEŞİL'de gerekçe bir risk sinyali değil, bilgi cümlesidir ("tüm doğrulamalar temiz")
    → skor 0.0, çubuk yok. Aksi hâlde taksonomi ağırlıklarıyla noisy-OR.
    """
    if bant == "yesil":
        return {"bant": bant, "skor": 0.0, "gerekceler": gerekceler,
                "katkilar": [0.0] * len(gerekceler), "kalibrasyon": "temiz",
                "oneri": _ONERI[bant]}
    skor, katkilar, kalibrasyon = skor_ve_katkilar(gerekceler)
    return {"bant": bant, "skor": skor, "gerekceler": gerekceler, "katkilar": katkilar,
            "kalibrasyon": kalibrasyon, "oneri": _ONERI[bant]}

# Zorunlu-alan anahtarı → kısa Türkçe etiket (risk gerekçesi okunur olsun; ham anahtar gösterilmez).
_ALAN_TR: dict[str, str] = {
    "gonderen_ad_soyad": "gönderen ad-soyad", "tckn_veya_kurum": "TCKN/kurum",
    "tarih": "tarih", "konu": "konu", "talep": "talep",
    "iletisim_adres": "iletişim/adres", "imza": "imza",
}


def compute_risk(
    verify_uyari: list[str],
    *,
    format_uyumlu: bool,
    eksik_alanlar: list[str],
    tur_confidence: float,
    evrak_turu: str,
    taslak: str,
    lint_uyari: list[str] | None = None,
    tutarlilik_uyari: list[str] | None = None,
) -> dict[str, Any]:
    """verify sinyalleri + tamlık → risk bandı (SAF, deterministik).

    Öncelik: uydurma (KIRMIZI) > eksik/belirsiz (SARI) > temiz (YEŞİL). Uydurma baskındır:
    hem uydurma hem eksik varsa KIRMIZI (CLAUDE.md §1 — somut uydurma en yüksek risk).
    """
    uyarilar = verify_uyari or []
    uydurma = [u for u in uyarilar if _UYDURMA_IMZA in u]
    if uydurma:
        gerekceler = [f"Uydurma şüphesi — {u}" for u in uydurma]
        return _bant_sonuc("kirmizi", gerekceler)

    sari: list[str] = [u for u in uyarilar if u.startswith(_EKSIK_IMZA)]
    if format_uyumlu is False and not sari:
        sari.append("Resmî yazı zorunlu format bölümleri eksik")
    dogrula = taslak.count("[DOĞRULA")
    if dogrula:
        sari.append(f"{dogrula} alan doğrulanmalı ([DOĞRULA] işareti)")
    if eksik_alanlar:
        etiketler = [_ALAN_TR.get(a, a) for a in eksik_alanlar[:3]]
        sari.append(f"Eksik zorunlu bilgi: {', '.join(etiketler)}")
    if evrak_turu == "belirsiz":
        sari.append("Evrak türü belirsiz (sınıflandırma abstention)")
    elif tur_confidence is not None and tur_confidence < RISK_GUVEN_ESIK:
        # 0.0 dahil — "hiç güven yok" da SARI'dır (falsy tuzağına düşme).
        sari.append(f"Düşük sınıflandırma güveni ({tur_confidence:.2f})")
    # S2 — 2646 lint kesin ihlalleri + veri-tutarlılık uyarıları SARI sinyalidir
    # (lint 'bilgi' seviyesi buraya HİÇ gelmez — yazi_lint yalnız 'uyari' listesini verir).
    for u in lint_uyari or []:
        sari.append(f"Format (2646 lint): {u}")
    for u in tutarlilik_uyari or []:
        sari.append(f"Tutarlılık: {u}")

    if sari:
        return _bant_sonuc("sari", sari)
    return _bant_sonuc(
        "yesil", ["Tüm doğrulamalar temiz — kaynaktan, format tam, uydurma yok."])


# (4) Doğal dil açıklaması — LLM yalnız SUNAR, karara asla karışmaz. Bant/gerekçe zaten
# hesaplanmış olarak verilir; prompt bandı değiştirme girişimini yasaklar (yine de çıktının
# yalnız 'aciklama' alanı okunur → LLM saçmalasa bile karar anahtarlarına dokunamaz).
_ACIKLAMA_SISTEM = (
    "Sen bir kamu kurumunda çalışan memura, hazırlanan resmî yazı taslağındaki sorunu anlatan "
    "asistansın. Karşındaki kişi YAZILIM BİLMEZ ve bu ekranı ilk kez kullanıyor.\n"
    "Bant ve gerekçeler SANA VERİLİR; bunları değiştiremezsin, sorgulamazsın.\n"
    "GÖREV: 2-3 cümlelik açıklama yaz: (1) taslakta ne sorun var, (2) memurun ilk yapması "
    "gereken somut adım.\n"
    "DİL KURALLARI: Memura 'siz' diye hitap et (\"kontrol etmelisiniz\"), üçüncü tekil "
    "resmî dil kurma (\"memurun ... gerekmektedir\" YASAK). Kısa ve gündelik cümleler kur.\n"
    "ŞU TERİMLERİ ASLA KULLANMA: risk bandı, skor, grounding, LLM, model, yapay zekâ modeli, "
    "abstention, prompt, sınıflandırma, lint, validasyon. Bunların yerine gündelik karşılığını "
    "yaz (ör. 'taslakta yazan ama evrakınızda bulunmayan bilgi').\n"
    "KESİN KURALLAR: yalnız verilen gerekçeleri kullan; hiçbir bilgi, kanun adı veya madde "
    "numarası UYDURMA; emoji kullanma.\n"
    'YALNIZ şu JSON nesnesini döndür: {"aciklama": "<2-3 cümle>"}'
)
# Bant kodu → memur diline açılım (LLM girdisi; frontend etiketiyle tutarlı).
_BANT_TR = {"sari": "SARI (memur incelemesi önerilir)",
            "kirmizi": "KIRMIZI (memur onayı zorunlu)"}


async def _llm_aciklama(bant: str, gerekceler: list[str], evrak_turu: str) -> str | None:
    """SARI/KIRMIZI bandını memura sade dille açıkla (LLM = sunum katmanı).

    Girdi MASKELİ gerekçelerdir (PII sözleşmesi — ham TCKN/telefon LLM'e sızmaz).
    LLM yok/mock/hata/bozuk çıktı → None; çağıran _ONERI metnine düşer (memur boş
    açıklamayla bırakılmaz).
    """
    kullanici = (
        f"Evrak türü: {evrak_turu}\n"
        f"Risk bandı: {_BANT_TR.get(bant, bant)}\n"
        "Gerekçeler:\n" + "\n".join(f"- {g}" for g in gerekceler)
    )
    obj = await llm_json(_ACIKLAMA_SISTEM, kullanici, max_tokens=220)
    metin = (obj or {}).get("aciklama")
    if not isinstance(metin, str) or not metin.strip():
        return None
    metin = metin.strip()
    # Aşırı uzun çıktı sunumu bozar (2-3 cümle sözleşmesi taşmış) → güvenilmez say.
    if len(metin) > 600:
        return None
    # LLM çıktısı da maskelenir — model PII-şekilli token üretse bile arayüze sızmaz.
    return mask_pii(metin).masked_text


async def risk_guard_node(state: dict[str, Any]) -> dict[str, Any]:
    """Risk bandını üret (additive). Koşullu onay graph._risk_route ile bağlanır."""
    if not RISK_GUARD_ENABLED:
        return {}  # node grafta yoksa buraya gelinmez; çift-guard (baseline güvence)
    # tur_confidence: None → 1.0 (yok sayma); 0.0 KORUNUR ("hiç güven yok" gerçek sinyal).
    _conf = state.get("tur_confidence")
    meta = compute_risk(
        state.get("verify_uyari", []),
        format_uyumlu=bool(state.get("format_uyumlu", True)),
        eksik_alanlar=state.get("eksik_alanlar", []) or [],
        tur_confidence=1.0 if _conf is None else float(_conf),
        evrak_turu=state.get("evrak_turu", "belirsiz"),
        taslak=state.get("yazi_taslak_md", "") or "",
        lint_uyari=(state.get("lint_2646") or {}).get("uyari", []),
        tutarlilik_uyari=state.get("tutarlilik_uyari", []) or [],
    )
    # PII güvenliği (CLAUDE.md §2): gerekçeler verify_uyari + lint_uyari + tutarlilik_uyari
    # birleşiminden türer; uydurma sayı/tarih token'ı TCKN-şekilli olabilir → arayüze/onaya
    # gitmeden maskele (verify tarafı da state'e girmeden maskeler; çift katman savunma).
    meta["gerekceler"] = [mask_pii(g).masked_text for g in meta["gerekceler"]]
    # Sade dil açıklama — additive 'aciklama'; bant/skor/gerekceler/oneri LLM'den ETKİLENMEZ.
    # Yeşilde LLM çağrılmaz (karar temiz, maliyet 0); LLM yok/hata/bozuk → oneri metni
    # (= _ONERI[bant]) — memur hiçbir durumda yönlendirmesiz kalmaz. Maskeleme SONRASI
    # çağrılır → LLM'e giden gerekçeler de maskeli (PII sözleşmesi korunur).
    aciklama = None
    if meta["bant"] in ("sari", "kirmizi") and config.RISK_ACIKLAMA_LLM:
        aciklama = await _llm_aciklama(
            meta["bant"], meta["gerekceler"], state.get("evrak_turu", "belirsiz"))
    meta["aciklama"] = aciklama or meta["oneri"]
    log.info("risk_guard", bant=meta["bant"], n_gerekce=len(meta["gerekceler"]),
             aciklama_llm=aciklama is not None)
    return {"risk_metadata": meta}


__all__ = ("compute_risk", "risk_guard_node")
