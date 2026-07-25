"""Resmî kaynak arama arayüzü — kaynak-doğrulamalı birim yönlendirmesinin ortak sözleşmesi.

REVİZYON 5: Ajan, kaynağın offline korpus mu canlı web mi olduğunu BİLMEZ. İki adapter aynı
`OfficialSourceSearch` protokolünü ve aynı `KaynakKaydi` şemasını döndürür:
  - `OfflineKorpusAdapter`: data/teskilat BM25 (ilk teslim, CI/mock deterministik omurga).
  - `WebAdapter`: canlı resmî-kaynak araması (Faz 5, ROUTE_WEB_YEDEK ile; korpus dışı 'her yer').

REVİZYON 6: KaynakKaydi yalnız anchor değil — belge başlığı, URL/yerel belge kimliği, kaynak
kurum, erişim tarihi, metin parçası, içerik hash'i taşır (denetim izi + grounding kanıtı).

REVİZYON 3: `uclu_grounding` — bir aday ancak (a) hedef kurum, (b) gerçek birim adı, (c) evrak
konusuyla ilişkili görev tanımı AYNI kaynak zincirinde doğrulanırsa kabul edilir.
"""
from __future__ import annotations

import re
from typing import Protocol, TypedDict

from agents.config import ROUTE_WEB_YEDEK
from agents.nodes.teskilat_ara import (
    _kanonik_slug,
    kelime_uyum_skoru,
    kurum_korpusta_var,
    teskilat_birim_ara,
)
from agents.nodes.teskilat_mevzuat import dosya_gecerli as mevzuat_dosya_gecerli
from core.text import tr_lower


class KaynakKaydi(TypedDict, total=False):
    """Bir birim adayının tam kaynak künyesi (REVİZYON 6)."""

    birim_ad: str
    gorev: str
    kaynak_kurum: str
    kurum_slug: str
    belge_basligi: str
    url_veya_belge_kimligi: str
    erisim_tarihi: str
    metin_parcasi: str
    icerik_hash: str
    skor: float
    kaynak_tipi: str   # "kurum_ozel" | "aday" | "jenerik" | "web"
    kaynak_guven: str
    kaynak_dosya: str
    kaynak_sha256: str
    dogrulayan: str
    dogrulama_tarihi: str


class OfficialSourceSearch(Protocol):
    """Resmî kaynakta birim arama sözleşmesi — offline ve web adapter'lar bunu uygular."""

    def ara(self, kurum_slug: str, konu: str, *, tur: str = "") -> list[KaynakKaydi]: ...

    def kurum_var(self, kurum_slug: str) -> bool: ...


class OfflineKorpusAdapter:
    """data/teskilat BM25 korpusu (teskilat_ara). Deterministik, ağsız — CI/mock omurgası."""

    def ara(self, kurum_slug: str, konu: str, *, tur: str = "") -> list[KaynakKaydi]:
        return teskilat_birim_ara(kurum_slug, konu, tur=tur)  # type: ignore[return-value]

    def kurum_var(self, kurum_slug: str) -> bool:
        return kurum_korpusta_var(kurum_slug)


def _web_adapter() -> OfficialSourceSearch | None:
    """WebAdapter (Faz 5) — yalnız ROUTE_WEB_YEDEK açık ve modül varsa. Yoksa None."""
    if not ROUTE_WEB_YEDEK:
        return None
    try:
        from agents.web_ara import WebAdapter  # Faz 5 (opsiyonel modül)
        return WebAdapter()
    except Exception:
        return None


def kaynak_ara(kurum_slug: str, konu: str, *, tur: str = "") -> list[KaynakKaydi]:
    """Hibrit dispatcher: offline korpus BİRİNCİL; kuruma-özel kaynak yok + web açıksa web yedek.

    Offline kuruma-özel kayıt varsa doğrudan onu döndürür (deterministik). Kuruma-özel kaynak
    yoksa (yalnız jenerik aday) VE web adapter etkinse, canlı kaynak denenir; web de boşsa
    offline jenerik adaylar döner (route ajanı bunları 'aday' olarak işaretli alır).
    """
    offline = OfflineKorpusAdapter()
    if offline.kurum_var(kurum_slug):
        return offline.ara(kurum_slug, konu, tur=tur)
    web = _web_adapter()
    if web is not None:
        try:
            web_sonuc = web.ara(kurum_slug, konu, tur=tur)
            if web_sonuc:
                return web_sonuc
        except Exception:
            pass  # web hatası → offline jenerik adaylara düş
    return offline.ara(kurum_slug, konu, tur=tur)  # jenerik şablon adayları


_WORD_RE = re.compile(r"[0-9a-zçğıöşü]+")
_GENEL_KONU = frozenset({
    "talep", "konu", "ilgili", "hakkında", "gereği", "arz", "ederim", "rica",
    "başvuru", "dilekçe", "işlem", "sayın", "belediye", "kurum", "müdürlük",
    "şikayet", "şikâyet", "ihbar", "gerekli", "yapılması", "edilmesi",
})


def _konu_tokenlari(konu: str) -> set[str]:
    """Konudan ayırt edici (≥4 harf, genel-terim olmayan) tokenlar."""
    return {t for t in _WORD_RE.findall(tr_lower(konu)) if len(t) >= 4 and t not in _GENEL_KONU}


def _kaynakta_var(ifade: str, kaynak: str) -> bool:
    """Sözcük-sınırlı eşleşme (substring değil): 'aydın' ≠ 'aydınlatma'. verify.py deseni."""
    ifade = tr_lower(ifade).strip()
    if not ifade:
        return False
    return any(
        kelime_uyum_skoru(ifade, token) > 0
        for token in _WORD_RE.findall(tr_lower(kaynak))
    )


def uclu_grounding(aday: KaynakKaydi, konu: str, yetkili_slug: str) -> bool:
    """REVİZYON 3 — aday AYNI kaynak zincirinde üç koşulu birlikte sağlamalı:

    (a) hedef kurum: aday kuruma-özel kaynaktan ve slug yetkili kuruma ait.
    (b) gerçek birim adı: birim_ad kaynak künyesinde dolu (uydurma değil, korpus kaydı).
    (c) görev-konu bağı: evrak konusundan en az iki ayırt edici token, görev tanımında
        sözcük-sınırlı geçer (birim gerçekten bu konuyla görevli). "Şikâyet/başvuru"
        gibi evrak zarfı sözcükleri ayırt edici sayılmaz.
    """
    # (a) kurum: yalnız kuruma-özel kaynak doğrulanmış hedef üretir; jenerik/boş → red.
    #
    # MEVZUAT-TEŞKİLAT ADAYI BİLİNÇLİ OLARAK BURADAN GEÇMEZ (docs/11 §7). Tür geneli mevzuat,
    # birimin O mülki idarede fiilen kurulu olduğunu kanıtlamaz (Valilik ve Kaymakamlık
    # Birimleri Yönetmeliği GEÇİCİ MADDE 1: işler başka bir şube müdürlüğüne gördürülebilir)
    # ve m.26/2 havaleyi ilin kendi İmza Yetkileri Yönergesiyle belirlenen görevliye ait
    # devredilmiş imza yetkisi sayar. Bu nedenle mevzuat adayı GERÇEK birim adı taşıyan
    # yüksek kaliteli bir ÖNERİdir; onayı memur verir.
    #
    # Web adayı (kaynak_tipi="web") da kurum-kaynağıdır ama slug'ı boş olabilir → yalnız
    # kurum_ozel/web kabul; slug karşılaştırması ALIAS-duyarlı (uedas ≡ uludag-elektrik-dagitim).
    if (
        aday.get("kaynak_tipi") != "kurum_ozel"
        or aday.get("kaynak_guven") != "resmi_dogrulanmis"
        or not aday.get("kaynak_sha256")
    ):
        return False
    # İndeks (teskilat_index.json) manifest-kilitli DEĞİLDİR: mevcut bir chunk'ın gövdesini
    # YERİNDE düzenlemek chunk sayısını ve korpus hash'ini bozmaz, yani veri kalite kapısından
    # geçer. Bu yüzden adayın `kaynak_guven` beyanına güvenilmez — kaynak dosyası manifest +
    # SHA-256 ile ŞU AN doğrulanıyor mu, diskten yeniden hesaplanır (güvenlik bulgusu F7).
    if not mevzuat_dosya_gecerli(str(aday.get("kaynak_dosya") or "")):
        return False
    aday_slug = aday.get("kurum_slug") or ""
    if yetkili_slug and aday_slug:
        yk = _kanonik_slug(yetkili_slug) or yetkili_slug
        ak = _kanonik_slug(aday_slug) or aday_slug
        if yk != ak:
            return False
    # (b) gerçek birim adı
    birim = (aday.get("birim_ad") or "").strip()
    if not birim:
        return False
    # (c) görev-konu bağı
    gorev = aday.get("gorev") or ""
    konu_tok = _konu_tokenlari(konu)
    if not konu_tok:
        return False
    eslesen = sum(1 for t in konu_tok if _kaynakta_var(t, gorev))
    return eslesen >= 2


__all__ = (
    "KaynakKaydi",
    "OfficialSourceSearch",
    "OfflineKorpusAdapter",
    "kaynak_ara",
    "uclu_grounding",
)
