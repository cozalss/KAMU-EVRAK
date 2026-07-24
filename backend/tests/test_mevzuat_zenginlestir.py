"""B2 — mevzuat öneri şeffaflık zenginleştirme (saf, deterministik).

Güven seviyesi (norm_score bandı / [DOĞRULA] / NLI önceliği), eşleşme gerekçesi, başlıktan
yürürlük parse, insan-incelemesi bayrağı. SIFIR UYDURMA: yürürlük yalnız başlıkta zaten varsa.

Bant kenarları eval/mevzuat_guven_kalibrasyon.py ile ÖLÇÜLDÜ (top-1 AUC 0.964).
"""
from __future__ import annotations

from api.mevzuat_zenginlestir import zenginlestir_mevzuat


def _state(oneriler, nli=None, konu="imar durumu"):
    guvenli_oneriler = [
        {"kaynak_guven": "resmi_dogrulanmis", **oneri}
        for oneri in oneriler
    ]
    return {"mevzuat_onerileri": guvenli_oneriler, "mevzuat_nli": nli or [],
            "bilgi_unsurlari": {"konu": konu}}


class TestKalibreBant:
    """Güven, max-normalize `score`tan DEĞİL mutlak `norm_score`tan gelir.

    Regresyon: `score` liderin kendine bölünmesiyle üretilir → top-1 daima 1.0 → çip
    retrieval kalitesinden bağımsız olarak daima "yüksek güven" yazıyordu (gerçek top-1
    isabeti 0.60). Aşağıdaki testler bu bağı kalıcı olarak koparır.
    """

    def test_top1_score_1_0_olsa_da_zayif_norm_dusuk_guven(self):
        # ESKİ DAVRANIŞ: score=1.0 → "yüksek". Ölçüm: norm<1.20 bandında isabet 0.058.
        out = zenginlestir_mevzuat(_state([{"baslik": "X m.1", "score": 1.0, "norm_score": 0.9}]))
        assert out[0]["guven"] == "düşük"
        assert out[0]["inceleme_oner"] is True

    def test_yuksek_bant_olculen_isabeti_tasir(self):
        out = zenginlestir_mevzuat(_state([{"baslik": "X m.1", "score": 1.0, "norm_score": 1.62}]))
        assert out[0]["guven"] == "yüksek" and out[0]["inceleme_oner"] is False
        assert out[0]["guven_isabet"] == 0.971   # tooltip'te gösterilen KANIT

    def test_orta_bant_kenarlari(self):
        orta = zenginlestir_mevzuat(_state([{"baslik": "X", "score": 1.0, "norm_score": 1.25}]))
        assert orta[0]["guven"] == "orta" and orta[0]["guven_isabet"] == 0.562
        # kenar tam üstü → yüksek (>= karşılaştırması)
        kenar = zenginlestir_mevzuat(_state([{"baslik": "X", "score": 1.0, "norm_score": 1.40}]))
        assert kenar[0]["guven"] == "yüksek"

    def test_olculen_isabet_yalniz_ilk_oneriye_ilistirilir(self):
        """Altın set ~tek beklenen kanun listeler → 'doğru mu?' yalnız ilk sırada temiz ölçülür.

        0.971'i 3. sıradaki öneriye iliştirmek, düzeltilen hatanın (ölçülmemiş sayıyı
        kesinlikmiş gibi göstermek) tekrarı olurdu. Bant gösterilir, oran gösterilmez.
        """
        out = zenginlestir_mevzuat(_state([
            {"baslik": "A m.1", "score": 1.0, "norm_score": 2.39},
            {"baslik": "B m.2", "score": 0.96, "norm_score": 2.28},
        ]))
        assert out[0]["guven"] == out[1]["guven"] == "yüksek"   # bant ikisinde de geçerli
        assert out[0]["guven_isabet"] == 0.971                  # ölçüm ilk sırada
        assert out[1]["guven_isabet"] is None                   # ikinci sırada İDDİA YOK

    def test_norm_score_yoksa_statik_skora_duser(self):
        """config fallback (retrieval yok) → eski skor eşikleri; ölçülen isabet İDDİA EDİLMEZ."""
        out = zenginlestir_mevzuat(_state([{"baslik": "3071 s.K. m.4", "score": 0.5}]))
        assert out[0]["guven"] == "orta"
        assert out[0]["guven_isabet"] is None


def test_yuksek_guven_statik_skordan():
    out = zenginlestir_mevzuat(_state([{"baslik": "3071 s.K. m.4", "score": 0.82}]))
    assert out[0]["guven"] == "yüksek" and out[0]["inceleme_oner"] is False


def test_dogrulanmamis_kaynak_yuksek_bandi_orta_ve_incelemeye_cevirir():
    out = zenginlestir_mevzuat(_state([{
        "baslik": "3071 s.K. m.4",
        "score": 1.0,
        "norm_score": 2.0,
        "kaynak_guven": "aday",
    }]))

    assert out[0]["guven"] == "orta"
    assert out[0]["guven_isabet"] is None
    assert out[0]["inceleme_oner"] is True
    assert out[0]["kaynak_dogrulanmis"] is False


def test_dusuk_guven_skordan_inceleme():
    out = zenginlestir_mevzuat(_state([{"baslik": "X", "score": 0.2}]))
    assert out[0]["guven"] == "düşük" and out[0]["inceleme_oner"] is True


def test_dogrula_isareti_orta_ve_inceleme():
    out = zenginlestir_mevzuat(_state([{"baslik": "Y [DOĞRULA: madde no]", "score": 0.9}]))
    # skor yüksek olsa da [DOĞRULA] → orta + insan incelemesi
    assert out[0]["dogrula"] is True
    assert out[0]["guven"] == "orta" and out[0]["inceleme_oner"] is True


def test_dogrula_yuksek_bandi_da_kelepceler():
    """[DOĞRULA] işaretli öneri, norm_score ne olursa olsun 'yüksek güven' olamaz."""
    out = zenginlestir_mevzuat(
        _state([{"baslik": "Y [DOĞRULA: madde no]", "score": 1.0, "norm_score": 2.4}])
    )
    assert out[0]["guven"] == "orta" and out[0]["inceleme_oner"] is True
    assert out[0]["guven_isabet"] is None   # bant artık bu öneriyi tarif etmiyor


def test_nli_destek_yok_en_zayif():
    nli = [{"baslik": "Z", "entailment": False, "skor": 0.2, "etiket": "[DOĞRULA: anlamsal destek zayıf]"}]
    out = zenginlestir_mevzuat(_state([{"baslik": "Z", "score": 0.9, "norm_score": 2.0}], nli=nli))
    # NLI > bant: anlamsal destek yoksa norm_score yüksek olsa da düşük + inceleme
    assert out[0]["guven"] == "düşük" and out[0]["inceleme_oner"] is True
    assert out[0]["guven_isabet"] is None
    assert out[0]["nli_etiket"].startswith("[DOĞRULA")


def test_eslesme_gerekcesi_konudan_ve_hukuki_dayanak_iddia_etmez():
    out = zenginlestir_mevzuat(_state([{"baslik": "A", "score": 0.7}], konu="ruhsat başvurusu"))
    gerekce = out[0]["eslesme_gerekcesi"]
    assert "ruhsat başvurusu" in gerekce
    assert "arandı" in gerekce          # "hangi sorgudan geldi" — mesnet iddiası değil
    assert "dayanak" not in out[0]      # eski yanıltıcı alan adı kaldırıldı


def test_konu_yoksa_gerekce_evrak_icerigi():
    out = zenginlestir_mevzuat(_state([{"baslik": "A", "score": 0.7}], konu=""))
    assert out[0]["eslesme_gerekcesi"] == "evrak içeriğinden arandı"


def test_kaynak_dosya_ve_madde_no_dogrulama_bagi_tasinir():
    """Öneri satırından mevzuat metnine atlayabilmek için kaynak bağı korunmalı."""
    out = zenginlestir_mevzuat(_state([{
        "baslik": "2004 icra iflas kanunu m.60", "score": 1.0, "norm_score": 1.7,
        "kaynak_dosya": "2004_icra_iflas_kanunu", "madde_no": 60,
    }]))
    assert out[0]["kaynak_dosya"] == "2004_icra_iflas_kanunu"
    assert out[0]["madde_no"] == "60"     # şema str bekler (int gelse de normalize edilir)


def test_kaynak_bagi_yoksa_bos_string_none():
    out = zenginlestir_mevzuat(_state([{"baslik": "A", "score": 0.5}]))
    assert out[0]["kaynak_dosya"] == "" and out[0]["madde_no"] is None


def test_yururluk_basliktan_parse_uydurmaz():
    # başlıkta parantezli sürüm VAR → yüzeye çıkar
    out = zenginlestir_mevzuat(_state([{"baslik": "Resmî Yazışma Yön. (CB 2646/2020)", "score": 0.7}]))
    assert out[0]["yururluk"] == "CB 2646/2020"
    # sürüm YOK → boş (uydurmaz)
    out2 = zenginlestir_mevzuat(_state([{"baslik": "3071 sayılı Kanun m.4", "score": 0.7}]))
    assert out2[0]["yururluk"] == ""


class TestCragDuzeltmesiOnceligi:
    """CRAG_ENABLED açıkken hesaplanan mevzuat_onerileri_corrected, MevzuatCard'a giden
    listeye YANSIMALIYDI — regresyon: önceden yalnız ham mevzuat_onerileri okunuyordu,
    CRAG'in düzeltmesi kullanıcıya hiç gösterilmiyordu (yalnız finalize'ın bir cümlelik
    özetinde görünüyordu).
    """

    def test_corrected_liste_varsa_o_kullanilir(self):
        ham = [{"baslik": "Yanlış Kanun m.1", "score": 0.3}]
        duzeltilmis = [{"baslik": "Doğru Kanun m.5", "score": 0.85}]
        state = {"mevzuat_onerileri": ham, "mevzuat_onerileri_corrected": duzeltilmis,
                 "mevzuat_nli": [], "bilgi_unsurlari": {"konu": "test"}}
        out = zenginlestir_mevzuat(state)
        assert [o["baslik"] for o in out] == ["Doğru Kanun m.5"]

    def test_corrected_yoksa_ham_listeye_duser(self):
        out = zenginlestir_mevzuat(_state([{"baslik": "Ham Kanun m.2", "score": 0.7}]))
        assert out[0]["baslik"] == "Ham Kanun m.2"

    def test_corrected_bos_listeyse_ham_listeye_duser(self):
        # CRAG çalıştı ama düzeltme gerekmedi → boş liste; ham korunmalı, [] ile ezilmemeli.
        state = {"mevzuat_onerileri": [{"baslik": "Ham Kanun m.3", "score": 0.7}],
                 "mevzuat_onerileri_corrected": [], "mevzuat_nli": [],
                 "bilgi_unsurlari": {"konu": "test"}}
        out = zenginlestir_mevzuat(state)
        assert out[0]["baslik"] == "Ham Kanun m.3"
