"""PII maskeleme — log ve çıktı güvenliği (CLAUDE.md §2: gerçek PII ASLA ham).

`core/logging.py` `_mask_pii_in_strings` processor'u `mask_pii(value)` çağırır ve dönen
nesnenin `.has_pii` / `.masked_text` / `.counts` alanlarını kullanır → bu arayüz KORUNMALI.
Yapılandırılmış log'lara sızabilecek TCKN/telefon/IBAN maskelenir (savunma derinliği).
Node-seviyesi maskeleme (`agents/nodes/cikar.py`) AYRI ve birincildir; bu log katmanıdır.

`mask_pii` KENDİSİ LOG ETMEZ → core/logging re-entrancy guard'ı için güvenli (no-op).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from core.text import tr_lower

# IBAN ÖNCE (TR + 24 hane; içindeki hane dizilerini maskeler) → sonra TCKN → sonra telefon.
_RE_IBAN = re.compile(r"\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b", re.IGNORECASE)
# TCKN: 11 hane. SINIR `\b` DEĞİL, "rakam-değil" bakışıdır — `\b` alt çizgiyi KELİME
# karakteri sayar, dolayısıyla `dilekce_12345678901.pdf` gibi (sahada en yaygın) dosya
# adlarında TCKN'yi HİÇ yakalamıyordu. Kendi regresyon testimiz yakaladı (8 Ağu 2026).
# Lookaround sürümü kesinlikle daha kapsayıcı ve fazladan yanlış-pozitif üretmez:
# yine tam 11 hane ister ve komşusunda başka rakam bulunmamasını şart koşar.
_RE_TCKN = re.compile(r"(?<!\d)[1-9]\d{10}(?!\d)")
_RE_TEL = re.compile(r"(?<!\d)0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)")

_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("iban", _RE_IBAN), ("tckn", _RE_TCKN), ("telefon", _RE_TEL),
)


@dataclass(frozen=True, slots=True)
class MaskResult:
    """mask_pii çıktısı — core/logging bu arayüze bağlı."""

    masked_text: str
    has_pii: bool
    counts: dict[str, int]


def _mask(s: str) -> str:
    """İlk 3 + son 2 görünür, ortası yıldız (kısa değer tümü yıldız). Boşluk sökülür."""
    compact = re.sub(r"\s", "", s)
    if len(compact) <= 5:
        return "*" * len(compact)
    return f"{compact[:3]}{'*' * (len(compact) - 5)}{compact[-2:]}"


def mask_pii(text: str) -> MaskResult:
    """Metindeki TCKN/telefon/IBAN'ı maskele → MaskResult(masked_text, has_pii, counts)."""
    if not isinstance(text, str) or not text:
        return MaskResult(text if isinstance(text, str) else "", False, {})
    counts: dict[str, int] = {}
    out = text
    for label, pat in _PATTERNS:
        out, n = pat.subn(lambda m: _mask(m.group(0)), out)
        if n:
            counts[label] = n
    return MaskResult(out, bool(counts), counts)


def has_pii(text: str) -> bool:
    """Metinde maskelenecek PII var mı? (hızlı kontrol)."""
    return isinstance(text, str) and bool(
        _RE_TCKN.search(text) or _RE_TEL.search(text) or _RE_IBAN.search(text),
    )


def dosya_ref(filename: str | None) -> str:
    """Log/kayıt için PII'siz dosya referansı — gerçek ad yerine kısa hash.

    NEDEN GEREKLİ: sahadaki dosya adları düzenli olarak kişisel veri taşır
    (`Ayse_Yilmaz_dilekce_12345678901.pdf`). `mask_pii` yalnız TCKN/telefon/IBAN
    desenlerini yakalar; AD kısmını yakalamaz. Dosya adında tanılama değeri olan tek
    şey aynılık/farklılıktır, o da hash'le korunur.

    Bu fonksiyon `api/routes/multimodal.py`'de kanıtlanmış deseni tek yere taşır
    (aynı davranış: `sha256:` + 8 hane).
    """
    import hashlib

    digest = hashlib.sha256((filename or "").encode("utf-8")).hexdigest()[:8]
    return f"sha256:{digest}"


def _redact_isim(text: str, isim: str | None) -> str:
    """Gönderen ad-soyadını metinden [AD] ile redakte et (case-insensitive, Türkçe-güvenli).

    Yönlendirme için isim bilgi taşımaz → kısmi yıldız yerine TAM redaksiyon (ilk-3-harf
    sızıntısı yok). isim yok/<3 → dokunma. Tam ad + her token'ı (≥3 harf) redakte edilir;
    tr_lower ile eşleşme (re.IGNORECASE Türkçe İ/ı'yı kaçırır). En uzun önce (kısmi bölme yok).
    """
    if not isim or not isinstance(isim, str):
        return text
    isim = isim.strip()
    if len(isim) < 3:
        return text
    parcalar = sorted(
        {isim, *[t for t in isim.split() if len(t) >= 3]},
        key=len, reverse=True,
    )
    out = text
    for parca in parcalar:
        hedef = tr_lower(parca)
        low = tr_lower(out)
        idx = low.find(hedef)
        while idx != -1:
            out = out[:idx] + "[AD]" + out[idx + len(hedef):]
            low = tr_lower(out)
            idx = low.find(hedef, idx + len("[AD]"))
    return out


def mask_for_llm(text: str, isim: str | None = None) -> str:
    """LLM'e/web'e göndermeden ÖNCE tam maskeleme: kişi adı [AD] + TCKN/telefon/IBAN yıldız.

    İsim ÖNCE redakte edilir (numara maskesinin ürettiği yıldızları isim taraması bozmasın),
    sonra mask_pii sayıları maskeler. KVKK: dış servise (DeepSeek/web) ham PII gitmez.
    """
    if not isinstance(text, str) or not text:
        return text if isinstance(text, str) else ""
    return mask_pii(_redact_isim(text, isim)).masked_text


# Yapısal maskelemede özyineleme tavanı — kötü niyetli/bozuk derin yapı sonsuz inmesin.
_AZAMI_DERINLIK = 12


def mask_yapisal(veri: Any, isim: str | None = None, _derinlik: int = 0) -> Any:
    """dict/list yapısındaki TÜM metin DEĞERLERİNİ maskele — dış modele giden veri için.

    NEDEN GEREKLİ: `mask_for_llm` bir metin fonksiyonudur, oysa araç çıktıları (DB kayıtları)
    iç içe dict/list gelir. Ekran bağlamı maskelenirken kayıt verisi ham gidiyordu; sesli modda
    bu veri ayrıca TARAYICI ÜZERİNDEN ikinci bir sağlayıcıya (OpenAI Realtime) ulaşıyor.
    Aynı sınırdan geçen iki veriden yalnız birini maskelemek tutarsızdı.

    ANAHTARLARA DOKUNULMAZ: onlar alan adıdır, kişisel veri değil; maskelenirse şema bozulur
    ve model alanları tanıyamaz. Sayı/bool/None olduğu gibi kalır — maskeleme metin işidir ve
    int bir alanı dizeye çevirmek şemayı sessizce değiştirirdi.

    KABUL EDİLEN BEDEL: mask_pii desenleri biçimseldir; 10-11 haneli bir KAYIT numarası da
    telefon/TCKN sanılıp yıldızlanabilir. Yanlış-pozitifin bedeli okunmayan bir numara,
    yanlış-negatifin bedeli dış servise sızan bir TCKN — asimetri maskeleme yönünde.
    """
    if _derinlik > _AZAMI_DERINLIK:
        return veri
    if isinstance(veri, str):
        return mask_for_llm(veri, isim)
    if isinstance(veri, dict):
        return {k: mask_yapisal(v, isim, _derinlik + 1) for k, v in veri.items()}
    if isinstance(veri, (list, tuple)):
        donusen = [mask_yapisal(v, isim, _derinlik + 1) for v in veri]
        return tuple(donusen) if isinstance(veri, tuple) else donusen
    return veri


__all__ = ("MaskResult", "dosya_ref", "has_pii", "mask_for_llm", "mask_pii",
           "mask_yapisal")
