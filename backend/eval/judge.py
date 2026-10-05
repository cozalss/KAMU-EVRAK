"""LLM-as-Judge — kamu-evrak ÖZET hakemliği (kapsama + sadakat + kısalık).

Görev 1 özet kalitesi için LLM hakemi (docs/06 birincil metrik "LLM-judge kapsama"):
(kısaltılmış evrak metni, üretilen özet) ikilisi → JSON skor:

    {"kapsama": 0..1, "sadakat": 0..1, "kisalik": 0..1, "notlar": "..."}

Model: deepseek-chat (get_llm_for_model tiered client; json_mode, temperature 0 →
tekrarlanabilir hakemlik). LLM_MODE=mock/hatada güvenli sıfır skor döner; harness'ler
(summary_eval) gate KAPALIYKEN bu modülü hiç çağırmaz → CI tamamen deterministik kalır
(CLAUDE.md fallback sözleşmesi). LLM çıktısı kapalı-küme doğrulanır: beklenen eksenler
yoksa şema-dışı sayılır (LLM'e körü körüne güvenilmez).

Kullanım (eval pipeline):
    judge = LLMJudge()
    score = await judge.evaluate(evrak_metni, ozet)
    # score: JudgeScore(kapsama=0.92, sadakat=1.0, kisalik=0.85, notlar="...")

Sampling (hızlı eval için isteğe bağlı):
    if should_sample(vaka_id, rate=0.20):
        score = await judge.evaluate(...)
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass

import structlog

from agents.llm import get_llm_for_model
from agents.nodes._llm_extract import llm_json

log = structlog.get_logger()

# Varsayılan TAM örneklem: hakemlik deterministik toplam üretsin (temperature=0 +
# json_mode + tüm vakalar) — bench tekrarları aynı sonucu verir. Hızlı/ucuz eval
# için JUDGE_SAMPLE_RATE=0.20 override edilebilir (should_sample deterministik).
JUDGE_SAMPLE_RATE = float(os.getenv("JUDGE_SAMPLE_RATE", "1.0"))
JUDGE_MAX_TOKENS = 512
# Hakem modeli: deepseek-v4-flash (ucuz + json_mode güvenilir). openai modunda tiered
# client açılır; mock/lokal modda get_llm_for_model base singleton'a düşer.
# NOT: eski sabit "deepseek-chat" API'den KALDIRILDI (HTTP 400) → hakem sessizce
# ölüydü. ENV ile geçersiz kılınabilir (2026-07-24).
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "deepseek-v4-flash")
# Evrak metni prompt bütçesi — hakem tam metni değil kısaltılmış halini görür
# (uzun evrakta bile tek çağrı; kilit unsurlar evrakın başında yoğunlaşır).
JUDGE_EVRAK_MAX_CHAR = 3000

_JUDGE_SYSTEM = (
    "Sen kamu evrakı için titiz bir ÖZET HAKEMİSİN. Verilen (evrak metni, üretilen "
    "özet) ikilisini ŞU üç ölçütle değerlendir:\n"
    "  - kapsama: Özet, evrakın kilit unsurlarını (konu, gönderen/muhatap, talep, "
    "kritik tarih/sayı) kapsıyor mu?\n"
    "  - sadakat: Özet YALNIZ evrak metnine mi dayanıyor? (metinde olmayan iddia, "
    "tarih veya sayı UYDURULMAMIŞ mı? Maskeli [TCKN]/[TEL] redaksiyondur, ihlal değildir.)\n"
    "  - kisalik: Özet kısa ve öz mü? (gereksiz tekrar/dolgu yok, tek paragraf hedef)\n"
    "Her ölçüt 0.00–1.00 arası float. 1.0 = kusursuz, 0.0 = berbat.\n\n"
    "SADECE şu JSON şemasını döndür (başka metin yazma):\n"
    '{"kapsama": 0.0..1.0, "sadakat": 0.0..1.0, "kisalik": 0.0..1.0, '
    '"notlar": "kısa gerekçe (max 200 karakter)"}'
)

_JUDGE_USER_TEMPLATE = (
    "EVRAK METNİ (kısaltılmış):\n{evrak}\n\n"
    "ÜRETİLEN ÖZET:\n{ozet}\n\n"
    "Değerlendir (sadece JSON):"
)

# Kapalı-küme eksen adları — LLM çıktısında hiçbiri yoksa şema-dışı yanıt sayılır.
_JUDGE_EKSENLER = ("kapsama", "sadakat", "kisalik")


@dataclass(slots=True)
class JudgeScore:
    kapsama: float
    sadakat: float
    kisalik: float
    notlar: str

    def overall(self) -> float:
        """Ağırlıklı ortalama — sadakat en önemli (kamu evrakta halüsinasyon kritik)."""
        return round(0.5 * self.sadakat + 0.3 * self.kapsama + 0.2 * self.kisalik, 3)

    def to_dict(self) -> dict:
        return {
            "kapsama": self.kapsama,
            "sadakat": self.sadakat,
            "kisalik": self.kisalik,
            "notlar": self.notlar,
            "overall": self.overall(),
        }


class LLMJudge:
    """Özet kalite hakemi — deepseek-chat json_mode; hata/bozuk çıktı → güvenli sıfır."""

    async def evaluate(self, evrak_metni: str, ozet: str) -> JudgeScore:
        if not evrak_metni or not ozet:
            return JudgeScore(0.0, 0.0, 0.0, "boş evrak/özet")

        user_msg = _JUDGE_USER_TEMPLATE.format(
            evrak=evrak_metni[:JUDGE_EVRAK_MAX_CHAR], ozet=ozet[:2000],
        )
        # Merkezi katman (profil `eval_judge`): kesilme kurtarma + iz + düşünme politikası.
        try:
            obj = await llm_json(_JUDGE_SYSTEM, user_msg, profil="eval_judge",
                                 max_tokens=JUDGE_MAX_TOKENS, temperature=0.0,
                                 llm=get_llm_for_model(JUDGE_MODEL))
        except Exception as exc:  # hakem asla eval koşusunu düşürmez
            log.warning("judge_llm_failed", error=str(exc))
            return JudgeScore(0.0, 0.0, 0.0, f"LLM hata: {exc!s}")
        if obj is None:
            return JudgeScore(0.0, 0.0, 0.0, "LLM hata ya da yanıt yok/kesik (yedek)")
        return _parse_judge_json(json.dumps(obj, ensure_ascii=False))


def _parse_judge_json(raw: str) -> JudgeScore:
    """Markdown fence-strip + JSON parse + kapalı-küme doğrulama + safe defaults."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(line for line in lines if not line.startswith("```"))
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        log.warning("judge_json_parse_failed", raw=raw[:200])
        return JudgeScore(0.0, 0.0, 0.0, "JSON parse hatası")

    # Beklenen eksenlerden hiçbiri yoksa (örn. MockLLM default cevabı) şema-dışıdır —
    # skorlar sıfırlanır ki bozuk hakem çıktısı raporu şişirmesin.
    if not isinstance(obj, dict) or not any(k in obj for k in _JUDGE_EKSENLER):
        log.warning("judge_json_sema_disi", raw=raw[:200])
        return JudgeScore(0.0, 0.0, 0.0, "şema dışı yanıt")

    return JudgeScore(
        kapsama=_clamp01(obj.get("kapsama", 0.0)),
        sadakat=_clamp01(obj.get("sadakat", 0.0)),
        kisalik=_clamp01(obj.get("kisalik", 0.0)),
        notlar=str(obj.get("notlar", ""))[:200],
    )


def _clamp01(x: object) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, v))


# --------------------------------------------------------------------------
#  Sampling helper — deterministic on call_id
# --------------------------------------------------------------------------

def should_sample(call_id: str, rate: float = JUDGE_SAMPLE_RATE) -> bool:
    """Deterministik sampling — aynı call_id her zaman aynı sonucu verir.

    SHA-256 hash → ilk 8 byte → uint64 / 2^64. Float oran ile karşılaştır.
    Faydası: traceability + ölçüt karşılaştırma; aynı vaka eval'de hep aynı
    şekilde örneklenir.
    """
    if rate <= 0:
        return False
    if rate >= 1:
        return True
    h = hashlib.sha256(call_id.encode("utf-8")).digest()[:8]
    bucket = int.from_bytes(h, "big") / float(1 << 64)
    return bucket < rate


__all__ = (
    "JUDGE_MODEL",
    "JUDGE_SAMPLE_RATE",
    "JudgeScore",
    "LLMJudge",
    "should_sample",
)
