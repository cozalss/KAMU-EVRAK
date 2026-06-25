"""EvrakState → YaziContext köprüsü + resmî üslupta metin gövdesi üretimi.

`yazi_taslak_node` ince kalsın diye (CLAUDE.md: fonksiyon <50 satır) bağlam
kurulumu ve gövde üretimi buraya taşındı.

Metin gövdesi:
  - mock/anahtarsız: deterministik şablon-tabanlı (LLM YOK) — test/CI güvenli.
  - openai/llamacpp: get_llm ile resmî üslupta (3. tekil/edilgen, kısa-açık;
    Yön. 2646 m.5/üslup). Çıkarılan olgular DIŞINDA kurum/tarih/sayı UYDURMAZ.

SIFIR UYDURMA: gövde yalnız evraktan çıkarılan unsurlara (konu/talep/ilgi)
dayanır; somut veri yoksa nötr çerçeve cümlesi kurulur (sahte sayı/kişi yok).
"""

from __future__ import annotations

from datetime import date
from typing import Any

import structlog

from agents.config import YAZI_TURU_TR
from yazi.models import YaziContext
from yazi.template_registry import default_kapanis, resolve_yazi_turu

log = structlog.get_logger()

# Gövde üretimi için LLM system prompt (Yön. 2646 m.5 resmî üslup).
_BODY_SYSTEM = (
    "Sen bir kamu kurumu yazı işleri uzmanısın. Resmî Yazışmalarda Uygulanacak "
    "Usul ve Esaslar Hakkında Yönetmelik (CB 2646/2020) üslubuna uygun, KISA "
    "(2-4 cümle) bir yazı GÖVDESİ yaz: 3. tekil/edilgen kip, açık ve resmî dil, "
    "argo/kısaltma yok. SADECE verilen bilgilere dayan; kurum adı, kişi adı, "
    "tarih, sayı, madde no UYDURMA. Yalnız gövde metnini döndür (başlık/imza yazma)."
)


def _olcu_meta(unsurlar: dict[str, Any]) -> dict[str, str]:
    """olur türü için teklif/onay alanlarını unsurlardan derle (eksik → placeholder)."""
    return {
        "teklif_eden": str(unsurlar.get("teklif_eden", "") or ""),
        "talep": str(unsurlar.get("olur_talep", "") or ""),
    }


def _fallback_body(yazi_turu: str, konu: str, has_ilgi: bool) -> str:
    """LLM yokken deterministik, uydurmasız gövde (test/CI). Yalnız konuya değinir."""
    konu_ifade = konu if konu else "ilgili konu"
    if yazi_turu == "cevabi_yazi" or has_ilgi:
        return (
            f"İlgi yazıda belirtilen \"{konu_ifade}\" konusu kurumumuzca incelenmiştir. "
            "Yapılan değerlendirme sonucu aşağıda arz/rica edilmektedir."
        )
    if yazi_turu == "olur":
        return (
            f"\"{konu_ifade}\" hususunda gereğinin yapılması için makamınızca uygun "
            "görülmesi hâlinde onayınıza arz edilen teklif sunulmuştur."
        )
    if yazi_turu == "bilgilendirme":
        return (
            f"\"{konu_ifade}\" konusuna ilişkin olarak ilgili birim ve kişilerin "
            "bilgilendirilmesi gereği duyulmuştur."
        )
    return (
        f"\"{konu_ifade}\" konusuna ilişkin gerekli işlemlerin yapılması "
        "hususunu içeren bu yazı tanzim edilmiştir."
    )


async def build_body(
    yazi_turu: str, unsurlar: dict[str, Any], evrak_text: str,
) -> str:
    """Resmî üslupta gövde metni üret (LLM varsa get_llm; yoksa deterministik)."""
    konu = str(unsurlar.get("konu", "") or "")
    has_ilgi = bool(unsurlar.get("sayi") or unsurlar.get("tarih"))
    try:
        from agents.llm import ChatMessage, MockLLM, get_llm

        llm = get_llm()
        if isinstance(llm, MockLLM):  # mock → deterministik (mock metni resmî değil)
            return _fallback_body(yazi_turu, konu, has_ilgi)
        prompt = (
            f"Yazı türü: {YAZI_TURU_TR.get(yazi_turu, yazi_turu)}\n"
            f"Konu: {konu or '(belirtilmemiş)'}\n"
            f"Kaynak evrak (özet): {evrak_text[:1200]}"
        )
        resp = await llm.chat(
            [ChatMessage(role="system", content=_BODY_SYSTEM),
             ChatMessage(role="user", content=prompt)],
            temperature=0.2, max_tokens=320,
        )
        body = (resp.content or "").strip()
        return body or _fallback_body(yazi_turu, konu, has_ilgi)
    except Exception as exc:  # LLM hata → deterministik fallback (node patlamaz)
        log.warning("yazi_body_llm_failed", err=str(exc))
        return _fallback_body(yazi_turu, konu, has_ilgi)


def build_context(
    yazi_turu: str, unsurlar: dict[str, Any], metin: str,
) -> YaziContext:
    """EvrakState bilgi_unsurları + üretilen gövde → YaziContext (placeholder-safe)."""
    turu = resolve_yazi_turu(yazi_turu)
    return YaziContext(
        yazi_turu=turu,
        tarih=date.today().strftime("%d.%m.%Y"),
        konu=str(unsurlar.get("konu", "") or ""),
        metin=metin,
        ilgi_tarih=str(unsurlar.get("tarih", "") or ""),
        ilgi_sayi=str(unsurlar.get("sayi", "") or ""),
        kapanis=default_kapanis(turu),
        olur_alanlari=_olcu_meta(unsurlar) if turu == "olur" else {},
    )


__all__ = ("build_body", "build_context")
