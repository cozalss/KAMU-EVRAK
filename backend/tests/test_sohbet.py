"""Sohbet asistanı testleri — niyet tespiti (fallback) + şablon yanıt + /sohbet route'u.

Birim testler saf fonksiyonları (agents/sohbet_niyet.py) LLM'siz doğrular; route testleri
TestClient + dependency_overrides ile auth/DB'ye dokunmadan HTTP sözleşmesini doğrular.
LLM_MODE=mock (conftest) → tüm akış deterministik. AAA deseni; Türkçe isimler.
Spec: docs/09-sohbet-asistani.md
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from agents.sohbet_niyet import bilgi_yaniti, fallback_niyet, onay_teyit, sablon_yanit
from api.middleware import ratelimit
from auth.deps import get_current_user


# ---------------------------------------------------------------------------
# fallback_niyet — deterministik niyet tespiti + filtre çıkarımı
# ---------------------------------------------------------------------------
class TestFallbackNiyet:
    """Türkçe söylem → doğru intent + parametreler (LLM yok)."""

    @pytest.mark.parametrize("mesaj", ["son gelen evraklar", "bekleyen evrak kuyruğu"])
    def test_gelen_evrak_soylemleri(self, mesaj):
        sonuc = fallback_niyet(mesaj)
        assert sonuc["intent"] == "gelen_evrak"

    @pytest.mark.parametrize("mesaj", ["giden evrakları göster", "gönderilen yazılar neler"])
    def test_giden_evrak_soylemleri(self, mesaj):
        sonuc = fallback_niyet(mesaj)
        assert sonuc["intent"] == "giden_evrak"

    def test_reddedilen_filtresi_durum_parametresine_cevrilir(self):
        sonuc = fallback_niyet("reddedilen giden evrakları göster")
        assert sonuc["intent"] == "giden_evrak"
        assert sonuc["parametreler"]["durum"] == "reddedildi"

    def test_kirmizi_risk_filtresi_cikarilir(self):
        sonuc = fallback_niyet("kırmızı riskli giden evraklar")
        assert sonuc["intent"] == "giden_evrak"
        assert sonuc["parametreler"]["risk"] == "kirmizi"

    def test_son_n_limit_olarak_cikarilir(self):
        sonuc = fallback_niyet("son 5 işlem")
        assert sonuc["intent"] == "islem_gecmisi"
        assert sonuc["parametreler"]["limit"] == 5

    def test_asiri_limit_ust_sinira_kirpilir(self):
        sonuc = fallback_niyet("son 500 gelen evrak")
        assert sonuc["parametreler"]["limit"] <= 20

    def test_taslak_soylemi(self):
        assert fallback_niyet("taslaklarım neler")["intent"] == "taslaklar"

    @pytest.mark.parametrize("mesaj", ["kaç evrak işledik", "genel istatistik ver"])
    def test_panel_ozet_soylemleri(self, mesaj):
        assert fallback_niyet(mesaj)["intent"] == "panel_ozet"

    def test_mevzuat_aramasi_sorguyu_tasir(self):
        sonuc = fallback_niyet("KVKK aydınlatma yükümlülüğü mevzuatı")
        assert sonuc["intent"] == "mevzuat_ara"
        assert "aydınlatma" in sonuc["parametreler"]["q"]

    def test_nedir_sorusu_site_yardimina_gider(self):
        # "gelen evrak" geçse bile soru kipi ("nedir") site yardımı kazanır.
        assert fallback_niyet("risk bandı nedir")["intent"] == "site_yardim"
        assert fallback_niyet("gelen evrak görünümü ne işe yarar")["intent"] == "site_yardim"

    def test_selamlama(self):
        assert fallback_niyet("merhaba")["intent"] == "selamlama"

    def test_eslesmeyen_soylem_genel(self):
        assert fallback_niyet("xqzptv lorem")["intent"] == "genel"


class TestFallbackNiyetV2:
    """V2 niyetleri — katalog / içerik / işlem detayı / denetim / onay aksiyonları."""

    @pytest.mark.parametrize("mesaj", ["hangi mevzuatlar var", "mevzuat listesi", "mevzuat kataloğu"])
    def test_mevzuat_katalog_soylemleri(self, mesaj):
        assert fallback_niyet(mesaj)["intent"] == "mevzuat_katalog"

    def test_sayili_kanun_icerik_niyeti_ve_numarasi(self):
        sonuc = fallback_niyet("3071 sayılı kanunu göster")
        assert sonuc["intent"] == "mevzuat_icerik"
        assert sonuc["parametreler"]["mevzuat_no"] == "3071"

    def test_metnini_oku_icerik_niyeti(self):
        sonuc = fallback_niyet("dilekçe hakkı kanununun tam metnini oku")
        assert sonuc["intent"] == "mevzuat_icerik"
        assert "dilekçe" in sonuc["parametreler"]["q"]

    @pytest.mark.parametrize("mesaj", ["son işlemin detayı", "işlem detayını göster"])
    def test_islem_detay_soylemleri(self, mesaj):
        assert fallback_niyet(mesaj)["intent"] == "islem_detay"

    def test_denetim_dogrula_soylemi(self):
        assert fallback_niyet("son işlemin denetim izini doğrula")["intent"] == "denetim_dogrula"

    @pytest.mark.parametrize("mesaj", [
        "hangi evrakların süresi geçti",
        "geciken işlemler",
        "vadesi yaklaşan evraklar",
        "yasal süresi dolan dilekçeler",
        "cevap süresi dolan evraklar",
    ])
    def test_sla_durum_soylemleri(self, mesaj):
        assert fallback_niyet(mesaj)["intent"] == "sla_durum"

    def test_sla_normal_liste_sorgusunu_calmaz(self):
        # SLA kelimesi içermeyen liste sorgusu SLA'ya kaymamalı (regresyon guard).
        assert fallback_niyet("son gelen evraklar")["intent"] == "gelen_evrak"
        assert fallback_niyet("reddedilen giden evraklar")["intent"] == "giden_evrak"

    @pytest.mark.parametrize("mesaj", [
        "taslağı revize et: kapanışı arz ederim yap",
        "son taslağı düzelt",
        "yazıyı güncelle",
        "taslakta hitabı değiştir",
    ])
    def test_taslak_revize_soylemleri(self, mesaj):
        assert fallback_niyet(mesaj)["intent"] == "taslak_revize"

    def test_duzenlenen_liste_revize_olmaz(self):
        # "düzenlenen taslaklar" liste sorgusu; 'düzelt' emri (farklı kök) değil → taslaklar.
        assert fallback_niyet("düzenlenen taslaklar")["intent"] == "taslaklar"

    @pytest.mark.parametrize("mesaj", [
        "brifing ver", "bugün ne var", "neye bakmalıyım", "önceliğim ne", "dikkat gerektiren işler",
    ])
    def test_brifing_soylemleri(self, mesaj):
        assert fallback_niyet(mesaj)["intent"] == "brifing"

    def test_panel_ozet_brifingden_ayri_kalir(self):
        # "kaç evrak işledik" sayım sorgusu brifing değil, panel_ozet.
        assert fallback_niyet("kaç evrak işledik")["intent"] == "panel_ozet"

    @pytest.mark.parametrize("mesaj", [
        "taslağı kurula sun", "bunu bürokrasi kuruluna sun", "kurul", "müzakereye sun",
    ])
    def test_kurula_sun_soylemleri(self, mesaj):
        assert fallback_niyet(mesaj)["intent"] == "kurula_sun"

    def test_kurulus_kelimesi_kurulu_tetiklemez(self):
        # 'kuruluş' (kurul\b değil) kurula_sun'a kaymamalı; soru → site_yardim.
        assert fallback_niyet("sistemin kuruluşu nasıl")["intent"] != "kurula_sun"


class TestTalimatCikar:
    """Revize talimatı ayıklama — ':' sonrası ya da fiil sonrası (Türkçe-güvenli)."""

    def test_iki_nokta_sonrasi_talimat(self):
        from agents.sohbet_niyet import talimat_cikar
        assert talimat_cikar("taslağı revize et: kapanışı arz ederim yap") == "kapanışı arz ederim yap"

    def test_iki_noktasiz_fiil_sonrasi_talimat(self):
        from agents.sohbet_niyet import talimat_cikar
        assert talimat_cikar("taslağı düzelt hitabı Sayın Valilik yap").startswith("hitabı")

    def test_bos_talimat_kisa_doner(self):
        from agents.sohbet_niyet import talimat_cikar
        assert len(talimat_cikar("taslağı revize et")) < 4

    def test_onayla_aksiyonu(self):
        assert fallback_niyet("son taslağı onayla")["intent"] == "taslak_onayla"

    def test_reddet_aksiyonu(self):
        assert fallback_niyet("bu işlemi reddet")["intent"] == "taslak_reddet"

    def test_reddedilen_listesi_aksiyona_donusmez(self):
        # "reddedilen" (sıfat) liste sorgusudur; "reddet" (emir) aksiyondur — karışmamalı.
        assert fallback_niyet("reddedilen giden evraklar")["intent"] == "giden_evrak"

    def test_onay_teyit_olumlu_ve_olumsuz(self):
        assert onay_teyit("evet") is True
        assert onay_teyit("evet, onayla") is True
        assert onay_teyit("onaylıyorum") is True
        assert onay_teyit("hayır") is False
        assert onay_teyit("vazgeç") is False
        assert onay_teyit("belki sonra") is False


# ---------------------------------------------------------------------------
# sablon_yanit — deterministik yanıt kompozisyonu (LLM fallback'i)
# ---------------------------------------------------------------------------
class TestSablonYanit:
    """Araç sonucu → okunur Türkçe yanıt; kayıt sayısı/başlık içerir."""

    def test_gelen_kayitlar_sayi_ve_baslik_icerir(self):
        kayitlar = [
            {"baslik": "Park aydınlatma dilekçesi", "evrak_no": "E-2026/001",
             "olusturuldu": "2026-07-01T10:00:00"},
            {"baslik": "Bilgi edinme başvurusu", "evrak_no": "E-2026/002",
             "olusturuldu": "2026-07-02T09:00:00"},
        ]
        yanit = sablon_yanit("gelen_evrak", kayitlar)
        assert "2" in yanit
        assert "Park aydınlatma dilekçesi" in yanit

    def test_bos_kayit_bulunamadi_mesaji(self):
        yanit = sablon_yanit("giden_evrak", [])
        assert "bulunamadı" in yanit.lower()

    def test_panel_ozet_sayimlari_icerir(self):
        veri = {"gelen_evrak": 12, "giden_evrak": 7, "islem": 12,
                "taslak": 3, "mevzuat": 233, "risk_dagilimi": {"yesil": 10}}
        yanit = sablon_yanit("panel_ozet", veri)
        assert "12" in yanit
        assert "7" in yanit

    def test_selamlama_yaniti_yol_gosterir(self):
        yanit = sablon_yanit("selamlama", None)
        assert "evrak" in yanit.lower()

    def test_mevzuat_katalog_adet_ve_kategori_icerir(self):
        veri = {"adet": 233, "kategoriler": ["Sağlık", "Yargı & Adalet"],
                "ornekler": [{"baslik": "Dilekçe Hakkı Kanunu", "no": "3071"}]}
        yanit = sablon_yanit("mevzuat_katalog", veri)
        assert "233" in yanit
        assert "Sağlık" in yanit

    def test_islem_detay_ozet_ve_birim_icerir(self):
        veri = {"name": "Park dilekçesi", "evrak_turu": "dilekce", "hedef_birim": "FEN",
                "bant": "yesil", "ozet": "Aydınlatma talebi.", "eksik_alanlar": ["tarih"]}
        yanit = sablon_yanit("islem_detay", veri)
        assert "Park dilekçesi" in yanit
        assert "FEN" in yanit

    def test_islem_detay_risk_ve_birim_gerekcesi_gosterir(self):
        # "Neden KIRMIZI / neden bu birim" gerekçeleri varsa yanıta taşınır.
        veri = {"name": "İcra", "evrak_turu": "icra", "hedef_birim": "HUKUK", "bant": "kirmizi",
                "ozet": "Ödeme emri.", "eksik_alanlar": [],
                "risk_aciklama": "Süreli icra evrakı; gecikme hak kaybı doğurur.",
                "birim_gerekce": "HUKUK — icra takibi (kaynak: teşkilat) [DeepSeek+kaynak]"}
        yanit = sablon_yanit("islem_detay", veri)
        assert "hak kaybı" in yanit
        assert "icra takibi" in yanit

    def test_islem_detay_kanit_seffafligi_gosterir(self):
        # "bu bilgiyi nereden çıkardın" → çıkarılan değerin kaynak metindeki yeri gösterilir.
        veri = {"name": "Dilekçe", "evrak_turu": "dilekce", "hedef_birim": "FEN",
                "bant": "yesil", "ozet": "Talep.", "eksik_alanlar": [],
                "kanitlar": [{"label": "Tarih", "deger": "15 Temmuz 2026"},
                             {"label": "Tutar", "deger": "5.000 TL"}]}
        yanit = sablon_yanit("islem_detay", veri)
        assert "Kanıt (kaynak metinde bulundu)" in yanit
        assert "15 Temmuz 2026" in yanit
        assert "Tutar" in yanit

    def test_sla_durum_listesi_durum_ve_kalan_gun_gosterir(self):
        kayitlar = [
            {"name": "İcra tebligatı", "evrak_turu": "icra", "hedef_birim": "HUKUK",
             "sla_durum": "GECIKMIS", "kalan_gun": -3},
            {"name": "Bilgi başvurusu", "evrak_turu": "bilgi_edinme", "hedef_birim": "YAZI",
             "sla_durum": "KRITIK", "kalan_gun": 1},
        ]
        yanit = sablon_yanit("sla_durum", kayitlar)
        assert "2" in yanit
        assert "süresi geçmiş" in yanit          # GECIKMIS etiketi
        assert "gün gecikme" in yanit             # negatif kalan → gecikme metni
        assert "kalan 1 gün" in yanit             # KRITIK, pozitif kalan

    def test_denetim_dogrula_butunluk_bildirir(self):
        yanit = sablon_yanit("denetim_dogrula", {"butunluk": True, "adim_sayisi": 15})
        assert "bütünlük" in yanit.lower() or "doğrulandı" in yanit.lower()

    def test_brifing_dikkat_gerektirenleri_sayar(self):
        veri = {"sla_kritik": 3, "bekleyen_onay": 5, "kirmizi_taslak": 2, "en_acil": "İcra yazısı"}
        yanit = sablon_yanit("brifing", veri)
        assert "3" in yanit and "2" in yanit and "5" in yanit
        assert "İcra yazısı" in yanit

    def test_brifing_temiz_kuyruk_olumlu_mesaj(self):
        yanit = sablon_yanit("brifing", {"sla_kritik": 0, "bekleyen_onay": 0, "kirmizi_taslak": 0})
        assert "temiz" in yanit.lower() or "dikkat gerektiren bir iş" in yanit.lower()


# ---------------------------------------------------------------------------
# _sla_araci — yasal süre sorgusu (araç filtresi)
# ---------------------------------------------------------------------------
class TestSlaAraci:
    """Yalnız GECIKMIS/KRITIK işlemleri, en acil (en az kalan gün) önce döndürür."""

    async def test_yalniz_kritik_gecikmis_islemler_aciliyet_sirali(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        rows = [
            {"name": "A", "evrak_turu": "dilekce", "hedef_birim": "FEN",
             "result": {"sla_metadata": {"durum": "NORMAL", "kalan_gun": 5}}},
            {"name": "B", "evrak_turu": "icra", "hedef_birim": "HUKUK",
             "result": {"sla_metadata": {"durum": "KRITIK", "kalan_gun": 1}}},
            {"name": "C", "evrak_turu": "sikayet", "hedef_birim": "ZABITA",
             "result": {"sla_metadata": {"durum": "GECIKMIS", "kalan_gun": -4}}},
        ]

        async def _sahte_listele(session, owner_id, limit):
            return rows

        monkeypatch.setattr(sohbet_mod, "islem_listele", _sahte_listele)
        sonuc = await sohbet_mod._sla_araci(session=None, owner_id="u1", limit=5)

        assert [x["name"] for x in sonuc] == ["C", "B"]  # NORMAL elendi; en çok geciken önce
        assert all(x["sla_durum"] in ("GECIKMIS", "KRITIK") for x in sonuc)


class TestIslemDetayKanit:
    """islem_detay aracı kanit_metadata span'larını 'kanitlar' olarak taşır (şeffaflık)."""

    async def test_kanit_spanlari_kanitlara_donusur(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        async def _listele(session, owner_id, limit):
            return [{
                "name": "Dilekçe", "evrak_turu": "dilekce", "hedef_birim": "FEN", "bant": "yesil",
                "result": {
                    "islem_id": "11111111-1111-1111-1111-111111111111",
                    "ozet": "Talep.", "eksik_alanlar": [],
                    "kanit_metadata": {"metin": "…", "spanlar": [
                        {"start": 5, "end": 10, "alan": "tarih", "label": "Tarih", "deger": "15 Temmuz"},
                    ]},
                },
            }]

        monkeypatch.setattr(sohbet_mod, "islem_listele", _listele)
        veri = await sohbet_mod._islem_detay_araci(session=None, owner_id="u1", q="")
        assert veri["kanitlar"] == [{"label": "Tarih", "deger": "15 Temmuz"}]


class TestBrifingAraci:
    """_brifing_araci: SLA kritik + kırmızı taslak + bekleyen onay sayımı (proaktif)."""

    async def test_dikkat_gerektirenleri_dogru_sayar(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        async def _sla(session, owner_id, limit):
            return [{"name": "Geciken A"}, {"name": "Kritik B"}]  # 2 SLA kritik

        async def _listele(session, owner_id, limit):
            return [
                {"name": "T1", "bant": "kirmizi",
                 "result": {"yazi_taslak_md": "x", "onay_durumu": ""}},   # bekleyen + kırmızı
                {"name": "T2", "bant": "yesil",
                 "result": {"yazi_taslak_md": "y", "onay_durumu": ""}},   # bekleyen
                {"name": "T3", "bant": "kirmizi",
                 "result": {"yazi_taslak_md": "z", "onay_durumu": "onaylandi"}},  # karar verilmiş → sayılmaz
            ]

        monkeypatch.setattr(sohbet_mod, "_sla_araci", _sla)
        monkeypatch.setattr(sohbet_mod, "islem_listele", _listele)
        veri = await sohbet_mod._brifing_araci(session=None, owner_id="u1")
        assert veri["sla_kritik"] == 2
        assert veri["bekleyen_onay"] == 2      # T1, T2 (T3 kararlı elendi)
        assert veri["kirmizi_taslak"] == 1     # yalnız T1
        assert veri["en_acil"] == "Geciken A"  # SLA en acil öncelikli


# ---------------------------------------------------------------------------
# _revize_isle — doğal-dil taslak revizyonu (grounded, non-mutating önizleme)
# ---------------------------------------------------------------------------
class TestRevizeIsle:
    """Talimat → revize önizleme; kaynaksız değişikliği reddeder, taslağı KAYDETMEZ."""

    def _istek(self, mesaj):
        from api.routes.sohbet import SohbetIstek
        return SohbetIstek(mesaj=mesaj)

    def _user(self):
        from types import SimpleNamespace
        return SimpleNamespace(id="u1", rol="memur")

    async def test_onizleme_degisiklik_ve_reddi_gosterir(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        async def _hedef(session, owner_id, q=""):
            return {"name": "İcra yazısı", "taslak_md": "Eski metin.", "evrak_ozet": ""}

        async def _uygula(taslak_md, talimat, evrak_ozet):
            return {"metin": "Yeni resmî metin.", "degisiklikler": ["kapanış düzeltildi"],
                    "uygulanamayan": "yeni tarih"}

        monkeypatch.setattr(sohbet_mod, "revize_hedefi_bul", _hedef)
        monkeypatch.setattr(sohbet_mod, "revize_uygula", _uygula)
        yanit = await sohbet_mod._revize_isle(
            self._istek("taslağı revize et: kapanışı düzelt"), self._user(), None)
        assert yanit.intent == "taslak_revize"
        assert "Yeni resmî metin" in yanit.yanit
        assert "kapanış düzeltildi" in yanit.yanit
        assert "Uygulanamayan" in yanit.yanit
        assert "kaydedilmedi" in yanit.yanit.lower()  # non-mutating dürüstlüğü

    async def test_bos_talimat_bilgi_ister(self):
        import api.routes.sohbet as sohbet_mod
        yanit = await sohbet_mod._revize_isle(
            self._istek("taslağı revize et"), self._user(), None)
        assert "neyi nasıl" in yanit.yanit.lower()

    async def test_hedef_taslak_yoksa_uyarir(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        async def _yok(session, owner_id, q=""):
            return None

        monkeypatch.setattr(sohbet_mod, "revize_hedefi_bul", _yok)
        yanit = await sohbet_mod._revize_isle(
            self._istek("taslağı revize et: kapanışı düzelt"), self._user(), None)
        assert "bulamadım" in yanit.yanit.lower()

    async def test_mock_degisiklik_yoksa_durust_uygulanamadi(self, monkeypatch):
        # revize_uygula None (mock/LLM yok) → uydurmaz, "uygulanamadı" der.
        import api.routes.sohbet as sohbet_mod

        async def _hedef(session, owner_id, q=""):
            return {"name": "T", "taslak_md": "Metin.", "evrak_ozet": ""}

        async def _none(taslak_md, talimat, evrak_ozet):
            return None

        monkeypatch.setattr(sohbet_mod, "revize_hedefi_bul", _hedef)
        monkeypatch.setattr(sohbet_mod, "revize_uygula", _none)
        yanit = await sohbet_mod._revize_isle(
            self._istek("taslağı revize et: X yap"), self._user(), None)
        assert "uygulanamadı" in yanit.yanit.lower()


# ---------------------------------------------------------------------------
# _kurul_isle — taslağı AI Bürokrasi Kurulu'na sun (karar + öneriler)
# ---------------------------------------------------------------------------
class TestKurulIsle:
    """Kurul kararını render eder; LLM yoksa dürüst yönlendirir; taslak yoksa uyarır."""

    def _istek(self):
        from api.routes.sohbet import SohbetIstek
        return SohbetIstek(mesaj="taslağı kurula sun")

    def _user(self):
        from types import SimpleNamespace
        return SimpleNamespace(id="u1", rol="memur")

    async def test_karar_ve_onerileri_render_eder(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        async def _hedef(session, owner_id, q=""):
            return {"name": "Park yazısı", "taslak_md": "T.C. ...", "evrak_ozet": ""}

        async def _kurul(taslak_md, evrak_ozet=""):
            return {"karar": "serhli", "oneriler": [{"metin": "kapanış ekle"}, {"metin": "tarih düzelt"}],
                    "uzlasi_degisti": True}

        monkeypatch.setattr(sohbet_mod, "revize_hedefi_bul", _hedef)
        monkeypatch.setattr(sohbet_mod, "kurul_uygula", _kurul)
        yanit = await sohbet_mod._kurul_isle(self._istek(), self._user(), None)
        assert yanit.intent == "kurula_sun"
        assert "Şerhli" in yanit.yanit
        assert "kapanış ekle" in yanit.yanit
        assert "revize önerdi" in yanit.yanit

    async def test_llm_yoksa_durust_yonlendirir(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        async def _hedef(session, owner_id, q=""):
            return {"name": "T", "taslak_md": "x", "evrak_ozet": ""}

        async def _none(taslak_md, evrak_ozet=""):
            return None

        monkeypatch.setattr(sohbet_mod, "revize_hedefi_bul", _hedef)
        monkeypatch.setattr(sohbet_mod, "kurul_uygula", _none)
        yanit = await sohbet_mod._kurul_isle(self._istek(), self._user(), None)
        assert "gerçek LLM" in yanit.yanit and "Kurul" in yanit.yanit

    async def test_taslak_yoksa_uyarir(self, monkeypatch):
        import api.routes.sohbet as sohbet_mod

        async def _yok(session, owner_id, q=""):
            return None

        monkeypatch.setattr(sohbet_mod, "revize_hedefi_bul", _yok)
        yanit = await sohbet_mod._kurul_isle(self._istek(), self._user(), None)
        assert "bulamadım" in yanit.yanit.lower()


# ---------------------------------------------------------------------------
# bilgi_yaniti — site bilgi tabanı (statik, mevzuat uydurmaz)
# ---------------------------------------------------------------------------
class TestBilgiYaniti:
    def test_risk_bandi_aciklamasi(self):
        yanit = bilgi_yaniti("risk bandı nedir")
        assert yanit is not None
        assert "YEŞİL" in yanit or "yeşil" in yanit.lower()

    def test_pipeline_aciklamasi(self):
        yanit = bilgi_yaniti("sistem evrakı nasıl işliyor")
        assert yanit is not None
        assert "sınıflandır" in yanit.lower() or "özet" in yanit.lower()

    def test_bilinmeyen_konu_none(self):
        assert bilgi_yaniti("xqzptv lorem") is None


# ---------------------------------------------------------------------------
# POST /sohbet — HTTP sözleşmesi (auth + şema + fallback kaynağı)
# ---------------------------------------------------------------------------
class _SahteKullanici:
    """CurrentUser yerine geçen minimal nesne (yalnız .id kullanılır)."""

    id = "00000000-0000-0000-0000-000000000001"
    ad_soyad = "Ayşe Yılmaz"
    rol = "memur"
    aktif = True


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def auth_client() -> TestClient:
    """Auth bağımlılığı sahte kullanıcıyla değiştirilmiş istemci (DB'siz)."""
    main.app.dependency_overrides[get_current_user] = lambda: _SahteKullanici()
    # /sohbet artık rate-limitli (20/dk) — suite'te çok çağrı 429'a takılır; limiter'ı
    # bu route sözleşme testleri için kapat (test_mobil.py deseni).
    _eski = getattr(ratelimit._limiter, "enabled", None)
    if ratelimit._limiter is not None:
        ratelimit._limiter.enabled = False
    yield TestClient(main.app)
    if ratelimit._limiter is not None and _eski is not None:
        ratelimit._limiter.enabled = _eski
    main.app.dependency_overrides.pop(get_current_user, None)


class TestSohbetRoute:
    def test_tokensiz_istek_reddedilir(self, client: TestClient):
        resp = client.post("/sohbet", json={"mesaj": "merhaba"})
        assert resp.status_code in (401, 403)

    def test_bos_mesaj_422(self, auth_client: TestClient):
        resp = auth_client.post("/sohbet", json={"mesaj": ""})
        assert resp.status_code == 422

    def test_selamlama_mock_modda_fallback_kaynakli(self, auth_client: TestClient):
        # DB'ye dokunmayan intent (selamlama) → mock modda deterministik yanıt.
        resp = auth_client.post("/sohbet", json={"mesaj": "merhaba"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["intent"] == "selamlama"
        assert body["kaynak"] == "fallback"
        assert body["yanit"]

    def test_site_yardim_bilgi_tabanindan_yanitlar(self, auth_client: TestClient):
        resp = auth_client.post("/sohbet", json={"mesaj": "risk bandı nedir"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["intent"] == "site_yardim"
        assert "risk" in body["yanit"].lower()

    def test_liste_intenti_kayitlari_ve_gorunum_onerisini_dondurur(
        self, auth_client: TestClient, monkeypatch,
    ):
        # Arrange — araç yürütmeyi sahte kayıtlarla değiştir (DB yok).
        from api.routes import sohbet as sohbet_mod

        async def _sahte_arac(session, owner_id, intent, parametreler):
            return [{"baslik": "Park aydınlatma dilekçesi", "evrak_no": "E-2026/001",
                     "olusturuldu": "2026-07-01T10:00:00"}]

        monkeypatch.setattr(sohbet_mod, "araci_calistir", _sahte_arac)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"})
        # Assert — kayıtlar + kart türü + görünüm önerisi
        assert resp.status_code == 200
        body = resp.json()
        assert body["intent"] == "gelen_evrak"
        assert body["kayit_turu"] == "gelen"
        assert body["kayitlar"] and body["kayitlar"][0]["evrak_no"] == "E-2026/001"
        assert body["oneri_gorunum"] == "gelen"
        assert "Park aydınlatma dilekçesi" in body["yanit"]


class TestMevzuatKaynaklari:
    """Sohbet yanıtı mevzuat kaynak çipleri taşır — UI tıklayınca okuma modalı açar.

    Sözleşme: SohbetYanit.mevzuat_kaynaklari = [{dosya, no, baslik, madde_no}] | None.
    dosya katalog anahtarıdır (/mevzuat/icerik/{dosya}); madde_no modalda vurgulanır.
    """

    def _arac(self, monkeypatch, veri):
        from api.routes import sohbet as sohbet_mod

        async def _sahte(session, owner_id, intent, parametreler):
            return veri
        monkeypatch.setattr(sohbet_mod, "araci_calistir", _sahte)

    def test_derin_ara_sekli_kaynaklara_maplenir(self, auth_client: TestClient, monkeypatch):
        # Arrange — dosya-tabanlı derin_ara şekli (dosya alanı hazır)
        self._arac(monkeypatch, [{
            "dosya": "7201_tebligat_kanunu", "no": "7201", "baslik": "Tebligat Kanunu",
            "madde_no": 10, "snippet": "Madde 10 — ...", "skor": 1.0}])
        # Act — fallback niyeti mevzuat_ara'ya düşen mesaj
        body = auth_client.post("/sohbet", json={"mesaj": "tebligat usulü mevzuatını ara"}).json()
        # Assert
        assert body["intent"] == "mevzuat_ara"
        kaynak = body["mevzuat_kaynaklari"][0]
        assert kaynak["dosya"] == "7201_tebligat_kanunu"
        assert kaynak["madde_no"] == 10

    def test_hybrid_sekli_kanun_no_katalog_dosyasina_cevrilir(self, auth_client: TestClient, monkeypatch):
        # Arrange — DB hybrid_ara şekli (kanun_no var, dosya yok)
        self._arac(monkeypatch, [{
            "kanun_no": "3071", "baslik": "Dilekçe Hakkı Kanunu", "madde_no": 4,
            "snippet": "Madde 4 — ...", "skor": 0.9, "yontem": "bm25"}])
        body = auth_client.post("/sohbet", json={"mesaj": "dilekçe şartları mevzuat"}).json()
        kaynak = body["mevzuat_kaynaklari"][0]
        assert kaynak["dosya"] == "3071_dilekce_hakki_kanunu"
        assert kaynak["madde_no"] == 4

    def test_katalogda_olmayan_kanun_no_atlanir(self, auth_client: TestClient, monkeypatch):
        self._arac(monkeypatch, [{"kanun_no": "99999", "baslik": "?", "madde_no": 1, "snippet": "x"}])
        body = auth_client.post("/sohbet", json={"mesaj": "mevzuat 99999 ara"}).json()
        assert body["mevzuat_kaynaklari"] is None

    def test_liste_intentlerinde_kaynak_yok(self, auth_client: TestClient, monkeypatch):
        self._arac(monkeypatch, [{"baslik": "Dilekçe", "evrak_no": "E-1"}])
        body = auth_client.post("/sohbet", json={"mesaj": "son gelen evraklar"}).json()
        assert body["mevzuat_kaynaklari"] is None

    def test_mevzuat_icerik_tek_kaynak_uretir(self, auth_client: TestClient, monkeypatch):
        self._arac(monkeypatch, {
            "dosya": "6698_kvkk", "no": "6698", "baslik": "KVKK", "kunye": "...",
            "madde_sayisi": 8, "kategori": "İdari Usul & Yazışma", "metin_ozet": "..."})
        body = auth_client.post("/sohbet", json={"mesaj": "6698 sayılı kanunun metnini oku"}).json()
        assert body["intent"] == "mevzuat_icerik"
        assert body["mevzuat_kaynaklari"] == [
            {"dosya": "6698_kvkk", "no": "6698", "baslik": "KVKK", "madde_no": None}]

    def test_db_yokken_dosya_tabanli_aramaya_duser(self):
        # Gerçek araci_calistir, session=None ile → hybrid_ara patlar → derin_ara devreye girer.
        import asyncio

        from api.routes.sohbet import araci_calistir

        rows = asyncio.run(araci_calistir(
            None, None, "mevzuat_ara",
            {"q": "dilekçede bulunması zorunlu şartlar imza adres", "limit": 5}))
        assert rows and all("dosya" in r for r in rows)

    def test_stream_meta_kaynaklari_tasir(self, auth_client: TestClient, monkeypatch):
        self._arac(monkeypatch, [{
            "dosya": "7201_tebligat_kanunu", "no": "7201", "baslik": "Tebligat Kanunu",
            "madde_no": 10, "snippet": "…", "skor": 1.0}])
        govde = auth_client.post("/sohbet/stream", json={"mesaj": "tebligat mevzuatı ara"}).text
        assert '"mevzuat_kaynaklari"' in govde
        assert "7201_tebligat_kanunu" in govde


class TestMevzuatSoruYonlendirme:
    """Mevzuat-içerikli soru bilgi tabanında yoksa aramaya gider (kaynaklı cevap)."""

    def test_bilgi_tabaninda_olmayan_kanun_sorusu_aramaya_gider(self):
        assert fallback_niyet("kanunda tebligat süresi nedir")["intent"] == "mevzuat_ara"

    def test_site_kavrami_sorusu_bilgi_tabaninda_kalir(self):
        assert fallback_niyet("risk bandı nedir")["intent"] == "site_yardim"

    def test_mevzuat_kelimeli_site_sorusu_bilgi_tabaninda_kalir(self):
        # bilgi_yaniti("mevzuat...") eşleşir → site_yardim korunur (davranış regresyonu yok).
        assert fallback_niyet("mevzuat görünümü nedir")["intent"] == "site_yardim"


class TestSohbetStream:
    """POST /sohbet/stream — SSE sözleşmesi (meta → delta → done)."""

    def test_stream_selamlama_meta_ve_done_yayar(self, auth_client: TestClient):
        resp = auth_client.post("/sohbet/stream", json={"mesaj": "merhaba"})
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        govde = resp.text
        assert '"event": "meta"' in govde
        assert '"event": "done"' in govde
        assert "selamlama" in govde

    def test_stream_tokensiz_reddedilir(self, client: TestClient):
        resp = client.post("/sohbet/stream", json={"mesaj": "merhaba"})
        assert resp.status_code in (401, 403)


class TestSohbetOnayAkisi:
    """Sohbetten HITL onay/ret — iki adımlı teyit el sıkışması."""

    def test_onay_istegi_teyit_bekletir(self, auth_client: TestClient, monkeypatch):
        # Arrange — onay hedefi çözümlemesini sahte işlemle değiştir (DB yok).
        from api.routes import sohbet as sohbet_mod

        async def _sahte_hedef(session, owner_id):
            return {"islem_id": "11111111-1111-1111-1111-111111111111",
                    "name": "Park dilekçesi", "bant": "yesil"}

        monkeypatch.setattr(sohbet_mod, "onay_hedefi_bul", _sahte_hedef)
        # Act
        resp = auth_client.post("/sohbet", json={"mesaj": "son taslağı onayla"})
        # Assert — eylem HEMEN uygulanmaz; teyit beklenir
        assert resp.status_code == 200
        body = resp.json()
        assert body["intent"] == "taslak_onayla"
        assert body["onay_bekleyen"]["islem_id"] == "11111111-1111-1111-1111-111111111111"
        assert body["onay_bekleyen"]["eylem"] == "onayla"
        assert "onay" in body["yanit"].lower()

    def test_teyit_evet_eylemi_uygular(self, auth_client: TestClient, monkeypatch):
        from api.routes import sohbet as sohbet_mod

        uygulanan = {}

        async def _sahte_uygula(session, kullanici, islem_id, secim):
            uygulanan.update({"islem_id": islem_id, "secim": secim})
            return {"durum": "gonderildi"}

        async def _sahte_islem_detay(session, islem_id, owner_id=None):
            return {"id": str(islem_id)}   # sahiplik bulundu (DB yok)

        monkeypatch.setattr(sohbet_mod, "onayi_uygula", _sahte_uygula)
        monkeypatch.setattr(sohbet_mod, "islem_detay", _sahte_islem_detay)
        baglam = {"eylem": "onayla", "islem_id": "11111111-1111-1111-1111-111111111111",
                  "ad": "Park dilekçesi"}
        # Act — kullanıcı teyit eder
        resp = auth_client.post("/sohbet", json={"mesaj": "evet", "onay_baglam": baglam})
        # Assert — eylem uygulanır, yanıt bildirir
        assert resp.status_code == 200
        body = resp.json()
        assert uygulanan["secim"] == "onayla"
        assert body["onay_bekleyen"] is None
        assert "onayla" in body["yanit"].lower() or "gönder" in body["yanit"].lower()

    def test_teyit_baskasinin_islemini_uygulamaz(self, auth_client: TestClient, monkeypatch):
        """IDOR koruması: islem_detay sahiplik bulamazsa onayi_uygula HİÇ çağrılmaz
        (kayitlar.py'deki REST onay rotasıyla aynı owner_id kontrolü — regresyon testi)."""
        from api.routes import sohbet as sohbet_mod

        async def _patlar(session, kullanici, islem_id, secim):  # çağrılmamalı
            raise AssertionError("başkasının işlemi onaylanmamalı (IDOR)")

        async def _sahiplik_yok(session, islem_id, owner_id=None):
            return None   # başka kullanıcıya ait / bulunamayan işlem

        monkeypatch.setattr(sohbet_mod, "onayi_uygula", _patlar)
        monkeypatch.setattr(sohbet_mod, "islem_detay", _sahiplik_yok)
        baglam = {"eylem": "onayla", "islem_id": "22222222-2222-2222-2222-222222222222",
                  "ad": "Başkasının taslağı"}
        resp = auth_client.post("/sohbet", json={"mesaj": "evet", "onay_baglam": baglam})
        assert resp.status_code == 200
        body = resp.json()
        assert "bulunamadı" in body["yanit"].lower()

    def test_teyit_vazgec_eylemi_uygulamaz(self, auth_client: TestClient, monkeypatch):
        from api.routes import sohbet as sohbet_mod

        async def _patlar(session, kullanici, islem_id, secim):  # çağrılmamalı
            raise AssertionError("vazgeçilen eylem uygulanmamalı")

        monkeypatch.setattr(sohbet_mod, "onayi_uygula", _patlar)
        baglam = {"eylem": "reddet", "islem_id": "11111111-1111-1111-1111-111111111111",
                  "ad": "Park dilekçesi"}
        resp = auth_client.post("/sohbet", json={"mesaj": "vazgeç", "onay_baglam": baglam})
        assert resp.status_code == 200
        body = resp.json()
        assert body["onay_bekleyen"] is None
        assert "vazge" in body["yanit"].lower() or "iptal" in body["yanit"].lower()
