"""Multimodal modülü — OCR (belge fotoğrafı/PDF/Word → metin).

kamu-evrak: yalnız OCR portlandı (STT/TTS gerekmiyor — şartname evrak okuma/yazışma).
ADALET'teki eager `.stt`/`.tts` importları KALDIRILDI (modüller yok → boot hatası önlendi).
"""

from .ocr import OCRResult, extract_text

__all__ = ("OCRResult", "extract_text")
