"""Görev 1 — İlgili mevzuat / yazışma kuralı önerme node'u.

İki kademe (LLM'siz — mock modda da çalışır):
  1. data/mevzuat korpusu VARSA: madde-bazlı chunk üzerinde BM25 retrieval.
     - Önce seed indeksi (data/mevzuat/index/mevzuat_index.json, scripts/seed_mevzuat.py)
       okunur; yoksa korpus *.txt runtime'da chunker.chunk_mevzuat ile chunk'lanır.
     - Skor: rank_bm25 BM25Okapi (varsa); yoksa stdlib term-overlap fallback.
     - Tür → mevzuat ÖN-FİLTRE/BOOST: config.EVRAK_TO_MEVZUAT'ta türe atanan kanun
       numaralarına ait chunk'lar skor olarak öne alınır (alaka sinyali güçlendirme).
  2. Korpus YOKSA: config.EVRAK_TO_MEVZUAT statik eşleme (kaynaklı başlıklar).

Ranking iyileştirmeleri (dış değerlendirme "mevzuat retrieval zayıf" bulgusu):
  - Türkçe stopword + resmî-yazı boilerplate ("arz ederim", "rica") elenir → gürültü ↓.
  - Madde/diakritik normalizasyon: "m.4" / "madde 4" tokenleri hizalanır.
  - Tür → beklenen-kanun BOOST (config uyumlu); dedup; min-skor eşiği.
  - BM25 k1/b tunable (kısa-madde korpusu için kalibre).

CLAUDE.md §1: madde no UYDURULMAZ. Korpustan gelen snippet ham metindir
(doğrulanabilir). Chunk metadata'sında madde_no varsa başlık "... m.<no>" olur;
yoksa başlık `[DOĞRULA: madde no]` ile işaretlenir.

Return sözleşmesi (KEEP): {"mevzuat_onerileri": list[MevzuatOneri]}.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog

from agents.config import (
    ATIF_GENISLET_ENABLED,
    EVRAK_TO_MEVZUAT,
    EVRAK_TURU_TR,
    IZIN_DENIZ_SINYAL,
    IZIN_ISCI_SINYAL,
    IZIN_TERIMLERI,
    RERANK_CAND_N,
    RERANK_ENABLED,
    RERANK_PROVIDER,
)
from core.text import tr_lower
from retrieval.chunker import chunk_mevzuat

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[3]
_MEVZUAT_DIR = _ROOT / "data" / "mevzuat"
_INDEX_FILE = _MEVZUAT_DIR / "index" / "mevzuat_index.json"
_TOP_K = 3
_MIN_QUERY_LEN = 8  # çok kısa metinde retrieval gürültülü → statik'e düş
_MIN_CHUNK_CHARS = 40
_SNIPPET_CHARS = 280
# Snippet kelime ORTASINDAN kesilmemeli ("...senedin kambiyo va") — memur yarım maddeyi
# doğrulayamaz. Cümle sınırı bu kadar geriye giderse snippet aşırı kısalır → kelime sınırı.
_SNIPPET_MIN_CHARS = 160
_CUMLE_SONU_RE = re.compile(r"[.;:!?]\s")
_WORD_RE = re.compile(r"[0-9a-zçğıöşü]+")
# Çok zayıf eşleşmeyi (sorgu hiçbir maddeye iyi değmedi) öneriden ele: ham BM25 top
# skoru bunun ALTINDAysa retrieval gürültülü kabul edilir → config fallback'e düşülür.
#
# DİKKAT — bu eşik pratikte HİÇ ateşlenmez ve kasıtlı olarak öyle bırakıldı.
# Eski yorum "güçlü ham≈17-40, gürültü <~3" diyordu; eval/mevzuat_guven_kalibrasyon.py
# ile ÖLÇÜLDÜ: gerçek ham skorlar 24-237 aralığında (BM25 skoru sorgu uzunluğuyla
# ölçeklendiği için belgeler arası karşılaştırılamaz). Yani mutlak ham eşik burada
# anlamlı bir kapı değildir; recall'ı korumak için düşük bırakılır. Zayıf eşleşmeyi
# KULLANICIYA bildirme işi `norm_score` bandına devredildi (api/mevzuat_zenginlestir).
_MIN_RAW_SCORE = 1.0

# BM25 uzunluk-normalizasyonu (b). Varsayılan 0.75 KISA madde korpusunda kısa+genel
# maddeleri (örn. 2646 m.22 Koordinasyon) aşırı kayırır → spesifik madde (3071 m.4
# Dilekçe zorunlu unsurlar) dilekçe sorgusunda 3. sıraya düşer. Madde uzunluğu burada
# alaka ile korele DEĞİL → b=0.3 ile normalizasyon zayıflatılır (ölçüldü: 3071 m.4 başa).
_BM25_B = 0.3
# Terim-frekansı doygunluğu (k1). Madde-chunk'larında bir terim çok tekrar etmez;
# default 1.5 yeterli. Tunable (Türkçe kısa-madde IR araştırması: 1.2-2.0 makul aralık).
_BM25_K1 = 1.5

# Türkçe stopword + resmî-yazı boilerplate. Bu terimler HER mevzuat maddesinde ve
# her evrakta geçer → ayırt edici değil; sorgu/doküman tokenlerinden elenince BM25
# spesifik domain terimine (dilekçe/tebligat/ihale) yoğunlaşır. (Diakritik küçük harf.)
_STOPWORDS: frozenset[str] = frozenset({
    "ve", "veya", "ile", "ya", "da", "de", "ki", "bu", "şu", "o", "bir", "için",
    "gibi", "kadar", "göre", "ise", "ancak", "ayrıca", "her", "hem", "en",
    # Resmî-yazı/dilekçe boilerplate (alaka taşımaz, gürültü yapar):
    "arz", "ederim", "rica", "ederiz", "gereğini", "gereği", "bilgilerinize",
    "bilgilerine", "saygılarımla", "konusunda", "hakkında", "ilgili", "talep",
    "ad", "soyad", "adı", "soyadı", "imza", "tarih", "sayı", "konu", "ek",
})

# Madde/kanun-no normalizasyon: "m.4", "madde 4", "md 4" → tek biçim "madde<no>".
# Sorgu ve doküman aynı biçime indirgenince madde-atıfları BM25'te eşleşir.
_MADDE_REF_RE = re.compile(r"\b(?:m|md|madde)[\.\s]*([0-9]+)", re.IGNORECASE)


def _normalize_madde_refs(s: str) -> str:
    """'m.4' / 'md 4' / 'madde 4' → 'madde4' (sorgu↔doküman madde-atıf hizalama)."""
    return _MADDE_REF_RE.sub(lambda m: f" madde{m.group(1)} ", s)


def _tokenize(s: str) -> list[str]:
    """Türkçe-doğru küçük harf + alfasayısal token; stopword/boilerplate elenir."""
    norm = _normalize_madde_refs(s)
    return [t for t in _WORD_RE.findall(tr_lower(norm)) if t not in _STOPWORDS]


def _snippet(metin: str) -> str:
    """Madde metnini CÜMLE (yoksa kelime) sınırında kes + '…' işaretle.

    Ham `[:280]` dilimi kelimeyi ortadan bölüyordu; maddenin anlamı çoğu kez kuyruktaki
    süre/istisna cümlesinde olduğundan yarım kelime memuru yanıltır. Sınır arayışı:
    son cümle sonu → yoksa son boşluk → ikisi de çok geriye düşerse ham kesme.
    """
    govde = (metin or "").strip()
    if len(govde) <= _SNIPPET_CHARS:
        return govde
    kirpik = govde[:_SNIPPET_CHARS]
    cumle_sonu = max((m.end() for m in _CUMLE_SONU_RE.finditer(kirpik)), default=-1)
    if cumle_sonu >= _SNIPPET_MIN_CHARS:
        return kirpik[:cumle_sonu].rstrip() + " …"
    bosluk = kirpik.rfind(" ")
    return kirpik[: bosluk if bosluk >= _SNIPPET_MIN_CHARS else _SNIPPET_CHARS].rstrip() + " …"


def _kaynak_dosya(chunk: dict[str, Any]) -> str:
    """Chunk → katalog dosya anahtarı (uzantısız), yoksa "".

    Öneri satırından mevzuat okuma modalına atlamak (/mevzuat/icerik/{dosya}) için tek
    doğrulanabilir bağ. Seed indekste `kaynak_dosya` var; runtime chunk'ında etiket
    ("3071 dilekce hakki kanunu") boşluk→_ ile dosya adına döner.
    """
    kaynak = str(chunk.get("kaynak_dosya", "") or "")
    if kaynak.endswith(".txt"):
        return kaynak[:-4]
    if kaynak:
        return kaynak
    etiket = str(chunk.get("mevzuat", "") or "").strip()
    return etiket.replace(" ", "_") if etiket else ""


def _chunks_from_corpus(src_dir: Path) -> list[dict[str, Any]]:
    """Korpus *.txt → madde-bazlı chunk kayıtları (seed indeksi yoksa runtime)."""
    kayitlar: list[dict[str, Any]] = []
    if not src_dir.is_dir():
        return kayitlar
    for path in sorted(src_dir.glob("*.txt")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        etiket = path.stem.replace("_", " ")
        chunks = chunk_mevzuat(text, subchunk=False)
        madde_var = any(c.metadata.get("madde_no") is not None for c in chunks)
        for chunk in chunks:
            govde = chunk.text.strip()
            if len(govde) < _MIN_CHUNK_CHARS:
                continue
            # Önsöz/künye chunk'ını (madde başlığı YOK) ele — seed yolu ile aynı
            # davranış (retrieval'da "[DOĞRULA:]" gürültüsü üretmesin).
            if madde_var and chunk.metadata.get("madde_no") is None:
                continue
            kayitlar.append({
                "mevzuat": etiket,
                "kaynak_dosya": path.name,   # seed indeksle parite (öneri → okuma modalı bağı)
                "madde_no": chunk.metadata.get("madde_no"),
                "text": govde,
            })
    return kayitlar


@lru_cache(maxsize=1)
def _load_index() -> tuple[dict[str, Any], ...]:
    """Mevzuat chunk indeksi — seed JSON öncelikli, yoksa korpustan runtime build.

    lru_cache: indeks process ömrü boyunca bir kez kurulur (her node çağrısında
    dosya okuma/chunk'lama tekrar etmez). Test izolasyonu için cache_clear var.
    """
    if _INDEX_FILE.is_file():
        try:
            payload = json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
            chunks = payload.get("chunks") or []
            if chunks:
                return tuple(chunks)
        except (OSError, ValueError) as exc:
            log.warning("mevzuat_oner.index_read_failed", hata=str(exc))
    return tuple(_chunks_from_corpus(_MEVZUAT_DIR))


# BM25 modeli indeks başına BİR kez kurulur (her sorguda yeniden token'lama yok).
# lru_cache kullanılamaz: chunks (dict tuple) hashable değil → id-anahtarlı memo.
# _load_index lru_cached olduğundan aynı tuple objesi döner (id sabit) → güvenli.
_BM25_MEMO: dict[int, Any] = {}


def _bm25_model(chunks: tuple[dict[str, Any], ...]) -> Any:
    """BM25Okapi'yi indeks için BİR kez kur (id-anahtarlı memo).

    rank_bm25 yoksa/hata → None döner; caller stdlib term-overlap fallback'e geçer.
    """
    anahtar = id(chunks)
    if anahtar in _BM25_MEMO:
        return _BM25_MEMO[anahtar]
    try:
        from rank_bm25 import BM25Okapi

        corpus_tokens = [_tokenize(c["text"]) for c in chunks]
        model = BM25Okapi(corpus_tokens, k1=_BM25_K1, b=_BM25_B)
        # Şeffaflık: hangi retrieval aktif? rank-bm25 çekirdek bağımlılık olduğundan
        # normalde buraya girilir; aksi (aşağıdaki WARN) ortam bozuk demektir.
        log.info(
            "mevzuat_oner.bm25_active",
            motor="BM25Okapi", k1=_BM25_K1, b=_BM25_B, n_chunk=len(chunks),
        )
    except Exception as exc:  # rank_bm25 yok/hata → stdlib term-overlap fallback
        # DÜRÜSTLÜK: BM25 düşerse "BM25 retrieval" iddiası geçersizdir. Bunu sessiz
        # bırakmak yerine WARN logla — fallback term-overlap'tir, BM25 değil.
        log.warning(
            "mevzuat_oner.bm25_unavailable_fallback",
            hata=str(exc),
            not_="rank-bm25 kurulu değil → stdlib term-overlap fallback aktif; 'BM25' iddiası bu modda GEÇERSİZ. Düzelt: uv sync (rank-bm25 çekirdek bağımlılık).",
        )
        model = None
    _BM25_MEMO[anahtar] = model
    return model


# 2005-7 (SDP genelge) ÖNCE (aksi halde \d{3,4} "2005"i yutar), sonra 3-4 hane.
_KANUN_NO_RE = re.compile(r"\b(2005[-/]7)\b|\b(\d{3,4})\b")


def _kanun_nolari(metin: str) -> set[str]:
    """Bir mevzuat etiketi/başlığından kanun numaraları (tür→mevzuat eşleşme anahtarı)."""
    nolar: set[str] = set()
    for m in _KANUN_NO_RE.finditer(metin or ""):
        no = m.group(1) or m.group(2)
        if no:
            nolar.add(no.replace("/", "-"))
    return nolar


def _beklenen_kanun_nolari(turu: str) -> set[str]:
    """config.EVRAK_TO_MEVZUAT'tan türe atanan beklenen kanun numaraları (ön-filtre/boost)."""
    nolar: set[str] = set()
    for baslik in EVRAK_TO_MEVZUAT.get(turu, []):
        nolar |= _kanun_nolari(baslik)
    return nolar


def _izin_jurisdiksiyon(text: str) -> str | None:
    """İçerik bir izin (dinlenme) matı ise onu düzenleyen kanun no; değilse None.

    Aynı "yıllık izin" ifadesi 657 (memur)/4857 (işçi)/854 (denizci)'de geçer. KAMU evrak
    sistemi olduğundan varsayılan memurdur (657); yalnız içerikte AÇIK iş-hukuku ya da
    deniz-iş sinyali varsa özel-hukuk kanununa yönlendirilir → memur izin talebi 657'yi öne
    alırken işçi/denizci uyuşmazlığı 657'ye yanlış kilitlenmez. Eşleşme tr_lower substring.
    """
    q = tr_lower(text)
    if not any(t in q for t in IZIN_TERIMLERI):
        return None
    if any(s in q for s in IZIN_DENIZ_SINYAL):
        return "854"
    if any(s in q for s in IZIN_ISCI_SINYAL):
        return "4857"
    return "657"


# Tür → beklenen-kanun BOOST katsayısı: doğru kanun chunk'ı top skorla çarpılır
# (ön-filtre yerine ölçekleme → güçlü ham eşleşme hâlâ kazanabilir, dürüstlük).
# Ölçüldü: 1.6 ile CİMER/dilekçe/tebligat doğru maddesi gürültülü 2646 maddesini geçer.
_TUR_BOOST = 1.6


def _score(query: str, chunks: tuple[dict[str, Any], ...]) -> list[tuple[float, dict[str, Any]]]:
    """(score, chunk) azalan sıralı — BM25Okapi (varsa) yoksa term-overlap.

    NOT: tür→mevzuat boost burada UYGULANMAZ (saf BM25). Boost _from_corpus'ta
    eklenir → bu yardımcı (testlerde de) saf retrieval davranışını korur.
    """
    q_tokens = _tokenize(query)
    if not q_tokens or not chunks:
        return []
    bm25 = _bm25_model(chunks)
    if bm25 is not None:
        scores = list(bm25.get_scores(q_tokens))
    else:  # stdlib term-overlap fallback
        q_set = set(q_tokens)
        scores = [
            float(sum(1 for t in _tokenize(c["text"]) if t in q_set)) for c in chunks
        ]
    ranked = sorted(
        ((float(s), chunks[i]) for i, s in enumerate(scores)),
        key=lambda x: -x[0],
    )
    return [r for r in ranked if r[0] > 0]


# Madde türü → başlık öneki. "Ek Madde 1" ve normal "Madde 1" AYNI madde_no'yu taşır
# (13 kanunda çakışma var, örn. 2985 toplu konut) → önek olmadan başlık belirsiz kalır ve
# dedup/link yanlış maddeyi hedefler. Önek ayrımı bu belirsizliği kapatır.
_MADDE_TUR_ONEK = {"ek": "ek m.", "gecici": "geç. m."}


def _baslik(chunk: dict[str, Any]) -> str:
    """Chunk metadata'sından öneri başlığı: madde_no varsa 'm.<no>' (ek/geçici önekli), yoksa [DOĞRULA:]."""
    mevzuat = str(chunk.get("mevzuat", "")).strip() or "mevzuat"
    madde_no = chunk.get("madde_no")
    if madde_no is not None:
        onek = _MADDE_TUR_ONEK.get(str(chunk.get("madde_tur") or ""), "m.")
        return f"{mevzuat} {onek}{madde_no}"
    return f"{mevzuat} [DOĞRULA: madde no]"


# Konu + evrak türü = en güçlü alaka sinyali; ham gövde boilerplate ("arz ederim",
# "imza") gürültüsü taşır ve genel resmî-yazı maddelerini (2646) kayırır. Konu/türü
# tekrar ederek ağırlandırırız (standart sorgu-genişletme) → domain-spesifik madde
# (3071 m.4 dilekçe) gövde-boilerplate'i geçer. Ölçüldü: dilekçe → 3071 m.4 TOP-1.
_QUERY_BOOST = 3
_EVRAK_TEXT_CHARS = 600


def _domain_terimleri(turu_key: str) -> str:
    """Türün EVRAK_TO_MEVZUAT başlıklarından sorgu-genişletme terimleri (hijyenli).

    Başlıklar sorguya OLDUĞU GİBİ giremez (ölçüldü, eval kaçışları):
      1. "m.4" atıfı "madde4" tokenine dönüşüp ×_QUERY_BOOST ağırlıkla HER kanunun
         4. maddesiyle eşleşir (5176 etik kurulu m.4, dilekçe-ailesi sorgularında
         içeriği ezdi → talep→657/4734 tam kaçış).
      2. Kanun NUMARASI kanunun kendi maddelerinde GEÇMEZ; yalnız onu adıyla anan
         çapraz-atıf chunk'larıyla eşleşir (5690 CİMER m.1 "...Kanun (3071)" alıntısı
         dilekçe sorgusunda 3071 m.4'ü geçti). Doğru kanuna yönlendirme numaranın işi
         değil _apply_boost'un işidir (etiket eşleşmesi) → numara sorguya girmez.
      3. "[DOĞRULA: ...]" girdileri başlık değil meta-nottur → atlanır.
    Geriye kanun adı/domain kelimeleri kalır ("Dilekçe", "Tebligat", "Bilgi Edinme").
    """
    parcalar = [
        _KANUN_NO_RE.sub(" ", _MADDE_REF_RE.sub(" ", baslik))
        for baslik in EVRAK_TO_MEVZUAT.get(turu_key, [])
        if not baslik.startswith("[DOĞRULA")
    ]
    return " ".join(" ".join(parcalar).split())


def _retrieval_query(state: dict[str, Any], *, domain_bastir: bool = False) -> str:
    """Sorgu: (konu+tür+domain-terim) ağırlıklı + metnin ilk bölümü (PII'siz).

    Tür anahtarı (`dilekce`) yerine Türkçe etiketi (`Dilekçe`) kullanılır → korpus
    metnindeki diakritikli terim ("dilekçe") ile eşleşir. Türe ait statik mevzuat
    başlıklarındaki domain terimleri (örn. "Tebligat", "Bilgi Edinme") de eklenir →
    BM25 doğru kanuna yönelir (sorgu-genişletme). Madde atıfları/DOĞRULA notları
    eklenMEZ (_domain_terimleri hijyeni).

    domain_bastir=True: tür-domain genişletmesi (VE Türkçe tür etiketi) sorgudan çıkarılır.
    İçerik biçimsel türle çeliştiğinde (izin talebi "dilekçe" sınıflanır) tür-domain vokabülü
    ("Dilekçe Hakkı Kanunu zorunlu unsurlar") 5690/5176/3071'i şişirip doğru izin kanununu
    boğar → izin tespit edilince (mevzuat_oner_node) yalnız konu+gövde ile aranır.
    """
    unsurlar = state.get("bilgi_unsurlari") or {}
    konu = str(unsurlar.get("konu", "") or "").strip()
    body = (state.get("evrak_text", "") or "")[:_EVRAK_TEXT_CHARS]
    if domain_bastir:
        boosted = " ".join(konu.split() * _QUERY_BOOST).strip()
        return " ".join(p for p in (boosted, body) if p)
    turu_key = (state.get("evrak_turu", "") or "").strip()
    turu = EVRAK_TURU_TR.get(turu_key, turu_key)
    domain = _domain_terimleri(turu_key)
    boosted = " ".join(f"{konu} {turu} {domain}".split() * _QUERY_BOOST).strip()
    return " ".join(p for p in (boosted, body) if p)


def _oneri(
    chunk: dict[str, Any], *, score: float, raw: float, q_token: int, **ek: Any
) -> dict[str, Any]:
    """Tek öneri kaydı — tüm retrieval yollarının ORTAK kurucusu (alan sözleşmesi tek yerde).

    `score`      : max-normalize (top≈1.0) — YALNIZ göreli sıralama sinyali, mutlak alaka DEĞİL.
    `raw_score`  : tür-boost'lu ham BM25 — sorgu uzunluğuyla ölçeklenir, belgeler arası
                   karşılaştırılamaz (CRAG mutlak-kalite sinyali olarak kullanılır).
    `norm_score` : raw_score / sorgu_token_sayısı — uzunluk düzeltmesi; belgeler arası
                   karşılaştırılabilir TEK mutlak sinyal. Güven bandı bundan türetilir
                   (eval/mevzuat_guven_kalibrasyon.py: top-1 AUC 0.964).
    """
    return {
        "baslik": _baslik(chunk),
        "snippet": _snippet(str(chunk.get("text", ""))),
        "kaynak_dosya": _kaynak_dosya(chunk),
        "madde_no": chunk.get("madde_no"),
        "madde_tur": chunk.get("madde_tur"),   # "madde"|"ek"|"gecici" → doğru maddeye link (ek≠normal)
        "score": round(score, 3),
        "raw_score": round(raw, 3),
        "norm_score": round(raw / q_token, 3) if q_token > 0 else 0.0,
        **ek,
    }


def _q_token(query: str) -> int:
    """Sorgunun (stopword'süz) token sayısı — norm_score paydası."""
    return len(_tokenize(query))


def _deepseek_rerank(
    query: str, deduped: list[tuple[float, dict[str, Any]]]
) -> list[dict[str, Any]] | None:
    """DeepSeek listwise rerank — SKORLAR KORUNUR, yalnız sıra/eleme değişir.

    BM25 dedup'lu top-N aday numaralı (başlık + kısaltılmış snippet) listeyle tek
    llm_json çağrısına verilir; dönen {"sira": [...]} KAPALI KÜME doğrulamasından
    geçer (retrieval.reranker.deepseek_listwise_sirala). None → caller BM25 sırasına
    AYNEN devam eder (mock/hata/ihlal/boş — deterministik fallback sözleşmesi).
    """
    if deduped[0][0] < _MIN_RAW_SCORE:
        return None  # zayıf retrieval'a LLM harcanmaz → BM25 yolu config fallback'ini uygular
    cands = deduped[:RERANK_CAND_N]
    adaylar = [
        {"baslik": _baslik(chunk), "snippet": _snippet(str(chunk.get("text", "")))}
        for _skor, chunk in cands
    ]
    try:
        from retrieval.reranker import deepseek_listwise_sirala

        sira = deepseek_listwise_sirala(query, adaylar)
    except Exception as exc:  # LLM köprüsü/beklenmedik hata → BM25'e graceful düş
        log.warning(
            "mevzuat_oner.rerank_unavailable_fallback", hata=str(exc),
            not_="DeepSeek listwise rerank başarısız → BM25 sıralaması.",
        )
        return None
    if sira is None:
        return None  # mock / kapalı-küme ihlali / boş çıktı → BM25 sırası aynen
    log.info(
        "mevzuat_oner.rerank_active",
        motor="deepseek-listwise", n_aday=len(cands), n_sonuc=min(len(sira), _TOP_K),
    )
    max_score = cands[0][0] or 1.0  # deduped azalan sıralı → BM25 lider skoru
    q_token = _q_token(query)
    return [
        _oneri(chunk, score=skor / max_score, raw=skor, q_token=q_token, rerank=True)
        for skor, chunk in (cands[i] for i in sira[:_TOP_K])
    ]


def _maybe_rerank(
    query: str, deduped: list[tuple[float, dict[str, Any]]]
) -> list[dict[str, Any]] | None:
    """İki-aşamalı retrieve-then-rerank: BM25 adaylarını yeniden sırala.

    Sağlayıcı seçimi (config.RERANK_PROVIDER):
      - "deepseek"      → listwise LLM rerank (_deepseek_rerank; model indirmez).
      - "cross-encoder" → bge-reranker-v2-m3 (aşağıdaki yol, birebir korunur).

    Dönüş sözleşmesi:
      - None  → rerank KAPALI (RERANK_ENABLED=0) veya model/LLM yok/hata/kapalı-küme
                ihlali → caller BM25'e düşer (baseline davranış birebir korunur).
      - []    → (yalnız cross-encoder) rerank AÇIK ama tüm adaylar RERANK_SCORE_MIN
                altında (kapsam-dışı) → uydurma yerine REDDET (caller config fallback).
      - liste → rerank sonucu öneri dict'leri (cross-encoder: score=alaka 0-1;
                deepseek: BM25 skorları korunur, yalnız sıra/eleme değişir).

    Graceful: sentence-transformers/torch/model yoksa (rag extra kurulu değil) WARN
    loglar ve None döner → demo/CI saf-BM25 ile çalışmaya devam eder.
    """
    if not RERANK_ENABLED or not deduped:
        return None
    if RERANK_PROVIDER == "deepseek":
        return _deepseek_rerank(query, deduped)
    try:
        from retrieval.reranker import get_reranker

        cands = [
            {"text": c.get("text", ""), "mevzuat": c.get("mevzuat", ""),
             "kaynak_dosya": c.get("kaynak_dosya", ""),
             "madde_no": c.get("madde_no"), "madde_tur": c.get("madde_tur"), "score": float(s)}
            for s, c in deduped[:RERANK_CAND_N]
        ]
        results = get_reranker().rerank(query, cands, top_k=_TOP_K)
    except Exception as exc:  # rag extra/model yok → BM25'e graceful düş
        log.warning(
            "mevzuat_oner.rerank_unavailable_fallback", hata=str(exc),
            not_="cross-encoder reranker yok (rag extra + model gerekir) → BM25 sıralaması.",
        )
        return None
    log.info(
        "mevzuat_oner.rerank_active",
        motor="bge-reranker-v2-m3", n_aday=len(cands), n_sonuc=len(results),
    )
    q_token = _q_token(query)
    # NOT: bu yolda `score` cross-encoder alakasıdır (0-1, MUTLAK) — diğer yollardaki
    # max-normalize skordan farklı anlam taşır; `norm_score` yine ham BM25'ten türer.
    return [
        _oneri(
            {"mevzuat": r.metadata.get("mevzuat", ""),
             "kaynak_dosya": r.metadata.get("kaynak_dosya", ""),
             "madde_no": r.metadata.get("madde_no"),
             "madde_tur": r.metadata.get("madde_tur"), "text": r.text},
            score=float(r.score), raw=float(r.original_score), q_token=q_token, rerank=True,
        )
        for r in results
    ]


def _from_corpus(query: str, turu: str = "", *, ek_beklenen: frozenset[str] = frozenset()) -> list[dict[str, Any]]:
    """Korpustan retrieval önerileri (boş liste → caller statik'e düşer).

    İki aşama: (1) BM25Okapi recall (tür-boost + dedup); (2) opt-in cross-encoder
    rerank (RERANK_ENABLED) — kapalıyken saf BM25 birebir korunur.

    Tür → mevzuat BOOST: config.EVRAK_TO_MEVZUAT'ta türe atanan kanunlara ait chunk'lar
    `_TUR_BOOST` ile ölçeklenir (alaka sinyali). Dedup (aynı mevzuat+madde) + min-skor.

    NOT (CRAG için): `score` max-normalize (top≈1.0); `raw_score` (boost'lu ham BM25)
    da eklenir → CRAG mutlak retrieval kalitesini ölçebilir (additive).
    """
    ranked = _score(query, _load_index())
    if not ranked:
        return []
    beklenen = _beklenen_kanun_nolari(turu) if turu else set()
    # İçerik-sinyali (izin jurisdiksiyonu) türden BAĞIMSIZ eklenir: biçimsel tür yanlış kanuna
    # boost verse bile, içeriğin işaret ettiği doğru kanun (memur→657/işçi→4857/denizci→854)
    # boost kümesine katılır. Doğru jurisdiksiyon mevzuat_oner_node'da seçilir.
    beklenen |= ek_beklenen
    boosted = _apply_boost(ranked, beklenen)
    boosted.sort(key=lambda x: -x[0])
    deduped = _dedup(boosted)
    # Aşama 2 — cross-encoder rerank (opt-in + graceful). None → BM25 yoluna devam.
    reranked = _maybe_rerank(query, deduped)
    if reranked is not None:
        return reranked
    top = deduped[:_TOP_K]
    if not top or top[0][0] < _MIN_RAW_SCORE:
        return []  # zayıf retrieval → config fallback (recall-koruyucu)
    max_score = top[0][0] or 1.0
    q_token = _q_token(query)
    oneriler = [
        _oneri(chunk, score=score / max_score, raw=score, q_token=q_token)
        for score, chunk in top
    ]
    # S7 — GraphRAG-lite (ENV-gated): top sonuçların atıf verdiği mevzuattan 1-hop ek aday.
    if ATIF_GENISLET_ENABLED:
        from retrieval.atif_grafi import atif_ek_adaylar

        oneriler += [
            _oneri(chunk, score=score / max_score, raw=score, q_token=q_token,
                   atif_genisletme=True)
            for score, chunk in atif_ek_adaylar(top, deduped)
        ]
        if len(oneriler) > len(top):
            log.info("mevzuat_oner.atif_genisletme", n_ek=len(oneriler) - len(top))
    return oneriler


def _apply_boost(
    ranked: list[tuple[float, dict[str, Any]]], beklenen: set[str]
) -> list[tuple[float, dict[str, Any]]]:
    """Türe atanan kanun chunk'larını `_TUR_BOOST` ile ölçekle (config uyumlu)."""
    if not beklenen:
        return list(ranked)
    out: list[tuple[float, dict[str, Any]]] = []
    for score, chunk in ranked:
        if _kanun_nolari(str(chunk.get("mevzuat", ""))) & beklenen:
            score *= _TUR_BOOST
        out.append((score, chunk))
    return out


def _dedup(
    ranked: list[tuple[float, dict[str, Any]]]
) -> list[tuple[float, dict[str, Any]]]:
    """Aynı (mevzuat, madde_no, madde_tur) üçlüsünü tek öneriye indir (en yüksek skorlu kalır).

    madde_tur anahtara DAHİL: "Madde 1" ile "Ek Madde 1" aynı madde_no'yu taşır (13 kanunda
    çakışma) → tür anahtardan çıkarılırsa biri diğerini sessizce eler ve yanlış madde önerilir.
    """
    gorulen: set[tuple[str, Any, Any]] = set()
    out: list[tuple[float, dict[str, Any]]] = []
    for score, chunk in ranked:
        anahtar = (str(chunk.get("mevzuat", "")), chunk.get("madde_no"), chunk.get("madde_tur"))
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        out.append((score, chunk))
    return out


def _from_config(turu: str) -> list[dict[str, Any]]:
    """config.EVRAK_TO_MEVZUAT statik başlıkları (kaynaklı; uydurma yok)."""
    basliklar = EVRAK_TO_MEVZUAT.get(turu, [])
    if basliklar:
        return [{"baslik": b, "score": 0.5} for b in basliklar]
    return [{
        "baslik": "Resmî Yazışmalarda Uygulanacak Usul ve Esaslar Hk. Yönetmelik (CB 2646/2020)",
        "score": 0.3,
    }]


async def mevzuat_oner_node(state: dict[str, Any]) -> dict[str, Any]:
    """İlgili mevzuatı öner — korpus BM25 retrieval birincil, statik config fallback."""
    turu = state.get("evrak_turu", "belirsiz")

    # İzin (dinlenme) matı mı? Biçimsel tür yanıltıcı olabildiğinden (izin talebi = "dilekçe")
    # jurisdiksiyon evrak İÇERİĞİNDEN seçilir (konu + gövde). İzinse: (1) doğru kanunu boost'la,
    # (2) yanıltıcı tür-domain kirliliğini bastır (yalnız konu+gövde ile ara).
    unsurlar = state.get("bilgi_unsurlari") or {}
    icerik = f"{unsurlar.get('konu', '') or ''} {(state.get('evrak_text', '') or '')[:_EVRAK_TEXT_CHARS]}"
    izin_kanun = _izin_jurisdiksiyon(icerik)
    query = _retrieval_query(state, domain_bastir=bool(izin_kanun))
    ek_beklenen = frozenset({izin_kanun}) if izin_kanun else frozenset()

    oneriler: list[dict[str, Any]] = []
    if len(query) >= _MIN_QUERY_LEN:
        oneriler = _from_corpus(query, turu, ek_beklenen=ek_beklenen)
    kaynak = "corpus" if oneriler else "config"
    if not oneriler:
        oneriler = _from_config(turu)

    log.info("mevzuat_oner", turu=turu, kaynak=kaynak, n=len(oneriler), izin_kanun=izin_kanun)
    return {"mevzuat_onerileri": oneriler}


__all__ = ("mevzuat_oner_node",)
