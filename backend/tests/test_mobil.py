"""Telefonla evrak yükleme (QR eşleme) oturum yaşam döngüsü testleri.

Akış: masaüstü oturum açar → telefon sayfayı açıp foto yükler → masaüstü poll ile
görür → dosyayı TEK SEFERLİK indirir → mevcut /process_doc/stream akışına verir.
Burada yalnız /mobil API sözleşmesi test edilir (pipeline'a dokunmaz).
"""

from __future__ import annotations

import io
import socket

import pytest
from fastapi.testclient import TestClient

from api.middleware import ratelimit
from api.routes import mobil as mobil_mod
from main import app

client = TestClient(app)

PNG_STUB = b"\x89PNG\r\n\x1a\n" + b"0" * 64  # gerçek PNG değil; API katmanı içerik ayrıştırmaz


@pytest.fixture(autouse=True)
def _temiz_oturumlar(monkeypatch):
    """Her test bağımsız — oturum deposu sıfır + hız sınırı kapalı.

    slowapi sayaçları süreç-genelidir; kapatılmazsa tavan testinin 429'u hız
    sınırından mı tavandan mı geldi ayırt edilemez (denetçi bulgusu)."""
    if ratelimit._limiter is not None:
        monkeypatch.setattr(ratelimit._limiter, "enabled", False)
    mobil_mod._OTURUMLAR.clear()
    yield
    mobil_mod._OTURUMLAR.clear()


def _olustur() -> dict:
    r = client.post("/mobil/oturum")
    assert r.status_code == 200, r.text
    return r.json()


def test_oturum_olustur_ve_durum_bekliyor():
    data = _olustur()
    assert data["oturum_id"]
    assert "/mobil/" in data["mobil_url"]
    # Çoklu-arayüz desteği: aday listesi dolu ve birincil URL listenin başı.
    assert data["aday_urller"]
    assert data["mobil_url"] == data["aday_urller"][0]
    assert all(data["oturum_id"] in u for u in data["aday_urller"])
    # Self-test alanı her yanıtta bulunur (CI'da 8000'de sunucu yok → False olabilir; tip sözleşmesi).
    assert isinstance(data["erisilebilir"], bool)
    r = client.get(f"/mobil/{data['oturum_id']}/durum")
    assert r.status_code == 200
    assert r.json()["durum"] == "bekliyor"


def test_mobil_base_url_env_tek_aday(monkeypatch):
    """MOBIL_BASE_URL set ise aday listesi TEK elemanlıdır ve onu kullanır."""
    monkeypatch.setenv("MOBIL_BASE_URL", "http://ornek-taban:9999")
    data = _olustur()
    assert data["aday_urller"] == [f"http://ornek-taban:9999/mobil/{data['oturum_id']}"]


def test_aday_filtrele_sanal_adaptor_eler():
    """192.168/10 aday varken 172.16-31 (WSL/Hyper-V sanal ağı) listeden düşer;
    yalnız-172'li gerçek kurumsal ağda liste aynen korunur."""
    assert mobil_mod._aday_filtrele(["192.168.0.18", "172.29.16.1"]) == ["192.168.0.18"]
    assert mobil_mod._aday_filtrele(["10.0.0.5", "172.21.1.1"]) == ["10.0.0.5"]
    assert mobil_mod._aday_filtrele(["172.16.4.2", "172.17.0.1"]) == ["172.16.4.2", "172.17.0.1"]
    # Hotspot senaryosu: iki gerçek aday da kalır (Ethernet + Windows hotspot adaptörü).
    assert mobil_mod._aday_filtrele(["192.168.0.18", "192.168.137.1"]) == ["192.168.0.18", "192.168.137.1"]


def test_aday_filtrele_iphone_hotspot_elenmez():
    """iPhone Kişisel Erişim Noktası HER ZAMAN 172.20.10.0/28 dağıtır — bu imza sanal
    adaptör DEĞİLDİR. PC'de ölü bir 192.168.x sanal adaptör (VirtualBox vb.) varken
    gerçek hotspot IP'sinin elenmesi QR'ı ölü IP'ye kilitliyordu."""
    assert "172.20.10.2" in mobil_mod._aday_filtrele(["172.20.10.2", "192.168.56.1"])
    # İmza dışı 172'ler (WSL/Docker) yine elenir — koruma yalnız /28 imzasına özgü.
    assert mobil_mod._aday_filtrele(["172.29.16.1", "172.20.10.2", "192.168.56.1"]) == [
        "172.20.10.2", "192.168.56.1"]


def test_aday_filtrele_varsayilan_rota_ip_asla_elenmez():
    """Varsayılan-rota IP'si internete ÇIKAN arayüzdür — sanal-adaptör varsayımıyla
    elenemez (örn. gerçek kurumsal/VPN 172'li ağ + makinede 192.168.x sanal adaptör)."""
    assert mobil_mod._aday_filtrele(["172.29.5.1", "192.168.56.1"], koru="172.29.5.1") == [
        "172.29.5.1", "192.168.56.1"]


def test_aday_filtrele_yalniz_172_agda_liste_aynen_kalir_koru_ile_de():
    """Skeptik bulgusu (S11): yalnız-172'li kurumsal ağ + telefon tether'ı (koru =
    172.20.10.x rota) → kurumsal IP DÜŞMEMELİ; muafiyetler eleme dalını açmaz.
    Eleme dalı yalnız listede 192.168/10 adayı varken çalışır (eski no-op sözleşmesi)."""
    assert mobil_mod._aday_filtrele(["172.20.10.2", "172.18.4.20"], koru="172.20.10.2") == [
        "172.20.10.2", "172.18.4.20"]
    # VPN varyantı (S12): koru imzasız 172'li olsa da yalnız-172 liste aynen kalır.
    assert mobil_mod._aday_filtrele(["172.31.0.5", "172.18.4.20"], koru="172.31.0.5") == [
        "172.31.0.5", "172.18.4.20"]


def test_aday_filtrele_daima_yeni_liste_doner():
    """Aliasing regresyonu (review bulgusu): her dal YENİ liste dönmeli — çağıranın
    mutasyonu girdiyle paylaşılan nesneyi sessizce değiştirmesin."""
    girdi_eleme = ["192.168.0.18", "172.29.16.1"]
    girdi_noop = ["172.16.4.2", "172.17.0.1"]   # 192.168/10 yok → no-op dalı
    assert mobil_mod._aday_filtrele(girdi_eleme) is not girdi_eleme
    assert mobil_mod._aday_filtrele(girdi_noop) is not girdi_noop
    assert mobil_mod._aday_filtrele([]) == []


def test_aday_ipler_hotspot_listede_rota_birincil(monkeypatch):
    """Senaryo: PC hem Ethernet'te (internet, varsayılan rota) hem iPhone hotspot'una
    bağlı. Varsayılan-rota IP'si BİRİNCİL kalır (tek ampirik sinyal — skeptik bulgusu:
    hotspot'u öne almak VPN/VLAN'da erişilemez IP yükseltir); hotspot adayı listede
    durur, modal seçicisi tek dokunuşla geçirir. Eski kod hotspot'u tamamen ELİYORDU."""
    monkeypatch.setattr(mobil_mod, "_varsayilan_ip", lambda: "192.168.0.18")
    monkeypatch.setattr(
        mobil_mod.socket, "getaddrinfo",
        lambda *a, **k: [(None, None, None, "", ("172.20.10.2", 0)),
                         (None, None, None, "", ("192.168.0.18", 0))])
    adaylar = mobil_mod._aday_ipler()
    assert adaylar[0] == "192.168.0.18"
    assert "172.20.10.2" in adaylar


def _dinleyen_soket() -> socket.socket:
    """127.0.0.1'de gerçek bir dinleyici — CI-güvenli (dış arayüz gerekmez)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    s.listen(1)
    return s


def test_erisim_tanisi_dinleyen_sunucuda_bos():
    """connect başarılı → tanı yok (erişilebilir)."""
    srv = _dinleyen_soket()
    try:
        assert mobil_mod._erisim_tanisi("127.0.0.1", srv.getsockname()[1]) == ""
    finally:
        srv.close()


def test_erisim_tanisi_bos_portta_dinlemiyor():
    """connect başarısız + porta bind BAŞARILI → o arayüzde dinleyen yok: 'dinlemiyor'
    (tipik: backend 127.0.0.1'e bağlı eski süreç ya da --host'suz uvicorn CLI)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    bos_port = s.getsockname()[1]
    s.close()
    assert mobil_mod._erisim_tanisi("127.0.0.1", bos_port) == "dinlemiyor"


def test_erisim_tanisi_port_dolu_ama_baglanilamiyorsa_engelleniyor(monkeypatch):
    """Güvenlik duvarı simülasyonu: port GERÇEKTEN dinleniyor ama connect kesiliyor →
    bind EADDRINUSE ile düşer → 'engelleniyor' (reçete: demo-mobil.ps1 / izin kuralı)."""
    srv = _dinleyen_soket()
    monkeypatch.setattr(mobil_mod, "_dinleme_testi", lambda ip, port: False)
    try:
        assert mobil_mod._erisim_tanisi("127.0.0.1", srv.getsockname()[1]) == "engelleniyor"
    finally:
        srv.close()


def test_oturum_yaniti_erisim_tanisini_tasir(monkeypatch):
    """API sözleşmesi: self-test başarısızsa yanıt hem bayrağı hem AYIRICI tanıyı taşır —
    frontend banner'ı nedene göre doğru reçeteyi gösterir."""
    monkeypatch.setattr(mobil_mod, "_erisim_tanisi", lambda ip, port: "engelleniyor")
    data = _olustur()
    assert data["erisilebilir"] is False
    assert data["erisim_tanisi"] == "engelleniyor"


def test_mobil_sayfa_gelir_ve_html():
    data = _olustur()
    r = client.get(f"/mobil/{data['oturum_id']}")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "kamu-evrak" in r.text


def test_yukle_sonrasi_durum_yuklendi_ve_dosya_tek_seferlik():
    data = _olustur()
    oid = data["oturum_id"]
    r = client.post(f"/mobil/{oid}/yukle",
                    files={"file": ("belge.png", io.BytesIO(PNG_STUB), "image/png")})
    assert r.status_code == 200, r.text

    r = client.get(f"/mobil/{oid}/durum")
    assert r.json()["durum"] == "yuklendi"
    assert r.json()["dosya_adi"] == "belge.png"

    # İlk indirme: bayt birebir + içerik türü korunur.
    r = client.get(f"/mobil/{oid}/dosya")
    assert r.status_code == 200
    assert r.content == PNG_STUB
    assert r.headers["content-type"].startswith("image/png")

    # One-shot: ikinci indirme 410 — bellekten silindi.
    r = client.get(f"/mobil/{oid}/dosya")
    assert r.status_code == 410


def test_cifte_yukleme_reddedilir():
    oid = _olustur()["oturum_id"]
    ok = {"file": ("a.png", io.BytesIO(PNG_STUB), "image/png")}
    assert client.post(f"/mobil/{oid}/yukle", files=ok).status_code == 200
    r = client.post(f"/mobil/{oid}/yukle",
                    files={"file": ("b.png", io.BytesIO(PNG_STUB), "image/png")})
    assert r.status_code == 409


def test_bilinmeyen_oturum_404():
    assert client.get("/mobil/yok-boyle-oturum/durum").status_code == 404
    assert client.post("/mobil/yok-boyle-oturum/yukle",
                       files={"file": ("a.png", io.BytesIO(PNG_STUB), "image/png")}).status_code == 404
    assert client.get("/mobil/yok-boyle-oturum/dosya").status_code == 404
    # Telefon sayfası jüri-dostu HTML hata verir (sayfa açılır, mesaj gösterir).
    r = client.get("/mobil/yok-boyle-oturum")
    assert r.status_code == 410
    assert "text/html" in r.headers["content-type"]


def test_buyuk_dosya_413():
    oid = _olustur()["oturum_id"]
    buyuk = io.BytesIO(b"0" * (mobil_mod.MAX_UPLOAD_BYTES + 1))
    r = client.post(f"/mobil/{oid}/yukle", files={"file": ("kocaman.png", buyuk, "image/png")})
    assert r.status_code == 413


def test_izinsiz_uzanti_415():
    oid = _olustur()["oturum_id"]
    r = client.post(f"/mobil/{oid}/yukle",
                    files={"file": ("zararli.exe", io.BytesIO(b"MZ"), "application/octet-stream")})
    assert r.status_code == 415


def test_ttl_dolan_oturum_silinir(monkeypatch):
    oid = _olustur()["oturum_id"]
    # Zamanı TTL ötesine sar → her erişimde çalışan purge oturumu düşürmeli.
    gercek_now = mobil_mod._now()
    monkeypatch.setattr(mobil_mod, "_now", lambda: gercek_now + mobil_mod.OTURUM_TTL_S + 1)
    assert client.get(f"/mobil/{oid}/durum").status_code == 404


def test_aktif_oturum_tavani():
    for _ in range(mobil_mod.MAX_AKTIF_OTURUM):
        _olustur()
    r = client.post("/mobil/oturum")
    assert r.status_code == 429
    # 429 hız sınırından DEĞİL tavandan gelmeli (limiter fixture'da kapalı + mesaj kontrolü).
    assert "tavan" in r.json()["detail"]


def test_yuklemeden_once_dosya_cekmek_409():
    """Denetçi bulgusu: yükleme olmadan /dosya '410 zaten teslim edildi' YALANI dönmemeli."""
    oid = _olustur()["oturum_id"]
    r = client.get(f"/mobil/{oid}/dosya")
    assert r.status_code == 409
    assert "henüz" in r.json()["detail"]


def test_cifte_yukleme_kilit_sonrasi_da_reddedilir():
    """TOCTOU regresyonu: durum kilit içinde 'bekliyor' değilse yükleme 409 almalı
    (ilk kontrol await'lerden önce koşar; bağlayıcı karar kilitteki ikinci kontrol)."""
    oid = _olustur()["oturum_id"]
    # İlk kontrolü atlat: oturumu doğrudan 'yuklendi' işaretle → yalnız kilit-içi yol karar verir.
    mobil_mod._OTURUMLAR[oid].durum = "yuklendi"
    r = client.post(f"/mobil/{oid}/yukle",
                    files={"file": ("a.png", io.BytesIO(PNG_STUB), "image/png")})
    assert r.status_code == 409


def test_content_length_kapisi_parse_oncesi_karar_verir(monkeypatch):
    """DoS kapısı GÖVDE AYRIŞTIRILMADAN çalışmalı. Kanıt: sınır üstü + İZİNSİZ uzantılı
    istek 413 döner (415 değil) → boyut kararı, uzantıyı görecek form parse'ından ÖNCE."""
    monkeypatch.setattr(mobil_mod, "MAX_UPLOAD_BYTES", 1024)
    monkeypatch.setattr(mobil_mod, "MULTIPART_ZARF_PAYI", 0)
    oid = _olustur()["oturum_id"]
    r = client.post(f"/mobil/{oid}/yukle",
                    files={"file": ("zararli.exe", io.BytesIO(b"0" * 8192), "application/octet-stream")})
    assert r.status_code == 413  # 415 olsaydı: parse önce koşmuş demekti
