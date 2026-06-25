"""Görev 2 — Birim yönlendirme (havale) node'u.

config.EVRAK_TO_BIRIM birincil sinyal; içerik-temelli keyword heuristiği ile
iyileştirilir + top-k alternatif üretilir. Resmî havale akışında (docs/02 §3)
tüm evrak önce Yazı İşleri/Genel Evrak'a düşer → alternatiflere eklenir.

# TODO(kamu-evrak): Üretimde few-shot LLM / DistilBERTurk sınıflandırıcı + maliyet-
#   ağırlıklı hata matrisi (yanlış havale pahalı) + eval/routing_eval.py Top-1/Top-3 + MRR.
"""

from __future__ import annotations

from typing import Any

import structlog

from agents.config import BIRIM_TR, BIRIMLER, EVRAK_TO_BIRIM
from core.text import tr_lower

log = structlog.get_logger()

_EVRAK = "yazi_isleri_evrak"  # her evrakın ilk havale durağı (resmî akış)

# İçerik-temelli sinyal: KÖK-bazlı anahtar → birim. docs/02 §3 birim sorumlulukları.
# Aynı anda birden çok eşleşirse skorlanır (en yüksek kazanır), kalanlar alternatif.
#
# GENELLEME (held-out): kökler Türkçe çekim eklerini yutacak şekilde KISA tutuldu
# (ör. "haciz" yerine değil ama "borçlu"→borçluya/borçlunun; "personel"→personelin;
# "tahsil"→tahsili/tahsilat). Salt sınıf-imzası değil, DOLAYLI içerik bağlamı da
# yakalanır (ör. "malvarlığ"/"şerh" → hukuk; "meblağ"/"hak ediş" → mali; "muhatab"/
# "süreniz başla" → hukuk-tebligat). Bu, 'belirsiz' türde ve alternatif sıralamada
# içerik sürücü olduğunda dolaylı evrakı da doğru birime taşır.
_CONTENT_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("hukuk_musavirligi",
     ("dava", "icra", "haciz", "tebligat", "tebliğ", "müzekkere", "mahkeme",
      "savcılık", "mütalaa", "hukuki", "ihtarname", "borçlu", "malvarlığ",
      "duruşma", "yargılama", "muhatab", "şerh", "el konul", "zorla tahsil",
      "kanaat", "merci")),
    ("insan_kaynaklari",
     ("personel", "atama", "izin", "disiplin", "kadro", "terfi", "sicil", "özlük",
      "görevlendir", "memur", "naklen")),
    ("mali_strateji_sgb",
     ("fatura", "ödeme", "bütçe", "tahakkuk", "harcama", "ihale bedel", "maaş",
      "avans", "meblağ", "hak ediş", "hak edilen", "tahsilat", "ödenek", "bedel")),
    ("bilgi_islem",
     ("sistem", "yazılım", "donanım", "ebys", "e-posta", "şifre", "veri taban")),
    ("destek_idari_hizmetler",
     ("satın alma", "lojistik", "temizlik", "araç", "bakım", "tedarik", "kira")),
    ("basin_halkla_iliskiler_cimer",
     ("cimer", "bilgi edinme", "4982", "basın", "halkla ilişki", "dilekçe",
      "tek kapı", "elektronik başvuru", "halk başvuru", "çevrim içi")),
    ("teftis_ic_denetim",
     ("şikayet", "şikâyet", "ihbar", "soruşturma", "denetim", "inceleme",
      "usulsüz", "aykırılık", "memnuniyetsiz", "rahatsız", "bulgu", "rapor")),
    ("ilgili_teknik_daire",
     ("ruhsat", "izin belge", "proje", "teknik", "imar", "başvuru", "şartları sağla",
      "hakkımın tesis")),
)


def _content_scores(text: str) -> dict[str, int]:
    """Metinde geçen birim-anahtar köklerini say (birim → eşleşme adedi)."""
    scores: dict[str, int] = {}
    for birim, kws in _CONTENT_KEYWORDS:
        n = sum(1 for kw in kws if tr_lower(kw) in text)
        if n:
            scores[birim] = n
    return scores


async def route_birim_node(state: dict[str, Any]) -> dict[str, Any]:
    """Hedef birimi belirle: config birincil + içerik heuristiği + top-k alternatif.

    Skorlama: içerik anahtar-sözcükleri birim adaylarına oy verir; tür kararı (config) ek
    ağırlık alır. BİLİNEN tür (belirsiz değil) için config OTORİTERDİR (içerik en yüksek
    skorunu AŞAR) — petisyon türleri (cimer/bilgi_edinme/dilekçe) içerikteki 'sistem/erişim'
    gibi gürültü sözcüklerine kapılmadan doğru ilk-birime gider. 'belirsiz' türde içerik
    sürücüdür (tür sinyali yok) → ham içerik skoru kazanır; içerik de yoksa Yazı İşleri.
    """
    turu = state.get("evrak_turu", "belirsiz")
    text = tr_lower(state.get("evrak_text", "") or "")
    config_hedef = EVRAK_TO_BIRIM.get(turu, _EVRAK)
    scores = _content_scores(text)

    # config ağırlığı: bilinen türde içerik en yüksek skorunu AŞACAK kadar (otoriter); belirsiz
    # türde sadece +1 (içerik eşitliğinde tür kazansın ama güçlü içerik sinyali öne çıkabilsin).
    if turu != "belirsiz":
        config_boost = max(scores.values(), default=0) + 1
    else:
        config_boost = 1
    scores[config_hedef] = scores.get(config_hedef, 0) + config_boost
    # Sıralı birimler: skora göre azalan, eşitlikte config'e ve BIRIMLER sırasına göre.
    sirali = sorted(scores, key=lambda b: (-scores[b], 0 if b == config_hedef else 1,
                                           BIRIMLER.index(b) if b in BIRIMLER else 99))
    hedef = sirali[0]

    # Alternatifler (top-3) + resmî ilk-durak (Yazı İşleri) garanti listede.
    alternatifler = sirali[:3]
    if _EVRAK not in alternatifler:
        alternatifler.append(_EVRAK)

    icerik_not = f"; içerik sinyali: {scores}" if len(scores) > 1 else ""
    log.info("route_birim", turu=turu, hedef=hedef, alt=alternatifler)
    return {
        "hedef_birim": hedef,
        "birim_alternatifleri": alternatifler,
        "birim_reasoning": (
            f"{BIRIM_TR.get(hedef, hedef)} (tür: {turu}, config: "
            f"{BIRIM_TR.get(config_hedef, config_hedef)}{icerik_not})"
        ),
    }


__all__ = ("route_birim_node",)
