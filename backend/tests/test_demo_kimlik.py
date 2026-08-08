"""api/demo_kimlik.py — imzalı ziyaretçi çerezi + IP ağ öneki.

Güvenlik sözleşmeleri: imzasız çerez sözlüğe giremez (bellek saldırısı) ·
X-Forwarded-For varsayılan olarak YOK SAYILIR (sınırsız kimlik üretimi) ·
http üzerinde Secure bayrağı BASILMAZ (LAN/QR telefon yolu sessizce çökmesin) ·
çerezsiz istek ağ kovasını paylaşır (curl döngüsü sınırsız hak almasın).
"""

from __future__ import annotations

import pytest

from api import demo_kimlik as dk


@pytest.fixture(autouse=True)
def _sabit_anahtar(monkeypatch):
    monkeypatch.setenv("DEMO_KOTA_SECRET", "test-gizli-anahtar")
    monkeypatch.delenv("DEMO_GUVENILEN_PROXY_SAYISI", raising=False)
    yield


def _scope(*, ip="203.0.113.7", basliklar=None, scheme="http") -> dict:
    return {
        "type": "http", "path": "/process_doc/stream", "method": "POST",
        "scheme": scheme,
        "client": (ip, 12345) if ip else None,
        "headers": basliklar or [],
    }


class TestCerez:
    def test_uretilen_cerez_dogrulanir(self):
        ham = dk.cerez_uret()
        assert dk.cerez_dogrula(ham) is not None

    def test_imzasiz_reddedilir(self):
        assert dk.cerez_dogrula("v1.abc") is None
        assert dk.cerez_dogrula("cop") is None
        assert dk.cerez_dogrula("") is None

    def test_bozuk_imza_reddedilir(self):
        # Arrange
        ham = dk.cerez_uret()
        surum, kimlik, _sig = ham.split(".")
        # Act + Assert
        assert dk.cerez_dogrula(f"{surum}.{kimlik}.{'0' * 32}") is None

    def test_kimlik_degistirilirse_reddedilir(self):
        ham = dk.cerez_uret()
        surum, _kimlik, sig = ham.split(".")
        assert dk.cerez_dogrula(f"{surum}.saldirgan.{sig}") is None

    def test_farkli_gizli_anahtar_gecersiz_kilar(self, monkeypatch):
        # Arrange
        ham = dk.cerez_uret()
        # Act — anahtar döndü (süreç yeniden başladı)
        monkeypatch.setenv("DEMO_KOTA_SECRET", "baska-anahtar")
        # Assert — herkes çerezsiz kovaya düşer: DAHA kısıtlayıcı, güvenli yön
        assert dk.cerez_dogrula(ham) is None

    def test_yanlis_surum_reddedilir(self):
        ham = dk.cerez_uret()
        _s, kimlik, sig = ham.split(".")
        assert dk.cerez_dogrula(f"v2.{kimlik}.{sig}") is None

    def test_jwt_secretten_ALAN_AYRIMIYLA_turer(self, monkeypatch):
        # Arrange — DEMO_KOTA_SECRET yok, AUTH_JWT_SECRET var
        monkeypatch.delenv("DEMO_KOTA_SECRET", raising=False)
        monkeypatch.setenv("AUTH_JWT_SECRET", "jwt-anahtari")
        # Act
        anahtar = dk._gizli_anahtar()
        # Assert — JWT anahtarının KENDİSİ kullanılmaz (çapraz-protokol yüzeyi)
        assert anahtar != b"jwt-anahtari"
        assert len(anahtar) == 32


class TestCerezBasligi:
    def test_https_de_Secure_basilir(self):
        assert b"Secure" in dk.cerez_basligi("x", https=True)

    def test_http_de_Secure_BASILMAZ(self):
        """Koşulsuz Secure, LAN/QR telefon yolunda çerezi sessizce attırırdı."""
        assert b"Secure" not in dk.cerez_basligi("x", https=False)

    def test_httponly_ve_samesite_hep_var(self):
        deger = dk.cerez_basligi("x", https=False)
        assert b"HttpOnly" in deger
        assert b"SameSite=Lax" in deger


class TestAgOneki:
    def test_ipv4_24_onekine_indirgenir(self):
        assert dk.ag_oneki("1.2.3.4") == dk.ag_oneki("1.2.3.200")

    def test_farkli_24_ayri_kova(self):
        assert dk.ag_oneki("1.2.3.4") != dk.ag_oneki("1.2.4.4")

    def test_ipv6_64_onekine_indirgenir(self):
        # SLAAC her saat yeni adres üretir → adres başına saymak anlamsız
        a = dk.ag_oneki("2001:db8:0:1::dead")
        b = dk.ag_oneki("2001:db8:0:1::beef")
        assert a == b

    def test_gecersiz_ip_TEK_kovaya_duser(self):
        assert dk.ag_oneki("bu-ip-degil") == dk._BILINMEYEN_AG
        assert dk.ag_oneki("") == dk._BILINMEYEN_AG


class TestIstemciIp:
    def test_varsayilan_yalniz_soket_adresi(self):
        # Arrange — saldırgan XFF yazdı
        scope = _scope(ip="203.0.113.7",
                       basliklar=[(b"x-forwarded-for", b"9.9.9.9")])
        # Assert — YOK SAYILIR
        assert dk.istemci_ip(scope) == "203.0.113.7"

    def test_guvenilen_proxy_ile_SAGDAN_secilir(self, monkeypatch):
        # Arrange — soldaki uçlar tamamen saldırgan kontrolünde
        monkeypatch.setenv("DEMO_GUVENILEN_PROXY_SAYISI", "1")
        scope = _scope(ip="10.0.0.1",
                       basliklar=[(b"x-forwarded-for", b"9.9.9.9, 203.0.113.7")])
        # Act + Assert
        assert dk.istemci_ip(scope) == "203.0.113.7"

    def test_client_yoksa_bos(self):
        assert dk.istemci_ip(_scope(ip=None)) == ""

    def test_bozuk_proxy_sayisi_sifir_sayilir(self, monkeypatch):
        monkeypatch.setenv("DEMO_GUVENILEN_PROXY_SAYISI", "cok")
        scope = _scope(ip="203.0.113.7", basliklar=[(b"x-forwarded-for", b"9.9.9.9")])
        assert dk.istemci_ip(scope) == "203.0.113.7"


class TestZiyaretciKimligi:
    def test_cerezsiz_istek_AG_anahtarini_paylasir(self):
        # Act
        z = dk.ziyaretci_kimligi(_scope())
        # Assert — curl döngüsü sınırsız hak almasın
        assert z.anahtar == z.ag_anahtari
        assert z.taze_cerez  # tarayıcı 2. istekte adil yola geçsin

    def test_gecerli_cerezle_AYRI_kova(self):
        # Arrange
        ham = dk.cerez_uret()
        scope = _scope(basliklar=[(b"cookie", f"{dk.CEREZ_ADI}={ham}".encode("latin-1"))])
        # Act
        z = dk.ziyaretci_kimligi(scope)
        # Assert
        assert z.anahtar.startswith("z:")
        assert z.anahtar != z.ag_anahtari
        assert z.taze_cerez == ""   # zaten var, yeniden basma

    def test_bozuk_cerez_cerezsiz_gibi(self):
        scope = _scope(basliklar=[(b"cookie", f"{dk.CEREZ_ADI}=sahte.cop.imza".encode())])
        z = dk.ziyaretci_kimligi(scope)
        assert z.anahtar == z.ag_anahtari
        assert z.taze_cerez

    def test_cerez_cozumleme_diger_cerezleri_bozmaz(self):
        scope = _scope(basliklar=[(b"cookie", b"ke-tema=koyu; ke_ziyaretci=x; digeri=1")])
        cerezler = dk.cerezleri_coz(scope)
        assert cerezler["ke-tema"] == "koyu"
        assert cerezler["digeri"] == "1"
