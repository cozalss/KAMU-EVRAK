"""Demo kapısı KAPSAM testi — "boşluk kalmasın" garantisini sağlayan mekanizma.

Bu dosyanın varlık sebebi: para koruması "geliştirici her yeni ücretli ucu listeye
eklemeyi HATIRLAR" varsayımına dayanamaz. Test uygulamanın gerçek route tablosunu gezer
ve her POST yolunun ya ÜCRETLİ ya SERBEST olarak sınıflandırıldığını doğrular.
Sınıflandırılmamış yeni bir uç eklendiğinde CI KIRILIR ve mesaj ne yapılacağını söyler.

İkinci test, ölçüm boğaz noktasını korur: LLM istemcisi `agents/llm.py` DIŞINDA
kurulursa harcama muhasebesini atlar.
"""

from __future__ import annotations

import re
from pathlib import Path

import main
from api.middleware.demo_kapisi import SERBEST_YOLLAR, UCRETLI_YOLLAR

BACKEND = Path(__file__).resolve().parents[1]


def _post_yollari() -> set[str]:
    """Uygulamanın gerçek POST yolları — OpenAPI şemasından.

    `app.routes` KULLANILMAZ: bu FastAPI sürümünde include_router edilen yollar
    `_IncludedRouter` sarmalayıcısında durur ve düzleşmez (ölçüldü: app.routes 15 giriş
    döndürüyor, POST sayısı 0). OpenAPI şeması sürümden bağımsız ve gerçek yüzeydir.
    """
    sema = main.app.openapi()
    return {yol for yol, islemler in (sema.get("paths") or {}).items() if "post" in islemler}


class TestKapsam:
    def test_her_POST_yolu_siniflandirilmis(self):
        # Arrange
        yollar = _post_yollari()
        assert yollar, "route tablosu boş — test kendini doğrulayamıyor"
        # Act
        siniflanmamis = sorted(y for y in yollar
                               if y not in UCRETLI_YOLLAR and y not in SERBEST_YOLLAR)
        # Assert
        assert not siniflanmamis, (
            "Şu POST uçları demo kapısında SINIFLANDIRILMAMIŞ:\n  "
            + "\n  ".join(siniflanmamis)
            + "\n\nYeni bir uç eklediyseniz api/middleware/demo_kapisi.py içinde "
              "UCRETLI_YOLLAR (LLM/bulut-OCR harcıyorsa) ya da SERBEST_YOLLAR "
              "(deterministik veya auth'lu ise) kümesine ekleyin. "
              "Sınıflandırmamak, halka açık demoda ölçülmeyen para harcaması demektir."
        )

    def test_iki_kume_KESISMEZ(self):
        assert not (UCRETLI_YOLLAR & SERBEST_YOLLAR)

    def test_listelenen_ucretli_yollar_GERCEKTEN_var(self):
        """Yeniden adlandırılmış/silinmiş bir uç listede ölü kayıt bırakmasın."""
        # Arrange
        yollar = _post_yollari()
        # Act
        hayalet = sorted(y for y in UCRETLI_YOLLAR if y not in yollar)
        # Assert
        assert not hayalet, f"UCRETLI_YOLLAR'da artık var olmayan yollar: {hayalet}"

    def test_bilinen_pahali_uclar_UCRETLI_listede(self):
        """Regresyon çıpası — bu dördü listeden düşerse demo parasız korunur."""
        for yol in ("/process_doc/stream", "/process_doc", "/multimodal/ocr", "/yazi/taslak"):
            assert yol in UCRETLI_YOLLAR


class TestOlcumBogazNoktasi:
    def test_LLM_istemcisi_agents_llm_DISINDA_kurulmuyor(self):
        """`get_llm()` tek giriş kapısı olmalı — aksi hâlde harcama ölçülmeden akar."""
        # Arrange
        desen = re.compile(r"\b(OpenAIClient|LlamaCppClient|LlamaCppServerClient)\s*\(")
        muaf = {
            BACKEND / "agents" / "llm.py",          # istemcilerin TANIMLANDIĞI yer
            BACKEND / "agents" / "llm_mock.py",
        }
        ihlal: list[str] = []
        # Act
        for yol in BACKEND.rglob("*.py"):
            if ".venv" in yol.parts or yol.parent.name == "tests" or yol in muaf:
                continue
            try:
                metin = yol.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            for no, satir in enumerate(metin.splitlines(), 1):
                if desen.search(satir) and "isinstance" not in satir:
                    ihlal.append(f"{yol.relative_to(BACKEND)}:{no}")
        # Assert
        assert not ihlal, (
            "LLM istemcisi agents/llm.py dışında doğrudan kuruluyor — bu yol harcama "
            "ölçümünü ATLAR:\n  " + "\n  ".join(ihlal)
            + "\n\nBunun yerine get_llm() / get_llm_for_model() kullanın."
        )
