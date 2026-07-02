"""Sohbet çok-adımlı araç döngüsü (MADDE 13) — JSON araç-seçim protokolü.

NEDEN JSON protokolü (native function-calling değil): agents.llm istemcisinin chat
API'si `tools` parametresi geçirmiyor; istemciye dokunmadan aynı davranış llm_json
ile kurulur — LLM her turda {"arac": "<ad>"|null, "parametreler": {...}} seçer,
araç sonucu transcript'e eklenir, en fazla SOHBET_MAX_TUR tur döner. DeepSeek'in
native tool-calling'i ileride istemciye eklenirse bu modül tek değişim noktasıdır.

FALLBACK SÖZLEŞMESİ: protokole uymayan çıktı (mock LLM / hata / None) → None döner,
çağıran (sohbet.py) ESKİ tek-tur niyet+araç akışına BİREBİR düşer. Bilinmeyen araç
adı asla çalıştırılmaz (kapalı küme: KAYIT_TURU anahtarları); araç hatası yutulur,
döngü sürer — sohbet hiçbir durumda 500'e düşmez.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import structlog

from agents.nodes._llm_extract import llm_json
from agents.sohbet_niyet import KAYIT_TURU

log = structlog.get_logger()

# Kapalı küme: yalnız veri-getiren (owner-scoped) araçlar döngüde çağrılabilir.
ARAC_ADLARI: frozenset[str] = frozenset(KAYIT_TURU)

_DONGU_SYSTEM = (
    "Sen bir kamu evrak yönetim sisteminin araç-seçen asistanısın. Kullanıcının sorusunu "
    "yanıtlamak için hangi aracı çağıracağına karar ver. Her turda YALNIZ şu JSON'u döndür:\n"
    '{"arac": "<araç adı>", "parametreler": {"limit": 5, "q": "", "durum": "", "risk": "", '
    '"mevzuat_no": ""}}\n'
    "Elindeki veri soruyu yanıtlamaya YETERLİYSE araç isteme: {\"arac\": null} döndür.\n"
    "Yalnız listede verilen araç adlarını kullan; araç uydurma."
)

# Tek araç sonucunun transcript'e girecek en fazla karakteri (bağlam şişmesin).
_SONUC_MAX = 2000


async def arac_dongusu(
    mesaj: str,
    gecmis_metni: str,
    calistir: Callable[[str, dict[str, Any]], Awaitable[Any]],
    max_tur: int,
) -> tuple[str, Any] | None:
    """LLM güdümlü araç döngüsü → (son_arac, son_veri) ya da None (eski akışa düş).

    None dönüş iki durumda: (a) LLM protokole uymadı (mock/bozuk — "arac" anahtarı yok),
    (b) döngü hiç geçerli araç çalıştırmadan durdu. Her iki durumda çağıran klasik
    tek-tur yolunu işletir → davranış asla LLM'e bağımlı olmaz.
    """
    transcript: list[str] = []
    if gecmis_metni:
        transcript.append(f"Önceki konuşma:\n{gecmis_metni}")
    transcript.append(f"Kullanıcı mesajı: {mesaj}")
    transcript.append("Kullanılabilir araçlar: " + ", ".join(sorted(ARAC_ADLARI)))

    son_arac: str | None = None
    son_veri: Any = None
    for _ in range(max_tur):
        cevap = await llm_json(_DONGU_SYSTEM, "\n\n".join(transcript), max_tokens=200)
        if not isinstance(cevap, dict) or "arac" not in cevap:
            return None  # protokol dışı (mock/bozuk) → eski tek-tur akış birebir
        arac = cevap.get("arac")
        if not arac or not isinstance(arac, str):
            break  # LLM "veri yeterli" dedi → kompozisyona geç
        if arac not in ARAC_ADLARI:
            # Kapalı küme: bilinmeyen araç ASLA çalıştırılmaz; LLM'e düzeltme şansı ver.
            transcript.append(f"NOT: '{arac}' geçerli bir araç değil; yalnız listeden seç.")
            continue
        parametreler = cevap.get("parametreler")
        try:
            veri = await calistir(arac, parametreler if isinstance(parametreler, dict) else {})
        except Exception as exc:  # araç hatası sohbeti düşürmesin (500 yok)
            log.warning("sohbet_dongu_arac_hatasi", arac=arac, error=type(exc).__name__)
            transcript.append(f"ARAÇ HATASI [{arac}]: araç şu an çalıştırılamadı.")
            continue
        son_arac, son_veri = arac, veri
        transcript.append(
            f"ARAÇ SONUCU [{arac}]: "
            + json.dumps(veri, ensure_ascii=False, default=str)[:_SONUC_MAX]
        )
    if son_arac is None:
        return None  # hiç araç koşmadı → klasik yol veriyi kendisi çeksin
    return son_arac, son_veri


__all__ = ("ARAC_ADLARI", "arac_dongusu")
