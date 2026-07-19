"""aktif_kurum yapılandırılabilirliği + demo kurumu uyuşmazlığı — uçtan-uca sözleşme.

19 Tem revizyon: sabit tek-tenant ZORUNLU DEĞİL. `/process_doc` istek bazlı `aktif_kurum`
alanı taşır; boşsa env KURUM_ADI'ya düşer (geriye-uyum). Farklı TÜRDE bir kuruma hitaben
yazılmış evrakta SARI "kurum_uyusmazligi" meta'sı ProcessResponse'a taşınır — KIRMIZI
DEĞİL, gönderimi engellemez (mock modda deterministik; ağ/LLM yok).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main

_SAGLIK_MUD = (
    "İL SAĞLIK MÜDÜRLÜĞÜNE\n\nHastane randevu sistemi hakkında şikayetimi arz ederim.\n"
    "Ayşe Yılmaz — imza"
)
_ODUNPAZARI = (
    "ODUNPAZARI BELEDİYE BAŞKANLIĞINA\n\nSokağımızdaki yol bozuk, tamir talep ederim.\n"
    "Ayşe Yılmaz — imza"
)


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


class TestAktifKurumOverride:
    def test_aktif_kurum_bossa_env_fallback(self, client: TestClient):
        # Act — aktif_kurum verilmezse (varsayılan "") davranış eskisiyle AYNI: env'e düşer.
        res = client.post("/process_doc", json={"evrak_text": _ODUNPAZARI, "filename": "x.txt"})
        assert res.status_code == 200
        assert res.json()["antet_meta"].get("idare") in ("KAMU KURUMU", "")

    def test_aktif_kurum_istek_bazli_antede_yazilir(self, client: TestClient):
        res = client.post("/process_doc", json={
            "evrak_text": _ODUNPAZARI, "filename": "x.txt",
            "aktif_kurum": "Odunpazarı Belediye Başkanlığı",
        })
        assert res.status_code == 200
        body = res.json()
        assert "ODUNPAZARI BELEDİYE BAŞKANLIĞI" in body["yazi_taslak_md"]
        assert body["antet_meta"]["idare"] == "ODUNPAZARI BELEDİYE BAŞKANLIĞI"


class TestKurumUyusmazligiUctanUca:
    def test_farkli_tur_sari_meta_doldurur(self, client: TestClient):
        res = client.post("/process_doc", json={
            "evrak_text": _SAGLIK_MUD, "filename": "x.txt",
            "aktif_kurum": "Örnekşehir Belediye Başkanlığı",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["kurum_uyusmazligi"] == {
            "belge_kurumu": "İl Sağlık Müdürlüğü", "belge_kurumu_tur": "mudurluk",
            "aktif_kurum": "Örnekşehir Belediye Başkanlığı",
        }
        # SARI — gönderim ENGELLENMEZ (KIRMIZI değil).
        assert body["risk_metadata"]["bant"] == "sari"
        # Antet yine de aktif kuruma göre (belgedeki kuruma DEĞİL).
        assert "ÖRNEKŞEHİR BELEDİYE BAŞKANLIĞI" in body["yazi_taslak_md"]

    def test_ayni_tur_stand_in_meta_bos(self, client: TestClient):
        res = client.post("/process_doc", json={
            "evrak_text": _ODUNPAZARI, "filename": "x.txt",
            "aktif_kurum": "Örnekşehir Belediye Başkanlığı",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["kurum_uyusmazligi"] is None

    def test_belgedeki_kurumu_kullan_uyusmazligi_temizler(self, client: TestClient):
        # "Belgedeki kurumu aktif kurum yap" akışı: aynı evrak, aktif_kurum artık belge
        # kurumuyla AYNI → uyuşmazlık kaybolur, antet belge kurumuna döner.
        res = client.post("/process_doc", json={
            "evrak_text": _SAGLIK_MUD, "filename": "x.txt",
            "aktif_kurum": "İl Sağlık Müdürlüğü",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["kurum_uyusmazligi"] is None
        assert "İL SAĞLIK MÜDÜRLÜĞÜ" in body["yazi_taslak_md"]
