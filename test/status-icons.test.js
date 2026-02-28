const test = require("node:test");
const assert = require("node:assert/strict");

const { getStatusIcons, resolveUseNf } = require("../lib/status-icons");

test("status mode defaults to glyph icons", () => {
  const useNf = resolveUseNf({
    args: ["--status"],
    asStatus: true,
    env: {},
  });
  assert.equal(useNf, true);
});

test("non-status mode defaults to ascii icons", () => {
  const useNf = resolveUseNf({
    args: [],
    asStatus: false,
    env: {},
  });
  assert.equal(useNf, false);
});

test("status mode can be forced to ascii with --no-nf", () => {
  const useNf = resolveUseNf({
    args: ["--status", "--no-nf"],
    asStatus: true,
    env: {},
  });
  assert.equal(useNf, false);
});

test("status mode respects OU_STATUS_GLYPHS=0", () => {
  const useNf = resolveUseNf({
    args: ["--status"],
    asStatus: true,
    env: { OU_STATUS_GLYPHS: "0" },
  });
  assert.equal(useNf, false);
});

test("glyph icon set includes non-ascii provider icons", () => {
  const icons = getStatusIcons(true, {});
  assert.notEqual(icons.codex, "Cx");
  assert.notEqual(icons.claude, "Cl");
  assert.notEqual(icons.gemini, "Gm");
});
