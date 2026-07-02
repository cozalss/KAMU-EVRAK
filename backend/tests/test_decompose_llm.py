"""decompose LLM yolu testleri — kapalı-küme tur/birim doğrulaması (aynı TEK çağrı).

Sözleşme: LLM segmentle birlikte tur/birim önerir; kapalı-küme (EVRAK_TURLERI/BIRIMLER)
İÇİ değerler kullanılır, DIŞI değerler O SEGMENT için mevcut keyword yoluna düşer
(segment bazında fallback). LLM'siz/bozuk çıktı → heuristik davranış birebir korunur;
compute_decomposition (saf yol) LLM'e hiç dokunmaz. SLA/yazı-türü türetimi deterministik.
"""

from __future__ import annotations

from datetime import date

import agents.nodes.decompose as dec
from agents.nodes.decompose import compute_decomposition, decompose_node

_BUGUN = date(2026, 6, 26)
# test_decompose.py ile aynı kanonik çok-konulu dilekçe (3 ayrı iş) — çoklu sinyal garanti.
_COK_KONULU = (
    "Sokağımızdaki çukurun onarılmasını, ayrıca geçen ay kestiğiniz su faturasının "
    "yanlış olduğunu, bir de oğlumun belediyedeki iş başvurusunun sonucunu öğrenmek istiyorum."
)


def _sahte_llm(payload):
    """llm_json imzasında sahte async LLM — sabit payload döndürür."""

    async def _fake(system, user, **kwargs):
        return payload

    return _fake


async def _patlat(*args, **kwargs):
    raise AssertionError("bu yolda LLM çağrılmamalıydı")


# ---------------------------------------------------------------------------
# Geçerli kapalı-küme değerleri → LLM tur/birim aynen kullanılır
# ---------------------------------------------------------------------------


class TestLlmGecerliKapaliKume:
    """LLM'in kapalı-küme İÇİ tur/birim önerisi keyword yolunu ezer (kanıt: keyword
    başka değer üretirdi)."""

    async def test_gecerli_tur_birim_kullanilir(self, monkeypatch):
        # Arrange — keyword yolu 'çukur onarımı' için talep/ilgili_teknik_daire derdi;
        # LLM kapalı-küme İÇİ farklı değer veriyor → LLM kazanmalı.
        payload = {"talepler": [
            {"metin": "Sokağımızdaki çukurun onarılmasını istiyorum",
             "tur": "sikayet", "birim": "teftis_ic_denetim"},
            {"metin": "Oğlumun iş başvurusunun sonucunu öğrenmek istiyorum",
             "tur": "bilgi_edinme", "birim": "insan_kaynaklari"},
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        out = await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}})
        alt = out["alt_talepler"]
        # Assert
        assert len(alt) == 2
        assert alt[0]["tur"] == "sikayet"
        assert alt[0]["birim"] == "teftis_ic_denetim"
        assert alt[1]["tur"] == "bilgi_edinme"
        assert alt[1]["birim"] == "insan_kaynaklari"

    async def test_sla_ve_yazi_turu_deterministik_turetilir(self, monkeypatch):
        # Arrange — SLA/yazı-türü LLM'den GELMEZ; doğrulanan türden config ile türetilir.
        payload = {"talepler": [
            {"metin": "Sokağımızdaki çukurun onarılmasını istiyorum",
             "tur": "sikayet", "birim": "teftis_ic_denetim"},
            {"metin": "Oğlumun iş başvurusunun sonucunu öğrenmek istiyorum",
             "tur": "bilgi_edinme", "birim": "insan_kaynaklari"},
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert — sikayet → olur yazısı + 3071 30 gün; bilgi_edinme → 4982 15 iş günü
        assert alt[0]["yazi_turu"] == "olur"
        assert "30 gün" in alt[0]["cevap_suresi"]
        assert "15 iş günü" in alt[1]["cevap_suresi"]
        assert alt[0]["tur_tr"] == "Şikâyet"

    async def test_llm_yolunda_anahtarlar_sabit(self, monkeypatch):
        # Arrange — frontend/AltTalepSchema sözleşmesi LLM yolunda da aynı kalmalı
        payload = {"talepler": [
            {"metin": "Sokağımızdaki çukurun onarılmasını istiyorum",
             "tur": "talep", "birim": "ilgili_teknik_daire"},
            {"metin": "Su faturasının düzeltilmesini istiyorum",
             "tur": "sikayet", "birim": "mali_strateji_sgb"},
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert
        beklenen = {"ozet", "tur", "tur_tr", "birim", "birim_tr",
                    "yazi_turu", "cevap_suresi", "sla_durum"}
        assert set(alt[0]) == beklenen

    async def test_llm_yolunda_ozet_pii_maskeli(self, monkeypatch):
        # Arrange — LLM metni sahte TCKN taşısa bile özet maskeden geçmeli
        payload = {"talepler": [
            {"metin": "12345678950 numaralı kaydımdaki fatura hatasının düzeltilmesini istiyorum",
             "tur": "sikayet", "birim": "mali_strateji_sgb"},
            {"metin": "Sokağımızdaki çukurun onarılmasını istiyorum",
             "tur": "talep", "birim": "ilgili_teknik_daire"},
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert
        assert all("12345678950" not in a["ozet"] for a in alt)


# ---------------------------------------------------------------------------
# Kapalı-küme DIŞI değer → o segment için keyword fallback (segment bazında)
# ---------------------------------------------------------------------------


class TestLlmKapaliKumeDisi:
    """Tablo dışı tur/birim ASLA kullanılmaz; alan bazında keyword yoluna düşülür."""

    async def test_gecersiz_tur_keyword_fallback_birim_llm_kalir(self, monkeypatch):
        # Arrange — tur uydurma ('imar_dosyasi' kapalı-küme dışı), birim geçerli
        payload = {"talepler": [
            {"metin": "Sokağımızdaki çukurun onarılmasını istiyorum",
             "tur": "imar_dosyasi", "birim": "teftis_ic_denetim"},
            {"metin": "Oğlumun iş başvurusunun sonucunu öğrenmek istiyorum",
             "tur": "bilgi_edinme", "birim": "insan_kaynaklari"},
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert — tur keyword'den ('onar...' → talep); geçerli birim LLM'den kalır
        assert alt[0]["tur"] == "talep"
        assert alt[0]["birim"] == "teftis_ic_denetim"

    async def test_gecersiz_birim_keyword_fallback_tur_llm_kalir(self, monkeypatch):
        # Arrange — birim uydurma, tur geçerli
        payload = {"talepler": [
            {"metin": "Su faturasının yanlış olduğunu düşünüyorum",
             "tur": "sikayet", "birim": "fen_isleri_xyz"},
            {"metin": "Sokağımızdaki çukurun onarılmasını istiyorum",
             "tur": "talep", "birim": "ilgili_teknik_daire"},
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert — birim keyword'den ('su faturas' → mali_strateji_sgb); tur LLM'den
        assert alt[0]["tur"] == "sikayet"
        assert alt[0]["birim"] == "mali_strateji_sgb"

    async def test_ikisi_de_gecersiz_tam_keyword_yolu(self, monkeypatch):
        # Arrange — tur da birim de kapalı-küme dışı → segment tamamen keyword yolunda
        payload = {"talepler": [
            {"metin": "Sokağımızdaki çukurun onarılmasını istiyorum",
             "tur": "XX", "birim": "YY"},
            {"metin": "Oğlumun iş başvurusunun sonucunu öğrenmek istiyorum",
             "tur": "ZZ", "birim": "QQ"},
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert — mevcut _segment_turu/_segment_birim davranışı birebir
        assert alt[0]["tur"] == "talep"
        assert alt[0]["birim"] == "ilgili_teknik_daire"
        assert alt[1]["tur"] == "bilgi_edinme"
        assert alt[1]["birim"] == "insan_kaynaklari"

    async def test_eski_duz_string_semasi_gecerli(self, monkeypatch):
        # Arrange — LLM eski şemayla (düz string listesi) dönerse tur/birim keyword'den
        payload = {"talepler": [
            "Sokağımızdaki çukurun onarılmasını istiyorum",
            "Su faturası yanlış geldi, itiraz ediyorum",
        ]}
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(payload))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert
        assert alt[0]["tur"] == "talep"
        assert alt[0]["birim"] == "ilgili_teknik_daire"
        assert alt[1]["tur"] == "sikayet"
        assert alt[1]["birim"] == "mali_strateji_sgb"


# ---------------------------------------------------------------------------
# LLM'siz / bozuk çıktı → mevcut heuristik davranış birebir
# ---------------------------------------------------------------------------


class TestLlmYokVeyaBozuk:
    """LLM None ya da bozuk çıktı verirse heuristik segmentasyon aynen çalışır."""

    async def test_llm_none_heuristik_uc_talep(self, monkeypatch):
        # Arrange — LLM erişilemez (None) → kanonik metin 3 alt-talebe bölünmeli
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(None))
        # Act
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        # Assert — test_decompose.py'deki deterministik sonuçla aynı
        assert [a["tur"] for a in alt] == ["talep", "sikayet", "bilgi_edinme"]

    async def test_talepler_liste_degil_heuristik(self, monkeypatch):
        # Arrange — bozuk şema: talepler string
        monkeypatch.setattr(dec, "llm_json", _sahte_llm({"talepler": "hepsi tek parça"}))
        # Act / Assert
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        assert len(alt) == 3

    async def test_metinsiz_maddeler_duser_heuristige_gecilir(self, monkeypatch):
        # Arrange — maddelerde 'metin' yok → hepsi elenir → <2 → heuristik
        monkeypatch.setattr(dec, "llm_json", _sahte_llm(
            {"talepler": [{"tur": "talep", "birim": "ilgili_teknik_daire"}]}
        ))
        # Act / Assert
        alt = (await decompose_node({"evrak_text": _COK_KONULU, "bilgi_unsurlari": {}}))["alt_talepler"]
        assert len(alt) == 3

    async def test_tek_konulu_llm_hic_cagrilmaz(self, monkeypatch):
        # Arrange — çoklu sinyal yok → LLM çağrısı YAPILMAMALI (maliyet sözleşmesi)
        monkeypatch.setattr(dec, "llm_json", _patlat)
        # Act
        out = await decompose_node({"evrak_text": "Bilgilerinize arz ederim.",
                                    "bilgi_unsurlari": {}})
        # Assert
        assert out["alt_talepler"] == []

    def test_compute_decomposition_saf_kalir(self, monkeypatch):
        # Arrange — saf/deterministik yol LLM'e asla dokunmaz
        monkeypatch.setattr(dec, "llm_json", _patlat)
        # Act
        alt = compute_decomposition(_COK_KONULU, {"tarih": "01.06.2026"}, _BUGUN)
        # Assert
        assert len(alt) == 3
