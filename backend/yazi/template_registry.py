"""Resmî yazı template registry — yazı türü → şablon dosyası + insan-okunur ad.

ADALET `dilekce/template_registry.py` deseninden ADAPT: 8 domain × 2 dilekçe
türü yerine 4 resmî yazı türü (Resmî Yazışmalarda Uygulanacak Usul ve Esaslar
Hk. Yönetmelik, CB 2646/2020). Şablonlar `data/templates/<turu>.j2`.

Bu modül yazı türü adlarının KANONİK kaynağıdır; renderer hangi .j2 dosyasını
yükleyeceğini buradan öğrenir. Bilinmeyen tür → cevabi_yazi'ya düşülür
(en genel iskelet: antet + ilgi + metin + imza).
"""

from __future__ import annotations

# yazi_turu (config.YAZI_TURLERI) → (şablon dosya kökü, insan-okunur ad, kapanış).
# Kapanış Yön. m.16'ya göre hiyerarşik; node override edebilir.
TemplateMeta = tuple[str, str, str]

_REGISTRY: dict[str, TemplateMeta] = {
    "ust_yazi": ("ust_yazi", "Üst Yazı", "Gereğini arz ederim."),
    "cevabi_yazi": ("cevabi_yazi", "Cevabi Yazı", "Gereğini rica ederim."),
    "bilgilendirme": ("bilgilendirme", "Bilgilendirme Yazısı", "Bilgilerinize arz ederim."),
    "olur": ("olur", "Olur / Onay Yazısı", "Olurlarınıza arz ederim."),
}

_FALLBACK = "cevabi_yazi"


def resolve_yazi_turu(yazi_turu: str | None) -> str:
    """Geçerli bir yazı türüne normalize et (bilinmeyen → cevabi_yazi)."""
    if yazi_turu and yazi_turu in _REGISTRY:
        return yazi_turu
    return _FALLBACK


def template_file(yazi_turu: str) -> str:
    """yazi_turu için jinja2 şablon dosya kökü (örn 'ust_yazi' → ust_yazi.j2)."""
    return _REGISTRY[resolve_yazi_turu(yazi_turu)][0]


def template_label(yazi_turu: str) -> str:
    """Audit/UI için insan-okunur başlık."""
    return _REGISTRY[resolve_yazi_turu(yazi_turu)][1]


def default_kapanis(yazi_turu: str) -> str:
    """Yön. m.16 hiyerarşik kapanış cümlesi (node override edebilir)."""
    return _REGISTRY[resolve_yazi_turu(yazi_turu)][2]


def available_yazi_turleri() -> tuple[str, ...]:
    """Kayıtlı tüm yazı türleri."""
    return tuple(_REGISTRY)


__all__ = (
    "resolve_yazi_turu",
    "template_file",
    "template_label",
    "default_kapanis",
    "available_yazi_turleri",
)
