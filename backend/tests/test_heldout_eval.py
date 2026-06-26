"""heldout_eval harness testleri — metrik doğruluğu + GERÇEK pipeline uçtan-uca.

Sınıflandırma macro-F1 + yönlendirme Top-1/Top-3 mantığı küçük in-memory held-out
set üzerinde GERÇEK pipeline (build_graph) ile doğrulanır. Mock-modda heuristik
fallback koşar (deterministik, ağ/GPU yok). AAA deseni.
"""

from __future__ import annotations

from eval.heldout_eval import evaluate, load_gold


class TestHeldoutEvaluateUctanUca:
    """GERÇEK pipeline küçük held-out set üzerinde sınıf + yönlendirme metriği üretir.

    NOT: evaluate() senkrondur ve içeride asyncio.run() ile pipeline koşar → test
    fonksiyonları SENKRON olmalı (async test içinde asyncio.run çağrılamaz).
    """

    def test_metrikler_aralik_ve_anahtar(self):
        # Arrange — minik held-out: net bir bilgi-edinme + bir cevabi yazı.
        rows = [
            {"id": "t1", "evrak_turu": "bilgi_edinme",
             "metin": "4982 sayılı Bilgi Edinme Hakkı Kanunu kapsamında bilgi talep ederim.",
             "beklenen_birim": "basin_halkla_iliskiler_cimer"},
            {"id": "t2", "evrak_turu": "cevabi_yazi",
             "metin": "T.C. KURUM\nSayı: E-1\nİlgi yazınıza istinaden cevabımız ektedir.",
             "beklenen_birim": "yazi_isleri_evrak"},
        ]
        # Act
        res = evaluate(rows)
        # Assert — metrikler var ve aralıkta
        assert res["n"] == 2
        assert 0.0 <= res["macro_f1"] <= 1.0
        assert 0.0 <= res["accuracy"] <= 1.0
        assert 0.0 <= res["route_top1_acc"] <= 1.0
        assert res["route_top3_acc"] >= res["route_top1_acc"]
        assert len(res["accuracy_ci95"]) == 2
        # Operasyonel metrik (eşdeğer-grup) sıkı metriğin YANINDA raporlanır.
        assert 0.0 <= res["operational_accuracy"] <= 1.0
        assert 0.0 <= res["operational_macro_f1"] <= 1.0
        # Operasyonel doğruluk sıkı doğruluktan ASLA düşük olamaz (gevşek tolerans).
        assert res["operational_accuracy"] >= res["accuracy"]
        assert len(res["operational_accuracy_ci95"]) == 2

    def test_dogru_siniflandirmada_accuracy_yuksek(self):
        # Arrange — keyword'ü açık iki örnek → heuristik doğru bulmalı
        rows = [
            {"id": "a", "evrak_turu": "bilgi_edinme",
             "metin": "4982 sayılı Bilgi Edinme Hakkı Kanunu gereği bilgi edinme talebimdir.",
             "beklenen_birim": "basin_halkla_iliskiler_cimer"},
        ]
        # Act
        res = evaluate(rows)
        # Assert — net keyword → doğru sınıf → accuracy 1.0, top1 1.0
        assert res["accuracy"] == 1.0
        assert res["route_top1_acc"] == 1.0


class TestHeldoutGoldYuklenir:
    """Üretilmiş held-out gold dosyası yüklenir ve şema-uyumludur."""

    def test_gold_dosyasi_yuklenir_ve_kanonik(self):
        # Arrange — gen_heldout.py daha önce koşuldu (data/synthetic/heldout_gold.jsonl)
        from agents.config import EVRAK_TURLERI

        # Act
        rows = load_gold()
        # Assert — boş değil; her satır kanonik etiket + held-out kaynak
        assert len(rows) > 0
        for r in rows:
            assert r["evrak_turu"] in EVRAK_TURLERI
            assert r["evrak_turu"] != "belirsiz"
            assert r.get("kaynak") == "heldout"
            assert r["metin"].strip()
