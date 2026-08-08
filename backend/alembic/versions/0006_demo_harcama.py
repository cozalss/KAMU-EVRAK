"""demo_harcama: günlük demo harcamasının KALICI toplamı (tek satır/gün)

Revision ID: 0006_demo_harcama
Revises: 0005_alt_talep_uniq_fk_idx
Create Date: 2026-08-08

NEDEN: halka açık demo Render'ın ÜCRETSİZ katmanında koşacak ve orada kalıcı disk YOK —
Render dokümanı dosya sisteminin "redeploy, restart veya spin-down'da kaybolduğunu"
söylüyor. `data/demo_harcama.json` defteri her yeniden başlatmada sıfırlanır ve günlük
para tavanı YENİDEN AÇILIR: tavan "günlük 0,50 USD" olmaktan çıkıp "konteyner ömrü
başına 0,50 USD" olur.

Kalıcı olması gereken tek şey BİR SAYIDIR: bugün ne kadar harcandı. Bu tablo onu tutar.
Dosya defteri BİRİNCİL kalır (hızlı, istek başına, fail-closed); bu tablo yalnız
DAYANIKLILIK katmanıdır — açılışta okunur, istek sonunda (belge başına bir kez, LLM
çağrısı başına DEĞİL) yazılır.

`gun` = UTC epoch günü (`core/gun_indeksi.bugun_indeksi()`), tarih değil: gün indeksi
süreç içinde geri gitmeyecek şekilde korunuyor ve aynı büyüklüğü saklamak iki katman
arasında dönüşüm hatası riskini kaldırır.
"""
from __future__ import annotations

from alembic import op

revision = "0006_demo_harcama"
down_revision = "0005_alt_talep_uniq_fk_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS demo_harcama (
            gun          INTEGER      PRIMARY KEY,
            toplam_usd   NUMERIC(12,6) NOT NULL DEFAULT 0,
            guncelleme   TIMESTAMPTZ   NOT NULL DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS demo_harcama;")
