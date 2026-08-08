"""Antet kurum kimliği — belgeye göre otomatik seçim + env fallback (uçtan-uca sözleşme).

19 Tem 2. revizyon: "biz belgeye göre hareket ediyoruz" — belge açıkça bir kuruma hitaben
yazılmışsa (yönelme-ekli, yargı hariç) antet O KURUMU otomatik kullanır; sormadan, uyarı
vermeden. Belge açık bir kurum belirtmiyorsa (nominatif/gönderen başlığı ya da hiç kurum
tespiti yoksa) kurulum sabiti env KURUM_ADI, o da yoksa jenerik "KAMU KURUMU" kullanılır.

6 Ağu 2026: istek-bazlı `aktif_kurum` override'ı (ProcessRequest alanı + state alanı +
frontend "Aktif kurum" ayarı) TAMAMEN KALDIRILDI — kurum kimliğinin yalnız iki kaynağı var.
Eski "demo kurumu uyuşmazlığı" SARI bilgilendirmesi ise daha önce kaldırılmıştı
(`kurum_uyusmazligi` ProcessResponse'da yok).
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
_HITAPSIZ = "Merhaba, sokağımızda çöpler toplanmıyor. Gereğini arz ederim."


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


class TestEnvFallback:
    def test_hitapsiz_belgede_env_fallbacke_duser(self, client: TestClient):
        # Belge açık bir kuruma hitap etmiyor → kurulum sabiti (test ortamında boş) → jenerik.
        res = client.post("/process_doc", json={"evrak_text": _HITAPSIZ, "filename": "x.txt"})
        assert res.status_code == 200
        assert res.json()["antet_meta"].get("idare") in ("KAMU KURUMU", "")

    def test_istek_bazli_aktif_kurum_alani_ARTIK_ETKISIZ(self, client: TestClient):
        """Kaldırılan sözleşmenin regresyon bekçisi: gövdeye `aktif_kurum` konsa bile
        antet DEĞİŞMEZ (alan şemadan silindi, Pydantic fazlalığı yok sayar)."""
        res = client.post("/process_doc", json={
            "evrak_text": _HITAPSIZ, "filename": "x.txt",
            "aktif_kurum": "Odunpazarı Belediye Başkanlığı",
        })
        assert res.status_code == 200
        body = res.json()
        assert body["antet_meta"].get("idare") in ("KAMU KURUMU", "")
        assert "ODUNPAZARI" not in body["yazi_taslak_md"]

    def test_kurum_uyusmazligi_alani_yaniti_hic_yok(self, client: TestClient):
        # Eski SARI uyarı/meta mekanizması tamamen kaldırıldı.
        res = client.post("/process_doc", json={"evrak_text": _SAGLIK_MUD, "filename": "x.txt"})
        assert res.status_code == 200
        assert "kurum_uyusmazligi" not in res.json()


class TestBelgeyeGoreOtomatikKurum:
    def test_hitap_ekli_belge_kurumu_sessizce_antede_yazilir(self, client: TestClient):
        res = client.post("/process_doc", json={"evrak_text": _SAGLIK_MUD, "filename": "x.txt"})
        assert res.status_code == 200
        body = res.json()
        assert "İL SAĞLIK MÜDÜRLÜĞÜ" in body["yazi_taslak_md"]
        assert body["antet_meta"]["idare"] == "İL SAĞLIK MÜDÜRLÜĞÜ"
        assert "KAMU KURUMU" not in body["yazi_taslak_md"]
        # Hiçbir uyarı/bant zorlaması yok — kurum seçimi sessiz bir otomasyondur.
        gerekceler = body.get("risk_metadata", {}).get("gerekceler", [])
        assert not any("uyuşmazlığı" in g for g in gerekceler)

    def test_belediye_belgesi_de_kendi_kurumunu_kullanir(self, client: TestClient):
        # (Kanonik ad "Belediyesi" son-ekiyle kurulur — kurum_kimlik._kanonik; belgedeki
        # tam "Belediye Başkanlığı" ifadesi değil.)
        res = client.post("/process_doc", json={"evrak_text": _ODUNPAZARI, "filename": "x.txt"})
        assert res.status_code == 200
        body = res.json()
        assert "ODUNPAZARI BELEDİYESİ" in body["yazi_taslak_md"]
        assert body["antet_meta"]["idare"] == "ODUNPAZARI BELEDİYESİ"
