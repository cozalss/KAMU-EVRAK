"""demo_kota: günlük belge kotasının KALICI sayacı (gün × anahtar)

Revision ID: 0007_demo_kota
Revises: 0006_demo_harcama
Create Date: 2026-08-09

NEDEN (ölçülen davranış): kota sayacı `core/demo_kota._SAYAC` süreç-içi bir sözlüktü.
Render ücretsiz web servisi 15 dakika hareketsizlikte UYUR ve sonraki istekte taze bir
süreçle uyanır; her redeploy/restart da aynı sonucu verir. Sözlük her uyanışta boştu,
yani "günde 3 belge" fiilen "UYANIŞ BAŞINA 3 belge" idi — siteyi 20 dakika bekletip
dönen ziyaretçi sınırsız hak alıyordu. 0006 aynı sorunu PARA için çözmüştü; bu tablo
KOTA için çözer.

`anahtar` üç eksenden biridir ve hepsi SUNUCU üretimidir:
    "k:<kullanıcı id>"   oturum açmış kullanıcı (JWT `sub`, imza doğrulanmış)
    "z:<ziyaretçi id>"   imzalı çerez
    "ag:<ağ öneki>"      IPv4 /24 · IPv6 /64

`gun` = UTC epoch günü (`core/gun_indeksi.bugun_indeksi()`), tarih değil — 0006 ile aynı
büyüklük, iki katman arasında dönüşüm hatası riski kalmasın diye.

Satırlar kısa ömürlüdür: `core/demo_kota_kalici.eski_gunleri_temizle` açılışta geçmiş
günleri siler. Tablo yalnız BUGÜNÜN kararını verir, bir kullanım geçmişi değildir.
"""
from __future__ import annotations

from alembic import op

revision = "0007_demo_kota"
down_revision = "0006_demo_harcama"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS demo_kota (
            gun          INTEGER      NOT NULL,
            anahtar      TEXT         NOT NULL,
            sayac        INTEGER      NOT NULL DEFAULT 0,
            guncelleme   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            PRIMARY KEY (gun, anahtar)
        );
    """)
    # Gün süpürmesi (DELETE ... WHERE gun < :esik) tablo taraması yapmasın.
    op.execute("CREATE INDEX IF NOT EXISTS ix_demo_kota_gun ON demo_kota (gun);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_demo_kota_gun;")
    op.execute("DROP TABLE IF EXISTS demo_kota;")
