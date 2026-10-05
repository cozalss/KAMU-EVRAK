"""İçerik odaklı, talep bazlı, BOŞ DÖNEBİLEN mevzuat önerisi — geri getirme + alaka yargıcı.

Akış (mevzuat_oner_node içinde koşar; graf topolojisi DEĞİŞMEZ — CLAUDE.md §8):
  1. mevzuat_mesele: talep başına hukuki mesele + katalogdan dosya seçimi (LLM, kapalı küme).
  2. Aday havuzu (deterministik): her talep için sorgu = talep + mesele + terimler — TÜR
     KELİMESİ YOK, tür boost'u YOK. Seçilen dosyaların en iyi maddeleri + genel BM25 ilk 4.
  3. Alaka yargıcı (LLM, kapalı küme): yalnız talebin meselesini DOĞRUDAN düzenleyen madde
     seçilir; hiçbiri uymuyorsa BOŞ. Çıktı numara doğrulamasından geçer; tek ihlal → tüm
     çıktı reddedilir (_sira_dogrula deseni) → içerik sorgulu BM25 yedeği, "yargıçsız" etiketli.
  4. Usul katmanı (deterministik): config.EVRAK_TO_MEVZUAT'taki başvuru usulü maddesi
     (ör. dilekçe → 3071 m.4) içerik önerileriyle YARIŞMAZ; ayrı `katman="usul"` kalemi olur.

Dürüst boş sonuç: yargıç hiçbir talep için madde seçmezse `mevzuat_bulunamadi=True` döner ve
statik config dolgusu YAPILMAZ. Yargıcın "alakalı" demesi kaynağı "doğrulanmış" yapmaz;
kaynak_guven alanı korpustan aynen taşınır.
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

from agents.config import EVRAK_TO_MEVZUAT
from agents.mevzuat_mesele import mesele_analizi, talep_listesi
from agents.nodes import mevzuat_oner as mo
from agents.nodes._llm_extract import llm_json
from api.pii import mask_for_llm

log = structlog.get_logger()

_DOSYA_BASI_ADAY = 5
_GENEL_ADAY = 4
_TALEP_BASI_ADAY = 10
_AZAMI_ADAY = 36
_ADAY_METIN_CHARS = 260
_TALEP_BASI_SECIM = 3
_YARGIC_MAX_TOKENS = 700

_YARGIC_SYSTEM = (
    "Sen Türk mevzuatında alaka yargıcısın. Her TALEP için ADAYLAR listesinden, talebin "
    "hukuki meselesini DOĞRUDAN düzenleyen maddeleri seç (talep başına en fazla 3).\n"
    "KURALLAR:\n"
    "- Kelime benzerliği yetmez: madde, talepteki işin yetkisini, yükümlülüğünü, usulünü ya "
    "da hakkını düzenlemeli. Talep konusu işlemi (belge verilmesi, ödeme, kayıt vb.) genel "
    "hükümle düzenleyen madde de alakalıdır.\n"
    "- Başka bir kanunun adını yalnız ALINTILAYAN maddeler alakalı DEĞİLDİR.\n"
    "- Hiçbir aday uymuyorsa o talep için hiçbir şey seçme — boş sonuç doğru cevaptır.\n"
    "- secim listesine YALNIZ alakalı bulduğun maddeleri yaz; alakasız adayı hiç yazma.\n"
    "- Yalnız listedeki 'no' değerlerini kullan; yeni madde/kanun yazma.\n"
    "- gerekce: en fazla 15 kelime, maddenin talebe neden uyduğu.\n"
    'Yalnız şu JSON\'u döndür: {"secim": [{"talep": "t1", "no": 3, "gerekce": "..."}]}'
)


def _ilk_satir(metin: str) -> str:
    return (metin or "").strip().split("\n", 1)[0][:160]


def _talep_sorgusu(talep: dict[str, str], analiz: dict[str, Any]) -> str:
    return " ".join([talep["metin"], analiz.get("mesele", ""), *analiz.get("terimler", [])])


def _dosya_chunklari(dosya: str) -> list[dict[str, Any]]:
    return [c for c in mo._load_index() if mo._kaynak_dosya(c) == dosya]


def _talep_adaylari(sorgu: str, dosyalar: list[str]) -> list[tuple[float, dict[str, Any]]]:
    """Seçilen dosyaların en iyi maddeleri (sıfır skorlu da — başlık recall'ı) + genel BM25."""
    ranked = mo._score(sorgu, mo._load_index())
    skor = {id(c): s for s, c in ranked}
    adaylar: list[tuple[float, dict[str, Any]]] = []
    for dosya in dosyalar:
        parcalar = sorted(_dosya_chunklari(dosya), key=lambda c: -skor.get(id(c), 0.0))
        adaylar += [(skor.get(id(c), 0.0), c) for c in parcalar[:_DOSYA_BASI_ADAY]]
    adaylar += mo._dedup(ranked)[:_GENEL_ADAY]
    return mo._dedup(adaylar)[:_TALEP_BASI_ADAY]


def aday_havuzu(
    talepler: list[dict[str, str]], analiz: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, dict[int, float]], dict[str, int]]:
    """(birleşik aday listesi, talep→{aday_no: ham skor}, talep→sorgu token sayısı)."""
    havuz: list[dict[str, Any]] = []
    sira: dict[int, int] = {}
    talep_skor: dict[str, dict[int, float]] = {}
    q_token: dict[str, int] = {}
    for t in talepler:
        a = analiz.get(t["id"]) or {"mesele": "", "terimler": [], "dosyalar": []}
        sorgu = _talep_sorgusu(t, a)
        q_token[t["id"]] = mo._q_token(sorgu)
        talep_skor[t["id"]] = {}
        for s, c in _talep_adaylari(sorgu, a["dosyalar"]):
            if id(c) not in sira:
                if len(havuz) >= _AZAMI_ADAY:
                    continue
                sira[id(c)] = len(havuz)
                havuz.append(c)
            talep_skor[t["id"]][sira[id(c)]] = s
    return havuz, talep_skor, q_token


def yargic_dogrula(obj: Any, ids: set[str], n: int) -> dict[str, list[tuple[int, str]]] | None:
    """Kapalı küme doğrulaması — TEK ihlal (aralık dışı no, bool, bilinmeyen talep) → None."""
    if not isinstance(obj, dict) or not isinstance(obj.get("secim"), list):
        return None
    sonuc: dict[str, list[tuple[int, str]]] = {i: [] for i in ids}
    for s in obj["secim"]:
        if not isinstance(s, dict):
            return None
        no, talep = s.get("no"), str(s.get("talep"))
        if isinstance(no, bool) or not isinstance(no, int) or not 0 <= no < n or talep not in ids:
            return None
        gerekce = s.get("gerekce") if isinstance(s.get("gerekce"), str) else ""
        if no not in [x for x, _ in sonuc[talep]] and len(sonuc[talep]) < _TALEP_BASI_SECIM:
            sonuc[talep].append((no, gerekce.strip()[:200]))
    return sonuc


async def alaka_yargici(
    talepler: list[dict[str, str]], analiz: dict[str, dict[str, Any]], havuz: list[dict[str, Any]]
) -> dict[str, list[tuple[int, str]]] | None:
    if not havuz:
        return {t["id"]: [] for t in talepler}
    girdi = {
        "talepler": [{"id": t["id"], "metin": mask_for_llm(t["metin"]),
                      "mesele": (analiz.get(t["id"]) or {}).get("mesele", "")} for t in talepler],
        "adaylar": [{"no": i, "kaynak": mo._kaynak_dosya(c), "baslik": _ilk_satir(c.get("text", "")),
                     "metin": str(c.get("text", ""))[:_ADAY_METIN_CHARS]}
                    for i, c in enumerate(havuz)],
    }
    obj = await llm_json(_YARGIC_SYSTEM, json.dumps(girdi, ensure_ascii=False),
                         max_tokens=_YARGIC_MAX_TOKENS, dusunme_kapali=True)
    return yargic_dogrula(obj, {t["id"] for t in talepler}, len(havuz))


_MADDE_RE = re.compile(r"\bm\.\s*(\d+)")


def usul_onerileri(turu: str) -> list[dict[str, Any]]:
    """Türün başvuru usulü maddesi (config.EVRAK_TO_MEVZUAT) — yalnız KORPUSTA bulunursa.

    Başlıktaki kanun no + İLK madde no korpusta (dosya öneki + madde_no) eşleşmezse kalem
    üretilmez: usul katmanı da uydurma üretmez.
    """
    out: list[dict[str, Any]] = []
    for baslik in EVRAK_TO_MEVZUAT.get(turu, []):
        madde = _MADDE_RE.search(baslik)
        if not madde or baslik.startswith("[DOĞRULA"):
            continue
        for no in mo._kanun_nolari(baslik):
            chunk = next((c for c in mo._load_index()
                          if mo._kaynak_dosya(c).startswith(f"{no}_")
                          and str(c.get("madde_no")) == madde.group(1)
                          and (c.get("madde_tur") or "madde") == "madde"), None)
            if chunk is not None:
                out.append(mo._oneri(chunk, score=0.5, raw=0.0, q_token=0, katman="usul",
                                     yargic=False, gerekce="Evrak türünün başvuru usulü / cevap süresi"))
    return out


def _birlestir(gruplar: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Talep grupları sırayla harmanlanır (t1#1, t2#1, t1#2…) → ilk sıralar her talebi kapsar."""
    out: list[dict[str, Any]] = []
    gorulen: set[tuple[Any, ...]] = set()
    for i in range(max((len(g) for g in gruplar), default=0)):
        for g in gruplar:
            if i < len(g):
                anahtar = (g[i].get("kaynak_dosya"), g[i].get("madde_no"), g[i].get("madde_tur"))
                if anahtar not in gorulen:
                    gorulen.add(anahtar)
                    out.append(g[i])
    return out


def _yargicsiz_grup(tid: str, skorlar: dict[int, float], havuz: list[dict[str, Any]],
                    q_token: int) -> list[dict[str, Any]]:
    """Yargıç yok/ihlal → içerik sorgulu BM25'in en iyisi, 'yargıçsız' (düşük güven) etiketli."""
    sirali = sorted(((s, no) for no, s in skorlar.items() if s > 0), reverse=True)[:1]
    return [mo._oneri(havuz[no], score=1.0, raw=s, q_token=q_token, talep_id=tid,
                      katman="esas", yargic=False, gerekce="") for s, no in sirali]


def _gruplar(talepler: list[dict[str, str]], secim: dict[str, list[tuple[int, str]]] | None,
             havuz: list[dict[str, Any]], talep_skor: dict[str, dict[int, float]],
             q_token: dict[str, int]) -> list[list[dict[str, Any]]]:
    gruplar: list[list[dict[str, Any]]] = []
    for t in talepler:
        tid = t["id"]
        if secim is None:
            gruplar.append(_yargicsiz_grup(tid, talep_skor[tid], havuz, q_token[tid]))
            continue
        gruplar.append([
            mo._oneri(havuz[no], score=round(1.0 - 0.1 * r, 3), raw=talep_skor[tid].get(no, 0.0),
                      q_token=q_token[tid], talep_id=tid, katman="esas", yargic=True,
                      gerekce=gerekce)
            for r, (no, gerekce) in enumerate(secim.get(tid, []))])
    return gruplar


async def icerik_odakli_oneriler(state: dict[str, Any]) -> dict[str, Any] | None:
    """Talep bazlı öneri; mesele analizi başarısızsa None (çağıran eski BM25 yoluna düşer)."""
    talepler = talep_listesi(state)
    analiz = await mesele_analizi(state, talepler)
    if analiz is None:
        return None
    havuz, talep_skor, q_token = aday_havuzu(talepler, analiz)
    secim = await alaka_yargici(talepler, analiz, havuz)
    gruplar = _gruplar(talepler, secim, havuz, talep_skor, q_token)
    esas = _birlestir(gruplar)
    turu = str(state.get("evrak_turu") or "")
    usul = [u for u in usul_onerileri(turu)
            if (u["kaynak_dosya"], u["madde_no"]) not in {(e["kaynak_dosya"], e["madde_no"]) for e in esas}]
    durum = [{"talep_id": t["id"], "mesele": (analiz.get(t["id"]) or {}).get("mesele", ""),
              "bulundu": bool(g)} for t, g in zip(talepler, gruplar, strict=True)]
    bulunamadi = secim is not None and not esas
    log.info("mevzuat_yargic", yargic=secim is not None, n_aday=len(havuz), n_esas=len(esas),
             n_usul=len(usul), bulunamadi=bulunamadi)
    return {"mevzuat_onerileri": esas + usul, "mevzuat_bulunamadi": bulunamadi,
            "mevzuat_talep_durumu": durum, "mevzuat_yargic_calisti": secim is not None}


__all__ = ("aday_havuzu", "alaka_yargici", "icerik_odakli_oneriler", "usul_onerileri",
           "yargic_dogrula")
