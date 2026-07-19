"""aktif_kurum fallback + belgeye-göre otomatik kurum seçimi — uçtan-uca sözleşme.

19 Tem 2. revizyon: "biz belgeye göre hareket ediyoruz" — belge açıkça bir kuruma hitaben
yazılmışsa (yönelme-ekli, yargı hariç) antet O KURUMU otomatik kullanır; sormadan, uyarı
vermeden. `aktif_kurum` (istek-bazlı override, boşsa env KURUM_ADI) yalnız belge açık bir
kurum belirtmediğinde (nominatif/gönderen başlığı ya da hiç kurum tespiti yoksa) fallback'tir.
Önceki "demo kurumu uyuşmazlığı" SARI bilgilendirmesi (yapılandırılmış meta + iki seçenek)
TAMAMEN KALDIRILDI — `kurum_uyusmazligi` artık ProcessResponse'da yok.
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


class TestAktifKurumFallback:
    def test_aktif_kurum_bossa_env_fallback_hitapsiz_belgede(self, client: TestClient):
        # Belge açık bir kuruma hitap etmiyor + aktif_kurum verilmedi → env'e düşer.
        res = client.post("/process_doc", json={"evrak_text": _HITAPSIZ, "filename": "x.txt"})
        assert res.status_code == 200
        assert res.json()["antet_meta"].get("idare") in ("KAMU KURUMU", "")

    def test_aktif_kurum_istek_bazli_hitapsiz_belgede_antede_yazilir(self, client: TestClient):
        res = client.post("/process_doc", json={
            "evrak_text": _HITAPSIZ, "filename": "x.txt",
            "aktif_kurum": "Odunpazarı Belediye Başkanlığı",
        })
        assert res.status_code == 200
        body = res.json()
        assert "ODUNPAZARI BELEDİYE BAŞKANLIĞI" in body["yazi_taslak_md"]
        assert body["antet_meta"]["idare"] == "ODUNPAZARI BELEDİYE BAŞKANLIĞI"

    def test_kurum_uyusmazligi_alani_yaniti_hic_yok(self, client: TestClient):
        # Eski SARI uyarı/meta mekanizması tamamen kaldırıldı.
        res = client.post("/process_doc", json={"evrak_text": _SAGLIK_MUD, "filename": "x.txt"})
        assert res.status_code == 200
        assert "kurum_uyusmazligi" not in res.json()


class TestBelgeyeGoreOtomatikKurum:
    def test_hitap_ekli_belge_aktif_kurumu_ezer_sessizce(self, client: TestClient):
        # Belge farklı türde bir kuruma hitaben yazılmış olsa da SORMADAN/UYARMADAN
        # belgenin kendi kurumu kullanılır — aktif_kurum verilmiş olsa bile.
        res = client.post("/process_doc", json={
            "evrak_text": _SAGLIK_MUD, "filename": "x.txt",
            "aktif_kurum": "Örnekşehir Belediye Başkanlığı",
        })
        assert res.status_code == 200
        body = res.json()
        assert "İL SAĞLIK MÜDÜRLÜĞÜ" in body["yazi_taslak_md"]
        assert body["antet_meta"]["idare"] == "İL SAĞLIK MÜDÜRLÜĞÜ"
        assert "ÖRNEKŞEHİR" not in body["yazi_taslak_md"]
        # Hiçbir uyarı/bant zorlaması yok — kurum seçimi sessiz bir otomasyondur.
        gerekceler = body.get("risk_metadata", {}).get("gerekceler", [])
        assert not any("uyuşmazlığı" in g for g in gerekceler)

    def test_ayni_tur_belge_de_kendi_kurumunu_kullanir(self, client: TestClient):
        # Önceki "aynı tür = stand-in, aktif kurum kazanır" ayrımı KALDIRILDI — belge her
        # zaman kazanır, tür farkı önemsiz. (Kanonik ad "Belediyesi" son-ekiyle kurulur —
        # kurum_kimlik._kanonik; belgedeki tam "Belediye Başkanlığı" ifadesi değil.)
        res = client.post("/process_doc", json={
            "evrak_text": _ODUNPAZARI, "filename": "x.txt",
            "aktif_kurum": "Örnekşehir Belediye Başkanlığı",
        })
        assert res.status_code == 200
        body = res.json()
        assert "ODUNPAZARI BELEDİYESİ" in body["yazi_taslak_md"]
        assert body["antet_meta"]["idare"] == "ODUNPAZARI BELEDİYESİ"
        assert "ÖRNEKŞEHİR" not in body["yazi_taslak_md"]
