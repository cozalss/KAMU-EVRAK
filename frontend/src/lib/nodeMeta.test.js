import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PIPELINE_NODE_IDS,
  PIPELINE_PHASES,
  nodeDurationMs,
  phaseForNode,
} from "./pipelinePhases.js";

test("tüm varsayılan düğümler dört resmî işlem fazından birine bağlıdır", () => {
  assert.equal(PIPELINE_PHASES.length, 4);
  const fazlar = new Set(PIPELINE_PHASES.map((faz) => faz.id));
  for (const id of DEFAULT_PIPELINE_NODE_IDS) assert.ok(fazlar.has(phaseForNode(id)), id);
});

test("sunucu süresi istemci tahmininden önceliklidir", () => {
  assert.equal(nodeDurationMs({ durationMs: 1234, t0: 10, t1: 9999 }), 1234);
  assert.equal(nodeDurationMs({ durationMs: null, t0: 10, t1: 510 }), 500);
  assert.equal(nodeDurationMs({ durationMs: null, t0: null, t1: null }), null);
});
