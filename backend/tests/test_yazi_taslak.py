"""yazi_taslak node birim testleri — resmî yazı taslak üretimi.

Mock modda render altyapısı (yazi.renderer) import edilemez → _fallback_taslak() çağrılır.
Tüm testler deterministik: ağ/GPU/jinja2/reportlab bağımlılığı yok.

Kontrol edilen özellikler:
- yazi_turu doğru şekilde belirlenir (EVRAK_TO_YAZI config'den)
- yazi_taslak_md alanı T.C., Sayı, Konu, İlgi/metin ve imza blokları içerir
- Eksik unsur alanları jüri demosunda {{ }} placeholder olarak görünmez
- format_uyumlu bool döner (fallback → True)
"""

from __future__ import annotations

import pytest

from agents.config import EVRAK_TO_YAZI, EVRAK_TURLERI, YAZI_TURLERI
from agents.nodes.yazi_taslak import (
    _devir_taslagi,
    _devir_var_mi,
    _fallback_taslak,
    yazi_taslak_node,
)
from yazi.yazi_render import devir_govdesi

# ---------------------------------------------------------------------------
# M6 — EVRAK_TO_YAZI TÜM türleri AÇIKÇA eşler (sessiz cevabi_yazi default'u yok)
# ---------------------------------------------------------------------------


class TestEvrakToYaziKapsam:
    """Her evrak türü resmî yazı türüne açıkça eşlenmeli (M6 boşluk kapatma)."""

    def test_tum_turler_aciklca_eslenir(self):
        # Arrange / Act
        eksik = [t for t in EVRAK_TURLERI if t not in EVRAK_TO_YAZI]
        # Assert — fatura/tutanak/rapor/dava/icra... sessizce default'a düşmemeli
        assert not eksik, f"EVRAK_TO_YAZI'de eksik tür(ler) sessiz default'a düşüyor: {eksik}"

    def test_hedef_yazi_turleri_gecerli(self):
        # Arrange / Act / Assert — her hedef geçerli bir YAZI_TURLERI üyesi olmalı
        gecersiz = {t: y for t, y in EVRAK_TO_YAZI.items() if y not in YAZI_TURLERI}
        assert not gecersiz, f"EVRAK_TO_YAZI geçersiz yazı türüne işaret ediyor: {gecersiz}"

# ---------------------------------------------------------------------------
# _fallback_taslak() birim testleri
# ---------------------------------------------------------------------------


class TestFallbackTaslak:
    """Render motoru yokken güvenli iskelet döner."""

    def test_yazi_turu_aktarilir(self):
        # Arrange
        yazi_turu = "dilekce_cevabi"
        konu = "İzin talebi"
        # Act
        sonuc = _fallback_taslak(yazi_turu, konu)
        # Assert
        assert sonuc["yazi_turu"] == yazi_turu

    def test_taslak_t_c_icerir(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("ust_yazi", "Test konusu")
        # Assert
        assert "T.C." in sonuc["yazi_taslak_md"]

    def test_taslak_konu_satirini_icerir(self):
        # Arrange
        konu = "Personel izin başvurusu"
        # Act
        sonuc = _fallback_taslak("cevabi_yazi", konu)
        # Assert — konu metnin içinde geçmeli
        assert konu in sonuc["yazi_taslak_md"] or "Konu" in sonuc["yazi_taslak_md"]

    def test_konu_bos_ise_demo_guvenli_konu(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("ust_yazi", "")
        # Assert — boş konu → nötr konu, Jinja placeholder yok
        assert "Başvuru değerlendirmesi" in sonuc["yazi_taslak_md"]
        assert "{{" not in sonuc["yazi_taslak_md"]

    def test_format_uyumlu_true(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("ust_yazi", "Test")
        # Assert — fallback yapısal olarak tam ve demo-güvenli
        assert sonuc["format_uyumlu"] is True

    def test_gövde_ve_imza_var_placeholder_yok(self):
        # Arrange
        # Act
        sonuc = _fallback_taslak("cevabi_yazi", "")
        # Assert — metin gövdesi ve imza bloğu boş bırakılmamalı
        taslak = sonuc["yazi_taslak_md"]
        assert "Başvurunuz" in taslak
        assert "Yetkili İmza" in taslak
        assert "{{" not in taslak


# ---------------------------------------------------------------------------
# yazi_taslak_node() birim testleri — EVRAK_TO_YAZI eşlemesi
# ---------------------------------------------------------------------------


class TestYaziTuruEslesmesi:
    """EVRAK_TO_YAZI config'den doğru yazi_turu seçilmeli."""

    async def test_dilekce_yazi_turu_eslesmesi(self):
        # Arrange
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"konu": "İzin talebi"},
            "evrak_text": "arz ederim",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        beklenen = EVRAK_TO_YAZI.get("dilekce", "cevabi_yazi")
        assert sonuc["yazi_turu"] == beklenen

    async def test_sikayet_yazi_turu_eslesmesi(self):
        # Arrange
        state = {
            "evrak_turu": "sikayet",
            "bilgi_unsurlari": {},
            "evrak_text": "şikayet",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        beklenen = EVRAK_TO_YAZI.get("sikayet", "cevabi_yazi")
        assert sonuc["yazi_turu"] == beklenen

    async def test_ust_yazi_yazi_turu_eslesmesi(self):
        # Arrange
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {"konu": "Resmi bilgilendirme"},
            "evrak_text": "T.C. Sayı:",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        beklenen = EVRAK_TO_YAZI.get("ust_yazi", "ust_yazi")
        assert sonuc["yazi_turu"] == beklenen

    async def test_belirsiz_tur_cevabi_yazi_fallback(self):
        # Arrange: bilinmeyen tür → EVRAK_TO_YAZI.get() None → default "cevabi_yazi"
        state = {
            "evrak_turu": "belirsiz",
            "bilgi_unsurlari": {},
            "evrak_text": "",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert isinstance(sonuc["yazi_turu"], str)
        assert len(sonuc["yazi_turu"]) > 0


# ---------------------------------------------------------------------------
# yazi_taslak_node() — çıktı yapısı + T.C./Konu içerik testleri
# ---------------------------------------------------------------------------


class TestYaziTaslakCiktiYapisi:
    """Çıktı her zaman gerekli anahtarları içermeli."""

    async def test_yazi_taslak_md_mevcut(self):
        # Arrange
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"konu": "Test"},
            "evrak_text": "arz ederim",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "yazi_taslak_md" in sonuc
        assert isinstance(sonuc["yazi_taslak_md"], str)
        assert len(sonuc["yazi_taslak_md"]) > 0

    async def test_yazi_turu_anahtari_mevcut(self):
        # Arrange
        state = {"evrak_turu": "basvuru", "bilgi_unsurlari": {}, "evrak_text": ""}
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "yazi_turu" in sonuc

    async def test_format_uyumlu_bool(self):
        # Arrange
        state = {"evrak_turu": "sikayet", "bilgi_unsurlari": {}, "evrak_text": ""}
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "format_uyumlu" in sonuc
        assert isinstance(sonuc["format_uyumlu"], bool)

    async def test_taslak_t_c_icerir(self):
        # Arrange: fallback taslak T.C. ile başlar
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {},
            "evrak_text": "arz ederim",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "T.C." in sonuc["yazi_taslak_md"]

    async def test_taslak_konu_basligi_icerir(self):
        # Arrange
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {"konu": "Personel izni"},
            "evrak_text": "T.C. Sayı:",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert — taslakta "Konu" etiketi veya "Konu :" olmalı
        assert "Konu" in sonuc["yazi_taslak_md"] or "KONU" in sonuc["yazi_taslak_md"]


# ---------------------------------------------------------------------------
# Eksik alan → demo-güvenli taslak testleri
# ---------------------------------------------------------------------------


class TestYaziTaslakDemoSafeDefaults:
    """Eksik unsur alanları {{ }} placeholder olarak görünmemeli."""

    async def test_bos_bilgi_unsurlari_placeholder_icermez(self):
        # Arrange: hiç bilgi unsuru yok → fallback iskelet
        state = {
            "evrak_turu": "ust_yazi",
            "bilgi_unsurlari": {},
            "evrak_text": "",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert — jüri demosunda Jinja placeholder görünmemeli
        assert "{{" not in sonuc["yazi_taslak_md"]
        assert "Sayı :" in sonuc["yazi_taslak_md"]
        assert "Yetkili İmza" in sonuc["yazi_taslak_md"]

    async def test_konu_eksik_demo_guvenli_konu_var(self):
        # Arrange: konu bilgi_unsurlari'nda yok
        state = {
            "evrak_turu": "cevabi_yazi",
            "bilgi_unsurlari": {"imza": True},  # konu yok
            "evrak_text": "",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        taslak = sonuc["yazi_taslak_md"]
        # Assert — konu olmadığında nötr konu satırı olmalı, placeholder olmamalı
        assert "Konu :" in taslak
        assert "Başvuru değerlendirmesi" in taslak
        assert "{{" not in taslak

    async def test_evrak_turu_yok_state_cokmuyor(self):
        # Arrange: evrak_turu state'de hiç yok → KeyError olmamalı
        state = {
            "bilgi_unsurlari": {},
            "evrak_text": "test",
        }
        # Act — istisna fırlatmamalı
        try:
            sonuc = await yazi_taslak_node(state)
            assert "yazi_turu" in sonuc
        except KeyError as e:
            pytest.fail(f"KeyError fırlatıldı: {e} — state eksik alana toleranslı olmalı")


# ---------------------------------------------------------------------------
# ust_yazi muhatabı: hedef BİRİM olmalı, gelen belgenin göndereni DEĞİL
# ---------------------------------------------------------------------------


class TestUstYaziMuhatapBirim:
    """tutanak/rapor → ust_yazi: muhatap route_birim'in bulduğu hedef birim olmalı."""

    async def test_hedef_birim_varsa_muhatap_birim_olur(self):
        # Arrange — route_birim zaten çalışmış (hedef_birim state'te var)
        state = {
            "evrak_turu": "rapor", "hedef_birim": "teftis_ic_denetim",
            "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "denetim raporu"},
            "evrak_text": "rapor metni",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert — kurum-içi birime yazılır, gönderen kişiye değil
        assert sonuc["yazi_turu"] == "ust_yazi"
        assert "Ayşe Yılmaz" not in sonuc["yazi_taslak_md"]

    async def test_hedef_birim_yoksa_eski_davranis(self):
        # Arrange — route_birim henüz çalışmamış (izole node testi) → geriye uyum
        state = {
            "evrak_turu": "rapor",
            "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz"},
            "evrak_text": "rapor metni",
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert — hedef_birim yok → eski _muhatap(gonderen) davranışı korunur
        assert "Sayın Ayşe Yılmaz" in sonuc["yazi_taslak_md"]


# ---------------------------------------------------------------------------
# Çok-konulu evrak: her alt-talep kendi biriminin üst yazı taslağını alır
# ---------------------------------------------------------------------------


class TestCokKonuluAltTaslaklar:
    """alt_talepler >= 2 → her biri kendi birimine giden ayrı taslak taşımalı."""

    async def test_iki_alt_talep_ayri_taslak_alir(self):
        # Arrange — Ayşe Yılmaz'ın çukur + su faturası talebi, 2 farklı birim
        state = {
            "evrak_turu": "dilekce",
            "bilgi_unsurlari": {"gonderen": "Ayşe Yılmaz", "konu": "Çeşitli talepler"},
            "evrak_text": "arz ederim",
            "alt_talepler": [
                {"ozet": "çukurun onarılması", "birim_tr": "İlgili Teknik Daire"},
                {"ozet": "su faturası itirazı", "birim_tr": "Strateji Geliştirme / Mali İşler"},
            ],
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert len(sonuc["alt_talepler"]) == 2
        for taslak in sonuc["alt_talepler"]:
            assert taslak["yazi_taslak_md"]
            assert taslak["birim_tr"] in taslak["yazi_taslak_md"]
            assert "Ayşe Yılmaz" not in taslak["yazi_taslak_md"]
        # Tekil (geriye-uyum) alanlar birleşik/vatandaşa-yönelik taslak DEĞİL, ilk birimi taşır.
        assert sonuc["yazi_turu"] == "ust_yazi"
        assert sonuc["yazi_taslak_md"] == sonuc["alt_talepler"][0]["yazi_taslak_md"]
        assert "Ayşe Yılmaz" not in sonuc["yazi_taslak_md"]

    async def test_tek_alt_talep_alani_eklenmez(self):
        # Arrange — < 2 alt-talep → alt_talepler alanı state'e YENİDEN yazılmaz
        state = {
            "evrak_turu": "dilekce", "bilgi_unsurlari": {}, "evrak_text": "",
            "alt_talepler": [{"ozet": "tek talep", "birim_tr": "İlgili Teknik Daire"}],
        }
        # Act
        sonuc = await yazi_taslak_node(state)
        # Assert
        assert "alt_talepler" not in sonuc


# ---------------------------------------------------------------------------
# Yetkisizlik (devir) — evrak muhataba gelmiş ama YETKİLİ kurum farklı → devir yazısı
# (frontend 'devir yazısı gerekli' işaretiyle eylem-tutarlı; 3071 m.8 / 4982 m.7).
# ---------------------------------------------------------------------------


def _devir_state(evrak_turu="dilekce", konu="sokak aydınlatması arızası"):
    return {
        "evrak_turu": evrak_turu,
        "evrak_text": "T.C.\nNİLÜFER BELEDİYE BAŞKANLIĞINA\n\nKonu: Sokak aydınlatması\n"
                      "Sokağımızdaki aydınlatma direği arızalı, gereğini arz ederim.",
        "bilgi_unsurlari": {"konu": konu},
        "muhatap_kurum": {"ad": "Nilüfer Belediye Başkanlığı", "slug": "nilufer-belediyesi",
                          "tur": "belediye"},
        "yetkili_kurum": {"ad": "Uludağ Elektrik Dağıtım A.Ş.",
                          "slug": "uludag-elektrik-dagitim", "tur": "diger"},
        "durum": "kaynak_dogrulandi",
    }


class TestDevirTespiti:
    def test_farkli_slug_devir_sayilir(self):
        assert _devir_var_mi(_devir_state()) is True

    def test_ayni_slug_devir_degil(self):
        st = _devir_state()
        st["yetkili_kurum"] = dict(st["muhatap_kurum"])  # yetkili == muhatap
        assert _devir_var_mi(st) is False

    def test_yetkili_kurum_yoksa_devir_degil(self):
        st = _devir_state()
        st.pop("yetkili_kurum")
        assert _devir_var_mi(st) is False

    def test_bos_slug_devir_degil(self):
        st = _devir_state()
        st["yetkili_kurum"] = {"ad": "X", "slug": ""}
        assert _devir_var_mi(st) is False


class TestDevirGovdesi:
    def test_dayanakli_govde_maddeye_atif_yapar(self):
        govde = devir_govdesi("sokak aydınlatması",
                              "3071 sayılı Dilekçe Hakkının Kullanılmasına Dair Kanunun 8 inci maddesi")
        assert "3071 sayılı" in govde and "8 inci maddesi" in govde
        assert "görev ve yetki alanı dışında" in govde
        assert "başvuru sahibine bilgi verilmesi" in govde  # bildirim yükümlülüğü
        assert "sokak aydınlatması" in govde

    def test_dayanaksiz_govde_madde_UYDURMAZ(self):
        govde = devir_govdesi("bir konu", "")  # tanımsız tür → hüküm yok
        assert "sayılı" not in govde and "madde" not in govde.lower()
        assert "görev ve yetki alanı dışında" in govde  # devir yine yapılır
        assert govde[0].isupper()  # cümle düzgün başlar ("Başvurunun...")

    def test_konusuz_govde_bos_tirnak_basmaz(self):
        govde = devir_govdesi("", "3071 sayılı ... 8 inci maddesi")
        assert '""' not in govde and "''" not in govde


class TestDevirTaslagiNode:
    async def test_devir_ust_yazi_uretir_yetkili_muhatap(self):
        sonuc = await yazi_taslak_node(_devir_state())
        assert sonuc["yazi_turu"] == "ust_yazi"
        assert sonuc.get("devir") is True
        md = sonuc["yazi_taslak_md"]
        # Muhatap = YETKİLİ kurum (üst yazı m.14), büyük harf
        assert "ULUDAĞ ELEKTRİK DAĞITIM" in md
        # Antet İDARE = evrakı ALAN kurum (muhatap) — route_ajan tespiti, KAMU KURUMU değil
        # (antet büyük harfe çevrilir → kasa-duyarsız kontrol)
        assert "NİLÜFER BELEDİYE" in md.upper()
        assert "KAMU KURUMU" not in md
        # 3071 m.8 dayanağı gövdede
        assert "3071 sayılı" in md
        # Placeholder sızmaz
        assert "{{" not in md

    async def test_bilgi_edinme_devir_4982_dayanagi(self):
        sonuc = await yazi_taslak_node(_devir_state(evrak_turu="bilgi_edinme"))
        assert "4982 sayılı" in sonuc["yazi_taslak_md"]
        assert sonuc["devir"] is True

    async def test_tanimsiz_turde_madde_uydurulmaz(self):
        # 'fatura' EVRAK_TO_DEVIR_DAYANAK'ta yok → devir yapılır ama hükme atıf yok
        sonuc = await yazi_taslak_node(_devir_state(evrak_turu="fatura"))
        assert sonuc["devir"] is True
        assert "sayılı" not in sonuc["yazi_taslak_md"]

    async def test_ayni_kurum_devir_dali_calismaz(self):
        # yetkili == muhatap → normal akış (devir bayrağı YOK)
        st = _devir_state()
        st["yetkili_kurum"] = dict(st["muhatap_kurum"])
        sonuc = await yazi_taslak_node(st)
        assert sonuc.get("devir") is not True

    async def test_devir_notu_insan_okunur(self):
        sonuc = await yazi_taslak_node(_devir_state())
        assert "Yetkisizlik" in sonuc["yazi_plan_notu"]
        assert "Uludağ Elektrik" in sonuc["yazi_plan_notu"]
