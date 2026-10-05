"""Yazı LLM yolları için GERİ ALINABİLİR PII kalkanı (KVKK — CLAUDE.md "LLM'e giden metin maskeli").

`api.pii.mask_for_llm` tek yönlüdür: adı `[AD]`, numarayı yıldızla değiştirir. Bu, çıktısı
yalnız bir karar olan çağrılar (sınıflandırma, plan) için doğrudur; ama çıktısı BELGE METNİ
olan çağrılarda (gövde, revizyon, format düzeltme) maskeli değer taslağa geri sızar
('Sayın [AD]', '123******01'). Kalkan, PII değerlerini numaralı belirteçle değiştirir
(`[KİŞİ-1]`, `[NO-1]`), dış modele yalnız belirteç gider, dönen metinde belirteçler
yerel olarak asıl değere çevrilir. Ham değer süreç dışına çıkmaz.

Kapsam `api.pii` ile aynıdır (tek doğruluk kaynağı): TCKN/telefon/IBAN desenleri + verilen
kişi adı (tam ad ve ≥3 harfli parçaları, Türkçe-duyarlı büyük/küçük harf eşleşmesi).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from api.pii import _PATTERNS
from core.text import tr_lower


@dataclass
class PiiKalkani:
    """Tek bir LLM çağrısı boyunca belirteç ↔ asıl değer haritası."""

    isim: str | None = None
    harita: dict[str, str] = field(default_factory=dict)

    def _belirtec(self, onek: str, deger: str) -> str:
        for k, v in self.harita.items():
            if v == deger and k.startswith(f"[{onek}-"):
                return k
        k = f"[{onek}-{sum(1 for x in self.harita if x.startswith(f'[{onek}-')) + 1}]"
        self.harita[k] = deger
        return k

    def _isim_parcalari(self) -> list[str]:
        ad = (self.isim or "").strip()
        if len(ad) < 3:
            return []
        return sorted({ad, *[t for t in ad.split() if len(t) >= 3]}, key=len, reverse=True)

    def maskele(self, metin: str) -> str:
        """Metindeki PII'yi belirteçle değiştir (ad önce — numara deseni adı bölmesin)."""
        if not isinstance(metin, str) or not metin:
            return metin if isinstance(metin, str) else ""
        out = metin
        for parca in self._isim_parcalari():
            hedef = tr_lower(parca)
            idx = tr_lower(out).find(hedef)
            while idx != -1:
                asil = out[idx:idx + len(parca)]
                k = self._belirtec("KİŞİ", asil)
                out = out[:idx] + k + out[idx + len(parca):]
                idx = tr_lower(out).find(hedef, idx + len(k))
        for _etiket, desen in _PATTERNS:
            out = desen.sub(lambda m: self._belirtec("NO", m.group(0)), out)
        return out

    def geri_yukle(self, metin: str | None) -> str | None:
        """LLM çıktısındaki belirteçleri asıl değerlere çevir (uzun belirteç önce)."""
        if not metin:
            return metin
        out = metin
        for k in sorted(self.harita, key=len, reverse=True):
            out = out.replace(k, self.harita[k])
        return out


def kisi_adi(gonderen: object) -> str | None:
    """Gönderen GERÇEK KİŞİ ise adı, kurum/makam ise None — kurum adının parçaları
    ('Ankara', 'Belediyesi') kişi verisi değildir; maskelenirse bağlam boşuna kaybolur."""
    from yazi.yazi_render import _kurum_adi_mi

    ad = str(gonderen or "").strip()
    return ad if ad and not _kurum_adi_mi(ad) else None


_SAYIN_RE =re.compile(r"^\s*Sayın\s+(.+?)\s*$", re.MULTILINE)


def taslak_kisi_adi(taslak: str) -> str | None:
    """Taslağın muhatap satırındaki GERÇEK KİŞİ adı (m.14: 'Sayın' + ad soyad) — taslak
    revizyonu gibi kaynağı bilinmeyen çağrılarda kalkanın ad girdisi (yapısal, sözlüksüz)."""
    m = _SAYIN_RE.search(taslak or "")
    return m.group(1).strip() if m else None


def taslak_kalkani(taslak: str, isim: str | None = None) -> PiiKalkani:
    """Taslak metni üzerinde çalışan LLM çağrıları için kalkan (ad: verilen ya da muhatap)."""
    return PiiKalkani(isim or taslak_kisi_adi(taslak))


__all__ = ("PiiKalkani", "kisi_adi", "taslak_kalkani", "taslak_kisi_adi")
