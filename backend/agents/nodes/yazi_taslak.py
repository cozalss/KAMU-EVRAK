"""Görev 2 — Resmî yazı taslaklama node'u.

Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)
formatına göre taslak iskeleti üretir: T.C. başlık / Sayı / Tarih / Konu / Muhatap /
İlgi / metin gövdesi / kapanış (hiyerarşiye göre arz/rica) / imza bloğu. Eksik alanlar
`{{ }}` placeholder olarak kalır (CLAUDE.md — uydurma yok).

# TODO(kamu-evrak): STUB string-template. Üretimde:
#   - data/templates/*.j2 (üst/cevabi/bilgilendirme/olur) + yazi/renderer.py (PDF/DOCX),
#   - metin gövdesi LLM (get_llm) ile resmî üslupta, kaynaksız iddia yok,
#   - format-compliance checklist (eval/draft_eval.py) + uydurma-kurum/tarih/sayı veto.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import structlog

from agents.config import EVRAK_TO_YAZI, YAZI_TURU_TR

log = structlog.get_logger()

_KAPANIS = {
    "ust_yazi": "Gereğini arz ederim.",
    "cevabi_yazi": "Gereğini rica ederim.",
    "bilgilendirme": "Bilgilerinize arz ederim.",
    "olur": "Olurlarınıza arz ederim.",
}


def _placeholder(unsurlar: dict[str, Any], key: str, etiket: str) -> str:
    val = unsurlar.get(key)
    return str(val) if val else "{{ " + etiket + " }}"


async def yazi_taslak_node(state: dict[str, Any]) -> dict[str, Any]:
    """Resmî yazı taslağı (markdown iskelet) üret (STUB; üretimde jinja2 + LLM gövde)."""
    turu = state.get("evrak_turu", "belirsiz")
    yazi_turu = EVRAK_TO_YAZI.get(turu, "cevabi_yazi")
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = _placeholder(unsurlar, "konu", "KONU")
    bugun = date.today().strftime("%d.%m.%Y")

    ilgi = ""
    if yazi_turu == "cevabi_yazi":
        sayi = unsurlar.get("sayi", "{{ İLGİ SAYI }}")
        tarih = unsurlar.get("tarih", "{{ İLGİ TARİH }}")
        ilgi = f"\nİlgi : {tarih} tarihli ve {sayi} sayılı yazınız.\n"

    taslak = f"""\
                                   T.C.
                          {{{{ İDARE ADI }}}}
                       {{{{ BİRİM ADI }}}}

Sayı : E-{{{{ DETSİS }}}}-{{{{ SDP }}}}-{{{{ KAYIT NO }}}}                {bugun}
Konu : {konu}

                          {{{{ MUHATAP MAKAM }}}}
{ilgi}
İlgili evrak ({YAZI_TURU_TR.get(yazi_turu, yazi_turu)}) tarafımıza ulaşmış olup
{{{{ METİN GÖVDESİ — talebin değerlendirmesi, dayanak, sonuç }}}}.

{_KAPANIS.get(yazi_turu, "Gereğini rica ederim.")}

                                              {{{{ AD SOYAD }}}}
                                              {{{{ UNVAN }}}}
"""
    log.info("yazi_taslak", turu=turu, yazi_turu=yazi_turu)
    return {"yazi_turu": yazi_turu, "yazi_taslak_md": taslak,
            "format_uyumlu": "{{" not in konu}


__all__ = ("yazi_taslak_node",)
