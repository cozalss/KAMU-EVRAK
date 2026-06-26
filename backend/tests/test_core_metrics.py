"""In-process latans metrik testleri — RollingPercentiles + event tap + Prometheus render.

core/metrics.py saf/deterministik (ağ/thread-yarışı yok burada). Boş pencere None,
yüzdelik hesabı, event tap dispatch, Prometheus text exposition formatı.
reset_all() ile test izolasyonu sağlanır.
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import pytest

from core.metrics import (
    RollingPercentiles,
    record_event,
    record_stream_timings,
    render_prometheus,
    reset_all,
    snapshot_all,
)


@pytest.fixture(autouse=True)
def _reset_metrics():
    """Her test öncesi/sonrası modül-seviyesi registry'yi sıfırla (izolasyon)."""
    reset_all()
    yield
    reset_all()


class TestRollingPercentiles:
    """RollingPercentiles — bounded pencere + yüzdelik snapshot."""

    def test_bos_pencere_none_doner(self):
        # Arrange
        rp = RollingPercentiles()
        # Act
        snap = rp.snapshot()
        # Assert — n=0 → tüm yüzdelikler None
        assert snap["n"] == 0
        assert snap["p50"] is None
        assert snap["max"] is None

    def test_none_degeri_atlanir(self):
        # Arrange
        rp = RollingPercentiles()
        # Act — None kaydı pencereye girmez
        rp.record(None)
        # Assert
        assert rp.snapshot()["n"] == 0

    def test_yuzdelik_hesabi(self):
        # Arrange — 1..100
        rp = RollingPercentiles()
        for v in range(1, 101):
            rp.record(v)
        # Act
        snap = rp.snapshot()
        # Assert
        assert snap["n"] == 100
        assert snap["max"] == 100.0
        assert snap["p50"] == 50.0
        assert snap["p95"] == 95.0
        assert snap["p99"] == 99.0
        assert snap["avg"] == 50.5

    def test_pencere_maxlen_eski_dusurur(self):
        # Arrange — window=3, 5 değer kaydet
        rp = RollingPercentiles(window=3)
        for v in (1, 2, 3, 4, 5):
            rp.record(v)
        # Act
        snap = rp.snapshot()
        # Assert — yalnız son 3 (3,4,5)
        assert snap["n"] == 3
        assert snap["max"] == 5.0

    def test_tek_deger_tum_yuzdelikler_esit(self):
        # Arrange
        rp = RollingPercentiles()
        rp.record(42)
        # Act
        snap = rp.snapshot()
        # Assert
        assert snap["p50"] == snap["p99"] == snap["max"] == 42.0


class TestRecordEvent:
    """record_event — bilinen timing event'lerini registry'ye yazar."""

    def test_llama_call_done_kaydedilir(self):
        # Arrange + Act
        record_event("llama_server_call_done", {"elapsed_ms": 1500})
        # Assert
        snap = snapshot_all()
        assert snap["llm.generation_ms"]["n"] == 1
        assert snap["llm.generation_ms"]["max"] == 1500.0

    def test_speculative_done_cift_metrik(self):
        # Arrange + Act — bir event iki metriğe katkı verir
        record_event("speculative_done", {"total_ms": 800, "hybrid_ms": 200})
        # Assert
        snap = snapshot_all()
        assert snap["retrieval.total_ms"]["n"] == 1
        assert snap["retrieval.hybrid_ms"]["n"] == 1

    def test_bilinmeyen_event_atlanir(self):
        # Arrange + Act — kayıtlı olmayan event no-op
        record_event("rastgele_event", {"x": 1})
        # Assert — hiçbir metrik artmaz
        assert all(m["n"] == 0 for m in snapshot_all().values())

    def test_stream_timings_dort_stage(self):
        # Arrange + Act — stream_timings 4 stage'e dağıtılır
        record_event("stream_timings", {
            "first_event_ms": 10, "retrieval_done_ms": 50,
            "first_token_ms": 100, "final_ms": 500,
        })
        # Assert
        snap = snapshot_all()
        assert snap["stream.first_event_ms"]["n"] == 1
        assert snap["stream.final_ms"]["max"] == 500.0

    def test_record_stream_timings_none_atlar(self):
        # Arrange — kısa-devre yolunda retrieval None
        record_stream_timings({"first_event_ms": 5, "retrieval_done_ms": None,
                               "first_token_ms": None, "final_ms": 20})
        # Assert — yalnız dolu olanlar kaydedilir
        snap = snapshot_all()
        assert snap["stream.first_event_ms"]["n"] == 1
        assert snap["stream.retrieval_done_ms"]["n"] == 0


class TestRenderPrometheus:
    """render_prometheus — bağımlılıksız text exposition formatı."""

    def test_bos_registry_help_type_satirlari(self):
        # Act
        out = render_prometheus()
        # Assert — HELP/TYPE başlıkları + sıfır-örnek samples
        assert "# HELP adalet_stage_latency_ms" in out
        assert "# TYPE adalet_stage_latency_ms gauge" in out
        assert 'adalet_stage_latency_samples{stage="llm.generation_ms"} 0' in out

    def test_dolu_metrik_quantile_satirlari(self):
        # Arrange — veri ekle
        record_event("verify_done", {"elapsed_ms": 300})
        # Act
        out = render_prometheus()
        # Assert — quantile-etiketli gauge satırı
        assert 'adalet_stage_latency_ms{stage="verify.duration_ms",quantile="0.5"}' in out
        assert 'adalet_stage_latency_samples{stage="verify.duration_ms"} 1' in out

    def test_render_newline_ile_biter(self):
        # Act + Assert — Prometheus formatı son satır newline ister
        assert render_prometheus().endswith("\n")


class TestSnapshotAll:
    """snapshot_all — tüm kayıtlı metriklerin snapshot'ı."""

    def test_tum_metrikler_var(self):
        # Act
        snap = snapshot_all()
        # Assert — registry anahtarları mevcut
        assert "llm.generation_ms" in snap
        assert "finalize.duration_ms" in snap
        assert all("n" in v for v in snap.values())
