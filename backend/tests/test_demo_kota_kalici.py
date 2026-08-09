"""Kotanın RESTART ve ÇIKIŞ/GİRİŞ karşısında ayakta kalması.

Bu dosya iki ölçülmüş açığı kilitler (9 Ağu 2026, canlı sitede bildirildi):

  A. RESTART AÇIĞI — sayaç süreç-içi sözlükteydi. Render ücretsiz katmanı 15 dk
     hareketsizlikte uyur; taze süreç boş sözlükle uyanır ve "günde 3" fiilen
     "uyanış başına 3" olur. Testler yeni bir SÜREÇ simüle etmek için belleği
     tamamen temizler (`kotayi_sifirla`) ve kalıcı sayacın kararı koruduğunu ölçer.

  B. ÇIKIŞ/GİRİŞ AÇIĞI — kimlik yalnız çerezdeydi. Çerezi silmek (ya da başka
     tarayıcı açmak) taze hak veriyordu. Hesap ekseni bunu kapatır; ters yönde de
     ölçülür: çıkış yapmak da taze hak vermez, çünkü tarayıcı ekseni ayrıca sayar.

Sahte DB: gerçek Postgres yerine sözlük destekli bir sahte oturum. Amaç SQL'i değil
KARAR MANTIĞINI ölçmek — SQL'in kendisi `sayaclari_artir`'ın tek transaction'ında ve
`test_demo_kota_kalici_sql.py` gerektirmeyecek kadar dar. Fail-open yolu (DB düştü)
ayrıca ölçülür, çünkü sessizce fail-closed olmak demoyu tamamen öldürürdü.
"""

from __future__ import annotations

import pytest

import core.demo_kota as kota
import core.demo_kota_kalici as kalici
import core.gun_indeksi as gi

AG = "ag:203.0.113.0/24"

# conftest'in autouse fixture'ı katmanı kapatmak için `_kalici_yapilandirildi`'yi yamalar.
# Gerçek fonksiyonu MODÜL İMPORTUNDA yakalarız — yama test başına kurulur, buraya erişmez.
_GERCEK_YAPILANDIRILDI = kalici._kalici_yapilandirildi


class SahteDB:
    """(gun, anahtar) -> sayac sözlüğü; `sayaclari_oku/artir` yerine geçer."""

    def __init__(self) -> None:
        self.satir: dict[tuple[int, str], int] = {}
        self.dustu = False          # True → DB erişilemiyor (fail-open yolu)
        self.okuma = 0

    async def oku(self, gun: int, anahtarlar: tuple[str, ...]) -> dict[str, int] | None:
        if self.dustu:
            return None
        self.okuma += 1
        return {a: self.satir.get((gun, a), 0) for a in anahtarlar}

    async def dus(self, gun: int, istekler: tuple[tuple[str, int], ...]):
        if self.dustu:
            return None
        sayaclar = {a: self.satir.get((gun, a), 0) for a, _ in istekler}
        dolu = tuple(a for a, t in istekler if t <= 0 or sayaclar[a] >= t)
        if dolu:
            return kalici.DusSonucu(sayaclar, dolu)     # hep ya hiç: hiçbiri artmaz
        for anahtar, _t in istekler:
            self.satir[(gun, anahtar)] = self.satir.get((gun, anahtar), 0) + 1
            sayaclar[anahtar] = self.satir[(gun, anahtar)]
        return kalici.DusSonucu(sayaclar, ())


@pytest.fixture
def db(monkeypatch):
    sahte = SahteDB()
    monkeypatch.setattr(kalici, "sayaclari_oku", sahte.oku)
    monkeypatch.setattr(kalici, "dus", sahte.dus)
    monkeypatch.setattr(kalici, "kullanilabilir", lambda: True)
    return sahte


@pytest.fixture(autouse=True)
def _temiz(monkeypatch):
    kota.kotayi_sifirla()
    kalici.devreyi_sifirla()
    gi.sifirla_test_icin()
    monkeypatch.setattr(gi, "_simdi", lambda: 6000 * 86_400.0 + 1.0)
    monkeypatch.delenv("DEMO_KOTA_BELGE_GUN", raising=False)
    monkeypatch.delenv("DEMO_KOTA_AG_GUN", raising=False)
    yield
    kota.kotayi_sifirla()
    kalici.devreyi_sifirla()
    gi.sifirla_test_icin()


def _yeni_surec() -> None:
    """Render'ın uyanışını simüle et: süreç belleği gitti, DB duruyor."""
    kota.kotayi_sifirla()


class TestRestartAcigi:
    @pytest.mark.asyncio
    async def test_RESTART_hakki_YENILEMEZ(self, db):
        # Arrange — üç hak da kullanıldı
        for _ in range(3):
            assert (await kota.kota_dus_dayanikli("z:ali", AG)).izin is True

        # Act — servis uyudu ve taze süreçle uyandı
        _yeni_surec()

        # Assert — dördüncü belge yine reddedilir (ESKİDEN: izin=True, açık buydu)
        sonuc = await kota.kota_dus_dayanikli("z:ali", AG)
        assert sonuc.izin is False
        assert sonuc.sebep == "ziyaretci"

    @pytest.mark.asyncio
    async def test_restart_sonrasi_KALAN_hak_dogru_gorunur(self, db):
        # Arrange
        await kota.kota_dus_dayanikli("z:ali", AG)
        _yeni_surec()
        # Act
        durum = await kota.kota_bak_dayanikli("z:ali", AG)
        # Assert — sayaç DB'den okunur, taze süreçte 3 değil 2
        assert durum.kalan_ziyaretci == 2

    @pytest.mark.asyncio
    async def test_gun_donunce_hak_yenilenir(self, db, monkeypatch):
        # Arrange
        for _ in range(3):
            await kota.kota_dus_dayanikli("z:ali", AG)
        # Act — ertesi gün (kalıcı satır ayrı güne yazılır)
        monkeypatch.setattr(gi, "_simdi", lambda: 6001 * 86_400.0 + 1.0)
        # Assert
        assert (await kota.kota_dus_dayanikli("z:ali", AG)).izin is True


class TestHesapEkseni:
    @pytest.mark.asyncio
    async def test_CEREZ_silmek_kullanicinin_hakkini_yenilemez(self, db):
        # Arrange — giriş yapmış kullanıcı üç hakkını harcadı
        for i in range(3):
            sonuc = await kota.kota_dus_dayanikli(f"z:tarayici{i}", AG, "k:kullanici-1")
            assert sonuc.izin is True, f"{i}. belge geçmeliydi"
        # Act — çerezi sil / başka tarayıcı aç (ziyaretçi anahtarı bambaşka)
        sonuc = await kota.kota_dus_dayanikli("z:bambaska", AG, "k:kullanici-1")
        # Assert — hesap kovası dolu
        assert sonuc.izin is False
        assert sonuc.sebep == "kullanici"

    @pytest.mark.asyncio
    async def test_CIKIS_yapmak_taze_hak_VERMEZ(self, db):
        # Arrange — kullanıcı aynı tarayıcıda üç hakkını harcadı
        for _ in range(3):
            await kota.kota_dus_dayanikli("z:tarayici", AG, "k:kullanici-1")
        # Act — çıkış yaptı; artık anonim (kullanıcı anahtarı yok) ama ÇEREZ aynı
        sonuc = await kota.kota_dus_dayanikli("z:tarayici", AG)
        # Assert — tarayıcı ekseni de sayıyordu
        assert sonuc.izin is False
        assert sonuc.sebep == "ziyaretci"

    @pytest.mark.asyncio
    async def test_farkli_kullanici_kendi_hakkini_alir(self, db):
        # Arrange
        for _ in range(3):
            await kota.kota_dus_dayanikli("z:t1", AG, "k:kullanici-1")
        # Act + Assert — başka hesap, başka tarayıcı: etkilenmez
        assert (await kota.kota_dus_dayanikli("z:t2", AG, "k:kullanici-2")).izin is True

    @pytest.mark.asyncio
    async def test_hesap_dolunca_TARAYICI_hakki_YANMAZ(self, db):
        """Hesabı dolu kullanıcı çıkış yaparsa tarayıcının kalan hakkı duruyor olmalı."""
        # Arrange — hesap başka tarayıcılarda doldu, BU tarayıcı hiç kullanılmadı
        for i in range(3):
            await kota.kota_dus_dayanikli(f"z:baska{i}", AG, "k:kullanici-1")
        # Act — kullanıcı temiz bir tarayıcıda dener → hesap ekseni reddeder
        red = await kota.kota_dus_dayanikli("z:temiz", AG, "k:kullanici-1")
        assert red.izin is False
        # Assert — reddedilen istek temiz tarayıcının sayacını ARTIRMADI (hep ya hiç)
        assert (await kota.kota_bak_dayanikli("z:temiz", AG)).kalan_ziyaretci == 3

    @pytest.mark.asyncio
    async def test_anonimde_kalan_kullanici_ziyaretciyle_AYNI(self, db):
        """Giriş yapmamışa "0 hakkın var" denmemeli — UI min() alıyor."""
        durum = await kota.kota_bak_dayanikli("z:ali", AG)
        assert durum.kalan_kullanici == durum.kalan_ziyaretci == 3


class TestAgEkseniKorundu:
    @pytest.mark.asyncio
    async def test_cerez_degisince_AG_kotasi_hala_sayar(self, db):
        gecen = 0
        for i in range(30):
            if (await kota.kota_dus_dayanikli(f"z:taze{i}", AG)).izin:
                gecen += 1
        assert gecen == kota.gunluk_ag()

    @pytest.mark.asyncio
    async def test_cerezsiz_istekte_CIFT_sayma_yok(self, db):
        """Çerezsizde ziyaretçi ve ağ anahtarı aynıdır — tek istek iki belge saymamalı."""
        sonuc = await kota.kota_dus_dayanikli(AG, AG)
        assert sonuc.kalan_ziyaretci == 2
        assert sonuc.kalan_ag == kota.gunluk_ag() - 1


class TestDBDustugunde:
    @pytest.mark.asyncio
    async def test_DB_yoksa_BELLEK_yedegi_calisir(self, db):
        # Arrange — DB baştan erişilemez
        db.dustu = True
        # Act
        for _ in range(3):
            assert (await kota.kota_dus_dayanikli("z:ali", AG)).izin is True
        # Assert — koruma bu değişiklikten ÖNCEKİ hâline düşer, kaybolmaz
        assert (await kota.kota_dus_dayanikli("z:ali", AG)).izin is False

    @pytest.mark.asyncio
    async def test_DB_gun_ortasinda_duserse_sayac_SIFIRDAN_baslamaz(self, db):
        # Arrange — iki hak DB üzerinden harcandı
        await kota.kota_dus_dayanikli("z:ali", AG)
        await kota.kota_dus_dayanikli("z:ali", AG)
        # Act — DB düştü; bellek yedeği devralıyor
        db.dustu = True
        # Assert — bellek DB'den eşitlendiği için yalnız 1 hak kaldı, 3 değil
        assert (await kota.kota_dus_dayanikli("z:ali", AG)).izin is True
        assert (await kota.kota_dus_dayanikli("z:ali", AG)).izin is False

    @pytest.mark.asyncio
    async def test_yaris_ARTIRMA_aninda_dolarsa_reddedilir(self, db, monkeypatch):
        """Okuma ile artış arasında başkası tavanı doldurursa istek reddedilmeli."""
        # Arrange — koşullu upsert satır döndürmedi (SQL'deki yarış dalı)
        async def yaris(gun, istekler):
            return kalici.DusSonucu({a: t for a, t in istekler}, (istekler[0][0],))

        monkeypatch.setattr(kalici, "dus", yaris)
        # Act
        sonuc = await kota.kota_dus_dayanikli("z:ali", AG)
        # Assert — fail-closed (yarışta izin vermek kotayı aşardı)
        assert sonuc.izin is False


class TestArizaDevresi:
    def test_ardisik_ariza_devreyi_ACAR(self, monkeypatch):
        # Arrange — katman yapılandırılmış say (conftest varsayılanı kapalı)
        monkeypatch.setattr(kalici, "_kalici_yapilandirildi", lambda: True)
        kalici.devreyi_sifirla()
        assert kalici.kullanilabilir() is True
        # Act — eşik kadar arıza
        for _ in range(kalici._ARIZA_ESIGI):
            kalici._ariza(RuntimeError("bağlantı yok"), "test")
        # Assert — DB artık her istekte denenmez (gecikme ödenmez)
        assert kalici.kullanilabilir() is False

    def test_DATABASE_URL_yoksa_katman_hic_denenmez(self, monkeypatch):
        # Arrange — conftest'in kapatma yamasını sök, GERÇEK env okumasını ölç
        monkeypatch.setattr(kalici, "_kalici_yapilandirildi", _GERCEK_YAPILANDIRILDI)
        monkeypatch.delenv("DATABASE_URL", raising=False)
        kalici.devreyi_sifirla()
        # Assert — yerel/dev koşumda katman hiç denenmez (boşuna bağlantı ödenmez)
        assert kalici.kullanilabilir() is False

    def test_uzun_anahtar_reddedilir(self):
        assert kalici.gecerli_anahtar("z:" + "a" * 200) is False
        assert kalici.gecerli_anahtar("z:normal") is True
