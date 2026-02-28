const test = require("node:test");
const assert = require("node:assert/strict");

const { stackedLaneValues } = require("../lib/status-lanes");

test("codex stacked lanes use primary session then secondary weekly", () => {
  const lanes = stackedLaneValues({
    provider: "codex",
    session: 21,
    weekly: 67,
  });
  assert.deepEqual(lanes, { top: 21, bottom: 67 });
});

test("claude stacked lanes use primary 5h session then secondary 7d", () => {
  const lanes = stackedLaneValues({
    provider: "claude",
    session: 33,
    weekly: 72,
  });
  assert.deepEqual(lanes, { top: 33, bottom: 72 });
});

test("gemini stacked lanes remain pro then flash", () => {
  const lanes = stackedLaneValues({
    provider: "gemini",
    proUsed: 48,
    flashUsed: 60,
  });
  assert.deepEqual(lanes, { top: 48, bottom: 60 });
});
