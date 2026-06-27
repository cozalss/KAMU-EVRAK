"""Saklama-süresi imha job'u (Faz 8). VARSAYILAN dry-run (yalnız rapor; HİÇBİR ŞEY silmez).

  uv run python -m db.imha_job              # dry-run: süresi dolanları listele
  uv run python -m db.imha_job --uygula     # anonimleştir (içerik sil, denetim izi korunur)
  uv run python -m db.imha_job --uygula --sil  # tam imha (cascade; geri alınamaz)

Periyodik çalıştırma (cron/Supabase scheduled) için tasarlandı. KVKK md.7 / 3473 s.K.
"""
from __future__ import annotations

import asyncio
import sys

from db.repositories.imha_repo import imha_uygula, suresi_dolmus
from db.session import engine, session_factory


async def main() -> int:
    uygula = "--uygula" in sys.argv
    yontem = "sil" if "--sil" in sys.argv else "anonimlestir"
    async with session_factory() as s:
        dolmus = await suresi_dolmus(s)
        print(f"Saklama süresi dolan evrak: {len(dolmus)}")
        for d in dolmus:
            print(f"  {d['evrak_no']:20} tür={d['tur']:14} "
                  f"saklama={d['saklama_yil']}yıl  son={d['son_tarih'].date()}")
        if not dolmus:
            print("İmha edilecek evrak yok.")
        elif not uygula:
            print("\n[DRY-RUN] Hiçbir şey silinmedi. Uygulamak için: --uygula [--sil]")
        else:
            ozet = await imha_uygula(s, yontem=yontem)
            print(f"\n✅ {ozet['imha_edilen']} evrak '{yontem}' ile imha edildi.")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
