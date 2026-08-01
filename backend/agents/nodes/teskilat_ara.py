"""Teşkilat korpusunda birim araması — kaynak-doğrulamalı yönlendirmenin arama primitifi.

`birim_ara` aracının offline backend'i (bkz. OfficialSourceSearch, arac_cekirdek). BM25
çekirdeği mevzuat_oner deseninden ADAPT (rank_bm25 + stdlib term-overlap fallback; mock/CI'da
çalışır, ağ yok). Kurum-slug filtreli; kuruma-özel dizin yoksa kurum TİPİNE göre jenerik
şablona düşer (aday/sorgu genişletme — doğrulanmış hedef DEĞİL).

Çıktı `KaynakKaydi` uyumlu dict listesi; her aday `kaynak_tipi` taşır:
  - "kurum_ozel": resmî URL + kaynak türü + doğrulama metadatası bulunan kurum kaynağı.
  - "aday": eski şablon, yerel kimlik veya doğrulanmamış kurum kaynağı; yalnız insan onayına öneri.
  - "jenerik": kurum-tipi şablon → yalnız aday; tek başına otomatik yönlendirme yapılmaz.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog

from agents.nodes.teskilat_mevzuat import KAYNAK_TIPI as MEVZUAT_KAYNAK_TIPI
from agents.nodes.teskilat_mevzuat import kapsam_cozumle
from agents.nodes.teskilat_mevzuat import onbellegi_temizle as mevzuat_onbellegi_temizle
from core.kaynak_guveni import RESMI_DOGRULANMIS
from core.sicil import sicil_turu
from core.text import tr_lower

log = structlog.get_logger()

_ROOT = Path(__file__).resolve().parents[3]
_INDEX_FILE = _ROOT / "data" / "teskilat" / "teskilat_index.json"
_WORD_RE = re.compile(r"[0-9a-zçğıöşü]+")
_BM25_K1 = 1.5
_BM25_B = 0.3
_TOP_K = 5

# Kurum tipi → jenerik şablon slug'ı (kuruma-özel dizin yoksa aday kaynağı).
_TIP_JENERIK: dict[str, str] = {
    "belediye": "_genel-belediye",
    "il_ozel_idare": "_genel-belediye",
    "valilik": "_genel-il-mudurlukleri",
    "kaymakamlik": "_genel-il-mudurlukleri",
    "bakanlik": "_genel-il-mudurlukleri",
    "defterdarlik": "_genel-il-mudurlukleri",
    "universite": "_genel-universite",
    "bassavcilik": "_genel-adliye",
    # Sicil taksonomisi (docs/10-kurum-sicili.md). YALNIZ karşılığı GERÇEKTEN olan tür
    # eşlenir; karşılığı olmayan tür (elektrik_dagitim, su_kanalizasyon, ust_kurul, kit,
    # kalkinma_ajansi...) bilinçli olarak eşlenmez — yanlış tipin şablonunu aday diye
    # göstermektense hiç aday üretmemek doğrudur.
    "il_mudurlugu": "_genel-il-mudurlukleri",
    "dogalgaz_dagitim": "_genel-dogalgaz-dagitim",
}
# tur bilinmiyorsa denenecek jenerik şablonlar (aday havuzu).
_JENERIK_HEPSI = ("_genel-belediye", "_genel-il-mudurlukleri")

_STOPWORDS: frozenset[str] = frozenset({
    "ve", "veya", "ile", "ya", "da", "de", "ki", "bu", "şu", "o", "bir", "için",
    "gibi", "kadar", "göre", "ise", "ancak", "ayrıca", "her", "hem", "en",
    "arz", "ederim", "rica", "ederiz", "gereğini", "gereği", "bilgilerinize",
    "konusunda", "hakkında", "ilgili", "talep", "konu", "sayın", "müdürlüğü",
    "müdürlük", "başkanlığı", "belediye", "belediyesi", "şikayet", "şikâyet",
    "ihbar", "başvuru", "işlem", "işlemler", "gerekli", "yapılması", "edilmesi",
})


_BAGLAC = frozenset({"ve", "ile"})


def _bagsiz(slug: str) -> str:
    """Slug'ı bağlaçsız normale indir — 'aile-ve-sosyal' ve 'aile-sosyal' aynı anahtara düşer."""
    return "-".join(p for p in slug.split("-") if p not in _BAGLAC)


def _tokenize(s: str) -> list[str]:
    return [t for t in _WORD_RE.findall(tr_lower(s)) if t not in _STOPWORDS]


def kelime_uyum_skoru(sorgu: str, hedef: str) -> float:
    """Return a conservative exact-or-stem word match score for Turkish inflections."""
    if not sorgu or not hedef:
        return 0.0
    if sorgu == hedef:
        return 1.0
    kisa, uzun = sorted((sorgu, hedef), key=len)
    if len(kisa) >= 4 and uzun.startswith(kisa):
        return 0.72
    return 0.0


def _index_revision() -> tuple[Any, ...]:
    """Atomik indeks degisimini process restart gerektirmeden fark eden stat kimligi."""
    try:
        stat = _INDEX_FILE.stat()
        return (stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size)
    except OSError:
        return (0, 0, 0)


@lru_cache(maxsize=3)
def _load_payload_revision(_revision: tuple[Any, ...]) -> dict[str, Any]:
    """teskilat_index.json ham payload (seed_teskilat.py üretir). Yoksa boş dict."""
    if _INDEX_FILE.is_file():
        try:
            return json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            log.warning("teskilat_ara.index_read_failed", hata=str(exc))
    return {}


def _load_payload() -> dict[str, Any]:
    return _load_payload_revision(_index_revision())


def _load_index() -> tuple[dict[str, Any], ...]:
    """Index chunk listesi."""
    return tuple(_load_payload().get("chunks") or ())


def _aliases() -> dict[str, str]:
    """@ALIAS haritası: alias-slug → kanonik kurum-slug (ör. uedas → uludag-elektrik-dagitim)."""
    return dict(_load_payload().get("aliases") or {})


@lru_cache(maxsize=512)
def _kanonik_slug_revision(kurum_slug: str, _revision: tuple[Any, ...]) -> str:
    """Slug'ı korpustaki kanonik kurum dizinine çözümle; çözülemezse "".

    Sıra: (1) birebir dizin, (2) @ALIAS haritası, (3) İL-ADI-KIRPMA — "ankara-sosyal-guvenlik-
    il-mudurlugu" → baştan 1-2 token at, kalan için (1)+(2) tekrar dene. Böylece her ildeki
    aynı-tip taşra birimi ("X Sosyal Güvenlik İl Müdürlüğü") tek ulusal kurum kaydına düşer.
    """
    slug = (kurum_slug or "").strip()
    if not slug or slug.startswith("_"):
        return ""
    # GÜVENLİK (REVİZYON 2): "_"-önekli jenerik şablonlar KANONİK hedef OLAMAZ — alias bir
    # jenerik şablona işaret etse bile kurum-özel çözümleme reddedilir (jenerik yol ayrı;
    # aksi halde şablon adayları kurum_ozel görünüp üçlü grounding'i yanıltır).
    mevcut = {c.get("kurum_slug") for c in _load_index()
              if not str(c.get("kurum_slug", "")).startswith("_")}
    aliases = _aliases()
    adaylar = [slug]
    parcalar = slug.split("-")
    if len(parcalar) > 2:
        adaylar.append("-".join(parcalar[1:]))   # il adı kırp (tek token)
    if len(parcalar) > 3:
        adaylar.append("-".join(parcalar[2:]))   # iki token (ör. "afyon-karahisar-...")
    for aday in adaylar:
        if aday in mevcut:
            return aday
        hedef = aliases.get(aday, "")
        if hedef and not hedef.startswith("_") and hedef in mevcut:
            return hedef
    # (4) BAĞLAÇ NORMALİZASYONU — kurum_kimlik._slug "ve"/"ile" bağlacını ATAR
    # ("aile-sosyal-hizmetler-bakanligi") ama korpus dizinleri bağlacı İÇEREBİLİR
    # ("aile-ve-sosyal-hizmetler-bakanligi"). Bu uyuşmazlık, elle @ALIAS yazılmamış
    # kurumları (AFAD, Çevre-Şehircilik, Hazine ve Maliye...) evraktan ERİŞİLEMEZ
    # yapıyordu — 2026-07-24 çapraz doğrulama bulgusu. Yalnız 1-3 sonuçsuz kalınca
    # çalışır (mevcut çözümleme sırası DEĞİŞMEZ) ve iki dizin aynı normale düşerse
    # belirsizlik sayılıp çözümlenmez.
    hedefler: dict[str, str] = {}
    for kurum in mevcut:
        anahtar = _bagsiz(kurum)
        if anahtar in hedefler and hedefler[anahtar] != kurum:
            hedefler[anahtar] = ""
        else:
            hedefler.setdefault(anahtar, kurum)
    for aday in adaylar:
        hedef = hedefler.get(_bagsiz(aday), "")
        if hedef:
            return hedef
    return ""


def _kanonik_slug(kurum_slug: str) -> str:
    return _kanonik_slug_revision(kurum_slug, _index_revision())


@lru_cache(maxsize=192)
def _slug_chunks_revision(
    kurum_slug: str,
    _revision: tuple[Any, ...],
) -> tuple[dict[str, Any], ...]:
    """Bir kurum slug'ına ait chunk'lar (lru_cache — BM25 memo için sabit tuple id)."""
    return tuple(c for c in _load_index() if c.get("kurum_slug") == kurum_slug)


def _slug_chunks(kurum_slug: str) -> tuple[dict[str, Any], ...]:
    return _slug_chunks_revision(kurum_slug, _index_revision())


def _resmi_slug_chunks(kurum_slug: str) -> tuple[dict[str, Any], ...]:
    """Only source records explicitly verified as official may ground an automatic route."""
    return tuple(
        c for c in _slug_chunks(kurum_slug)
        if c.get("kaynak_guven") == "resmi_dogrulanmis"
    )


# BM25 modeli chunk-tuple başına bir kez kurulur (id-anahtarlı memo; _slug_chunks lru_cached).
_BM25_MEMO: dict[int, Any] = {}


def indeks_onbellegini_temizle() -> None:
    """Test/operasyon icin tum teskilat indeks ve BM25 onbelleklerini temizle."""
    _load_payload_revision.cache_clear()
    _kanonik_slug_revision.cache_clear()
    _slug_chunks_revision.cache_clear()
    _BM25_MEMO.clear()
    mevzuat_onbellegi_temizle()


def _bm25_model(chunks: tuple[dict[str, Any], ...]) -> Any:
    """BM25Okapi kur (memo). rank_bm25 yok/hata → None (stdlib term-overlap fallback)."""
    anahtar = id(chunks)
    if anahtar in _BM25_MEMO:
        return _BM25_MEMO[anahtar]
    if len(_BM25_MEMO) >= 192:
        _BM25_MEMO.clear()
    model: Any = None
    try:
        from rank_bm25 import BM25Okapi

        corpus_tokens = [_tokenize(c["text"]) for c in chunks]
        model = BM25Okapi(corpus_tokens, k1=_BM25_K1, b=_BM25_B)
    except Exception as exc:  # rank_bm25 yok/hata → term-overlap fallback
        log.warning("teskilat_ara.bm25_unavailable_fallback", hata=str(exc))
        model = None
    _BM25_MEMO[anahtar] = model
    return model


def _score(konu: str, chunks: tuple[dict[str, Any], ...]) -> list[tuple[float, dict[str, Any]]]:
    """(skor, chunk) azalan — BM25Okapi (varsa) yoksa term-overlap. Skoru 0 olanlar elenir."""
    q = _tokenize(konu)
    if not q or not chunks:
        return []
    bm25 = _bm25_model(chunks)
    if bm25 is not None:
        skorlar = list(bm25.get_scores(q))
    else:
        q_set = set(q)
        skorlar = [float(sum(1 for t in _tokenize(c["text"]) if t in q_set)) for c in chunks]
    # "yol", "su", "imar" gibi kısa görev alanlarını kaçırmamak için üç harfli
    # terimler de kök eşleşmesine girer. Arama zaten kurum ile sınırlıdır.
    q_benzersiz = tuple(dict.fromkeys(t for t in q if len(t) >= 3))
    zengin: list[tuple[float, dict[str, Any]]] = []
    for i, raw_skor in enumerate(skorlar):
        chunk = chunks[i]
        hedef_tokenlari = tuple(dict.fromkeys(_tokenize(chunk.get("text", ""))))
        kok_skoru = sum(
            max((kelime_uyum_skoru(s, h) for h in hedef_tokenlari), default=0.0)
            for s in q_benzersiz
        )
        # Küçük (özellikle tek kayıtlı) korpuslarda BM25'in IDF düzeltmesi negatif
        # skor üretebilir. Bu, gerçek bir terim eşleşmesini elememeli; kök eşleşmesi
        # yine yalnızca sıralamayı/erişimi destekler.
        skor = max(0.0, float(raw_skor)) + (kok_skoru * 0.45)
        zengin.append((skor, chunk))
    sirali = sorted(zengin, key=lambda x: (-x[0], x[1].get("birim_ad", "")))
    return [r for r in sirali if r[0] > 0]


def _mevzuat_adaylari(kurum_slug: str, konu: str, top_k: int) -> list[dict[str, Any]]:
    """Adım 1.5 — mevzuatla tür geneli zorunlu kılınmış birimleri kuruma genişlet.

    Şablon chunk'ları puanlanır, sonra künye SOMUT kuruma yazılır (kurum_slug/kurum_ad).
    Kapsam ve hash doğrulaması `teskilat_mevzuat`'a aittir (INV-6/INV-8); burada yalnız
    puanlama ve künye yazımı yapılır. Bkz. docs/11-mevzuat-teskilat.md.
    """
    genisleme = kapsam_cozumle(_load_payload(), kurum_slug)
    if genisleme is None:
        return []
    # GÜVENLİK: doğrulama DİZİNE değil, chunk'ın KENDİ dosyasına bağlanır. Aksi hâlde şablon
    # dizinine bırakılan manifest-dışı bir .txt, doğrulanmış şablonun yetkisini ödünç alırdı
    # (güvenlik denetimi bulgusu F1). Chunk ayrıca resmi_dogrulanmis olmak zorundadır.
    chunks = tuple(
        c for c in _slug_chunks(genisleme.sablon_slug)
        if c.get("kaynak_dosya") == genisleme.kaynak_dosya
        and c.get("kaynak_guven") == RESMI_DOGRULANMIS
    )
    if not chunks:
        return []
    adaylar: list[dict[str, Any]] = []
    for skor, chunk in _score(konu, chunks)[:top_k]:
        aday = _aday(chunk, skor, MEVZUAT_KAYNAK_TIPI)
        aday["kurum_slug"] = genisleme.kurum_slug
        aday["kaynak_kurum"] = genisleme.kurum_ad
        aday["sablon_slug"] = genisleme.sablon_slug
        adaylar.append(aday)
    return adaylar


def _aday(chunk: dict[str, Any], skor: float, kaynak_tipi: str) -> dict[str, Any]:
    """Chunk → KaynakKaydi-uyumlu aday dict (icerik_hash + kaynak_tipi eklenir)."""
    import hashlib

    metin = chunk.get("text", "")
    return {
        "birim_ad": chunk.get("birim_ad", ""),
        "gorev": chunk.get("gorev", ""),
        "kaynak_kurum": chunk.get("kurum_ad", ""),
        "kurum_slug": chunk.get("kurum_slug", ""),
        "belge_basligi": chunk.get("belge_basligi", ""),
        "url_veya_belge_kimligi": chunk.get("kaynak_kimlik", ""),
        "erisim_tarihi": chunk.get("erisim", ""),
        "metin_parcasi": metin[:400],
        "icerik_hash": hashlib.sha256(metin.encode("utf-8")).hexdigest()[:16],
        "skor": round(skor, 3),
        "kaynak_tipi": kaynak_tipi,
        "kaynak_guven": chunk.get("kaynak_guven", "aday"),
        "kaynak_dosya": chunk.get("kaynak_dosya", ""),
        "kaynak_sha256": chunk.get("icerik_sha256", ""),
        "dogrulayan": chunk.get("dogrulayan", ""),
        "dogrulama_tarihi": chunk.get("dogrulama_tarihi", ""),
    }


def teskilat_birim_ara(
    kurum_slug: str,
    konu: str,
    *,
    tur: str = "",
    top_k: int = _TOP_K,
) -> list[dict[str, Any]]:
    """Kurumun teşkilatında konuya en uygun birimleri ara (offline BM25).

    Önce doğrulanmış kuruma-özel kayıtlar (kaynak_tipi='kurum_ozel'); bunlar yoksa aynı kurumun
    eski/doğrulanmamış kayıtları insan onayı için (kaynak_tipi='aday') döner. Son aşamada kurum
    tipine göre jenerik şablon (kaynak_tipi='jenerik') kullanılır. Yalnız ilk tür otomatik hedef
    üretebilir. Boş konu/korpus → boş liste.
    """
    kurum_slug = (kurum_slug or "").strip()
    # 1) Kuruma-özel kaynak — alias + il-adı-kırpma çözümlemesiyle (uedas, ankara-sgk-... vb.)
    kanonik = _kanonik_slug(kurum_slug)
    if kanonik:
        resmi = _resmi_slug_chunks(kanonik)
        if resmi:
            aday = [_aday(c, s, "kurum_ozel") for s, c in _score(konu, resmi)[:top_k]]
            if aday:
                return aday
    # 1.5) Mevzuatla tür geneli zorunlu birimler (docs/11) + kurumun KENDİ doğrulanmamış kaydı.
    # İkisi BİRLİKTE döner: erken dönüş, kurumun kendi kaydını memurdan gizliyordu (güvenlik
    # denetimi bulgusu F8). Kuruma-özel kayıt önce sıralanır — tür-genel bir şablon, kurumun
    # kendi beyan ettiği birimi gölgelememelidir; ikisi de memur onayına gider.
    ozel_adaylar: list[dict[str, Any]] = []
    if kanonik:
        ozel = _slug_chunks(kanonik)
        if ozel:
            ozel_adaylar = [_aday(c, s, "aday") for s, c in _score(konu, ozel)[:top_k]]
    mevzuat = _mevzuat_adaylari(kanonik or kurum_slug, konu, top_k)
    if ozel_adaylar or mevzuat:
        return (ozel_adaylar + mevzuat)[:top_k] if mevzuat else ozel_adaylar
    # 2) Kurum tipine göre jenerik şablon(lar) — yalnız aday.
    # Çağıranın tipi bilinmiyorsa (kurum_kimlik kalıbı tutmayan SGK/TÜİK/il müdürlükleri...)
    # kurum SİCİLİNDEN tür sorulur. Sicil yalnız TÜR verir: hedef üretmez, otomatik havale
    # yetkisi kazandırmaz (INV-1/INV-2) — sonuç yine kaynak_tipi="jenerik" adaydır.
    etkin_tur = tur if tur in _TIP_JENERIK else (sicil_turu(kurum_slug) or tur)
    jenerik_sluglar = (
        [_TIP_JENERIK[etkin_tur]] if etkin_tur in _TIP_JENERIK else list(_JENERIK_HEPSI)
    )
    havuz: list[tuple[float, dict[str, Any]]] = []
    for js in jenerik_sluglar:
        havuz.extend(_score(konu, _slug_chunks(js)))
    havuz.sort(key=lambda x: -x[0])
    return [_aday(c, s, "jenerik") for s, c in havuz[:top_k]]


def kurum_korpusta_var(kurum_slug: str) -> bool:
    """Doğrulanmış kuruma-özel resmî kaynak var mı (alias/il-kırpma çözümlemesi dahil)?"""
    kanonik = _kanonik_slug(kurum_slug or "")
    return bool(kanonik and _resmi_slug_chunks(kanonik))


__all__ = ("kelime_uyum_skoru", "kurum_korpusta_var", "teskilat_birim_ara")
