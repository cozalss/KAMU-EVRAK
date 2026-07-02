"""Görev 2 — Doğrulama (verify) node'u: format-uyum + uydurma veto.

Şartname Görev 2 kalite kapısı: üretilen resmî yazı taslağı (1) zorunlu bölümleri
(T.C./Sayı/Konu/imza — Yön. 2646) içermeli ve (2) kaynak evrakta OLMAYAN somut
kurum/tarih/sayı UYDURMAMALI (CLAUDE.md §1 — hukuki/somut referans uydurma yasağı).

Tasarım (anti-halüsinasyon): tespit DETERMİNİSTİK regex/heuristik — tarih ve evrak
sayısı taslakta görünüyor ama `bilgi_unsurlari`'nda (doğrulanmış kaynak) ya da ham
evrak metninde YOKSA "uydurulmuş" sayılır ve veto uyarısı eklenir. Placeholder
(`{{ ... }}`) ve şablon ifadeleri muaf (henüz doldurulmamış → uydurma değil).

ADDITIVE / passthrough: state'i ASLA bozmaz; yalnız `verify_notes` + `verify_uyari`
+ (varsa) `format_uyumlu` günceller. VERIFY_ENABLED=0 → no-op (boş dict döner).
LLM opsiyoneldir; varsayılan saf-deterministik (anahtarsız demo deterministik kalır).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

import structlog

from agents.config import (
    LINT_AUTOFIX,
    VERIFY_ENABLED,
    VERIFY_GROUNDING_LLM,
    YAZI_ZORUNLU_BOLUMLER,
)
from agents.nodes._llm_extract import llm_json
from agents.tutarlilik import tutarlilik_kontrol
from agents.yazi_lint import lint_2646
from api.pii import mask_pii
from core.text import tr_lower

log = structlog.get_logger()

# Madde 6 — grounding uyarı sanite sınırları (LLM çıktısına körü körüne güvenilmez).
_GROUNDING_MAX_IDDIA = 5
_GROUNDING_MAX_KARAKTER = 200

# Taslaktaki somut tarih / evrak-sayısı (cikar.py ile aynı desen — tutarlı tespit).
_RE_TARIH = re.compile(r"\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}\b")
_RE_SAYI = re.compile(r"\bE?-?\d{6,}[-/.\d]*\b")
# Henüz doldurulmamış jinja/şablon placeholder'ları — uydurma DEĞİL, muaf.
_RE_PLACEHOLDER = re.compile(r"\{\{.*?\}\}", re.DOTALL)


def _eksik_bolumler(taslak_lower: str) -> list[str]:
    """Zorunlu format bölümlerinden taslakta bulunmayanların etiketlerini döndür."""
    eksik: list[str] = []
    for etiket, anahtarlar in YAZI_ZORUNLU_BOLUMLER:
        if not any(a in taslak_lower for a in anahtarlar):
            eksik.append(etiket)
    return eksik


def _kaynak_tokenlar(state: dict[str, Any]) -> tuple[set[str], set[str]]:
    """Doğrulanmış kaynaktan (bilgi_unsurlari + ham evrak) tarih/sayı token kümeleri.

    Taslaktaki somut değerler bu kümelerde yoksa "uydurma" sayılır. Ham evrak da
    dahildir: çıkarımda kaçan ama belgede gerçekten var olan değerler veto'lanmasın.
    Ayrıca taslağın üretildiği günün tarihi giden yazı tarihi olarak meşrudur; kaynak
    evrakta bulunması beklenmez.
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    evrak_text = state.get("evrak_text", "") or ""
    kaynak = f"{evrak_text} {unsurlar.get('tarih', '')} {unsurlar.get('sayi', '')}"
    tarihler = set(_RE_TARIH.findall(kaynak))
    tarihler.add(date.today().strftime("%d.%m.%Y"))
    sayilar = set(_RE_SAYI.findall(kaynak))
    return tarihler, sayilar


def _uydurma_veto(taslak: str, state: dict[str, Any]) -> list[str]:
    """Taslakta olup kaynakta olmayan somut tarih/sayı → uydurma uyarısı listesi."""
    # Placeholder bloklarını çıkar — boş şablon alanı uydurma sayılmaz.
    govde = _RE_PLACEHOLDER.sub(" ", taslak)
    kaynak_tarih, kaynak_sayi = _kaynak_tokenlar(state)
    uyarilar: list[str] = []
    for tarih in set(_RE_TARIH.findall(govde)):
        if tarih not in kaynak_tarih:
            uyarilar.append(f"Taslaktaki '{tarih}' tarihi kaynak evrakta yok (doğrulayın).")
    for sayi in set(_RE_SAYI.findall(govde)):
        if sayi not in kaynak_sayi:
            uyarilar.append(f"Taslaktaki '{sayi}' sayısı kaynak evrakta yok (doğrulayın).")
    return uyarilar


async def _lint_autofix(taslak: str, lint: dict[str, Any],
                        state: dict[str, Any]) -> str | None:
    """Madde 2 — lint ihlalleri için LLM düzeltme önerisi (deterministik doğrulamalı).

    Kabul zinciri (LLM'e güvenilmez): (1) çıktı boş-olmayan string; (2) yeniden-lint
    uyarı sayısı AZALMALI; (3) düzeltme kaynakta olmayan YENİ tarih/sayı içermemeli
    (_uydurma_veto boş). Herhangi biri tutmazsa öneri sessizce düşürülür — mevcut
    davranış birebir. Mevcut taslak hiçbir durumda otomatik değişmez (yalnız öneri).
    """
    cevap = await llm_json(
        "Resmî Yazışma Yönetmeliği (CB 2646/2020) format düzelticisisin. Sana bir resmî "
        "yazı taslağı ve tespit edilmiş format ihlalleri verilecek. YALNIZ işaretli format "
        "ihlallerini düzelt; içerik/tarih/sayı EKLEME ve DEĞİŞTİRME; yeni bilgi uydurma. "
        'YALNIZ şu JSON\'u döndür: {"duzeltilmis_taslak": "<düzeltilmiş tam taslak>"}',
        "TASLAK:\n" + taslak + "\n\nFORMAT İHLALLERİ:\n"
        + "\n".join(f"- {u}" for u in lint.get("uyari", [])),
        max_tokens=900,
    )
    if not isinstance(cevap, dict):
        return None
    duzeltme = cevap.get("duzeltilmis_taslak")
    if not isinstance(duzeltme, str) or not duzeltme.strip():
        return None
    yeni_lint = lint_2646(duzeltme, state.get("yazi_turu", "") or "")
    if len(yeni_lint.get("uyari", [])) >= len(lint.get("uyari", [])):
        return None  # iyileşme yok → öneri değersiz
    if _uydurma_veto(duzeltme, state):
        return None  # düzeltme yeni somut veri uydurdu → reddet
    return duzeltme


async def _grounding_iddialar(taslak: str, state: dict[str, Any]) -> list[str]:
    """Madde 6 — iddia-düzeyi grounding: taslakta kaynağa dayanmayan somut iddialar.

    GÜVENLİK ASİMETRİSİ: dönen iddialar verify_uyari'ye 'kaynak evrakta yok' imzasıyla
    EKLENİR (risk_guard otomatik KIRMIZI'ya çevirir); deterministik regex veto hiçbir
    durumda silinmez/yumuşatılmaz. Girdi maskeli metin (PII sızmaz); çıktı sanite
    süzgecinden geçer (yalnız string, ≤5 iddia, ≤200 karakter).
    """
    kaynak_maskeli = mask_pii(state.get("evrak_text", "") or "").masked_text
    cevap = await llm_json(
        "Kamu evrak doğrulama denetçisisin. Taslaktaki her SOMUT iddiayı (kurum adı, kişi, "
        "mevzuat madde numarası, tutar, taahhüt) kaynak evrakla karşılaştır. YALNIZ kaynakta "
        "hiçbir biçimde dayanağı olmayan iddiaları listele; biçim farkı (ayraç/format) iddia "
        'DEĞİLDİR. YALNIZ şu JSON\'u döndür: {"desteklenmeyen_iddialar": ["..."]}',
        "KAYNAK EVRAK:\n" + kaynak_maskeli[:3000] + "\n\nTASLAK:\n" + taslak[:3000],
        max_tokens=400,
    )
    if not isinstance(cevap, dict) or not isinstance(cevap.get("desteklenmeyen_iddialar"), list):
        return []
    temiz = [i.strip()[:_GROUNDING_MAX_KARAKTER]
             for i in cevap["desteklenmeyen_iddialar"]
             if isinstance(i, str) and i.strip()]
    return [f"Taslaktaki iddia kaynak evrakta yok (LLM grounding): {i}"
            for i in temiz[:_GROUNDING_MAX_IDDIA]]


async def verify_node(state: dict[str, Any]) -> dict[str, Any]:
    """Taslak format-uyumu + uydurma veto — additive passthrough (state bozmaz)."""
    if not VERIFY_ENABLED:
        return {}  # no-op: grafta var ama kapalı (baseline davranış korunur)

    # S2 — kaynak evrak veri-tutarlılığı taslaktan bağımsız denetlenir (TCKN checksum,
    # gelecek tarih, m.11 sayı deseni); taslak yoksa da raporlanır.
    # PII güvenliği (CRITICAL guard): uyarı metinleri TCKN-şekilli ham sayı taşıyabilir
    # ve /process_doc/stream ara SSE event'leri _to_response maskesini ATLAR → maskeleme
    # state'e girmeden BURADA yapılır (risk_guard.gerekceler ile aynı desen) — REST, SSE,
    # DB persist ve her gelecek tüketici otomatik korunur.
    tutarlilik = [mask_pii(u).masked_text for u in tutarlilik_kontrol(
        state.get("evrak_text", "") or "", state.get("bilgi_unsurlari") or {}
    )]

    taslak = state.get("yazi_taslak_md", "") or ""
    if not taslak:
        return {"verify_notes": "Taslak bulunamadı — doğrulama atlandı.",
                "verify_uyari": [], "tutarlilik_uyari": tutarlilik}

    eksik = _eksik_bolumler(tr_lower(taslak))
    uydurma = _uydurma_veto(taslak, state)
    # Uydurma-veto mesajları taslaktaki HAM tarih/sayı token'ını içerir (TCKN-şekilli
    # olabilir) → SSE'ye maskesiz gitmesin diye state'e girmeden maskelenir.
    uyarilar = [mask_pii(u).masked_text for u in uydurma] + [f"Eksik bölüm: {e}" for e in eksik]
    # S2 — madde-referanslı 2646 lint raporu (kural-kimlikli; risk'e yalnız 'uyari' gider).
    lint = lint_2646(taslak, state.get("yazi_turu", "") or "")

    # Madde 6 — LLM grounding: yalnız uyarı EKLER (bandı sertleştirme yönü serbest;
    # deterministik veto her durumda üstte kalır). LLM yok/mock/bozuk → hiçbir ek yok.
    if VERIFY_GROUNDING_LLM:
        uyarilar += [mask_pii(u).masked_text
                     for u in await _grounding_iddialar(taslak, state)]

    # Madde 2 — lint auto-fix önerisi: yalnız ihlal VARSA çağrılır (maliyet disiplini).
    lint_duzeltme: str | None = None
    if LINT_AUTOFIX and lint.get("uyari"):
        lint_duzeltme = await _lint_autofix(taslak, lint, state)

    notlar = (
        "Doğrulama tamam — format zorunlu bölümleri mevcut, uydurma somut veri yok."
        if not uyarilar
        else f"Doğrulama {len(uyarilar)} uyarı buldu: " + " | ".join(uyarilar)
    )
    if lint["uyari"] or tutarlilik:
        notlar += (f" 2646 lint: {lint['ozet']['gecti']} kural geçti, "
                   f"{len(lint['uyari'])} uyarı; tutarlılık: {len(tutarlilik)} uyarı.")
    out: dict[str, Any] = {"verify_notes": notlar, "verify_uyari": uyarilar,
                           "lint_2646": lint, "tutarlilik_uyari": tutarlilik}
    if lint_duzeltme:
        out["lint_duzeltme_md"] = lint_duzeltme
    # format_uyumlu yalnız ZAYIFLATMA yönünde güncellenir (eksik bölüm → False).
    if eksik:
        out["format_uyumlu"] = False
    log.info("verify", eksik=eksik, uydurma=len(uydurma),
             lint_uyari=len(lint["uyari"]), tutarlilik=len(tutarlilik),
             lint_duzeltme=bool(lint_duzeltme))
    return out


__all__ = ("verify_node",)
