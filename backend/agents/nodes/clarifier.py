"""Görev 2 — Dur-ve-sor (clarifier) node'u: kritik eksik bilgide kullanıcıdan talep.

Şartname Görev 2: "gerekli durumlarda eksik bilgi talep edebilme". Eksik-alan tespiti
zaten `eksik_tespit` node'unda yapılır (clarify_questions üretilir). Bu node, KRİTİK
eksik (dilekçe 3071 m.4: ad-soyad / imza / iletişim-adres) varsa akışı durdurup
kullanıcıya net "şu bilgileri tamamlayın" mesajı üretir ve `want_stop` işaretler.

ENV-gated (CLARIFY_STOP_ENABLED): grafta yalnız bayrak açıkken devreye girer; KAPALI
iken (varsayılan) bu node hiç çağrılmaz → mevcut akış (taslak hep üretilir) korunur.
Taslak ÜRETMEDEN finalize'a gider → kullanıcıdan eksik tamamlanması beklenir.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import CLARIFY_KRITIK_ALANLAR

log = structlog.get_logger()

# Kritik alan → kullanıcıya net talep mesajı (3071 m.4 dayanaklı, uydurmasız).
# NOT: anahtarlar config.CLARIFY_KRITIK_ALANLAR ile BİREBİR örtüşür. 'gonderen_ad_soyad'
# bilerek YOK: LLM-yapısal alandır, mock modda her dilekçede eksik görünür → kritik
# sayılmaz (CLARIFY_KRITIK_ALANLAR'a dahil değil); buraya eklenirse ASLA erişilmeyen
# ölü kayıt olurdu (ECC LOW-6). Yeni kritik alan eklenirse İKİSİ birlikte güncellenir.
_KRITIK_TALEP: dict[str, str] = {
    "imza": "Islak/elektronik imza",
    "iletisim_adres": "İletişim/tebligat adresi (veya telefon)",
}


def kritik_eksikler(state: dict[str, Any]) -> list[str]:
    """Dilekçe için 3071 m.4 kritik alanlardan eksik olanları döndür (saf yardımcı).

    Yalnız 'dilekce' türünde kritik kabul edilir (resmî yazı kurum→kurum farklıdır).
    `eksik_alanlar` (eksik_tespit çıktısı) ile kesişim — yeni tespit yapılmaz (DRY).
    """
    if state.get("evrak_turu") != "dilekce":
        return []
    eksik = set(state.get("eksik_alanlar") or [])
    return [a for a in CLARIFY_KRITIK_ALANLAR if a in eksik]


def _dur_ve_sor_mesaji(kritik: list[str], sorular: list[str]) -> str:
    """Net 'eksik bilgileri tamamlayın' bilgilendirme metni (deterministik)."""
    talepler = [_KRITIK_TALEP.get(a, a) for a in kritik]
    satirlar = [
        "⛔ **Evrak işleme alınamadı — kritik bilgiler eksik.**",
        "3071 sayılı Kanun m.4 gereği aşağıdaki bilgiler tamamlanmadan dilekçe incelenemez:",
        "\n".join(f"- {t}" for t in talepler),
    ]
    if sorular:
        satirlar.append("Lütfen şu bilgileri ekleyip evrağı yeniden gönderin:")
        satirlar.append("\n".join(f"- {s}" for s in sorular))
    return "\n\n".join(satirlar)


async def clarifier_node(state: dict[str, Any]) -> dict[str, Any]:
    """Kritik eksik varsa dur-ve-sor mesajı + want_stop üret; yoksa passthrough.

    NOT: graf conditional-edge zaten yalnız kritik-eksikte buraya yönlendirir;
    yine de savunmacı kontrol — boş kritik → mesaj üretmeden geçer (state bozmaz).
    """
    kritik = kritik_eksikler(state)
    if not kritik:
        return {"clarify_stop": False, "want_stop": False}

    sorular = state.get("clarify_questions") or []
    mesaj = _dur_ve_sor_mesaji(kritik, sorular)
    log.info("clarifier_stop", kritik=kritik, n_soru=len(sorular))
    return {
        "want_stop": True,
        "clarify_stop": True,
        "response": mesaj,
        "bilgilendirme": mesaj,
    }


__all__ = ("clarifier_node", "kritik_eksikler")
