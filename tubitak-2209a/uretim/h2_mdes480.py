"""n=480'de H2'nin saptanabilir en kucuk etkilesimi (MDES) — on-kayit metnine yazilacak."""
import sys, math, json
import numpy as np
from scipy import stats

sys.stdout.reconfigure(encoding="utf-8")
RNG = np.random.default_rng(20260808)
Z = stats.norm.ppf(0.975)


def ters(x):
    return 1.0 / (1.0 + np.exp(-x))


def loj(p):
    return math.log(p / (1 - p))


def guc(n, e, taban=0.62, kol=0.10, sd=0.8, n_sim=1500):
    red = 0
    for _ in range(n_sim):
        u = RNG.normal(0, sd, n)
        dd = RNG.binomial(1, ters(loj(taban + kol) + u)) - RNG.binomial(1, ters(loj(taban) + u))
        dy = RNG.binomial(1, ters(loj(taban - 0.15 + kol + e) + u)) - \
            RNG.binomial(1, ters(loj(taban - 0.15) + u))
        d = dy - dd
        se = d.std(ddof=1) / math.sqrt(n)
        if se == 0:
            continue
        red += abs(d.mean() / se) > Z
    return red / n_sim


out = {}
for n in (240, 480):
    print(f"\n[n = {n}] MDES araması (güç ≥ 0,80)")
    bulundu = None
    for e in np.arange(0.10, 0.26, 0.01):
        g = guc(n, float(e))
        print(f"   etkileşim {e:.2f} → güç {g:.3f}")
        if g >= 0.80 and bulundu is None:
            bulundu = round(float(e), 2)
            break
    out[f"MDES_n{n}"] = bulundu
    print(f"   >>> MDES(n={n}) = {bulundu}")

json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nYAZILDI:", sys.argv[1])
