"""Mevzuat katalog paneli API'si — dosya-tabanlı, DB'siz referans endpoint'leri.

Personel tüm mevzuatı listeleyip tam metnini okuyabilmeli (frontend Mevzuat paneli):
  - GET /mevzuat/katalog          → data/mevzuat/*.txt korpusunun tamamı (233 mevzuat)
  - GET /mevzuat/icerik/{dosya}   → tek mevzuatın tam metni (path-traversal korumalı)

Kaynak RAG ile aynı korpus (data/mevzuat); DB/auth GEREKMEZ → mock/demo modda çalışır.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# GET /mevzuat/katalog — korpusun tamamı listelenir
# ---------------------------------------------------------------------------


class TestKatalog:
    def test_katalog_tum_korpusu_listeler(self, client: TestClient):
        # Act
        res = client.get("/mevzuat/katalog")
        body = res.json()
        # Assert — korpus 233 dosya; en az 200 bekle (dosya ekleme/çıkarmaya dayanıklı)
        assert res.status_code == 200
        assert body["adet"] >= 200
        assert body["adet"] == len(body["mevzuatlar"])

    def test_katalog_kaydi_gerekli_alanlari_tasir(self, client: TestClient):
        # Act
        kayit = client.get("/mevzuat/katalog").json()["mevzuatlar"][0]
        # Assert — frontend kartının ihtiyacı: dosya anahtarı + no + başlık + künye + madde sayısı + kategori
        assert set(kayit) >= {"dosya", "no", "baslik", "kunye", "madde_sayisi", "kategori"}
        assert kayit["dosya"] and kayit["baslik"]
        assert isinstance(kayit["madde_sayisi"], int)

    def test_katalog_3071_dilekce_kanunu_dogru_basliklanir(self, client: TestClient):
        # Act
        mevzuatlar = client.get("/mevzuat/katalog").json()["mevzuatlar"]
        kayit = next(m for m in mevzuatlar if m["dosya"] == "3071_dilekce_hakki_kanunu")
        # Assert — başlık dosyanın 1. satırından (Türkçe karakterler tam), no dosya önekinden
        assert kayit["baslik"] == "Dilekçe Hakkının Kullanılmasına Dair Kanun"
        assert kayit["no"] == "3071"
        assert kayit["madde_sayisi"] >= 3


# ---------------------------------------------------------------------------
# Kategori — katalog konu/tema gruplarıyla organize edilir (öğrenme/keşif paneli)
# ---------------------------------------------------------------------------


class TestKategori:
    @pytest.fixture
    def body(self, client: TestClient) -> dict:
        return client.get("/mevzuat/katalog").json()

    def test_her_kayit_kategorilidir(self, body: dict):
        assert all(m.get("kategori") for m in body["mevzuatlar"])

    @pytest.mark.parametrize(("dosya", "kategori"), [
        ("3071_dilekce_hakki_kanunu", "İdari Usul & Yazışma"),
        ("2646_resmi_yazisma_yonetmeligi", "İdari Usul & Yazışma"),
        ("213_vergi_usul_kanunu", "Vergi & Kamu Maliyesi"),
        ("657_devlet_memurlari_kanunu", "Kamu Personeli"),
        ("4857_is_kanunu", "Çalışma, Sosyal Güvenlik & Aile"),
        ("5237_turk_ceza_kanunu_belgede_sahtecilik", "Yargı & Adalet"),
        ("2872_cevre_kanunu", "Çevre, Orman & Su"),
        ("3194_imar_kanunu", "İmar, Şehircilik & Afet"),
        ("1739_milli_egitim_temel_kanunu", "Eğitim, Gençlik & Spor"),
        ("5393_belediye_kanunu", "Kamu Yönetimi & Yerel İdare"),
    ])
    def test_bilinen_eslesmeler_dogru(self, body: dict, dosya: str, kategori: str):
        kayit = next(m for m in body["mevzuatlar"] if m["dosya"] == dosya)
        assert kayit["kategori"] == kategori

    def test_diger_sepeti_kucuk_kalir(self, body: dict):
        # Sınıflandırma korpusu gerçekten örgütlemeli — "Diğer" çöp sepeti olmamalı.
        diger = [m["dosya"] for m in body["mevzuatlar"] if m["kategori"] == "Diğer"]
        assert len(diger) <= 12, f"Diğer'e düşenler: {diger}"

    def test_kategoriler_listesi_sirali_ve_kapsayici(self, body: dict):
        # Yanıt, frontend'in grup sırası için sıralı kategori listesi taşır (dupsuz, tam).
        kategoriler = body["kategoriler"]
        assert len(kategoriler) == len(set(kategoriler))
        assert set(kategoriler) == {m["kategori"] for m in body["mevzuatlar"]}

    def test_numarasiz_yonetmelikte_no_bos(self, body: dict):
        # "atik_yonetimi_yonetmeligi" gibi öneksiz dosyalarda no "atik" DEĞİL boş olmalı.
        kayit = next(m for m in body["mevzuatlar"] if m["dosya"] == "atik_yonetimi_yonetmeligi")
        assert kayit["no"] == ""


# ---------------------------------------------------------------------------
# GET /mevzuat/derin-ara — madde İÇİNDE arama (BM25, seed indeks; modal'a atlanır)
# ---------------------------------------------------------------------------


class TestDerinAra:
    def test_derin_arama_ilgili_maddeyi_bulur(self, client: TestClient):
        # Act — 3071 m.4'ün gövde terimleriyle sor
        res = client.get("/mevzuat/derin-ara", params={"q": "dilekçede bulunması zorunlu şartlar imza ikametgâh adresi"})
        body = res.json()
        # Assert — ilk 5 sonuçta 3071 m.4 var; her sonuç modal açacak alanları taşır
        assert res.status_code == 200
        assert body["adet"] > 0
        ilk5 = body["sonuclar"][:5]
        assert any(s["dosya"] == "3071_dilekce_hakki_kanunu" and s["madde_no"] == 4 for s in ilk5)

    def test_sonuc_alan_sozlesmesi(self, client: TestClient):
        s = client.get("/mevzuat/derin-ara", params={"q": "tebligat usulü"}).json()["sonuclar"][0]
        # madde_tur DAHİL (bug avı 2026-07-17): alan dönmeyince okuma modalı "Ek Madde 5"
        # yerine normal "Madde 5"i vurguluyordu — sözleşmeye sabitlendi.
        assert set(s) >= {"dosya", "no", "baslik", "madde_no", "madde_tur", "snippet", "skor"}
        assert s["snippet"]

    def test_sonuc_dosyalari_katalogda_vardir(self, client: TestClient):
        # Modal /mevzuat/icerik/{dosya} ile açılır → her sonuç dosyası katalogda olmalı.
        katalog = {m["dosya"] for m in client.get("/mevzuat/katalog").json()["mevzuatlar"]}
        sonuclar = client.get("/mevzuat/derin-ara", params={"q": "çevre kirliliği izin", "limit": 20}).json()["sonuclar"]
        assert sonuclar and all(s["dosya"] in katalog for s in sonuclar)

    def test_ayni_madde_tek_kez_gelir(self, client: TestClient):
        # Dedup anahtarı madde_tur DAHİL: "Madde 1" ile "Ek Madde 1" AYRI kayıtlardır
        # (13 kanunda no çakışması; mevzuat_oner._dedup ile aynı kural).
        sonuclar = client.get("/mevzuat/derin-ara", params={"q": "bilgi edinme başvurusu süresi"}).json()["sonuclar"]
        anahtarlar = [(s["dosya"], s["madde_no"], s.get("madde_tur")) for s in sonuclar]
        assert len(anahtarlar) == len(set(anahtarlar))

    def test_bos_ve_anlamsiz_sorgu(self, client: TestClient):
        assert client.get("/mevzuat/derin-ara", params={"q": ""}).status_code == 422
        assert client.get("/mevzuat/derin-ara", params={"q": "zzqqxxyy yokböylekelime"}).json()["adet"] == 0

    def test_limit_siniri(self, client: TestClient):
        assert client.get("/mevzuat/derin-ara", params={"q": "kanun", "limit": 99}).status_code == 422
        body = client.get("/mevzuat/derin-ara", params={"q": "vergi beyanname ödeme", "limit": 3}).json()
        assert len(body["sonuclar"]) <= 3


# ---------------------------------------------------------------------------
# GET /mevzuat/icerik/{dosya} — tek mevzuatın tam metni
# ---------------------------------------------------------------------------


class TestIcerik:
    def test_icerik_tam_metin_doner(self, client: TestClient):
        # Act
        res = client.get("/mevzuat/icerik/3071_dilekce_hakki_kanunu")
        body = res.json()
        # Assert — başlık + künye + tam gövde (madde metinleri dahil)
        assert res.status_code == 200
        assert body["baslik"] == "Dilekçe Hakkının Kullanılmasına Dair Kanun"
        assert "Madde 4" in body["metin"]
        assert "adı-soyadı ve imzası" in body["metin"]  # m.4 gövdesi gerçekten okunuyor

    def test_icerik_bilinmeyen_dosya_404(self, client: TestClient):
        assert client.get("/mevzuat/icerik/9999_olmayan_kanun").status_code == 404

    @pytest.mark.parametrize("dosya", [
        "..",                                   # üst dizin
        "..%2F..%2Fmain",                       # encoded traversal
        "3071_dilekce_hakki_kanunu.txt",        # uzantı enjeksiyonu ('.' beyaz listede yok)
        "index%2Fmevzuat_index",                # alt dizine sızma
        "CON",                                  # Windows aygıt adı (büyük harf reddedilir)
    ])
    def test_icerik_path_traversal_reddedilir(self, client: TestClient, dosya: str):
        # Assert — beyaz liste ([a-z0-9_-]) dışı her şey 404 (bilgi sızdırmadan)
        assert client.get(f"/mevzuat/icerik/{dosya}").status_code == 404
