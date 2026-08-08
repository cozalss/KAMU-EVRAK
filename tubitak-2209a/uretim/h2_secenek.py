"""H2 icin uygulanabilir orneklem secenekleri + H3 (ana etki) gucu.

Amac: "n=860 gerekiyor ama yapamayiz" cikmazini, panelistin saygi duyacagi bir
ON-KAYIT KARAR KURALINA cevirmek. Bunun icin:
  - ara orneklemlerde (360/480/600) gercek gucu olc
  - H3 (bozulmanin ANA etkisi) gucunu olc — etkilesim zayifsa bile bu saglam olmali
  - H2 icin genisletilmis ALT DESEN maliyetini hesapla (yalniz b2 ve c kollari)
"""
import sys, math, json
import numpy as np
from scipy import stats

sys.stdout.reconfigure(encoding="utf-8")
RNG = np.random.default_rng(20260808)
ALFA = 0.05
Z = stats.norm.ppf(1 - ALFA / 2)


def ters(x):
    return 1.0 / (1.0 + np.exp(-x))


def loj(p):
    return math.log(p / (1 - p))


def h2_guc(n, etkilesim=0.10, taban=0.62, kol=0.10, sd=0.8, n_sim=1200):
    red = 0
    for _ in range(n_sim):
        u = RNG.normal(0, sd, n)
        d_d = RNG.binomial(1, ters(loj(taban + kol) + u)) - \
            RNG.binomial(1, ters(loj(taban) + u))
        d_y = RNG.binomial(1, ters(loj(taban - 0.15 + kol + etkilesim) + u)) - \
            RNG.binomial(1, ters(loj(taban - 0.15) + u))
        d = d_y - d_d
        se = d.std(ddof=1) / math.sqrt(n)
        if se == 0:
            continue
        red += abs(d.mean() / se) > Z
    return red / n_sim


def h3_guc(n=240, dusus=0.15, taban=0.70, sd=0.8, n_sim=1500):
    """Bozulmanin ANA etkisi: uc sirali seviyede monoton dusus (Page/egilim)."""
    red = 0
    agirlik = np.array([-1.0, 0.0, 1.0])
    for _ in range(n_sim):
        u = RNG.normal(0, sd, n)
        sut = [RNG.binomial(1, ters(loj(taban - dusus * i) + u)) for i in range(3)]
        F = np.column_stack(sut)
        k = F @ agirlik
        se = k.std(ddof=1) / math.sqrt(n)
        if se == 0:
            continue
        red += abs(k.mean() / se) > Z
    return red / n_sim


print("=" * 76)
print("H2 ÖRNEKLEM SEÇENEKLERİ + H3 ANA ETKİ GÜCÜ")
print("=" * 76)

sonuc = {}
print("\n[H2] etkileşim = 0,10 · farklı örneklemler")
for n in (240, 360, 480, 600, 720):
    g = h2_guc(n)
    print(f"   n = {n:>3} → güç {g:.3f}")
    sonuc[f"H2_n{n}"] = round(g, 3)

print("\n[H2] n = 240 · farklı etkileşim büyüklükleri (MDES eğrisi)")
for e in (0.10, 0.14, 0.16, 0.18, 0.20):
    g = h2_guc(240, etkilesim=e)
    print(f"   etkileşim {e:.2f} → güç {g:.3f}")
    sonuc[f"H2_240_e{e}"] = round(g, 3)

print("\n[H3] Bozulmanın ANA etkisi (monoton eğilim), n = 240")
for d in (0.10, 0.15):
    g = h3_guc(240, dusus=d)
    print(f"   seviye başına düşüş {d:.2f} → güç {g:.3f}")
    sonuc[f"H3_dusus_{d}"] = round(g, 3)

# --- genisletilmis alt desen maliyeti
print("\n[MALİYET] H2'ye özel genişletilmiş alt desen")
print("   H2 yalnız (b2) ve (c) kollarını × 3 bozulma seviyesini kullanır = 6 koşul")
for n_ek in (120, 240, 360):
    ek_kosum = n_ek * 6
    print(f"   +{n_ek:>3} belge → +{ek_kosum:>5} model çağrılı koşum "
          f"(toplam n = {240 + n_ek}, güç {h2_guc(240 + n_ek, n_sim=800):.3f})")
    sonuc[f"ek_{n_ek}_kosum"] = ek_kosum

json.dump({"tohum": 20260808, "sonuc": sonuc},
          open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nYAZILDI:", sys.argv[1])
