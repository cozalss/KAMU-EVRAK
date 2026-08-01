"""1 sayılı Cumhurbaşkanlığı Kararnamesinden bakanlık teşkilat dosyası üretir.

Birim adları m.<hizmet birimleri> bentlerinden, görev metinleri her birimin KENDİ
maddesinden BİREBİR alınır — özet/yeniden yazım yoktur. Amaç uydurma riskini sıfırlamak:
metni model yeniden yazarsa kelime kayması olabilir, kesip almak bu riski ortadan kaldırır.

Mülga bentler ve mülga görev maddeleri atlanır (ölçüldü: Tarım'da Doğa Koruma ve Milli
Parklar GM 28/12/2024'te mülga edilmişti ve elimizdeki veri onu hâlâ birim sayıyordu).

Kullanım:
    python scripts/cbk_bakanlik_cikar.py --madde 99 --slug cevre-sehircilik-ve-iklim-degisikligi-bakanligi
    python scripts/cbk_bakanlik_cikar.py --madde 99 --slug ... --yaz     # dosyaya yaz
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_KOK = Path(__file__).resolve().parents[2]
_TESKILAT_DIR = _KOK / "data" / "teskilat"
_KAYNAK_URL = "https://www.mevzuat.gov.tr/MevzuatMetin/19.5.1.pdf"
_BELGE = "1 sayılı Cumhurbaşkanlığı Teşkilatı Hakkında Cumhurbaşkanlığı Kararnamesi (RG 10/7/2018-30474)"

_BENT_RE = re.compile(r"^([a-zçğıöşü]{1,2})\)\s*(.+)$")
_UNVAN = (
    r"(?:Genel Müdürlükleri|Genel Müdürlüğü|Başkanlığı|Müşavirliği|Müdürlüğü|"
    r"Başkanlığının|Kurulu|Merkezi)"
)
# "(Ek:RG-...)70 Diplomatik Güvenlik GM" — değişiklik parantezi silinince dipnot numarası
# adın başında kalıyor; ad "70 Diplomatik..." olarak kaydedilmemeli.
_BASTA_DIPNOT_RE = re.compile(r"^\d{1,3}\s+(?=[A-ZÇĞİÖŞÜ])")
# Dipnot satırları: "57 12/4/2019 tarihli ve ... Kararnamesinin ... maddesiyle ..."
# Dipnot satırı: başta dipnot numarası + satırın herhangi bir yerinde tarih. Numaradan
# hemen sonra tarih beklemek yetmiyor — "175 Anayasa Mahkemesinin 27/12/2023 tarihli ve..."
# biçimi kaçıyordu ve bu satır birim listesini ortadan kesiyordu (ölçüldü: Sanayi 15→6).
_DIPNOT_RE = re.compile(r"^\d{1,3} .{0,60}?\d{1,2}/\d{1,2}/\d{4}")
_SADECE_SAYI_RE = re.compile(r"^\d{1,4}$")
_DEGISIKLIK_RE = re.compile(r"\((?:Değişik|Ek|Mülga|Yeniden düzenleme|İptal)[^)]*\)\s*", re.I)
_DIPNOT_NO_RE = re.compile(r"(?<=[a-zçğıöşü),.])\d{1,3}(?=\s|$)")


def _metin_yukle(yol: Path) -> list[str]:
    ham = yol.read_text(encoding="utf-8")
    sat: list[str] = []
    atla = False
    for s in (x.strip() for x in ham.split("\n")):
        if not s or _SADECE_SAYI_RE.match(s):
            continue  # tek başına duran dipnot işareti satırı
        if _DIPNOT_RE.match(s):
            atla = True
            continue
        if atla:
            # KRİTİK: dipnotun bittiğini kaçırırsak belgenin geri kalanını yutarız
            # (ölçüldü: MEB'de 8 birimin görev maddesi bu yüzden kayboluyordu). Bu yüzden
            # bitiş yalnız kalıba değil, SERT durakları da içerir: madde başlığı, bent
            # işareti veya unvanla biten başlık satırı görülür görülmez atlama biter.
            if re.match(r"^MADDE |^[a-zçğıöşü]{1,2}\)|^\(\d+\)", s) or re.search(
                _UNVAN + r"$", s
            ):
                atla = False
                sat.append(s)
                continue
            if re.search(
                r"(ettirilmiştir|kaldırılmıştır|değiştirilmiştir|eklenmiştir|işlenmiştir|"
                r"girmiştir|edilmiştir)\.?$",
                s,
            ):
                atla = False
            continue
        sat.append(s)
    return sat


def _bolum_sonu(sat: list[str], bas: int) -> int:
    for i in range(bas + 1, len(sat)):
        if sat[i].endswith("BÖLÜM"):
            return i
    return len(sat)


def _madde_indeksi(sat: list[str], no: int) -> int:
    for i, s in enumerate(sat):
        if re.match(rf"MADDE {no}\s*[-–—/]", s) or s.startswith(f"MADDE {no} "):
            return i
    raise SystemExit(f"MADDE {no} bulunamadı")


def birimleri_cikar(sat: list[str], madde: int) -> list[str]:
    """Hizmet birimleri maddesinin bentlerinden birim adlarını al; mülga bentleri atla."""
    i = _madde_indeksi(sat, madde)
    son = _bolum_sonu(sat, i)
    # Birim adı da satır sonunda bölünebiliyor ("...Uluslararası Hizmet Ticareti Genel /
    # Müdürlüğü"). Devam satırı toplanmazsa unvanla bitmediği için bent sessizce düşerdi
    # (ölçüldü: Ticaret'te 17 birimin 8'i kayboluyordu).
    ham: list[str] = []
    for s in sat[i:son]:
        m = _BENT_RE.match(s)
        if m:
            ham.append(m.group(2))
        elif ham and not re.match(r"^\(\d+\)|^MADDE|BÖLÜM$", s):
            # Son bent "... Müdürlüğü." gibi noktayla biter; noktalama soyulmadan bakılırsa
            # unvan eşleşmez ve takip eden BAŞLIK satırı bendin içine yapışır.
            if re.search(_UNVAN + r"$", ham[-1].rstrip(",. ")):
                break  # liste bitti, sonraki başlığa geçildi
            ham[-1] += " " + s
        elif ham:
            break

    adlar: list[str] = []
    for parca in ham:
        govde = _DEGISIKLIK_RE.sub("", parca).strip().rstrip(",.").strip()
        if not govde or "Mülga" in parca:
            continue
        govde = re.sub(r"\s+", " ", _DIPNOT_NO_RE.sub("", govde)).strip()
        govde = _BASTA_DIPNOT_RE.sub("", govde).strip()
        if not re.search(_UNVAN + r"$", govde):
            continue
        adlar.append(govde)
    return adlar


def gorev_cikar(sat: list[str], birim: str, bolum_sonu: int, bas: int) -> str:
    """Birimin kendi maddesindeki bentleri birebir birleştir."""
    bas_i = None
    for i in range(bas, bolum_sonu):
        if sat[i].startswith(birim) and len(sat[i]) <= len(birim) + 3:
            for j in range(i + 1, min(i + 4, bolum_sonu)):
                if sat[j].startswith("MADDE"):
                    if "Mülga" in sat[j]:
                        return ""
                    bas_i = j
                    break
            if bas_i:
                break
    if bas_i is None:
        # Bazı maddelerde ayrı başlık satırı yok; madde metni doğrudan birim adıyla başlar
        # ("MADDE 131- (1) Uluslararası Güvenlik Genel Müdürlüğünün görev ve yetkileri...").
        kok = re.escape(birim.rstrip("."))
        desen = re.compile(rf"^MADDE [\d/A-ZÇĞİÖŞÜ]+\s*[-–—]?\s*\(1\)\s*{kok}(?:nün|nin|nun|ün|in|un)?"
                           r"\s+görev")
        for i in range(bas, bolum_sonu):
            if desen.match(sat[i]):
                bas_i = i
                break
    if bas_i is None:
        return ""
    # PDF'te bir bent birkaç fiziksel satıra bölünüyor; devam satırları toplanmazsa metin
    # cümle ortasında kesilir (ölçüldü: m.99'da bentlerin tamamı yarım çıkıyordu).
    ham_bentler: list[str] = []
    for s in sat[bas_i : bolum_sonu]:
        if s.startswith("MADDE") and s != sat[bas_i]:
            break
        m = _BENT_RE.match(s)
        if m:
            ham_bentler.append(m.group(2))
        elif ham_bentler and not re.match(r"^\(\d+\)", s):
            ham_bentler[-1] += " " + s

    parcalar: list[str] = []
    for ham in ham_bentler:
        # Anayasa Mahkemesince iptal edilen bentler yürürlükte değildir.
        if "İptal bent" in ham or "Mülga" in ham:
            continue
        govde = _DEGISIKLIK_RE.sub("", ham).strip()
        govde = _DIPNOT_NO_RE.sub("", govde).strip().rstrip(",").strip()
        govde = re.sub(r"\s+", " ", govde)
        if not govde or re.match(r"^(Bakan|Genel Müdürlükçe|Başkanlıkça) tarafından", govde):
            continue
        if "verilen diğer görevleri yapmak" in govde or "verilecek benzeri görevleri" in govde:
            continue
        parcalar.append(govde[0].upper() + govde[1:])
    metin = "; ".join(parcalar)
    if len(metin) > 550:
        kes = metin[:550].rsplit(";", 1)[0]
        metin = kes
    return (metin + ".") if metin and not metin.endswith(".") else metin


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--madde", type=int, required=True, help="hizmet birimleri madde no")
    a.add_argument("--slug", required=True, help="data/teskilat altındaki kurum dizini")
    a.add_argument("--kaynak", default="", help="çıkarılmış CBK metni (varsayılan: scratchpad)")
    a.add_argument("--yaz", action="store_true", help="dosyaya yaz (yoksa yalnız göster)")
    args = a.parse_args()

    yol = Path(args.kaynak) if args.kaynak else Path(
        "C:/Users/cemmo/AppData/Local/Temp/claude/"
        "c--Users-cemmo-Desktop-kamu-evrak/aea5191c-64da-4606-990a-f49ef8f0299e/scratchpad/cbk1.txt"
    )
    sat = _metin_yukle(yol)
    bas = _madde_indeksi(sat, args.madde)
    son = _bolum_sonu(sat, bas)
    birimler = birimleri_cikar(sat, args.madde)

    satirlar: list[str] = []
    eksik: list[str] = []
    for b in birimler:
        g = gorev_cikar(sat, b, son, bas)
        if not g:
            # Birim m.<madde>/1 listesinde SAYILI; yalnız görevleri ayrı maddede
            # düzenlenmemiş. Dosyadan düşürmek kaynakta var olan bir birimi kaybetmek olur.
            eksik.append(b)
            g = (
                f"1 sayılı Cumhurbaşkanlığı Kararnamesi m.{args.madde}/1 uyarınca Bakanlığın "
                "hizmet birimidir; görev ve yetkileri anılan Kararnamede ayrı bir maddeyle "
                "düzenlenmemiştir."
            )
        satirlar.append(f"BİRİM: {b}\nGÖREV: {g}\n")

    print(f"m.{args.madde}: {len(birimler)} birim bulundu, {len(satirlar)} tanesinin görevi çıkarıldı")
    for b in birimler:
        print(("  ✓ " if b not in eksik else "  ✗ ") + b)
    if eksik:
        print(f"\nGÖREV MADDESİ BULUNAMADI ({len(eksik)}) — elle bakılmalı")

    if args.yaz:
        hedef = _TESKILAT_DIR / args.slug / "birimler.txt"
        eski = hedef.read_text(encoding="utf-8") if hedef.exists() else ""
        alias = next((s for s in eski.splitlines() if s.startswith("@ALIAS:")), "")
        kurum = next((s for s in eski.splitlines() if s.startswith("@KURUM:")), "@KURUM: ?")
        kunye = [
            kurum,
            f"@BELGE: {_BELGE}, m.{args.madde} ve devamı",
            f"@KAYNAK_KIMLIK: {_KAYNAK_URL}",
            "@ERISIM: 2026-07-26",
            "@KAYNAK_TURU: resmi_teskilat",
            "@DOGRULAMA: resmi",
        ]
        if alias:
            kunye.append(alias)
        kunye.append(
            f"@NOT: Birim adları m.{args.madde}/1 bentlerinden, görev metinleri her birimin kendi "
            "maddesinden BİREBİR alınmıştır (scripts/cbk_bakanlik_cikar.py). Mülga bentler ve "
            "mülga görev maddeleri listeye alınmamıştır. Bakanlığa bağlı ayrı tüzel kişilikler "
            "bu dosyada YER ALMAZ; onlar 4 sayılı Kararnameye dayanan ayrı dosyalarda ele "
            "alınır."
        )
        hedef.write_text("\n".join(kunye) + "\n\n" + "\n".join(satirlar), encoding="utf-8")
        print(f"\nyazıldı -> {hedef.relative_to(_KOK)}")


if __name__ == "__main__":
    main()
