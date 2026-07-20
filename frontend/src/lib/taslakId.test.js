/* taslakId regresyon testleri — `node --test src/lib/taslakId.test.js`.
   Bug avı bulgusu (2026-07-17): önbellekten hidre oturum taslakları db-taslak- önekiyle
   SENTETİK id taşıyordu; önek kalıntısı DB islem id'si sanılınca PATCH/DELETE yanlış uca
   gidiyor, silinen taslak refresh'te diriliyordu. Bu testler o sözleşmeyi sabitler. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SENTETIK_ID, islemIdCoz } from "./taslakId.js";

const UUID = "3f2b8a10-9c4d-4e21-b7aa-0d5f6e7a8b9c";

test("db-taslak-<uuid>: önek kalıntısı DB islem id'sidir", () => {
  assert.equal(islemIdCoz(`db-taslak-${UUID}`, null), UUID);
});

test("db-taslak-<sentetik>: result.islem_id varsa O kullanılır (önek kalıntısı değil)", () => {
  const draft = { result: { islem_id: UUID } };
  assert.equal(islemIdCoz("db-taslak-1752762000000-0-dilekce.pdf", draft), UUID);
});

test("db-taslak-<sentetik> + islem_id yok: null (yanlış uca istek atılmaz)", () => {
  assert.equal(islemIdCoz("db-taslak-1752762000000-3-fatura.pdf", { result: {} }), null);
});

test("öneksiz oturum id'si: yalnız result.islem_id'den çözülür", () => {
  assert.equal(islemIdCoz("T-1752762000000-evrak", { result: { islem_id: UUID } }), UUID);
  assert.equal(islemIdCoz("T-1752762000000-evrak", { result: {} }), null);
});

test("SENTETIK_ID deseni: epoch-sıra-ad yakalar, UUID'yi yakalamaz", () => {
  assert.ok(SENTETIK_ID.test("1752762000000-0-dilekce.pdf"));
  assert.ok(!SENTETIK_ID.test(UUID));
});
