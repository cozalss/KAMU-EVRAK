"""POST /yazi/dayanak + grounding muafiyeti — kutucukla seçilen mevzuatın yazıya işlenmesi.

Kurgu: memur "İlgili mevzuat" panelinden madde işaretler → taslağa DETERMİNİSTİK "Dayanak"
bloğu eklenir; işaret kaldırılınca bire bir geri alınır. Gönderim yolunda (/yazi/dogrula)
seçili atıf grounding'de 'uydurma' sayılmaz, ama sahte sayı hâlâ yakalanır (asimetri korunur).
Mock modda deterministik → CI güvenli.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

_EVRAK = (
    "Sokağımızın başındaki çukurun onarılmasını arz ederim. "
    "Adı Soyadı: Ayşe Yılmaz  Tarih: 02.06.2026"
)
_SECILI = [
    {"baslik": "2709 anayasa secili maddeler m.74", "madde_no": "74", "kaynak_dosya": "2709.txt"},
    {"baslik": "4982 bilgi edinme kanunu m.4", "madde_no": "4", "kaynak_dosya": "4982.txt"},
]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _base(client, tur="cevabi_yazi"):
    r = client.post("/yazi/taslak-turu", json={
        "evrak_text": _EVRAK, "yazi_turu": tur,
        "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Çukur onarımı",
                             "tarih": "02.06.2026"},
    })
    assert r.status_code == 200, r.text
    return r.json()["yazi_taslak_md"]


def _dayanak(client, taslak, secili, **ek):
    return client.post("/yazi/dayanak", json={
        "taslak_md": taslak, "secili_mevzuat": secili, "yazi_turu": "cevabi_yazi", **ek})


class TestDayanakUcu:
    def test_secili_madde_yaziya_islenir(self, client):
        base = _base(client)
        r = _dayanak(client, base, _SECILI)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "Dayanak :" in data["yazi_taslak_md"]
        assert "2709 anayasa secili maddeler m.74" in data["yazi_taslak_md"]
        assert "4982 bilgi edinme kanunu m.4" in data["yazi_taslak_md"]
        assert data["dayanak_sayisi"] == 2
        assert data["format_uyumlu"] is True

    def test_bos_secim_base_ile_ayni(self, client):
        # "çıkarırsa geri alsın" — sunucu tarafı da boş seçimde base'i AYNEN döndürür.
        base = _base(client)
        r = _dayanak(client, base, [])
        assert r.status_code == 200, r.text
        assert r.json()["yazi_taslak_md"] == base
        assert r.json()["dayanak_sayisi"] == 0

    def test_girinti_korunur(self, client):
        # strip() KULLANILMAZ: ortalı antet/imza girintileri ve kapanış hizası bozulmamalı.
        base = _base(client)
        r = _dayanak(client, base, _SECILI)
        md = r.json()["yazi_taslak_md"]
        # base'deki lider-boşluklu (ortalı) satırlar md'de AYNEN durmalı (global strip yok).
        ortali = [ln for ln in base.split("\n") if ln.strip() and ln.startswith("          ")]
        assert ortali, "base'de ortalı satır beklenirdi"
        for ln in ortali:
            assert ln in md

    def test_kapanistan_once(self, client):
        base = _base(client)
        md = _dayanak(client, base, _SECILI).json()["yazi_taslak_md"]
        assert md.index("Dayanak :") < md.index("Gereğini rica ederim.")

    def test_placeholder_sizmaz(self, client):
        base = _base(client)
        md = _dayanak(client, base, _SECILI).json()["yazi_taslak_md"]
        assert "{{" not in md

    def test_bos_taslak_422(self, client):
        r = client.post("/yazi/dayanak", json={"taslak_md": "   ", "secili_mevzuat": _SECILI})
        assert r.status_code == 422

    def test_gecersiz_oge_patlamaz(self, client):
        base = _base(client)
        r = _dayanak(client, base, ["çöp", {"baslik": ""}, 7])
        assert r.status_code == 200, r.text
        assert r.json()["yazi_taslak_md"] == base  # net atıf yok → değişmez


class TestGonderimYoluGrounding:
    """Dayanaklı taslak /yazi/dogrula'dan geçince: memur-küreli blok grounding-gövdesinden
    ayrılır (atıf 'uydurma' sayılmaz), AMA deterministik veto TÜM taslağa uygulanır (asimetri).
    İstemci-kontrollü 'whitelist' YOK — güvenli by construction (bkz. verify.dayanak_blogunu_cikar)."""

    def test_dayanakli_taslak_temiz_kalir(self, client):
        base = _base(client)
        dayanakli = _dayanak(client, base, _SECILI).json()["yazi_taslak_md"]
        r = client.post("/yazi/dogrula", json={
            "taslak_md": dayanakli, "evrak_text": _EVRAK, "yazi_turu": "cevabi_yazi",
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Çukur onarımı",
                                "tarih": "02.06.2026"},
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["format_uyumlu"] is True
        assert data["risk_metadata"]["bant"] == "yesil"

    def test_dayanak_bloguna_gomulu_6hane_sahte_sayi_veto_ile_yakalanir(self, client):
        # ASİMETRİ: blok grounding-LLM'inden ayrılsa bile, deterministik uydurma-veto (6+ hane,
        # kaynakta yok) TÜM taslağa uygulanır → atıf-ŞEKLİNDE ama sahte-sayılı başlık yine yakalanır.
        base = _base(client)
        # Geçerli atıf şekli (m.1 + harf) AMA kaynakta olmayan 9-hane sayı taşıyor.
        dayanakli = _dayanak(client, base, [{"baslik": "999888777 sayılı kanun m.1"}]).json()["yazi_taslak_md"]
        assert "999888777" in dayanakli   # atıf-şekli geçerli → render edildi
        r = client.post("/yazi/dogrula", json={
            "taslak_md": dayanakli, "evrak_text": _EVRAK, "yazi_turu": "cevabi_yazi",
            "evrak_turu": "dilekce", "bilgi_unsurlari": {"tarih": "02.06.2026"}})
        assert r.status_code == 200, r.text
        data = r.json()
        assert any("999888777" in u for u in data["verify_uyari"])
        assert data["risk_metadata"]["bant"] != "yesil"

    def test_grounding_govdesi_dayanak_blogunu_gormez(self):
        # Blok, grounding LLM'ine giden gövdeden ayrılır (istemci metni grounding'e girmez).
        from yazi.dayanak import dayanak_blogunu_cikar, dayanak_uygula

        base = ("T.C.\nKonu : X\n\nGövde metni.\n\n"
                "         Gereğini rica ederim.\n\n"
                "                                              İmza\n")
        dayanakli = dayanak_uygula(base, _SECILI)
        govde = dayanak_blogunu_cikar(dayanakli)
        assert "Dayanak :" not in govde
        assert "2709 anayasa secili maddeler m.74" not in govde
        assert "Gövde metni." in govde and "Gereğini rica ederim." in govde
