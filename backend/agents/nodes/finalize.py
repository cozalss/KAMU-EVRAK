"""Finalize — pipeline çıktısını kullanıcıya bilgilendirme metnine topla (Görev 2 son adım).

Şartname Görev 2: "Kullanıcıya süreç hakkında açık ve anlaşılır bilgilendirme sunma" +
"gerekli durumlarda eksik bilgi talep edebilme". Bu node iki görevin çıktısını birleştirir.

# TODO(kamu-evrak): STUB deterministik metin birleştirir. Üretimde compose/LLM ile
# daha akıcı bilgilendirme + ADALET nodes/finalize.py disclaimer/sunum deseni.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import birim_tr, evrak_turu_tr

log = structlog.get_logger()


async def finalize_node(state: dict[str, Any]) -> dict[str, Any]:
    """Görev 1+2 sonuçlarını tek bilgilendirme metninde topla."""
    turu = evrak_turu_tr(state.get("evrak_turu", "belirsiz"))
    birim = birim_tr(state.get("hedef_birim", "yazi_isleri_evrak"))
    eksik = state.get("eksik_alanlar") or []
    sorular = state.get("clarify_questions") or []
    # CRAG düzeltme yaptıysa düzeltilmiş öneriler tercih edilir (yoksa baseline liste).
    mevzuat = state.get("mevzuat_onerileri_corrected") or state.get("mevzuat_onerileri") or []

    satirlar = [
        f"📄 **Evrak türü:** {turu}",
        f"➡️ **Önerilen birim:** {birim}",
    ]
    if mevzuat:
        satirlar.append("📚 **İlgili mevzuat:** " + "; ".join(m["baslik"] for m in mevzuat[:3]))
    if state.get("ozet"):
        satirlar.append(f"📝 **Özet:** {state['ozet']}")
    # Arşivleme (SDP 2005/7) — bir satır bilgilendirme (additive; arsiv_node üretti).
    arsiv = state.get("arsiv_metadata") or {}
    if arsiv.get("sdp_kodu"):
        satirlar.append(
            f"🗄️ **Arşiv (SDP 2005/7):** dosya kodu {arsiv['sdp_kodu']}, "
            f"saklama süresi {arsiv.get('saklama_suresi', '—')}"
        )
    if eksik:
        satirlar.append(f"⚠️ **Eksik bilgi ({len(eksik)}):** " + ", ".join(eksik))
        if sorular:
            satirlar.append("❓ **Tamamlanması gerekenler:**\n" + "\n".join(f"- {s}" for s in sorular))
    else:
        satirlar.append("✅ Zorunlu alanlar tam — resmî yazı taslağı hazırlandı.")

    bilgilendirme = "\n\n".join(satirlar)
    log.info("finalize", turu=turu, birim=birim, eksik=len(eksik))
    return {"response": bilgilendirme, "bilgilendirme": bilgilendirme}


__all__ = ("finalize_node",)
