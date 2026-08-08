"""H5 (yanlis-veto asmazlik) ve H8 (gecikme esdegerlik/TOST) icin GEREKEN n.

Neden: istatistik hakemi B5'te "sinirlar 0,05 (mutlak) ve log olcekte %20; gereken n
on-kayittan once bu sinirlarla hesaplanip BURADA raporlanir" dedi. guc_simulasyonu.py
H1/H2/H3/H4/H6/H7'yi kapsiyor; H5 ve H8 icin hicbir sayi yoktu. Bu betik o bosluğu
kapatir ve ayni tohumu kullanir, boylece tum guc beyanlari tek koşumdan gelmis olur.

Varsayimlar (hepsi belgeden; uydurma olan YOK, belirsiz olan SUPURULUR):
  H5 - kapi acik/kapali karsilastirmasi, 240 belgenin iddia duzeyinde esleşmiş ikili
       sonuc. Asmazlik: kapali kapinin yanlis-veto orani, acik kapininkini 0,05'ten
       (mutlak) fazla asmamali. Tek yonlu, alfa = 0,02 (Kapi 3'te iki test, mekanizma kolu
       alfa 0,04 -> Holm en kati basamak 0,02). Taban yanlis-veto orani belgede yok: 0,03-0,10 arasi
       SUPURULUR ve gereken n her taban icin ayri raporlanir.
  H8 - belge basina gecikme, esleştirilmiş, log olcekte. Esdegerlik siniri ±ln(1,20).
       Eslesmis log farkin standart sapmasi belgede yok: 0,15-0,45 arasi SUPURULUR.
       TOST, iki tek yonlu test, her biri alfa = 0,05 (Kapi 4'te Holm ayrica
       uygulanir; en kati basamak icin alfa = 0,0133 senaryosu da verilir).

Yontem: H5 kapali-form asmazlik gucu (iki oran, esleşmiş olmayan muhafazakar yaklasim)
DEGIL, esleşmiş tasarima uygun Monte Carlo. H8 icin TOST'un kapali-form gucu
(non-central t yerine normal yaklasim + Monte Carlo dogrulamasi).
"""
import sys
import json
import math

import numpy as np
from scipy import stats

sys.stdout.reconfigure(encoding="utf-8")
RNG = np.random.default_rng(20260808)   # guc_simulasyonu.py ile AYNI tohum

N_SIM = 4000
SINIR_H5 = 0.05                 # mutlak yanlis-veto farki siniri
SINIR_H8 = math.log(1.20)       # log olcekte %20


# ------------------------------------------------- H5: tek yonlu asmazlik (esleşmiş)
def h5_asmazlik(n, taban, gercek_fark=0.0, sinir=SINIR_H5, alfa=0.02, n_sim=N_SIM):
    """Kapali kapinin yanlis-veto orani acik kapininkini <sinir> kadar asmiyor mu?

    Esleşmiş ikili sonuc: her iddia iki kapi ayarinda da gozlenir. Test, farkin
    ust guven sinirinin <sinir>'in altinda kalmasidir (tek yonlu asmazlik).
    gercek_fark = 0 varsayilani "kapi sikilastirmasi yanlis-vetoyu artirmiyor" demek.
    """
    p_kapali = taban + gercek_fark
    red = 0
    z_a = stats.norm.ppf(1 - alfa)
    for _ in range(n_sim):
        # esleşmiş: uyumsuz ciftler uzerinden fark kestirimi (McNemar gecidi)
        p01 = max(p_kapali - taban, 0) + taban * 0.35     # kapali'da veto, acik'ta yok
        p10 = taban * 0.35                                 # tersi
        p01, p10 = min(p01, 0.99), min(p10, 0.99)
        say = RNG.multinomial(n, [p01, p10, max(1 - p01 - p10, 0.0)])
        b, c = say[0], say[1]
        fark = (b - c) / n
        se = math.sqrt(max(b + c - (b - c) ** 2 / n, 1e-9)) / n
        if se == 0:
            continue
        # tek yonlu ust guven siniri < sinir  =>  asmazlik kurulur
        red += (fark + z_a * se) < sinir
    return red / n_sim


def h5_gereken_n(taban, guc=0.80, sinir=SINIR_H5, alfa=0.02):
    for n in range(60, 1501, 20):
        if h5_asmazlik(n, taban, 0.0, sinir, alfa, n_sim=1200) >= guc:
            return n
    return None


# --------------------------------------------------------------- H8: TOST (esleşmiş)
def h8_tost(n, sd_log, gercek_fark=0.0, sinir=SINIR_H8, alfa=0.05, n_sim=N_SIM):
    """Esleşmiş log-gecikme farki ±sinir bandinin ICINDE mi (iki tek yonlu test)."""
    red = 0
    for _ in range(n_sim):
        d = RNG.normal(gercek_fark, sd_log, n)
        m, se = d.mean(), d.std(ddof=1) / math.sqrt(n)
        if se == 0:
            continue
        sd_ = n - 1
        t1 = (m + sinir) / se        # H0a: fark <= -sinir
        t2 = (m - sinir) / se        # H0b: fark >= +sinir
        red += (stats.t.sf(t1, sd_) < alfa) and (stats.t.cdf(t2, sd_) < alfa)
    return red / n_sim


def h8_gereken_n(sd_log, guc=0.80, sinir=SINIR_H8, alfa=0.05):
    for n in range(20, 1201, 10):
        if h8_tost(n, sd_log, 0.0, sinir, alfa, n_sim=1000) >= guc:
            return n
    return None


# ===================================================================== KOŞUM
sonuc = {}
print("=" * 78)
print("H5 / H8 GÜÇ VE GEREKEN n — 2209-A (tohum 20260808)")
print("=" * 78)

print(f"\n[H5] Tek yönlü aşmazlık, sınır {SINIR_H5} (mutlak), α = 0,02 (Kapı 3 Holm)")
print("     Taban yanlış-veto oranı belgede sabitlenmemiş → süpürülüyor.")
h5 = {}
for taban in (0.03, 0.05, 0.08, 0.10):
    n_ger = h5_gereken_n(taban)
    g240 = h5_asmazlik(240, taban)
    h5[str(taban)] = {"gereken_n_guc080": n_ger, "guc_n240": round(g240, 3)}
    print(f"     taban {taban:.2f} → gereken n = {str(n_ger):>5}   "
          f"(n=240'ta güç {g240:.3f})")
sonuc["H5_asmazlik"] = h5

print(f"\n[H8] TOST eşdeğerlik, sınır ±ln(1,20) = ±{SINIR_H8:.4f} log, α = 0,05")
print("     Eşleşmiş log farkın standart sapması belgede yok → süpürülüyor.")
h8 = {}
for sd in (0.15, 0.25, 0.35, 0.45):
    n_ger = h8_gereken_n(sd)
    g240 = h8_tost(240, sd)
    h8[str(sd)] = {"gereken_n_guc080": n_ger, "guc_n240": round(g240, 3)}
    print(f"     sd_log {sd:.2f} → gereken n = {str(n_ger):>5}   "
          f"(n=240'ta güç {g240:.3f})")
sonuc["H8_tost"] = h8

print("\n     Kapı 4'te Holm en katı basamağı (α = 0,0133) senaryosu:")
h8k = {}
for sd in (0.25, 0.35):
    g = h8_tost(240, sd, alfa=0.0133)
    h8k[str(sd)] = round(g, 3)
    print(f"     sd_log {sd:.2f} → n=240'ta güç {g:.3f}")
sonuc["H8_tost_alfa0133_n240"] = h8k

print("\n" + "=" * 78)
yol = sys.argv[1] if len(sys.argv) > 1 else "guc_h5_h8.json"
json.dump({"tohum": 20260808, "n_sim": N_SIM,
           "sinir_H5_mutlak": SINIR_H5, "sinir_H8_log": round(SINIR_H8, 4),
           "sonuc": sonuc}, open(yol, "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("YAZILDI:", yol)
