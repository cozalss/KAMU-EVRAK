"""Eval LLM-judge gate testleri — SUMMARY_JUDGE_ENABLED / DRAFT_JUDGE_ENABLED sözleşmesi.

Kontrat (CLAUDE.md deterministik-fallback sözleşmesi):
  (a) bayrak kapalı (default) → judge HİÇ çağrılmaz; rapor deterministik (CI güvenli),
  (b) bayrak açık + sahte LLM → rapora judge_* / uslup_* alanları eklenir,
  (c) bozuk LLM çıktısı → None-güvenli (çökmez; deterministik metrikler aynen kalır).
Pipeline stub'lanır (run_pipeline monkeypatch) — graf/LLM koşulmaz, testler hızlı +
gold dosyası gerektirmez. Scorecard render'ı judge alanlarını None-güvenli biçimler.
AAA deseni; LLM_MODE=mock (conftest).
"""

from __future__ import annotations

import pytest

from agents.llm import LLMResponse
from eval import draft_eval, summary_eval
from eval import judge as judge_mod

# ---------------------------------------------------------------------------
#  Ortak sahte LLM (judge yolu için) — eval.judge.get_llm_for_model'e takılır
# ---------------------------------------------------------------------------


class _SahteLLM:
    def __init__(self, content: str) -> None:
        self.content = content
        self.cagri = 0

    async def chat(self, messages, **kwargs):
        self.cagri += 1
        return LLMResponse(content=self.content)


_JUDGE_JSON = '{"kapsama": 0.9, "sadakat": 0.8, "kisalik": 0.7, "notlar": "iyi"}'


# ---------------------------------------------------------------------------
#  Özet gate — sentetik satırlar + stub pipeline (deterministik beklentiler)
# ---------------------------------------------------------------------------

_OZETLER = {
    "s1": "12.03.2026 tarihli dilekçe ile kira yardımı talep edilmektedir.",
    "s2": "Ruhsat başvurusu hakkında 05.01.2026 tarihli yazı ile bilgi istenmektedir.",
}


def _ozet_rows() -> list[dict]:
    # Sentetik/kurgu evrak (gerçek PII yok — sahte: Ayşe Yılmaz, 0555-123-4567).
    return [
        {"id": "s1",
         "metin": ("Ankara Valiliğine sunulan 12.03.2026 tarihli dilekçe. "
                   "Konu: kira yardımı talebi. Başvuran: Ayşe Yılmaz, 0555-123-4567."),
         "anahtar_unsurlar": ["kira yardımı", "dilekçe"]},
        {"id": "s2",
         "metin": ("Çankaya Belediyesi İmar Müdürlüğüne 05.01.2026 tarihli yazı. "
                   "Konu: ruhsat başvurusu hakkında bilgi talebi."),
         "anahtar_unsurlar": ["ruhsat", "yazı"]},
    ]


def _stub_ozet_pipeline(rows: list[dict]) -> None:
    for r in rows:
        r["ozet"] = _OZETLER[r["id"]]


@pytest.fixture()
def ozet_stub(monkeypatch):
    monkeypatch.setattr(summary_eval, "run_pipeline", _stub_ozet_pipeline)
    return _ozet_rows()


class TestSummaryJudgeGate:
    """summary_eval — gate kapalı deterministik / açık judge alanları / bozuk güvenli."""

    def test_gate_kapali_judge_cagrilmaz_rapor_deterministik(self, ozet_stub, monkeypatch):
        # Arrange — default (bayrak yok) + judge çağrılırsa test patlasın
        monkeypatch.delenv("SUMMARY_JUDGE_ENABLED", raising=False)

        async def _yasak(self, *a, **k):
            raise AssertionError("gate kapalıyken judge çağrılmamalı")

        monkeypatch.setattr(judge_mod.LLMJudge, "evaluate", _yasak)
        # Act
        res = summary_eval.evaluate(ozet_stub)
        # Assert — deterministik key-fact/faithfulness AYNEN + judge alanları None-güvenli
        assert res["n"] == 2
        assert res["micro_recall"] == 1.0
        assert res["faithfulness_rate"] == 1.0
        assert res["judge_coverage"] is None
        assert res["judge_kapsama"] is None
        assert res["judge_sadakat"] is None
        assert res["judge_kisalik"] is None
        assert res["judge_n"] == 0

    def test_gate_acik_judge_alanlari_raporda(self, ozet_stub, monkeypatch):
        # Arrange — bayrak açık + sahte LLM geçerli judge JSON'u döndürür
        monkeypatch.setenv("SUMMARY_JUDGE_ENABLED", "1")
        sahte = _SahteLLM(content=_JUDGE_JSON)
        monkeypatch.setattr(judge_mod, "get_llm_for_model", lambda m: sahte)
        # Act
        res = summary_eval.evaluate(ozet_stub)
        # Assert — judge alanları rapora eklenir; deterministik metrikler değişmez
        assert res["judge_kapsama"] == 0.9
        assert res["judge_sadakat"] == 0.8
        assert res["judge_kisalik"] == 0.7
        assert res["judge_coverage"] == 0.9  # geriye-uyum: kapsama ortalaması
        assert res["judge_n"] == 2
        assert sahte.cagri == 2  # her satır judge'lanır
        assert res["micro_recall"] == 1.0

    def test_gate_acik_bozuk_json_guvenli(self, ozet_stub, monkeypatch):
        # Arrange — bayrak açık ama LLM bozuk çıktı üretir
        monkeypatch.setenv("SUMMARY_JUDGE_ENABLED", "1")
        sahte = _SahteLLM(content="JSON üretemedim {{{")
        monkeypatch.setattr(judge_mod, "get_llm_for_model", lambda m: sahte)
        # Act — çökmemeli
        res = summary_eval.evaluate(ozet_stub)
        # Assert — güvenli sıfır skor; deterministik metrikler aynen
        assert res["judge_kapsama"] == 0.0
        assert res["judge_n"] == 2
        assert res["micro_recall"] == 1.0
        assert res["faithfulness_rate"] == 1.0


# ---------------------------------------------------------------------------
#  Taslak üslup gate — sentetik taslak + stub pipeline
# ---------------------------------------------------------------------------

_TASLAK = """\
                T.C.
        ANKARA VALİLİĞİ
    Yazı İşleri Müdürlüğü

Sayı: E-12345678-622.03-4567                                12.03.2026
Konu: Kira yardımı başvurusu

    SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞINA

İlgi: a) 05.01.2026 tarihli ve E-87654321-622.03-111 sayılı yazı.

İlgi yazıda belirtilen başvuru incelenmiş olup sonucun başvurana bildirilmesi
hususunda gereğini rica ederim.

                                        {{ AD SOYAD }}
                                        {{ UNVAN }}
"""


def _taslak_rows() -> list[dict]:
    return [
        {"id": "d1", "metin": "Kira yardımı başvurusu dilekçesi.",
         "evrak_turu": "dilekce", "beklenen_yazi_turu": "cevabi_yazi"},
        {"id": "d2", "metin": "Ruhsat başvurusu dilekçesi.",
         "evrak_turu": "dilekce", "beklenen_yazi_turu": "cevabi_yazi"},
    ]


def _stub_taslak_pipeline(rows: list[dict]) -> None:
    for r in rows:
        r["taslak"] = _TASLAK
        r["format_uyumlu"] = True
        r["yazi_turu"] = "cevabi_yazi"
        r["verify_uyari"] = []


@pytest.fixture()
def taslak_stub(monkeypatch):
    monkeypatch.setattr(draft_eval, "run_pipeline", _stub_taslak_pipeline)
    return _taslak_rows()


class TestDraftUslupGate:
    """draft_eval — DRAFT_JUDGE_ENABLED gate'li resmî-üslup ekseni."""

    def test_gate_kapali_llm_cagrilmaz_rapor_deterministik(self, taslak_stub, monkeypatch):
        # Arrange — default kapalı; llm_json çağrılırsa patla
        monkeypatch.delenv("DRAFT_JUDGE_ENABLED", raising=False)

        async def _yasak(*a, **k):
            raise AssertionError("gate kapalıyken üslup-judge çağrılmamalı")

        monkeypatch.setattr(draft_eval, "llm_json", _yasak)
        # Act
        res = draft_eval.evaluate(taslak_stub)
        # Assert — mevcut deterministik metrikler AYNEN + üslup alanları None-güvenli
        assert res["n"] == 2
        assert res["format_score"] == 1.0
        assert res["compliance_rate"] == 1.0
        assert res["yazi_turu_acc"] == 1.0
        assert res["false_veto"] == 0
        assert res["uslup_judge"] is None
        assert res["uslup_boyutlar"] is None
        assert res["uslup_judge_n"] == 0

    def test_gate_acik_uslup_alanlari_raporda(self, taslak_stub, monkeypatch):
        # Arrange — bayrak açık + sahte llm_json geçerli üslup JSON'u döndürür
        monkeypatch.setenv("DRAFT_JUDGE_ENABLED", "1")
        cagri = {"n": 0}

        async def _sahte_llm_json(system, user, **kwargs):
            cagri["n"] += 1
            return {"resmiyet": 0.9, "kip_uygunlugu": 0.8, "aciklik": 1.0, "notlar": "resmî"}

        monkeypatch.setattr(draft_eval, "llm_json", _sahte_llm_json)
        # Act
        res = draft_eval.evaluate(taslak_stub)
        # Assert — üslup ekseni rapora eklenir; deterministik metrikler değişmez
        assert res["uslup_judge"] == 0.9  # (0.9+0.8+1.0)/3
        assert res["uslup_boyutlar"] == {"resmiyet": 0.9, "kip_uygunlugu": 0.8, "aciklik": 1.0}
        assert res["uslup_judge_n"] == 2
        assert cagri["n"] == 2
        assert res["format_score"] == 1.0

    def test_gate_acik_bozuk_cikti_none_guvenli(self, taslak_stub, monkeypatch):
        # Arrange — bayrak açık ama LLM bozuk/şema-dışı çıktı üretir (llm_json → None)
        monkeypatch.setenv("DRAFT_JUDGE_ENABLED", "1")

        async def _bozuk_llm_json(system, user, **kwargs):
            return None  # llm_json sözleşmesi: hata/bozuk JSON → None

        monkeypatch.setattr(draft_eval, "llm_json", _bozuk_llm_json)
        # Act — çökmemeli
        res = draft_eval.evaluate(taslak_stub)
        # Assert — üslup alanları None; deterministik metrikler aynen
        assert res["uslup_judge"] is None
        assert res["uslup_judge_n"] == 0
        assert res["format_score"] == 1.0

    def test_gate_acik_sema_disi_json_none_guvenli(self, taslak_stub, monkeypatch):
        # Arrange — geçerli JSON ama beklenen eksenler yok (kapalı-küme doğrulama)
        monkeypatch.setenv("DRAFT_JUDGE_ENABLED", "1")

        async def _sema_disi(system, user, **kwargs):
            return {"domain": "kira", "confidence": 0.85}

        monkeypatch.setattr(draft_eval, "llm_json", _sema_disi)
        # Act
        res = draft_eval.evaluate(taslak_stub)
        # Assert
        assert res["uslup_judge"] is None
        assert res["uslup_judge_n"] == 0


# ---------------------------------------------------------------------------
#  Scorecard — judge alanları None-güvenli render
# ---------------------------------------------------------------------------


def _sahte_karne(judge_coverage=None, uslup_judge=None) -> dict:
    return {
        "git_sha": "abc1234", "llm_mode": "mock",
        "evrak_turu_sayisi": 9, "birim_sayisi": 12,
        "gorev1": {
            "siniflandirma": {"accuracy": 0.9, "macro_f1": 0.88,
                              "accuracy_ci95": [0.8, 0.95], "abstention_rate": 0.05,
                              "by_zorluk": {"kolay": 1.0}},
            "eksik_bilgi": {"precision": 0.8, "recall": 0.9, "f_beta": 0.87, "beta": 2.0,
                            "recall_ci95": [0.8, 0.95]},
            "ozet": {"micro_recall": 0.95, "macro_recall": 0.94, "full_cover_rate": 0.9,
                     "avg_uzunluk": 32.5, "faithfulness_rate": 1.0,
                     "faithfulness_ci95": [0.9, 1.0], "judge_coverage": judge_coverage},
        },
        "gorev2": {
            "yonlendirme": {"top1": 0.85, "top3": 0.97, "top1_ci95": [0.75, 0.92]},
            "yazi_taslak": {"format_uyumlu_rate": 1.0, "compliance_rate": 1.0,
                            "yazi_turu_acc": 1.0, "avg_turkish_purity": 1.0,
                            "per_component": {"tc_baslik": 1.0},
                            "false_veto": 0, "false_veto_rate": 0.0,
                            "veto_uyari_toplam": 3, "uslup_judge": uslup_judge},
        },
        "etik": {"class_consistency": 1.0, "route_consistency": 1.0,
                 "class_consistency_ci95": [0.95, 1.0]},
        "n": {"siniflandirma": 50, "yonlendirme": 50, "eksik": 40, "ozet": 30,
              "taslak": 30, "adillik": 20},
    }


class TestScorecardJudgeNoneGuvenli:
    """competition_scorecard render — judge alanları None iken '—', doluyken sayı."""

    def test_judge_alanlari_none_iken_tire(self):
        # Arrange
        from eval.competition_scorecard import render_console, render_markdown
        sc = _sahte_karne(judge_coverage=None, uslup_judge=None)
        # Act
        md = render_markdown(sc)
        konsol = render_console(sc)
        # Assert — None sızmaz, '—' basılır
        assert "None" not in md
        assert "—" in md
        assert "None" not in konsol

    def test_judge_alanlari_doluyken_sayi(self):
        # Arrange
        from eval.competition_scorecard import render_console, render_markdown
        sc = _sahte_karne(judge_coverage=0.912, uslup_judge=0.856)
        # Act
        md = render_markdown(sc)
        konsol = render_console(sc)
        # Assert — üç ondalık biçim
        assert "0.912" in md
        assert "0.856" in md
        assert "0.856" in konsol

    def test_eksik_judge_anahtarlari_kirmaz(self):
        # Arrange — eski karne JSON'unda yeni anahtarlar hiç yok (geriye-uyum)
        from eval.competition_scorecard import render_console, render_markdown
        sc = _sahte_karne()
        del sc["gorev1"]["ozet"]["judge_coverage"]
        del sc["gorev2"]["yazi_taslak"]["uslup_judge"]
        # Act + Assert — KeyError yok
        assert isinstance(render_markdown(sc), str)
        assert isinstance(render_console(sc), str)
