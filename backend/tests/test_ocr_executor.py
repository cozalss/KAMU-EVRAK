"""OCR dedicated thread-pool testleri (regresyon).

asyncio.to_thread PAYLAŞIMLI varsayılan executor'ı kullanır — takılan bir OCR işi (timeout
alttaki thread'i durduramaz, yalnız await'i iptal eder) tüm uygulamanın diğer to_thread
çağrılarını açlığa düşürebiliyordu. _to_ocr_thread ayrılmış, SINIRLI bir havuza yönlendirir.
"""
from __future__ import annotations

import concurrent.futures
import threading

from multimodal import ocr as ocr_mod


def test_ocr_executor_ayri_ve_sinirli_havuz():
    # Ayrılmış, boyutu belirli bir ThreadPoolExecutor — paylaşımlı varsayılan DEĞİL.
    assert isinstance(ocr_mod._ocr_executor, concurrent.futures.ThreadPoolExecutor)
    assert ocr_mod._ocr_executor._max_workers == ocr_mod._OCR_MAX_WORKERS
    assert ocr_mod._OCR_MAX_WORKERS > 0


async def test_to_ocr_thread_ocr_havuzunda_calisir():
    # _to_ocr_thread ile çalıştırılan fonksiyon gerçekten "ocr-worker" adlı thread'te koşar
    # (varsayılan asyncio executor'ının ThreadPoolExecutor-0 adlandırmasında DEĞİL).
    def _mevcut_thread_adi():
        return threading.current_thread().name

    ad = await ocr_mod._to_ocr_thread(_mevcut_thread_adi)
    assert ad.startswith("ocr-worker")
