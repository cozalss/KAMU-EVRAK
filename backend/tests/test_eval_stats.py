"""İstatistiksel yardımcı testleri — Wilson CI + McNemar + bootstrap Δ CI (jüri titizliği).

eval/stats.py saf/deterministik fonksiyonları (ağ/LLM yok). Coverage boşluğunu kapatır
ve dürüstlük garantilerini (P=1.0'da alt-sınır<1, p>0.05 → anlamlı değil) regrese karşı kilitler.
AAA deseni; Türkçe açıklayıcı isimler.
"""

from __future__ import annotations

import math

from eval.stats import (
    bootstrap_diff_ci,
    fmt_ci,
    fmt_delta_ci,
    mcnemar_from_paired,
    mcnemar_test,
    wilson_interval,
)


class TestWilsonInterval:
    """wilson_interval küçük-N dürüstlüğü + [0,1] sınır kırpması."""

    def test_n_sifir_tam_belirsizlik(self):
        # Arrange + Act
        lo, hi = wilson_interval(0, 0)
        # Assert — bilgi yok → tam aralık
        assert (lo, hi) == (0.0, 1.0)

    def test_tam_basari_alt_sinir_birden_kucuk(self):
        # Arrange — 8/8 → nokta P=1.0 ama küçük-N'de alt sınır < 1.0 (dürüstlük)
        lo, hi = wilson_interval(8, 8)
        # Assert
        assert hi == 1.0
        assert lo < 1.0
        assert lo > 0.5  # makul taban

    def test_yarim_oranda_merkez_yaklasik_yarim(self):
        # Arrange — 50/100
        lo, hi = wilson_interval(50, 100)
        # Assert — simetrik, 0.5 civarı
        assert lo < 0.5 < hi
        assert abs((lo + hi) / 2 - 0.5) < 0.02

    def test_sinirlar_araliga_kirpilir(self):
        # Arrange — 0/3 → alt sınır negatife taşmamalı (Wald taşardı)
        lo, hi = wilson_interval(0, 3)
        # Assert
        assert lo == 0.0
        assert 0.0 <= hi <= 1.0

    def test_fmt_ci_okunabilir_string(self):
        # Act
        s = fmt_ci(8, 8)
        # Assert — '[alt, üst]' biçimi, 3 ondalık
        assert s.startswith("[") and s.endswith("]")
        assert "," in s


class TestMcNemarExact:
    """Küçük-N exact iki-taraflı binom McNemar dalı (n <= 25)."""

    def test_uyumsuz_cift_yok_anlamli_degil(self):
        # Arrange — b=c=0 → discordant yok
        stat, p = mcnemar_test(0, 0)
        # Assert — en muhafazakâr p
        assert stat is None
        assert p == 1.0

    def test_simetrik_discordant_p_bir(self):
        # Arrange — b=c → tam simetri, fark yok
        stat, p = mcnemar_test(5, 5)
        # Assert — exact dalda stat None; p ≈ 1.0 (iki-taraflı tam kuyruk)
        assert stat is None
        assert p == 1.0

    def test_asimetrik_discordant_dusuk_p(self):
        # Arrange — b=10, c=0 → güçlü asimetri (n=10 ≤ 25 exact)
        stat, p = mcnemar_test(10, 0)
        # Assert — exact; çok düşük p (anlamlı)
        assert stat is None
        assert p < 0.05

    def test_exact_p_binom_ile_eslesir(self):
        # Arrange — b=2, c=0, n=2: p = 2*P(X<=0) = 2*0.25 = 0.5
        _, p = mcnemar_test(2, 0)
        # Assert
        assert abs(p - 0.5) < 1e-9


class TestMcNemarChiSquare:
    """Büyük-N (n > 25) süreklilik-düzeltmeli ki-kare dalı."""

    def test_buyuk_n_chi2_dondurur(self):
        # Arrange — b=40, c=10, n=50 > 25 → ki-kare dalı
        chi2, p = mcnemar_test(40, 10)
        # Assert — istatistik float (None değil) + makul p
        assert isinstance(chi2, float)
        assert chi2 > 0
        assert 0.0 <= p <= 1.0

    def test_chi2_degeri_formul_ile_tutarli(self):
        # Arrange — chi2 = (|b-c|-1)^2 / n
        b, c = 40, 10
        chi2, _ = mcnemar_test(b, c)
        beklenen = (abs(b - c) - 1) ** 2 / (b + c)
        # Assert
        assert abs(chi2 - beklenen) < 1e-9

    def test_buyuk_asimetri_anlamli(self):
        # Arrange — b=60, c=0 → çok güçlü fark
        _, p = mcnemar_test(60, 0)
        # Assert
        assert p < 0.001


class TestMcNemarFromPaired:
    """(A_doğru, B_doğru) çiftlerinden b,c sayımı."""

    def test_paired_b_c_dogru_sayilir(self):
        # Arrange — 3× (A doğru, B yanlış), 1× (A yanlış, B doğru), 2× concordant
        paired = [
            (True, False), (True, False), (True, False),   # b=3
            (False, True),                                  # c=1
            (True, True), (False, False),                   # concordant (sayılmaz)
        ]
        # Act
        stat, p = mcnemar_from_paired(paired)
        # Assert — b+c=4 ≤ 25 exact; stat None
        assert stat is None
        assert 0.0 <= p <= 1.0

    def test_bos_paired_anlamli_degil(self):
        # Act + Assert
        stat, p = mcnemar_from_paired([])
        assert stat is None
        assert p == 1.0


class TestBootstrapDiffCI:
    """Eşleştirilmiş doğruluk farkı (B-A) bootstrap %95 CI — deterministik (seed)."""

    def test_bos_paired_sifir_doner(self):
        # Act + Assert
        assert bootstrap_diff_ci([]) == (0.0, 0.0, 0.0)

    def test_fark_yok_nokta_sifir(self):
        # Arrange — A ve B aynı → delta 0
        paired = [(True, True), (False, False), (True, True)]
        # Act
        point, lo, hi = bootstrap_diff_ci(paired, n_resamples=2000)
        # Assert
        assert point == 0.0
        assert lo == 0.0 and hi == 0.0

    def test_b_ustun_pozitif_nokta(self):
        # Arrange — B her vakada A'dan iyi
        paired = [(False, True)] * 10
        # Act
        point, lo, hi = bootstrap_diff_ci(paired, n_resamples=2000)
        # Assert — delta = mean(B)-mean(A) = 1.0
        assert point == 1.0
        assert lo <= hi

    def test_deterministik_ayni_seed_ayni_sonuc(self):
        # Arrange — aynı veri + aynı seed → tekrar-üretilebilir
        paired = [(True, False), (False, True), (True, True), (False, False)] * 5
        # Act
        r1 = bootstrap_diff_ci(paired, n_resamples=1500, seed=42)
        r2 = bootstrap_diff_ci(paired, n_resamples=1500, seed=42)
        # Assert
        assert r1 == r2


class TestFmtDeltaCI:
    """fmt_delta_ci okunabilir anlamlılık özeti."""

    def test_anlamli_degil_p_yuksek(self):
        # Act — p=0.31 > 0.05
        s = fmt_delta_ci(0.02, -0.012, 0.051, 0.31)
        # Assert
        assert "anlamlı DEĞİL" in s
        assert "p=0.310" in s

    def test_anlamli_p_dusuk(self):
        # Act — p=0.01 < 0.05
        s = fmt_delta_ci(0.10, 0.04, 0.16, 0.01)
        # Assert — 'anlamlı' var ama 'anlamlı DEĞİL' yok
        assert "anlamlı" in s
        assert "DEĞİL" not in s

    def test_pp_yuzde_puan_donusumu(self):
        # Act — 0.02 → +2.0pp
        s = fmt_delta_ci(0.02, 0.0, 0.04, 0.5)
        # Assert
        assert "+2.0pp" in s


class TestErfcKiKareKuyruk:
    """Ki-kare p-değeri math.erfc tabanlı sağ-kuyruk doğrulaması (sağlamlık)."""

    def test_chi2_p_erfc_ile_tutarli(self):
        # Arrange — büyük-N daldan chi2 al, p'yi erfc ile bağımsız hesapla
        chi2, p = mcnemar_test(40, 10)
        beklenen_p = math.erfc(math.sqrt(chi2 / 2.0))
        # Assert
        assert abs(p - beklenen_p) < 1e-9
