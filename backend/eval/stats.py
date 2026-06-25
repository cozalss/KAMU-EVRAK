"""İstatistiksel yardımcılar — oran metriklerine güven aralığı (jüri titizliği).

Nokta-tahmini (P=1.0, R=0.875) küçük-N'de yanıltıcı: '8/8 → P=1.0' ama %95 alt-sınır ~0.63.
Wilson score aralığı normal-yaklaşımdan üstündür: 0/1'e yakın oranlarda ve küçük n'de
güvenilir, aralık [0,1] dışına TAŞMAZ (Wald yaklaşımı taşar). Saf fonksiyon — LLM/bağımlılık yok.

Ref: Wilson (1927); Brown, Cai & DasGupta (2001) küçük-n için Wilson'ı önerir.
"""

from __future__ import annotations

import math
import random

# z=1.96 → %95 iki-taraflı güven aralığı.
Z_95 = 1.96

# Exact binom testini bu discordant-çift sayısına kadar kullan; üstünde ki-kare yaklaşımı.
MCNEMAR_EXACT_MAX_N = 25


def wilson_interval(k: int, n: int, z: float = Z_95) -> tuple[float, float]:
    """k başarı / n deneme oranı için Wilson score güven aralığı → (alt, üst), [0,1]'e kırpılı.

    n=0 → (0.0, 1.0) (bilgi yok). k=n (P=1.0) → alt-sınır < 1.0 (küçük-n'de dürüstlük).
    """
    if n <= 0:
        return (0.0, 1.0)
    p = k / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = (p + z2 / (2 * n)) / denom
    half = (z / denom) * math.sqrt(p * (1.0 - p) / n + z2 / (4.0 * n * n))
    return (max(0.0, center - half), min(1.0, center + half))


def fmt_ci(k: int, n: int, z: float = Z_95) -> str:
    """'%95 CI [alt, üst]' okunabilir string (rapor için)."""
    lo, hi = wilson_interval(k, n, z)
    return f"[{lo:.3f}, {hi:.3f}]"


def mcnemar_test(b: int, c: int) -> tuple[float | None, float]:
    """Eşleştirilmiş ikili A/B karşılaştırması için McNemar testi (discordant çiftler).

    b = "A doğru & B yanlış" sayısı; c = "A yanlış & B doğru" sayısı (uyumsuz/discordant).
    Concordant çiftler (ikisi de aynı) bilgi taşımaz → kullanılmaz. H0: iki sistem eşit
    (b ≈ c). Küçük p → fark anlamlı.

    n = b+c ≤ MCNEMAR_EXACT_MAX_N ise **exact** iki-taraflı binom testi (scipy gerekmez,
    küçük-n güvenilir); aksi halde **süreklilik-düzeltmeli ki-kare** (1 sd). Dönüş:
    (istatistik|None, p_değeri); exact dalda istatistik None'dır.

    Ref: McNemar (1947); Edwards (1948) süreklilik düzeltmesi.
    """
    n = b + c
    if n == 0:
        return (None, 1.0)  # uyumsuz çift yok → ayırt edilemez (en muhafazakâr p)
    if n <= MCNEMAR_EXACT_MAX_N:
        # Exact: H0 altında discordant'lar Binom(n, 0.5). İki-taraflı p = 2·P(X ≤ min(b,c)).
        k = min(b, c)
        tail = sum(math.comb(n, i) for i in range(k + 1)) * (0.5**n)
        return (None, min(1.0, 2.0 * tail))
    # Süreklilik-düzeltmeli ki-kare (1 sd): p = erfc(sqrt(chi2/2)) (χ²₁ sağ-kuyruk).
    chi2 = (abs(b - c) - 1) ** 2 / n
    return (chi2, math.erfc(math.sqrt(chi2 / 2.0)))


def mcnemar_from_paired(paired: list[tuple[bool, bool]]) -> tuple[float | None, float]:
    """(A_doğru, B_doğru) çiftlerinden b,c sayıp mcnemar_test çağırır."""
    b = sum(1 for a, bb in paired if a and not bb)
    c = sum(1 for a, bb in paired if (not a) and bb)
    return mcnemar_test(b, c)


def bootstrap_diff_ci(
    paired: list[tuple[bool, bool]],
    n_resamples: int = 10000,
    alpha: float = 0.05,
    seed: int = 12345,
) -> tuple[float, float, float]:
    """Eşleştirilmiş ikili sonuçlarda doğruluk FARKININ (B − A) bootstrap güven aralığı.

    paired: (A_doğru, B_doğru) listesi. delta = mean(B) − mean(A). Dönüş:
    (delta_nokta, alt, üst). %95 için alpha=0.05 → 2.5/97.5 persentil (dağılımdan bağımsız).
    Deterministik (seed) — resume/tekrar-üretilebilirlik için Z_95 yerine sabit tohum.
    """
    n = len(paired)
    if n == 0:
        return (0.0, 0.0, 0.0)
    a_vals = [1 if a else 0 for a, _ in paired]
    b_vals = [1 if bb else 0 for _, bb in paired]
    point = (sum(b_vals) - sum(a_vals)) / n
    rng = random.Random(seed)
    deltas: list[float] = []
    for _ in range(n_resamples):
        sa = sb = 0
        for _ in range(n):
            j = rng.randrange(n)
            sa += a_vals[j]
            sb += b_vals[j]
        deltas.append((sb - sa) / n)
    deltas.sort()
    lo_idx = max(0, min(n_resamples - 1, int((alpha / 2) * n_resamples)))
    hi_idx = max(0, min(n_resamples - 1, int((1 - alpha / 2) * n_resamples)))
    return (point, deltas[lo_idx], deltas[hi_idx])


def fmt_delta_ci(point: float, lo: float, hi: float, p: float) -> str:
    """'Δ=+2.0pp, %95 CI [-1.2, +5.1]pp, p=0.31 → anlamlı DEĞİL' okunabilir özet."""
    sig = "anlamlı" if p < 0.05 else "anlamlı DEĞİL"
    return (
        f"Δ={point * 100:+.1f}pp, %95 CI [{lo * 100:+.1f}, {hi * 100:+.1f}]pp, "
        f"p={p:.3f} → {sig}"
    )
