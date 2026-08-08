"""Anonim ziyaretçi kimliği — imzalı çerez + IP ağ öneki.

Depoda anonim ziyaretçi primitifi YOKTU: `auth/deps.py` `HTTPBearer(auto_error=True)`
kullanır, opsiyonel-kullanıcı bağımlılığı yok. Kimliksiz istekte elde yalnız IP vardı.

ÇEREZ NEDEN İMZALI (id zaten tahmin edilemez olduğu hâlde): imza gizlilik için değil,
SÖZLÜK BÜYÜTME saldırısı içindir. İmzasız olsaydı `Cookie: ke_ziyaretci=<çöp>` × 1 milyon
istek, kota sözlüğüne 1 milyon anahtar ekleyebilirdi. İmzalı olunca sözlüğe yalnız SUNUCUNUN
ürettiği anahtarlar girer ve üretim hızı da ağ kotasıyla sınırlıdır.

ÇEREZSİZ İSTEK NEDEN TEK KOVAYA DÜŞER: her çerezsiz isteğe taze kova verilseydi
`curl` döngüsü sınırsız hak alırdı. Çerezsizler ağ anahtarını PAYLAŞIR → bir /24'ten
gelen tüm çerezsiz istekler toplam 3 belge alır, istek başına 3 değil.

X-FORWARDED-FOR VARSAYILAN OLARAK YOK SAYILIR. Başlık istemci-kontrollüdür; ona güvenmek
sınırsız kimlik üretmek demektir. `slowapi.util.get_remote_address` de aynısını yapar.
Ters vekil ARKASINDA çalışıyorsanız `DEMO_GUVENILEN_PROXY_SAYISI` verin; o zaman
listenin SAĞINDAN n'inci alınır (soldaki uçlar tamamen saldırgan kontrolündedir).

TUZAK — güvenilen proxy sayısı 0 iken tünel arkasında: tüm ziyaretçiler tünelin IP'sine
düşer, tek ağ kovasını paylaşır ve demo günde `DEMO_KOTA_AG_GUN` belgeyle sınırlanır.
Bu AŞIRI KISITLAYICIDIR, yani fail-closed — doğru varsayılan budur. Tersi (XFF'e güven)
fail-open olurdu.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import os
import secrets
from dataclasses import dataclass
from typing import Any

import structlog

log = structlog.get_logger()

CEREZ_ADI = "ke_ziyaretci"
_SURUM = "v1"
_CEREZ_OMRU_SN = 30 * 24 * 3600

# Ağ kovası birimi. IPv6'da adres BAŞINA saymak anlamsızdır (SLAAC her saat yeni adres
# üretir, ISS /56 delege eder) → /64 ana ağ birimidir.
_IPV4_ONEK = 24
_IPV6_ONEK = 64

_BILINMEYEN_AG = "ag:bilinmiyor"


@dataclass(frozen=True)
class Ziyaretci:
    anahtar: str          # "z:<id>" veya çerezsizse ag_anahtari ile aynı
    ag_anahtari: str      # "ag:<önek>"
    taze_cerez: str       # "" ise Set-Cookie basılmaz


def _gizli_anahtar() -> bytes:
    """Çerez imza anahtarı. DEMO_KOTA_SECRET yoksa AUTH_JWT_SECRET'tan ALAN AYRIMIYLA türer.

    JWT anahtarının kendisi ASLA doğrudan kullanılmaz (aynı anahtarı iki amaçta kullanmak
    çapraz-protokol saldırı yüzeyi açar). İkisi de yoksa sürece özel rastgele anahtar
    üretilir; sonuç, süreç yeniden başlayınca tüm çerezlerin geçersizleşmesidir — herkes
    çerezsiz kovaya düşer, yani DAHA kısıtlayıcı. Güvenli yön.
    """
    acik = os.getenv("DEMO_KOTA_SECRET", "").strip()
    if acik:
        return acik.encode("utf-8")
    jwt = os.getenv("AUTH_JWT_SECRET", "").strip()
    if jwt:
        return hashlib.sha256(b"ke-ziyaretci-v1|" + jwt.encode("utf-8")).digest()
    return hashlib.sha256(b"ke-ziyaretci-v1|" + secrets.token_bytes(32)).digest()


def _imzala(kimlik: str) -> str:
    govde = f"{_SURUM}.{kimlik}"
    sig = hmac.new(_gizli_anahtar(), govde.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    return f"{govde}.{sig}"


def cerez_uret() -> str:
    """Yeni imzalı ziyaretçi çerezi değeri."""
    return _imzala(secrets.token_urlsafe(16))


def cerez_dogrula(ham: str) -> str | None:
    """Çerezi doğrula → ziyaretçi id'si, geçersizse None (sabit zamanlı karşılaştırma)."""
    if not ham or ham.count(".") != 2:
        return None
    surum, kimlik, _sig = ham.split(".")
    if surum != _SURUM or not kimlik:
        return None
    if not hmac.compare_digest(_imzala(kimlik), ham):
        return None
    return kimlik


def istemci_ip(scope: dict[str, Any]) -> str:
    """ASGI scope'tan istemci IP'si. Varsayılan: yalnız gerçek soket adresi."""
    guvenilen = 0
    try:
        guvenilen = max(0, int(os.getenv("DEMO_GUVENILEN_PROXY_SAYISI", "0")))
    except ValueError:
        guvenilen = 0

    if guvenilen:
        for ad, deger in scope.get("headers") or []:
            if ad == b"x-forwarded-for":
                parcalar = [p.strip() for p in deger.decode("latin-1").split(",") if p.strip()]
                if parcalar:
                    # SAĞDAN n'inci — soldaki uçlar saldırgan tarafından yazılabilir.
                    idx = max(0, len(parcalar) - guvenilen)
                    return parcalar[idx]
                break
    istemci = scope.get("client")
    if not istemci:
        return ""
    return str(istemci[0] or "")


def ag_oneki(ip: str) -> str:
    """IP → ağ kovası anahtarı. Çözümlenemeyen IP TEK ortak kovaya düşer."""
    if not ip:
        return _BILINMEYEN_AG
    try:
        adres = ipaddress.ip_address(ip)
    except ValueError:
        return _BILINMEYEN_AG
    onek = _IPV4_ONEK if adres.version == 4 else _IPV6_ONEK
    try:
        ag = ipaddress.ip_network(f"{ip}/{onek}", strict=False)
    except ValueError:
        return _BILINMEYEN_AG
    return f"ag:{ag}"


def cerezleri_coz(scope: dict[str, Any]) -> dict[str, str]:
    """ASGI scope'tan çerez sözlüğü (Starlette Request kurmadan)."""
    cikti: dict[str, str] = {}
    for ad, deger in scope.get("headers") or []:
        if ad != b"cookie":
            continue
        for parca in deger.decode("latin-1").split(";"):
            if "=" in parca:
                k, _, v = parca.partition("=")
                cikti[k.strip()] = v.strip()
    return cikti


def ziyaretci_kimligi(scope: dict[str, Any]) -> Ziyaretci:
    """İstekten ziyaretçi + ağ anahtarını çıkar; çerez yoksa/bozuksa taze çerez üret."""
    ag = ag_oneki(istemci_ip(scope))
    ham = cerezleri_coz(scope).get(CEREZ_ADI, "")
    kimlik = cerez_dogrula(ham)
    if kimlik:
        return Ziyaretci(anahtar=f"z:{kimlik}", ag_anahtari=ag, taze_cerez="")
    # Çerezsiz/bozuk → ağ kovasını PAYLAŞ (curl döngüsü sınırsız hak almasın),
    # ama taze çerez bas ki gerçek tarayıcı 2. istekte adil yola geçsin.
    #
    # ÖLÇÜLEN YAN ETKİ (+1): çerezini saklayan gerçek bir tarayıcı ilk isteğini ağ
    # kovasından harcar, ardından kendi çerez kovası SIFIRDAN başlar → ziyaretçi başına
    # en fazla 3 değil 4 belge. Bilinçli kabul: alternatifler ya taze çerezi ilk istekte
    # ücretsiz kılar (curl her istekte yeni çerez basıp ağ tavanına kadar, yani 12'ye
    # çıkar) ya da yeni ziyaretçiye ağın sayacını miras bırakır (kalabalık ağdaki masum
    # kullanıcıyı cezalandırır). +1'in sınırı serttir: çerezi SİLEN saldırgan hep ağ
    # kovasına düşer ve 3'ü aşamaz. Para tavanı bu +1'den hiç etkilenmez.
    return Ziyaretci(anahtar=ag, ag_anahtari=ag, taze_cerez=cerez_uret())


def cerez_basligi(deger: str, *, https: bool) -> bytes:
    """Set-Cookie başlık değeri.

    `Secure` YALNIZ https'te: koşulsuz eklemek, http üzerinden koşan LAN/QR telefon
    yolunda (`api/routes/mobil.py`, MOBIL_BASE_URL http varsayılanı) çerezi tarayıcıya
    sessizce attırır ve her telefon çerezsiz kovaya düşerdi.
    """
    parcalar = [
        f"{CEREZ_ADI}={deger}",
        "Path=/",
        f"Max-Age={_CEREZ_OMRU_SN}",
        "HttpOnly",
        "SameSite=Lax",
    ]
    if https:
        parcalar.append("Secure")
    return "; ".join(parcalar).encode("latin-1")


__all__ = ("CEREZ_ADI", "Ziyaretci", "ag_oneki", "cerez_basligi", "cerez_dogrula",
           "cerez_uret", "cerezleri_coz", "istemci_ip", "ziyaretci_kimligi")
