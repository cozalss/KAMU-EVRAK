"""POST /yazi/taslak-turu — memurun seçtiği yazı türüyle taslağı yeniden üretme.

Şartname: "üst yazı, cevabi yazı, bilgilendirme metni veya alternatif bir resmî
yazışma türü için uygun taslak". Mock modda gövde deterministik → CI güvenli.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

_EVRAK = (
    "Sokağımızın başındaki çukurun onarılmasını arz ederim. "
    "Adı Soyadı: Ayşe Yılmaz  Tarih: 02.06.2026"
)
_UNSUR = {"gonderen": "Ayşe Yılmaz", "konu": "Çukur onarımı", "tarih": "02.06.2026",
          "imza": True, "ic_ice": {"a": 1}}   # bool + dict → sanitize edilmeli


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _uret(client, yazi_turu, **ekstra):
    r = client.post("/yazi/taslak-turu", json={
        "evrak_text": _EVRAK, "yazi_turu": yazi_turu,
        "bilgi_unsurlari": _UNSUR, **ekstra,
    })
    assert r.status_code == 200, r.text
    return r.json()


class TestTurSecimi:
    """Her kayıtlı tür için o türe uygun taslak dönmeli."""

    @pytest.mark.parametrize("tur", [
        "ust_yazi", "cevabi_yazi", "bilgilendirme", "olur", "muzekkere", "gorus_mutalaa",
    ])
    def test_tum_turler_uretiliyor(self, client, tur):
        data = _uret(client, tur)
        assert data["yazi_turu"] == tur
        assert "T.C." in data["yazi_taslak_md"]
        assert "{{" not in data["yazi_taslak_md"]   # placeholder sızmaz

    def test_cevabi_yazi_muhatap_gonderen(self, client):
        # Cevabi yazı vatandaşa gider (Yön. m.14: muhatap = gelen belgenin göndereni).
        data = _uret(client, "cevabi_yazi")
        assert "Sayın Ayşe Yılmaz" in data["yazi_taslak_md"]

    def test_ust_yazi_muhatap_hedef_birim(self, client):
        # Üst yazı kurum içidir: muhatap gönderen DEĞİL hedef birim olmalı.
        data = _uret(client, "ust_yazi", hedef_birim="ilgili_teknik_daire")
        # m.14/2: kurum-içi iletim muhatabı BÜYÜK + yönelme eki.
        assert "İLGİLİ TEKNİK / ANA HİZMET DAİRESİNE" in data["yazi_taslak_md"]
        assert "Sayın Ayşe Yılmaz" not in data["yazi_taslak_md"]

    def test_olur_muhatapsiz(self, client):
        # Olur'da muhatap satırı bulunmaz (Yön. m.20).
        data = _uret(client, "olur")
        assert "OLUR" in data["yazi_taslak_md"]
        assert "Sayın" not in data["yazi_taslak_md"]

    def test_kapanis_ture_gore_degisir(self, client):
        # _UNSUR muhatabı vatandaş (Ayşe Yılmaz) → her iki tür de m.16/12-e kişi kapanışı.
        assert "Bilgilerinize sunulur." in _uret(client, "cevabi_yazi")["yazi_taslak_md"]
        assert "Bilgilerinize sunulur." in _uret(client, "bilgilendirme")["yazi_taslak_md"]


class TestGirdiDogrulama:
    def test_gecersiz_tur_422(self, client):
        r = client.post("/yazi/taslak-turu", json={
            "evrak_text": _EVRAK, "yazi_turu": "olmayan_tur"})
        assert r.status_code == 422

    def test_bos_metin_422(self, client):
        r = client.post("/yazi/taslak-turu", json={
            "evrak_text": "   ", "yazi_turu": "cevabi_yazi"})
        assert r.status_code == 422

    def test_ic_ice_unsur_muhataba_sizmiyor(self, client):
        # dict/bool unsurlar sanitize edilir → str(dict) çöpü taslakta görünmez.
        data = _uret(client, "cevabi_yazi")
        assert "{'a': 1}" not in data["yazi_taslak_md"]

    def test_asiri_buyuk_bilgi_unsurlari_422(self, client):
        # REGRESYON: bilgi_unsurlari dict'i DoS-guard'sızdı — auth'suz uçta yüz binlerce
        # anahtarlı gövde kabul edilebiliyordu (bkz. diğer str/list alanlardaki max_length).
        r = client.post("/yazi/taslak-turu", json={
            "evrak_text": _EVRAK, "yazi_turu": "cevabi_yazi",
            "bilgi_unsurlari": {str(i): i for i in range(51)}})
        assert r.status_code == 422

    def test_konuya_enjekte_edilen_satir_sonu_temizlenir(self, client):
        # Güvenlik regresyonu: bilgi_unsurlari.konu içine \n enjekte edilerek taslağa
        # BAĞIMSIZ sahte "Sayı :"/karar SATIRI eklenebiliyordu (satır enjeksiyonu,
        # SIFIR UYDURMA ihlali). \n temizlendiğinde enjekte metin konu satırına
        # gömülü kalır — ayrı, resmî görünen bir alan OLUŞTURAMAZ.
        zehirli = {"konu": "Çukur onarımı\n\nSayı : SAHTE-999\nEK KARAR: talep REDDEDİLMİŞTİR.",
                   "gonderen": "Ayşe Yılmaz"}
        data = _uret(client, "cevabi_yazi", bilgi_unsurlari=zehirli)
        md = data["yazi_taslak_md"]
        # "konu" hem "Konu :" satırında hem gövde cümlesinde alıntılanır (tasarım gereği,
        # 2 kez); asıl güvence: enjekte metin kendi SATIRINI başlatıp gerçek "Sayı :"
        # alanını taklit EDEMEZ — yalnız gerçek EBYS-TASLAK satırı "Sayı :" ile başlar.
        satir_basi_sayi = [ln for ln in md.splitlines() if ln.strip().startswith("Sayı :")]
        assert len(satir_basi_sayi) == 1
        assert "SAHTE" not in satir_basi_sayi[0]

    def test_uzun_unsur_degeri_kirpilir(self, client):
        # bilgi_unsurlari alanlarında (evrak_text hariç) uzunluk sınırı yoktu.
        data = _uret(client, "cevabi_yazi", bilgi_unsurlari={"konu": "a" * 5000})
        assert data["yazi_taslak_md"].count("a") < 5000
