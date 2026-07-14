"""process_doc._to_response — API sınırı PII maskeleme testleri (savunma derinliği).

REGRESYON: `bilgilendirme`/`bilgilendirme_yapisal`, aynı fonksiyondaki `ozet`/`verify_notes`
alanlarının aksine hiç maskelenmiyordu — state'te ham TCKN/telefon varsa (ör. bir node'un
kaçırdığı maskeleme adımı) API yanıtına sızabilirdi. bilgilendirme metni zaten state["ozet"]'i
harfiyen içerir (finalize._metin) — bu yüzden en azından bu alan için maskeleme şart.
"""

from __future__ import annotations

from api.routes.process_doc import _to_response


def _state_ham_pii() -> dict:
    return {
        "bilgilendirme": "**Özet:** Başvuran 12345678901 TCKN ile başvurmuştur.",
        "bilgilendirme_yapisal": {
            "ne_oldu": "Başvuran 12345678901 TCKN ile başvurmuştur.",
            "referans": {"gonderen": "", "evrak_turu": "", "birim": "", "dayanak": []},
            "sirada": [], "yapilacak": None, "sure": None, "notlar": [],
            "durum": "hazir", "durum_etiket": "", "surum": 1, "ne_oldu_kaynak": "sablon",
        },
    }


class TestBilgilendirmeMaskeleme:
    def test_bilgilendirme_metni_maskelenir(self):
        resp = _to_response(_state_ham_pii(), {})
        assert "12345678901" not in resp.bilgilendirme

    def test_bilgilendirme_yapisal_ne_oldu_maskelenir(self):
        resp = _to_response(_state_ham_pii(), {})
        assert "12345678901" not in resp.bilgilendirme_yapisal["ne_oldu"]

    def test_ne_oldu_yoksa_yapisal_aynen_kalir(self):
        # Arrange — ne_oldu boş/yok → dict olduğu gibi döner (crash yok)
        state = {"bilgilendirme_yapisal": {"durum": "hazir"}}
        # Act
        resp = _to_response(state, {})
        # Assert
        assert resp.bilgilendirme_yapisal == {"durum": "hazir"}
