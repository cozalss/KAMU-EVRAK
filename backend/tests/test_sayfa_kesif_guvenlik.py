"""Sayfa keşfinin AĞ GÜVENLİĞİ — sahte transport ile, gerçek ağa çıkmadan.

`test_sayfa_kesif.py` saf fonksiyonları (izinli_mi, bağlantı seçimi) sınar. Bu dosya ise
ağa çıkan yolu (`_getir` / `birim_sayfasi_bul`) `httpx.MockTransport` ile koşturur ve
"hangi adrese İSTEK ATILDI" sorusunu doğrudan ölçer. Ayrım önemli: 2026-08-06 denetiminde
bulunan hatanın tamamı "istek atıldı ama sonucu kullanılmadı" biçimindeydi ve sonucu
inceleyen hiçbir test onu göremezdi.

KİLİTLENEN ÜÇ SÖZLEŞME:
  D. Yalnız izinli resmî alanlara İSTEK ATILIR — yönlendirmenin ARA sıçramaları dâhil.
     (Eskiden httpx zinciri kendi takip ediyordu; 127.0.0.1'e istek gidiyor, yalnız
      içerik atılıyordu — kör SSRF.)
  F. Akış düşmez: gövde sınırı indirme SIRASINDA uygulanır (sıkıştırma bombası/dev dosya
     belleğe alınmaz) ve toplam süre bütçesi vardır.
  +  HTML olmayan içerik hiç indirilmez.
"""
from __future__ import annotations

import httpx
import pytest

from core import sayfa_kesif as sk

# Gerçek fonksiyon, aşağıdaki autouse fixture onu değiştirmeden ÖNCE saklanır —
# `TestIcAgKapisi` sahteyi değil aslını sınamalı.
_GERCEK_IC_AG = sk.ic_ag_mi


@pytest.fixture(autouse=True)
def _dns_kapali(monkeypatch):
    """`ic_ag_mi` gerçek DNS'e çıkmasın; testler ağdan bağımsız olmalı."""
    monkeypatch.setattr(sk, "ic_ag_mi", lambda konak: konak in {"127.0.0.1", "localhost"})


def _istemci(islek, **kw) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(islek),
                        follow_redirects=False, timeout=5.0, **kw)


class TestYonlendirmeZinciri:
    def test_izinsiz_ara_sicramaya_ISTEK_ATILMAZ(self) -> None:
        """En kritik güvenlik testi: iç adrese GET GİTMEMELİ, sadece içerik atılması yetmez."""
        istekler: list[str] = []

        def islek(istek: httpx.Request) -> httpx.Response:
            istekler.append(str(istek.url))
            if istek.url.host == "x.bel.tr" and istek.url.path == "/git":
                return httpx.Response(302, headers={"location": "http://127.0.0.1:8000/admin"})
            return httpx.Response(200, text="<html>ok</html>",
                                  headers={"content-type": "text/html"})

        with _istemci(islek) as c:
            assert sk._getir(c, "https://x.bel.tr/git") is None
        assert istekler == ["https://x.bel.tr/git"], f"iç adrese istek atıldı: {istekler}"

    def test_izinsiz_ALANA_yonlendirme_de_kesilir(self) -> None:
        istekler: list[str] = []

        def islek(istek: httpx.Request) -> httpx.Response:
            istekler.append(str(istek.url))
            if istek.url.host == "x.bel.tr":
                return httpx.Response(302, headers={"location": "https://saldirgan.com/a"})
            return httpx.Response(200, text="gizli", headers={"content-type": "text/html"})

        with _istemci(islek) as c:
            assert sk._getir(c, "https://x.bel.tr/") is None
        assert all("saldirgan.com" not in u for u in istekler), istekler

    def test_IZINLI_alana_yonlendirme_izlenir(self) -> None:
        """Koruma abartılmamalı: resmî alan içi yönlendirme normal ve izlenmeli."""
        def islek(istek: httpx.Request) -> httpx.Response:
            if istek.url.path == "/eski":
                return httpx.Response(301, headers={"location": "https://x.bel.tr/yeni"})
            return httpx.Response(200, text="<p>Fen İşleri Müdürlüğü</p>",
                                  headers={"content-type": "text/html"})

        with _istemci(islek) as c:
            assert "Fen İşleri" in (sk._getir(c, "https://x.bel.tr/eski") or "")

    def test_yonlendirme_dongusu_sonsuza_gitmez(self) -> None:
        sayac = {"n": 0}

        def islek(istek: httpx.Request) -> httpx.Response:
            sayac["n"] += 1
            hedef = f"https://x.bel.tr/{sayac['n']}"
            return httpx.Response(302, headers={"location": hedef})

        with _istemci(islek) as c:
            assert sk._getir(c, "https://x.bel.tr/0") is None
        assert sayac["n"] <= sk.AZAMI_YONLENDIRME + 1, sayac


class TestGovdeSiniri:
    def test_dev_govde_TAMAMEN_indirilmez(self) -> None:
        """Sınır indirme SIRASINDA uygulanmalı; `len(content)` ile bakmak belleği korumaz."""
        okunan = {"bayt": 0}
        parca = b"x" * 100_000

        def uret():
            for _ in range(200):                       # 20 MB
                okunan["bayt"] += len(parca)
                yield parca

        def islek(istek: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=uret(), headers={"content-type": "text/html"})

        with _istemci(islek) as c:
            assert sk._getir(c, "https://x.bel.tr/dev") is None
        assert okunan["bayt"] <= sk.AZAMI_GOVDE + len(parca), (
            f"sınır aşıldıktan sonra da indirilmeye devam edildi: {okunan['bayt']}"
        )

    def test_content_length_buyukse_govde_HIC_okunmaz(self) -> None:
        okundu = {"evet": False}

        def uret():
            okundu["evet"] = True
            yield b"veri"

        def islek(istek: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=uret(), headers={
                "content-type": "text/html", "content-length": str(sk.AZAMI_GOVDE + 1)})

        with _istemci(islek) as c:
            assert sk._getir(c, "https://x.bel.tr/buyuk") is None
        assert okundu["evet"] is False

    @pytest.mark.parametrize("tip", ["application/pdf", "application/zip", "video/mp4"])
    def test_HTML_olmayan_icerik_reddedilir(self, tip: str) -> None:
        def islek(istek: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b"ikili", headers={"content-type": tip})

        with _istemci(islek) as c:
            assert sk._getir(c, "https://x.bel.tr/dosya") is None

    def test_ikili_uzantili_baglanti_ADAY_bile_olmaz(self) -> None:
        """Tür kapısından önce ucuz uzantı kapısı: PDF'e hiç istek atılmasın."""
        govde = ('<a href="/dosya/mudurlukler-semasi.pdf">Müdürlükler</a>'
                 '<a href="/kurumsal/mudurlukler">Müdürlükler</a>')
        adaylar = [u for _a, u, _i in sk._aday_baglantilar(govde, "https://x.bel.tr/")]
        assert "https://x.bel.tr/kurumsal/mudurlukler" in adaylar
        assert all(not u.endswith(".pdf") for u in adaylar), adaylar


class TestSureButcesi:
    def test_toplam_butce_asilmaz(self, monkeypatch) -> None:
        """4 ölü aday × istek zaman aşımı ≈ 96 sn ediyordu; bütçe bunu keser."""
        import time
        cagri = {"n": 0}

        def yavas(istemci, url, bitis=None):
            cagri["n"] += 1
            time.sleep(0.25)
            return None

        monkeypatch.setattr(sk, "_getir", yavas)
        basla = time.monotonic()
        sonuc = sk.birim_sayfasi_bul(
            [f"https://x{i}.bel.tr" for i in range(40)], butce_sn=1.0)
        gecen = time.monotonic() - basla
        assert sonuc is None
        assert gecen < 3.0, f"bütçe tutmadı: {gecen:.1f} sn, {cagri['n']} çağrı"


class TestIcAgKapisi:
    @pytest.mark.parametrize("ham,beklenen", [
        ("127.0.0.1", True), ("10.0.0.5", True), ("192.168.1.1", True),
        ("169.254.169.254", True), ("8.8.8.8", False),
    ])
    def test_ozel_aralik_tespiti(self, monkeypatch, ham: str, beklenen: bool) -> None:
        """`.gov.tr` bir ad da iç IP'ye çözülebilir — sonek kontrolü tek başına yetmez."""
        import socket as _s
        monkeypatch.setattr(sk.socket, "getaddrinfo",
                            lambda *a, **k: [(_s.AF_INET, None, None, "", (ham, 443))])
        assert _GERCEK_IC_AG("her-neyse.gov.tr") is beklenen

    def test_cozulemeyen_ad_ic_ag_SAYILMAZ(self, monkeypatch) -> None:
        monkeypatch.setattr(sk.socket, "getaddrinfo",
                            lambda *a, **k: (_ for _ in ()).throw(OSError()))
        assert _GERCEK_IC_AG("olmayan.gov.tr") is False
