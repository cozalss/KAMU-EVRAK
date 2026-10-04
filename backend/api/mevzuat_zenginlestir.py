"""Mevzuat önerisi şeffaflık zenginleştirme (B2) — kaynak/güven/eşleşme gerekçesi yüzeye çıkar.

"Kaynak göstermeyen öneri = güven kaybı" (kamu kullanımı). Bu modül pipeline state'inden
HER ZAMAN üretilebilen sinyalleri (retrieval skoru + [DOĞRULA] işareti + eşleşme gerekçesi)
ile NLI (varsa, ENV-gated) birleştirip her öneriye güven seviyesi + "insan incelemesi
önerilir" bayrağı ekler. SIFIR UYDURMA (CLAUDE.md §1): yürürlük yalnız başlıkta zaten VAR
olan parantezli sürümden alınır (örn. '(CB 2646/2020)'); üretilmez.

Güven bandı NEDEN `norm_score`'dan türer
----------------------------------------
Eskiden bant max-normalize `score`'dan geliyordu. `score` liderin kendine bölünmesiyle
üretilir (mevzuat_oner._from_corpus) → **top-1 daima 1.0** → çip retrieval kalitesinden
BAĞIMSIZ olarak daima "yüksek güven" yazardı. Gold sette ölçülen gerçek top-1 isabeti ise
0.60 idi: rozet her 5 evrakın 2'sinde yanılıyor ve memura bunu söylemiyordu.

`norm_score = raw_score / sorgu_token_sayısı` (uzunluk-düzeltilmiş BM25) top-1 doğruluğunu
AUC 0.964 ile ayırır. Aşağıdaki kenarlar ve `_BANT_ISABET` değerleri ÖLÇÜMDÜR, tahmin değil:

    uv run python -m eval.mevzuat_guven_kalibrasyon

Korpus ya da BM25 parametreleri (k1/b/boost) değişirse bu sabitler orada YENİDEN ölçülüp
güncellenmelidir; aksi halde "yüksek güven" iddiası dayanaksız kalır.
"""
from __future__ import annotations

import re
from typing import Any

# Başlıkta zaten bulunan parantezli sürüm/yıl (uydurma değil — kaynak metni yüzeye çıkarır).
_YURURLUK_RE = re.compile(r"\(([^()]*\b(?:19|20)\d{2}\b[^()]*)\)")

# --- Kalibre bant kenarları (norm_score) + o bandın gold sette ÖLÇÜLEN top-1 isabeti ---
# n=204 evrak, taban isabet 0.598. Kaynak: eval/mevzuat_guven_kalibrasyon.py
_BANT_YUKSEK = 1.40   # ölçülen isabet 0.971 (n=103)
_BANT_ORTA = 1.20     # ölçülen isabet 0.562 (n=32)
#                       altı: ölçülen isabet 0.058 (n=69) → pratikte yanlış öneri
_BANT_ISABET: dict[str, float] = {"yüksek": 0.971, "orta": 0.562, "düşük": 0.058}

# --- Eski (norm_score YOKKEN) skor eşikleri: config fallback statik önerileri ---
# `_from_config` retrieval yapmaz, elle küratörlenmiş tür→mevzuat eşlemesi döner (score
# 0.5/0.3). Bunlar ölçülmüş bir retrieval bandı DEĞİL → `guven_isabet` verilmez.
_STATIK_YUKSEK = 0.6
_STATIK_ORTA = 0.4


def _yururluk(baslik: str) -> str:
    m = _YURURLUK_RE.search(baslik or "")
    return m.group(1).strip() if m else ""


def _bant(norm_score: float | None, score: float) -> tuple[str, float | None]:
    """(güven, ölçülen_isabet). norm_score varsa kalibre mutlak bant; yoksa statik skor."""
    if norm_score is None:
        if score >= _STATIK_YUKSEK:
            return "yüksek", None
        return ("orta", None) if score >= _STATIK_ORTA else ("düşük", None)
    if norm_score >= _BANT_YUKSEK:
        return "yüksek", _BANT_ISABET["yüksek"]
    if norm_score >= _BANT_ORTA:
        return "orta", _BANT_ISABET["orta"]
    return "düşük", _BANT_ISABET["düşük"]


def _guven(
    norm_score: float | None, score: float, dogrula: bool, nli_destek: bool | None, *, ilk: bool
) -> tuple[str, float | None, bool]:
    """(güven, ölçülen_isabet, inceleme_oner). Öncelik: NLI > [DOĞRULA] > retrieval bandı.

    `ilk` (rank-1) DEĞİLSE ölçülen isabet İLİŞTİRİLMEZ. Gerekçe: altın set her evrak için
    ~tek beklenen kanun listeler → "bu öneri doğru mu?" sorusu yalnız ilk sıra için temiz
    biçimde ölçülebilir. 0.971 rakamını 3. sıradaki bir öneriye iliştirmek, düzeltilen
    hatanın (ölçülmemiş bir sayıyı kesinlikmiş gibi göstermek) küçük bir tekrarı olurdu.

    NLI "destek yok" dediyse ölçülen bant artık o öneriyi tarif etmez → isabet gizlenir.
    Aynı şekilde [DOĞRULA] işaretli bir öneri "yüksek güven" olamaz: madde no şüphelidir
    (CLAUDE.md §1) — bant en fazla "orta"ya kelepçelenir.
    """
    if nli_destek is False:                       # NLI açık + anlamsal destek YOK → en zayıf
        return "düşük", None, True
    guven, isabet = _bant(norm_score, score)
    if dogrula and guven == "yüksek":             # [DOĞRULA] → memur teyit etsin, "yüksek" deme
        guven, isabet = "orta", None
    return guven, (isabet if ilk else None), (guven == "düşük" or dogrula)


def _eslesme_gerekcesi(konu: str) -> str:
    """Öneriyi hangi sorgunun getirdiği — HUKUKİ DAYANAK DEĞİL (eski `dayanak` adı yanıltıyordu)."""
    return f"“{konu}” talebinden arandı" if konu else "evrak içeriğinden arandı"


def _sayi(x: Any) -> float | None:
    try:
        return float(x) if x is not None else None
    except (TypeError, ValueError):
        return None


def zenginlestir_mevzuat(state: dict[str, Any]) -> list[dict[str, Any]]:
    """state.mevzuat_onerileri → şeffaflık alanları eklenmiş liste (additive; sıra korunur).

    CRAG düzeltmesi varsa ONU kullanır (finalize_node ile aynı öncelik: corrected → ham).
    Önceki hâli yalnız ham mevzuat_onerileri'ni okuyordu — CRAG_ENABLED açıkken düzeltilmiş
    liste hesaplanıyor ama kullanıcıya gösterilen kart (MevzuatCard) hiç görmüyordu; CRAG'in
    tek etkisi finalize'ın bir cümlelik bilgilendirme metniyle sınırlı kalıyordu.
    """
    oneriler = state.get("mevzuat_onerileri_corrected") or state.get("mevzuat_onerileri") or []
    nli = {str(n.get("baslik", "")): n for n in (state.get("mevzuat_nli") or [])}
    konu = str((state.get("bilgi_unsurlari") or {}).get("konu") or "").strip()
    gerekce = _eslesme_gerekcesi(konu)

    out: list[dict[str, Any]] = []
    for i, o in enumerate(oneriler):
        baslik = str(o.get("baslik", "") or "")
        snippet = o.get("snippet")
        dogrula = "[DOĞRULA" in baslik or "[DOĞRULA" in str(snippet or "")
        n = nli.get(baslik)
        nli_destek = bool(n.get("entailment")) if n else None
        score = float(o.get("score") or 0)
        norm_score = _sayi(o.get("norm_score"))
        guven, isabet, incele = _guven(norm_score, score, dogrula, nli_destek, ilk=(i == 0))
        kaynak_dogrulanmis = o.get("kaynak_guven") == "resmi_dogrulanmis"
        if not kaynak_dogrulanmis:
            if guven == "yüksek":
                guven = "orta"
            isabet = None
            incele = True
        madde_no = o.get("madde_no")
        out.append({
            "baslik": baslik, "gosterim_adi": str(o.get("gosterim_adi", "") or ""),
            "snippet": snippet, "url": o.get("url"), "score": score,
            "raw_score": _sayi(o.get("raw_score")), "norm_score": norm_score,
            "eslesme_gerekcesi": gerekce, "guven": guven, "guven_isabet": isabet,
            "inceleme_oner": incele,
            "dogrula": dogrula, "nli_etiket": (n.get("etiket", "") if n else ""),
            "yururluk": _yururluk(baslik),
            "kaynak_dosya": str(o.get("kaynak_dosya", "") or ""),
            "madde_no": str(madde_no) if madde_no is not None else None,
            "madde_tur": (str(o.get("madde_tur")) if o.get("madde_tur") else None),
            "kaynak_url": str(o.get("kaynak_url", "") or ""),
            "kaynak_turu": str(o.get("kaynak_turu", "") or ""),
            "kaynak_guven": str(o.get("kaynak_guven", "aday") or "aday"),
            "kaynak_dogrulanmis": kaynak_dogrulanmis,
            "icerik_sha256": str(o.get("icerik_sha256", "") or ""),
            "dogrulayan": str(o.get("dogrulayan", "") or ""),
            "dogrulama_tarihi": str(o.get("dogrulama_tarihi", "") or ""),
            "dogrulama_yontemi": str(o.get("dogrulama_yontemi", "") or ""),
            "kaynak_guven_hatalari": list(o.get("kaynak_guven_hatalari") or []),
            "atif_genisletme": bool(o.get("atif_genisletme")),
        })
    return out


__all__ = ("zenginlestir_mevzuat",)
