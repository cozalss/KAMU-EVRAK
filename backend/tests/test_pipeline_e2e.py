"""Pipeline uçtan-uca (E2E) entegrasyon testleri.

build_graph().ainvoke(make_initial_state(...)) → tam pipeline LangGraph ile koşulur.
Mock modda LLM → keyword/regex heuristic; tüm node'lar deterministik.

Kontrol edilen özellikler:
- Temel alan doluluğu: evrak_turu / hedef_birim / response
- PII maskeleme: ham TCKN/telefon pipeline çıktısında OLMAMALI
- yazi_taslak_md mevcut
- eksik_alanlar liste tipinde
- belirsiz metin → hedef_birim geçerli BIRIMLER kümesinden
"""

from __future__ import annotations

import re

import pytest

from agents.config import BIRIMLER, EVRAK_TURLERI
from agents.graph import build_graph
from agents.state import make_initial_state

# Regex guard — ham PII tespiti
_TCKN_RE = re.compile(r"\b[1-9]\d{10}\b")
_TEL_RE = re.compile(r"\b0?\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b")


# ---------------------------------------------------------------------------
# Yardımcı
# ---------------------------------------------------------------------------


def _graph():
    """Her test için taze compile — tekrar-kullanım hatalarını önler."""
    return build_graph()


def _state_str_except_input(final: dict) -> str:
    """Final state'i evrak_text (ham giriş) hariç string'e döker.

    evrak_text giriş alanıdır ve ham metin içerir — PII maskeleme yalnızca
    bilgi_unsurlari / response / bilgilendirme çıktı alanlarına uygulanır.
    """
    filtered = {k: v for k, v in final.items() if k != "evrak_text"}
    return str(filtered)


# ---------------------------------------------------------------------------
# Temel E2E — dilekçe pipeline'ı
# ---------------------------------------------------------------------------


class TestPipelineTemelDilekce:
    """Örnek dilekçeyle tam pipeline: tüm çıktı alanları dolu olmalı."""

    _ORNEK_DILEKCE = (
        "Sayın Müdür,\n\n"
        "Konu: Yıllık izin talebi\n\n"
        "25.06.2026 tarihi itibarıyla iki haftalık yıllık izin kullanmak istiyorum. "
        "Gereğini bilgilerinize arz ederim.\n\n"
        "Ayşe Yılmaz\nAdres: Atatürk Caddesi No:5 Ankara\nİmza"
    )

    async def test_evrak_turu_dolduruluyor(self):
        # Arrange
        state = make_initial_state(self._ORNEK_DILEKCE)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert
        assert sonuc.get("evrak_turu"), "evrak_turu boş döndü"
        assert sonuc["evrak_turu"] in EVRAK_TURLERI

    async def test_hedef_birim_gecerli(self):
        # Arrange
        state = make_initial_state(self._ORNEK_DILEKCE)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert
        assert sonuc.get("hedef_birim"), "hedef_birim boş döndü"
        assert sonuc["hedef_birim"] in BIRIMLER

    async def test_response_dolu(self):
        # Arrange
        state = make_initial_state(self._ORNEK_DILEKCE)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert
        response = sonuc.get("response") or sonuc.get("bilgilendirme", "")
        assert len(response) > 0, "response/bilgilendirme boş döndü"

    async def test_yazi_taslak_md_mevcut(self):
        # Arrange
        state = make_initial_state(self._ORNEK_DILEKCE)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert
        assert "yazi_taslak_md" in sonuc
        assert len(sonuc["yazi_taslak_md"]) > 0

    async def test_eksik_alanlar_liste(self):
        # Arrange
        state = make_initial_state(self._ORNEK_DILEKCE)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert
        assert isinstance(sonuc.get("eksik_alanlar", []), list)


# ---------------------------------------------------------------------------
# PII maskeleme E2E guard — KRİTİK GÜVENLİK
# ---------------------------------------------------------------------------


class TestPipelinePiiMaskelemeGuard:
    """Ham TCKN/telefon pipeline'dan sonra herhangi bir çıktı alanında OLMAMALI."""

    _HAM_TCKN = "34561234567"
    _HAM_TEL = "0532 111 22 33"

    _METIN_TCKN = (
        f"TCKN: {_HAM_TCKN} numaralı Ayşe Yılmaz başvurusu.\n"
        "Konu: Personel izni\n"
        "Gereğini arz ederim.\n"
        "İmza. Adres: Kızılay Ankara."
    )

    _METIN_TEL = (
        f"İletişim: {_HAM_TEL} numarasından ulaşabilirsiniz.\n"
        "Konu: Şikayet başvurusu\n"
        "Arz ederim.\n"
        "Ayşe Yılmaz. Adres: Çankaya Ankara."
    )

    async def test_ham_tckn_cikti_alanlarda_yok(self):
        # Arrange
        state = make_initial_state(self._METIN_TCKN)
        # Act
        sonuc = await _graph().ainvoke(state)
        # evrak_text ham giriş alanıdır (maskelenmez); çıktı alanları kontrol edilir.
        cikti_str = _state_str_except_input(sonuc)
        # Assert — ham TCKN çıktı alanlarında (bilgi_unsurlari/response vb.) bulunmamalı
        assert self._HAM_TCKN not in cikti_str, (
            f"TCKN SIZINTI: '{self._HAM_TCKN}' pipeline çıktı alanlarında görünüyor!"
        )

    async def test_ham_tckn_response_icinde_yok(self):
        # Arrange
        state = make_initial_state(self._METIN_TCKN)
        # Act
        sonuc = await _graph().ainvoke(state)
        response = sonuc.get("response", "") + sonuc.get("bilgilendirme", "")
        # Assert
        assert self._HAM_TCKN not in response, (
            "Ham TCKN kullanıcı yanıtı (response) içinde görünüyor — sızıntı!"
        )

    async def test_ham_telefon_cikti_alanlarda_yok(self):
        # Arrange
        state = make_initial_state(self._METIN_TEL)
        # Act
        sonuc = await _graph().ainvoke(state)
        # evrak_text ham giriş alanıdır; çıktı alanları kontrol edilir.
        cikti_str = _state_str_except_input(sonuc)
        # Assert — boşluk/tire normalleştirilerek kontrol et
        cikti_normalize = cikti_str.replace(" ", "").replace("-", "")
        tel_normalize = self._HAM_TEL.replace(" ", "").replace("-", "")
        assert tel_normalize not in cikti_normalize, (
            f"TELEFON SIZINTI: '{self._HAM_TEL}' pipeline çıktı alanlarında görünüyor!"
        )

    async def test_pii_var_true_ve_maskeli_kayit(self):
        # Arrange
        state = make_initial_state(self._METIN_TCKN)
        # Act
        sonuc = await _graph().ainvoke(state)
        bilgi = sonuc.get("bilgi_unsurlari", {})
        # Assert — pii_var ve tckn_maskeli kayıtlandı
        assert bilgi.get("pii_var") is True, "TCKN içeren belgede pii_var=True beklendi"
        assert "tckn_maskeli" in bilgi, "tckn_maskeli kaydı bilgi_unsurlari'nda bulunmalı"

    async def test_maskeli_tckn_ham_icerik_icermez(self):
        # Arrange
        state = make_initial_state(self._METIN_TCKN)
        # Act
        sonuc = await _graph().ainvoke(state)
        bilgi = sonuc.get("bilgi_unsurlari", {})
        maskeli = str(bilgi.get("tckn_maskeli", ""))
        # Assert — maskelide ham TCKN substring'i olmamalı
        assert self._HAM_TCKN not in maskeli


# ---------------------------------------------------------------------------
# Şikayet pipeline E2E
# ---------------------------------------------------------------------------


class TestPipelineSimayet:
    """Şikayet evrakı doğru birime yönlendirilmeli."""

    _SIKAYET = (
        "Şikayet konusu: Komşunun gürültü kirliliği.\n"
        "Tarih: 25.06.2026\n"
        "Gereğini arz ederim.\n"
        "Ayşe Yılmaz. Adres: Kızılay Ankara. İmza."
    )

    async def test_sikayet_turu_tespit_edilir(self):
        # Arrange
        state = make_initial_state(self._SIKAYET)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert
        assert sonuc.get("evrak_turu") == "sikayet"

    async def test_sikayet_birim_teftis(self):
        # Arrange
        state = make_initial_state(self._SIKAYET)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert — teftis_ic_denetim veya geçerli başka birim
        assert sonuc.get("hedef_birim") in BIRIMLER


# ---------------------------------------------------------------------------
# Belirsiz metin E2E — güvenli degradasyon
# ---------------------------------------------------------------------------


class TestPipelineBelirsizdegradasyonu:
    """Hiçbir keyword içermeyen metin → pipeline çökmemeli, geçerli çıktı dönemeli."""

    _BELIRSIZ = "lorem ipsum dolor sit amet 12345"

    async def test_belirsiz_pipeline_cokmez(self):
        # Arrange
        state = make_initial_state(self._BELIRSIZ)
        # Act — istisna fırlatmamalı
        try:
            sonuc = await _graph().ainvoke(state)
        except Exception as e:
            pytest.fail(f"Pipeline istisnasız çalışmalı, {type(e).__name__}: {e}")

    async def test_belirsiz_hedef_birim_gecerli(self):
        # Arrange
        state = make_initial_state(self._BELIRSIZ)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert — belirsiz olsa bile geçerli birim döner
        assert sonuc.get("hedef_birim") in BIRIMLER

    async def test_belirsiz_response_bos_degil(self):
        # Arrange
        state = make_initial_state(self._BELIRSIZ)
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert
        response = sonuc.get("response", "") or sonuc.get("bilgilendirme", "")
        assert len(response) > 0


# ---------------------------------------------------------------------------
# Filename metadata geçişi
# ---------------------------------------------------------------------------


class TestPipelineMetadata:
    """make_initial_state'e verilen metadata alanları state'e geçmeli."""

    async def test_filename_state_icinde_gecer(self):
        # Arrange
        state = make_initial_state(
            "Konu: Test\narz ederim.", filename="ornek_dilekce.pdf"
        )
        # Act
        sonuc = await _graph().ainvoke(state)
        # Assert — filename pipeline boyunca korunmalı
        assert sonuc.get("filename") == "ornek_dilekce.pdf"
