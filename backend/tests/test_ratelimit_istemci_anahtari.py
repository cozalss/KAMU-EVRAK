"""Hız sınırı kova anahtarı — ters vekil arkasında GERÇEK istemciyi ayırt etmeli.

REGRESYON (9 Ağu 2026 güvenlik denetimi): `Limiter(key_func=get_remote_address)`
`request.client.host` yani SOKET adresini döndürüyordu. Render/Cloudflare ters vekili
arkasında bu adres her ziyaretçi için AYNIDIR → tüm dünya tek hız-sınırı kovasını
paylaşıyordu. Sonuç iki yönlü: (a) saldırgan başına sınır yok, (b) tek istemci sınırı
doldurunca herkes 429 alıyor (ucuz DoS).

Bu testler `istemci_anahtari`'nın `demo_kimlik.istemci_ip` ile AYNI türetmeyi
kullandığını sabitler — iki ayrı IP türetmesinin tekrar birbirinden ayrılmasını engeller.
AAA deseni.
"""

from __future__ import annotations

from api.middleware.ratelimit import istemci_anahtari


class _SahteIstek:
    """slowapi'nin key_func'a verdiği Request'in tek ilgili yüzeyi: `.scope`."""

    def __init__(self, scope):
        self.scope = scope


def _scope(client_ip: str, xff: str | None = None) -> dict:
    basliklar = []
    if xff is not None:
        basliklar.append((b"x-forwarded-for", xff.encode("latin-1")))
    return {"type": "http", "client": (client_ip, 12345), "headers": basliklar}


class TestVekilArkasindaAyirtEtme:
    """Güvenilen vekil sayısı verildiğinde gerçek istemci ayırt edilir."""

    def test_vekil_arkasinda_iki_ziyaretci_farkli_kovaya_duser(self, monkeypatch):
        # Arrange — Render deseni: tek vekil, gerçek istemci XFF'in SAĞ ucunda.
        # Soket adresi (10.0.0.7) İKİSİNDE DE AYNI — hatanın tam olduğu yer burasıydı.
        monkeypatch.setenv("DEMO_GUVENILEN_PROXY_SAYISI", "1")
        a = _SahteIstek(_scope("10.0.0.7", xff="203.0.113.5"))
        b = _SahteIstek(_scope("10.0.0.7", xff="198.51.100.9"))

        # Act
        anahtar_a = istemci_anahtari(a)
        anahtar_b = istemci_anahtari(b)

        # Assert — ayrı ziyaretçi, ayrı kova
        assert anahtar_a == "203.0.113.5"
        assert anahtar_b == "198.51.100.9"
        assert anahtar_a != anahtar_b

    def test_ayni_ziyaretci_ayni_kovada_kalir(self, monkeypatch):
        # Arrange
        monkeypatch.setenv("DEMO_GUVENILEN_PROXY_SAYISI", "1")
        birinci = _SahteIstek(_scope("10.0.0.7", xff="203.0.113.5"))
        ikinci = _SahteIstek(_scope("10.0.0.9", xff="203.0.113.5"))

        # Act + Assert — sınır aynı istemciyi takip etmeli (soket adresi değişse bile)
        assert istemci_anahtari(birinci) == istemci_anahtari(ikinci)


class TestBaslikGuveniFailClosed:
    """Güvenilen vekil sayısı yokken X-Forwarded-For YOK SAYILIR (fail-closed)."""

    def test_guvenilen_vekil_yokken_xff_yok_sayilir(self, monkeypatch):
        # Arrange — saldırgan başlığı uydurup sınırsız kimlik üretmeye çalışıyor
        monkeypatch.delenv("DEMO_GUVENILEN_PROXY_SAYISI", raising=False)
        sahte = _SahteIstek(_scope("203.0.113.1", xff="1.2.3.4"))

        # Act
        anahtar = istemci_anahtari(sahte)

        # Assert — uydurulan başlık DEĞİL, gerçek soket adresi
        assert anahtar == "203.0.113.1"

    def test_xff_uydurmak_yeni_kova_kazandirmaz(self, monkeypatch):
        # Arrange — aynı saldırgan, her istekte farklı sahte XFF
        monkeypatch.delenv("DEMO_GUVENILEN_PROXY_SAYISI", raising=False)
        istekler = [_SahteIstek(_scope("203.0.113.1", xff=f"9.9.9.{i}")) for i in range(5)]

        # Act
        anahtarlar = {istemci_anahtari(r) for r in istekler}

        # Assert — hepsi TEK kovada; sınır gerçekten uygulanır
        assert anahtarlar == {"203.0.113.1"}

    def test_soldan_enjekte_edilen_vekil_zinciri_kazanamaz(self, monkeypatch):
        # Arrange — saldırgan XFF'e soldan sahte atlama ekliyor; güvenilen vekil 1 ise
        # SAĞDAN birinci alınmalı (soldaki uçlar tamamen saldırgan kontrolünde).
        monkeypatch.setenv("DEMO_GUVENILEN_PROXY_SAYISI", "1")
        sahte = _SahteIstek(_scope("10.0.0.7", xff="1.1.1.1, 2.2.2.2, 203.0.113.5"))

        # Act
        anahtar = istemci_anahtari(sahte)

        # Assert — saldırganın yazdığı sol uçlar değil, vekilin eklediği sağ uç
        assert anahtar == "203.0.113.5"


class TestDayaniklilik:
    """Anahtar üretimi hiçbir girdide çökmemeli (hız sınırı boot'u kırmamalı)."""

    def test_scope_yoksa_cokmez(self):
        # Arrange — scope'suz nesne (slowapi sürüm farkı / testte sahte istek)
        class _Bos:
            pass

        # Act + Assert — istisna atmamalı
        sonuc = istemci_anahtari(_Bos())
        assert isinstance(sonuc, str)

    def test_client_yoksa_bos_string_doner(self, monkeypatch):
        # Arrange — ASGI scope'ta client None olabilir (test istemcisi, unix socket)
        monkeypatch.delenv("DEMO_GUVENILEN_PROXY_SAYISI", raising=False)
        istek = _SahteIstek({"type": "http", "client": None, "headers": []})

        # Act + Assert
        assert isinstance(istemci_anahtari(istek), str)
