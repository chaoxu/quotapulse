const test = require("node:test");
const assert = require("node:assert/strict");

const { renderStackedDualBar } = require("../lib/cellgauge-renderer");

test("renderStackedDualBar maps style aliases to cellgauge flags", () => {
  let capturedArgs = null;
  const out = renderStackedDualBar(80, 20, 6, {
    barStyle: "gap-full-no-border",
    scriptPath: "/tmp/cellgauge.js",
    runCellGauge: (args) => {
      capturedArgs = args;
      return "glyphs\n";
    },
  });

  assert.equal(out, "glyphs");
  assert.deepEqual(capturedArgs, [
    "/tmp/cellgauge.js",
    "80",
    "20",
    "--width",
    "6",
    "--gapped",
    "--full",
    "--no-border",
  ]);
});

test("renderStackedDualBar falls back to bordered gap-height style", () => {
  let capturedArgs = null;
  renderStackedDualBar(-10, 150, 0, {
    barStyle: "unknown-style",
    scriptPath: "/tmp/cellgauge.js",
    runCellGauge: (args) => {
      capturedArgs = args;
      return "x\n";
    },
  });

  assert.deepEqual(capturedArgs, [
    "/tmp/cellgauge.js",
    "0",
    "100",
    "--width",
    "6",
    "--gapped",
    "--border",
  ]);
});

test("renderStackedDualBar defaults to gapped with border", () => {
  let capturedArgs = null;
  const prev = process.env.OU_BAR_STYLE;
  delete process.env.OU_BAR_STYLE;
  try {
    renderStackedDualBar(50, 25, 4, {
      scriptPath: "/tmp/cellgauge.js",
      runCellGauge: (args) => {
        capturedArgs = args;
        return "bar\n";
      },
    });
  } finally {
    if (prev === undefined) delete process.env.OU_BAR_STYLE;
    else process.env.OU_BAR_STYLE = prev;
  }

  assert.deepEqual(capturedArgs, [
    "/tmp/cellgauge.js",
    "50",
    "25",
    "--width",
    "4",
    "--gapped",
    "--border",
  ]);
});
