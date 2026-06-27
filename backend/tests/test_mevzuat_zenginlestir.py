"""B2 — mevzuat öneri şeffaflık zenginleştirme (saf, deterministik).

Güven seviyesi (skor/[DOĞRULA]/NLI önceliği), dayanak cümlesi, başlıktan yürürlük parse,
insan-incelemesi bayrağı. SIFIR UYDURMA: yürürlük yalnız başlıkta zaten varsa.
"""
from __future__ import annotations

from api.mevzuat_zenginlestir import zenginlestir_mevzuat


def _state(oneriler, nli=None, konu="imar durumu"):
    return {"mevzuat_onerileri": oneriler, "mevzuat_nli": nli or [],
            "bilgi_unsurlari": {"konu": konu}}


def test_yuksek_guven_skordan():
    out = zenginlestir_mevzuat(_state([{"baslik": "3071 s.K. m.4", "score": 0.82}]))
    assert out[0]["guven"] == "yüksek" and out[0]["inceleme_oner"] is False


def test_dusuk_guven_skordan_inceleme():
    out = zenginlestir_mevzuat(_state([{"baslik": "X", "score": 0.2}]))
    assert out[0]["guven"] == "düşük" and out[0]["inceleme_oner"] is True


def test_dogrula_isareti_orta_ve_inceleme():
    out = zenginlestir_mevzuat(_state([{"baslik": "Y [DOĞRULA: madde no]", "score": 0.9}]))
    # skor yüksek olsa da [DOĞRULA] → orta + insan incelemesi
    assert out[0]["dogrula"] is True
    assert out[0]["guven"] == "orta" and out[0]["inceleme_oner"] is True


def test_nli_destek_yok_en_zayif():
    nli = [{"baslik": "Z", "entailment": False, "skor": 0.2, "etiket": "[DOĞRULA: anlamsal destek zayıf]"}]
    out = zenginlestir_mevzuat(_state([{"baslik": "Z", "score": 0.9}], nli=nli))
    # NLI > skor: anlamsal destek yoksa skor yüksek olsa da düşük + inceleme
    assert out[0]["guven"] == "düşük" and out[0]["inceleme_oner"] is True
    assert out[0]["nli_etiket"].startswith("[DOĞRULA")


def test_dayanak_konudan():
    out = zenginlestir_mevzuat(_state([{"baslik": "A", "score": 0.7}], konu="ruhsat başvurusu"))
    assert "ruhsat başvurusu" in out[0]["dayanak"]


def test_yururluk_basliktan_parse_uydurmaz():
    # başlıkta parantezli sürüm VAR → yüzeye çıkar
    out = zenginlestir_mevzuat(_state([{"baslik": "Resmî Yazışma Yön. (CB 2646/2020)", "score": 0.7}]))
    assert out[0]["yururluk"] == "CB 2646/2020"
    # sürüm YOK → boş (uydurmaz)
    out2 = zenginlestir_mevzuat(_state([{"baslik": "3071 sayılı Kanun m.4", "score": 0.7}]))
    assert out2[0]["yururluk"] == ""
