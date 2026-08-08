"""Genel amaçlı harcama defteri — ekle-yalnız, fail-closed, rezervasyonlu.

`core/kaynak_web_arama.py`'deki ÖLÇÜLMÜŞ deseni sınıfa taşır. O modül REFACTOR EDİLMEDİ,
bilinçli olarak yerinde bırakıldı:

· Testleri (tests/test_kaynak_web_arama.py) denetimde ÖLÇÜLEN bulguları kodluyor —
  20 iş parçacığında %96,5 para kaybı, tavana 0,0005 USD kala geçen 50/50 eşzamanlı
  kontrol, tek bozuk satırın sayacı sıfırlaması. Bu garantileri yeniden riske atmanın
  işlevsel getirisi yok.
· O modül özelliğe KAYNAKLI: `acik_mi()` içinde KESIF_OPENAI_API_KEY kontrolü, KESIF_*
  ortam adları, web-arama'ya özgü fiyat sabitleri.
· Hata sözleşmeleri TERS: onun "kapalı"sı *sessizce ücretsiz katmana düş*; demonun
  "kapalı"sı *isteği 402 ile reddet*. Tek soyutlamada birleştirmek birini bozar.

Sonuç: İKİ AYRI DEFTER = İKİ AYRI BÜTÇE. Günlük en kötü hâl ikisinin TOPLAMIDIR.

Bu sınıfın `kaynak_web_arama`'dan farkı: satırlarda `gun` alanı vardır ve `gunluk=True`
iken toplam YALNIZ bugünün satırlarından hesaplanır — böylece tavan her gün yenilenir.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import structlog

from core.gun_indeksi import bugun_indeksi

log = structlog.get_logger()


@dataclass(frozen=True)
class DefterAyari:
    """Bir defterin kimliği ve davranışı."""

    ad: str            # log etiketi ("demo")
    dosya: Path        # ekle-yalnız JSONL yolu
    tavan_env: str     # tavanı okuyan ortam değişkeni adı
    gunluk: bool = True  # True → toplam yalnız BUGÜNÜN satırlarından


@dataclass
class ButceDefteri:
    """Ekle-yalnız harcama defteri + rezervasyon. Tüm okuma yolları FAIL-CLOSED."""

    ayar: DefterAyari
    _kilit: threading.RLock = field(default_factory=threading.RLock, repr=False)
    _yazilamiyor: bool = field(default=False, repr=False)
    # Bu süreçte BUGÜN yazılan toplam — defter dosyası silinse bile tavanı geri açtırmaz.
    _surecte_harcanan: float = field(default=0.0, repr=False)
    _surec_gunu: int = field(default=-1, repr=False)

    # ------------------------------------------------------------------ tavan
    def azami_harcama(self) -> float:
        """Tavan (USD). Tanımsız/bozuk/negatif → 0.0 → defter KAPALI.

        Türkçe ondalık virgül (`"0,50"`) en olası operatör hatasıdır ve `float()` onu
        ValueError yapar → tavan 0 → katman kapanır. Sessiz "sanırım 50 dolar demek
        istedi" yorumu yapılmaz; kapalı kalmak, yanlış yorumdan güvenlidir. Hata log'a
        yazılır ki açılış banner'ında görülsün.
        """
        ham = (os.getenv(self.ayar.tavan_env) or "0").strip()
        try:
            return max(0.0, float(ham))
        except ValueError:
            log.error(f"{self.ayar.ad}.tavan_okunamadi", env=self.ayar.tavan_env, ham=ham[:20])
            return 0.0

    # --------------------------------------------------------------- harcanan
    def harcanan(self) -> float:
        """Defterdeki (bugünkü) toplam. FAIL-CLOSED.

        · Dosya yok → süreç-içi yüksek su seviyesi (ilk çalıştırma meşru).
        · Okunamıyor → `inf` (katman kapanır).
        · Herhangi bir satır bozuk → `inf`. Bozuk satır = KAYBOLMUŞ harcama kaydı;
          ne kadar harcandığını bilmiyorsak "harcanmadı" varsayamayız.
        · `gunluk=True` iken `gun` alanı eksik/bozuk olan satır da BOZUK sayılır —
          "herhalde bugündür" ya da "herhalde dündür" varsayımı tavanı sessizce açardı.
        """
        bugun = bugun_indeksi()
        try:
            ham = self.ayar.dosya.read_text(encoding="utf-8")
        except FileNotFoundError:
            return self._surec_ici_taban(bugun)
        except OSError as exc:
            log.error(f"{self.ayar.ad}.defter_okunamadi", hata=str(exc))
            return float("inf")

        toplam = 0.0
        for satir in ham.splitlines():
            satir = satir.strip()
            if not satir:
                continue
            try:
                kayit = json.loads(satir)
                tutar = float(kayit["usd"])
                if self.ayar.gunluk and int(kayit["gun"]) != bugun:
                    continue
                toplam += tutar
            except (ValueError, KeyError, TypeError):
                log.error(f"{self.ayar.ad}.defter_bozuk", satir=satir[:80])
                return float("inf")
        return max(toplam, self._surec_ici_taban(bugun))

    def _surec_ici_taban(self, bugun: int) -> float:
        """Bugüne ait süreç-içi yüksek su seviyesi (gün dönünce sıfırlanır)."""
        with self._kilit:
            if self._surec_gunu != bugun:
                return 0.0
            return self._surecte_harcanan

    # ------------------------------------------------------------------ yazma
    def deftere_ekle(self, tutar: float) -> bool:
        """Tek satır EKLE (üzerine yazma yok). Yazılamazsa defteri kalıcı olarak kapat.

        Kilit ZORUNLU (ölçüldü): Windows'ta aynı dosyayı çok iş parçacığıyla paralel
        açmak paylaşım ihlali veriyor ve yazımların büyük kısmı düşüyordu.
        """
        bugun = bugun_indeksi()
        satir = json.dumps(
            {"usd": round(tutar, 6), "gun": bugun, "ts": int(time.time()),
             "pid": os.getpid(), "id": uuid.uuid4().hex[:8]},
            ensure_ascii=False,
        ) + "\n"
        with self._kilit:
            try:
                self.ayar.dosya.parent.mkdir(parents=True, exist_ok=True)
                with open(self.ayar.dosya, "a", encoding="utf-8", newline="\n") as f:
                    f.write(satir)
                    f.flush()
                    os.fsync(f.fileno())
            except OSError as exc:
                self._yazilamiyor = True
                log.error(f"{self.ayar.ad}.defter_yazilamadi_kapandi", hata=str(exc))
                return False
            if self._surec_gunu != bugun:
                self._surec_gunu = bugun
                self._surecte_harcanan = 0.0
            self._surecte_harcanan = max(0.0, self._surecte_harcanan + tutar)
        return True

    # ------------------------------------------------------------------ durum
    def acik_mi(self) -> bool:
        """Defter sağlam ve tavan aşılmamış mı?"""
        if self._yazilamiyor:
            return False
        return self.harcanan() < self.azami_harcama()

    def rezerve_et(self, tutar: float) -> bool:
        """Tavanı kontrol et VE parayı önceden düş — TEK kritik bölge (TOCTOU kapalı).

        `kaynak_web_arama._rezerve_et`'ten BİLİNÇLİ FARK: orası yalnız `acik_mi()`
        sorar, yani tavana 0,001 USD kala bile tam rezervasyon yazılır ve tavan bir
        rezervasyon kadar AŞILIR (ölçüldü: tavan 0,10 · rezervasyon 0,01 → 11 geçiş).
        Burada rezervasyonun SIĞDIĞI da aranır: `harcanan + tutar <= tavan`.

        Bedeli, günün son kırıntısının kullanılmaması. Karşılığı, "günlük harcama tavanı
        AŞMAZ" diyebilmek — halka açık bir demoda tam olarak istenen taraf.
        """
        if tutar <= 0:
            return True
        with self._kilit:
            if self._yazilamiyor:
                return False
            if self.harcanan() + tutar > self.azami_harcama():
                return False
            return self.deftere_ekle(tutar)

    def kalan(self) -> float:
        """Bugün kalan bütçe (USD). Negatif olmaz."""
        return max(0.0, self.azami_harcama() - self.harcanan())

    def tabani_tohumla(self, gun: int, toplam: float) -> None:
        """Süreç-içi yüksek su seviyesini DIŞ bir kaynaktan (kalıcı DB) yükselt.

        YALNIZ YÜKSELTİR. Dış kaynak düşük bir değer bildirirse yok sayılır — aksi hâlde
        bayat/yarışan bir okuma, bu süreçte zaten yazılmış harcamayı unutturup tavanı
        sessizce geri açardı.
        """
        with self._kilit:
            if self._surec_gunu != gun:
                self._surec_gunu = gun
                self._surecte_harcanan = 0.0
            self._surecte_harcanan = max(self._surecte_harcanan, max(0.0, toplam))

    # ------------------------------------------------------------------- test
    def sifirla_test_icin(self) -> None:
        """YALNIZ test/bakım — süreç-içi durumu sıfırla (dosyaya dokunmaz)."""
        with self._kilit:
            self._yazilamiyor = False
            self._surecte_harcanan = 0.0
            self._surec_gunu = -1


__all__ = ("ButceDefteri", "DefterAyari")
