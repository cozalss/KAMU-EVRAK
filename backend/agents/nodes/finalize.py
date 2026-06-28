"""Finalize — pipeline çıktısını kullanıcıya bilgilendirme metnine topla (Görev 2 son adım).

Şartname Görev 2: "Kullanıcıya süreç hakkında açık ve anlaşılır bilgilendirme sunma" +
"gerekli durumlarda eksik bilgi talep edebilme". Bu node iki görevin çıktısını birleştirir.

GERÇEK LLM (DeepSeek) yapılandırılmış sonuçtan AKICI, resmî bir bilgilendirme yazar; bilgi
UYDURMAZ (yalnız verilenleri kullanır). LLM yok/mock/hata → deterministik metin birleştirme
(test-edilebilir, tahmin-edilebilir) aynen devreye girer.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import birim_tr, evrak_turu_tr
from agents.nodes._llm_extract import llm_text

log = structlog.get_logger()


async def finalize_node(state: dict[str, Any]) -> dict[str, Any]:
    """Görev 1+2 sonuçlarını tek bilgilendirme metninde topla."""
    turu = evrak_turu_tr(state.get("evrak_turu", "belirsiz"))
    birim = birim_tr(state.get("hedef_birim", "yazi_isleri_evrak"))
    eksik = state.get("eksik_alanlar") or []
    sorular = state.get("clarify_questions") or []
    # CRAG düzeltme yaptıysa düzeltilmiş öneriler tercih edilir (yoksa baseline liste).
    mevzuat = state.get("mevzuat_onerileri_corrected") or state.get("mevzuat_onerileri") or []

    # Kurumsal/resmî üslup: kalın etiketler tarama için yeter; emoji kullanılmaz
    # (frontend ikon çiplerini kendi katmanında SVG ile sağlar — tutarlı, jenerik-olmayan UI).
    satirlar = [
        f"**Evrak türü:** {turu}",
        f"**Önerilen birim:** {birim}",
    ]
    if mevzuat:
        satirlar.append("**İlgili mevzuat:** " + "; ".join(m["baslik"] for m in mevzuat[:3]))
    if state.get("ozet"):
        satirlar.append(f"**Özet:** {state['ozet']}")
    # Arşivleme (SDP 2005/7) — bir satır bilgilendirme (additive; arsiv_node üretti).
    arsiv = state.get("arsiv_metadata") or {}
    if arsiv.get("sdp_kodu"):
        satirlar.append(
            f"**Arşiv (SDP 2005/7):** dosya kodu {arsiv['sdp_kodu']}, "
            f"saklama süresi {arsiv.get('saklama_suresi', '—')}"
        )
    if eksik:
        satirlar.append(f"**Eksik bilgi ({len(eksik)}):** " + ", ".join(eksik))
        if sorular:
            satirlar.append("**Tamamlanması gerekenler:**\n" + "\n".join(f"- {s}" for s in sorular))
    else:
        satirlar.append("**Zorunlu alanlar tam** — resmî yazı taslağı hazırlandı.")

    det_bilgilendirme = "\n\n".join(satirlar)

    # DeepSeek ile akıcı bilgilendirme (gerçek LLM'de); başarısız/mock → deterministik metin.
    # Yalnız yapılandırılmış sonuç verilir (ham evrak metni DEĞİL) — özet zaten LLM-üretimi.
    mevzuat_str = "; ".join(m["baslik"] for m in mevzuat[:3]) if mevzuat else "yok"
    arsiv = state.get("arsiv_metadata") or {}
    facts = (
        f"Evrak türü: {turu}\n"
        f"Önerilen birim: {birim}\n"
        f"İlgili mevzuat: {mevzuat_str}\n"
        f"Özet: {state.get('ozet') or '—'}\n"
        f"Arşiv (SDP 2005/7): {arsiv.get('sdp_kodu', 'yok')}\n"
        f"Eksik zorunlu alanlar: {', '.join(eksik) if eksik else 'yok'}\n"
        f"Tamamlanması istenecekler: {'; '.join(sorular) if sorular else 'yok'}"
    )
    llm_metin = await llm_text(
        system=(
            "Sen bir kamu kurumunda memura yardımcı olan asistansın. Verilen yapılandırılmış "
            "sonuçtan; vatandaşa/memura yönelik AÇIK, RESMÎ ve AKICI bir bilgilendirme yaz.\n"
            "KESİN KURALLAR:\n"
            "1) Yalnız sana verilen bilgileri kullan; HİÇBİR ŞEY UYDURMA.\n"
            "2) MEVZUAT: yalnızca 'İlgili mevzuat' satırındaki başlıkları AYNEN kullan. "
            "ASLA yeni kanun adı, kanun numarası veya madde numarası ekleme/uydurma. "
            "'İlgili mevzuat: yok' ise mevzuattan HİÇ bahsetme.\n"
            "3) Kısa tut: 1 kısa paragraf + gerekirse madde listesi. Eksik alan varsa nazikçe "
            "tamamlanmasını iste. Emoji kullanma."
        ),
        user=facts,
        max_tokens=400,
    )
    bilgilendirme = llm_metin or det_bilgilendirme
    log.info("finalize", turu=turu, birim=birim, eksik=len(eksik), llm=bool(llm_metin))
    return {"response": bilgilendirme, "bilgilendirme": bilgilendirme}


__all__ = ("finalize_node",)
