"""e2e_gercek_eval metin eşleşme kuralları — Türkçe-güvenli katlama, çekim kökü, sicil kısaltması.

Ayrı modül: değerlendirme kuralları tek başına test edilir (tests/test_e2e_gercek_eval.py) ve
ana harness dosyası 800 satır sınırının altında kalır.

NEDEN (2026-10-05 ölçüm incelemesi): düz alt-dizgi eşleşmesi iki yanlış negatif üretiyordu —
(1) ünlü düşmesi/türetme eki: 'Aile kabri' ≁ 'kabir', 'borçlanılması' ≁ 'borçlanma';
(2) kısaltma ↔ tam ad: 'İstanbul Su ve Kanalizasyon İdaresi Genel Müdürlüğü' ≁ 'İSKİ'.
İkisi de doğru çıktıyı başarısız sayıyordu. Çözüm kelime listesi DEĞİL: (1) Türkçe ses
kurallarından türetilen gövde varyantları, (2) kurum sicilinin kendi alias/kısaltma çözümü.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any


def norm(s: Any) -> str:
    """Türkçe-güvenli katlama: İ/I → i/ı → ASCII, küçük harf, aksan yok, boşluk sıkışık."""
    s = str(s or "").replace("İ", "i").replace("I", "ı").lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("ı", "i")
    return re.sub(r"\s+", " ", s).strip()


def icerir_herhangi(metin: Any, kokler: list[str]) -> bool:
    """Normalize metin, normalize köklerden birini içeriyor mu (alt-dizgi)."""
    n = norm(metin)
    return bool(n) and any(norm(k) and norm(k) in n for k in kokler)


def _kelimeler(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", norm(s))


# Ünsüz yumuşaması (normalize gövde sonu): kitap→kitabı, kanat→kanadı, renk→rengi.
# (ç→c normalize edildiği için borç→borcu ayrıca gerekmez.)
_YUMUSAMA = {"p": "b", "t": "d", "k": "g"}
_UNLU = frozenset("aeiou")
_DAR_UNLU = frozenset("iu")  # normalize sonrası ı/i/u/ü — ünlü düşmesi yalnız dar ünlüde
_KOK_AZAMI_KISALMA = 7      # türetme eki serbestliği yalnız bu uzunluk ve üstünde
_VARYANT_ASGARI = 4         # daha kısa gövdeyle önek eşleşmesi yanlış pozitif üretir


def kok_varyantlari(anahtar: str) -> list[str]:
    """Tek sözcüklü anahtarın Türkçe çekimde görülebilecek gövdeleri (normalize).

    * kendisi ('borclanma'),
    * ünlü düşmesi: son hecenin DAR ünlüsü iki ünsüz arasından düşer ('kabir' → 'kabr'),
    * ünsüz yumuşaması: son ünsüz yumuşar ('kitap' → 'kitab'),
    * türetme eki değişimi: ≥7 harfli sözcükte son iki harf serbest ('borclanma' →
      'borclan' ~ 'borçlanılması'). Kısa sözcükte uygulanmaz (yanlış pozitif).
    Çok sözcüklü anahtar olduğu gibi döner (alt-dizgi kuralı yeter)."""
    k = norm(anahtar)
    if not k or " " in k:
        return [k] if k else []
    out = [k]
    if len(k) >= 4 and k[-2] in _DAR_UNLU and k[-1] not in _UNLU and k[-3] not in _UNLU:
        out.append(k[:-2] + k[-1])
    if k[-1] in _YUMUSAMA:
        out.append(k[:-1] + _YUMUSAMA[k[-1]])
    if len(k) >= _KOK_AZAMI_KISALMA:
        out.append(k[:-2])
    return list(dict.fromkeys(out))


def kok_icerir(metin: Any, anahtarlar: list[str]) -> bool:
    """Alt-dizgi eşleşmesi + Türkçe çekim: metindeki bir sözcük, anahtarın bir gövde
    varyantıyla BAŞLIYORSA eşleşir ('Aile kabri' ~ 'kabir', 'borçlanılması' ~ 'borçlanma')."""
    if icerir_herhangi(metin, anahtarlar):
        return True
    sozcukler = _kelimeler(str(metin or ""))
    return any(w.startswith(v) for a in anahtarlar for v in kok_varyantlari(a)
               if len(v) >= _VARYANT_ASGARI for w in sozcukler)


_DEVIR_EKI = re.compile(r"\s*\((?:devir[^)]*)\)\s*$", re.IGNORECASE)


def sicil_slug(ad: str) -> str:
    """Kurum adı/kısaltması → sicil slug'ı ('İSKİ' ile 'İstanbul Su ve Kanalizasyon İdaresi
    Genel Müdürlüğü (devir)' aynı kayda çözülür). Çözülemezse '' — tahmin yapılmaz."""
    from agents.kurum_aday import kurum_ad_cozumle

    temiz = _DEVIR_EKI.sub("", str(ad or "")).split(" — ")[0].strip()
    kayit = kurum_ad_cozumle(temiz) if temiz else None
    return str((kayit or {}).get("slug") or "")


def birim_dogru(birim: str, kabul: list[str]) -> bool:
    """Birim kuralı: kabul köklerinden biri metinde geçer YA DA tahmin ile bir kabul öğesi
    sicilde AYNI kuruma çözülür (kısaltma ↔ tam ad yanlış negatifi)."""
    if icerir_herhangi(birim, kabul):
        return True
    slug = sicil_slug(birim)
    return bool(slug) and any(sicil_slug(k) == slug for k in kabul)


__all__ = ("birim_dogru", "icerir_herhangi", "kok_icerir", "kok_varyantlari", "norm",
           "sicil_slug")
