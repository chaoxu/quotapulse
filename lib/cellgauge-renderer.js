const { execFileSync } = require("node:child_process");

const STYLE_ALIASES = {
  ghb: "ghb",
  gfb: "gfb",
  nhb: "nhb",
  nfb: "nfb",
  ghn: "ghn",
  gfn: "gfn",
  nhn: "nhn",
  nfn: "nfn",

  // Legacy aliases
  legacy: "ghb",
  gap: "ghb",
  sh: "nhb",
  sf: "nfb",
  gf: "gfb",
  "shared-h": "nhb",
  sharedh: "nhb",
  h: "nhb",
  "shared-full": "nfb",
  sharedfull: "nfb",
  full: "nfb",
  block: "nfb",
  "gap-full": "gfb",
  gapfull: "gfb",

  // Descriptive aliases
  border: "ghb",
  "no-border": "ghn",
  noborder: "ghn",
  "gap-border": "ghb",
  "gap-no-border": "ghn",
  "gap-noborder": "ghn",
  "gap-nb": "ghn",
  "gap-full-border": "gfb",
  "gap-full-no-border": "gfn",
  "gap-full-noborder": "gfn",
  "gap-full-nb": "gfn",
  nogap: "nhb",
  "no-gap": "nhb",
  "nogap-border": "nhb",
  "no-gap-border": "nhb",
  "nogap-no-border": "nhn",
  "no-gap-no-border": "nhn",
  "nogap-noborder": "nhn",
  "no-gap-noborder": "nhn",
  "nogap-nb": "nhn",
  "no-gap-nb": "nhn",
  "nogap-full": "nfb",
  "no-gap-full": "nfb",
  "nogap-full-border": "nfb",
  "no-gap-full-border": "nfb",
  "nogap-full-no-border": "nfn",
  "no-gap-full-no-border": "nfn",
  "nogap-full-noborder": "nfn",
  "no-gap-full-noborder": "nfn",
  "nogap-full-nb": "nfn",
  "no-gap-full-nb": "nfn",
};

function normalizeBarStyle(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "ghb";
  return STYLE_ALIASES[key] || "ghb";
}

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function defaultRunCellGauge(args) {
  return execFileSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function renderStackedDualBar(topPct, bottomPct, widthCells, options = {}) {
  const styleId = normalizeBarStyle(options.barStyle ?? process.env.OU_BAR_STYLE);
  const safeWidth = Math.max(1, Math.trunc(widthCells || 6));
  const scriptPath = options.scriptPath || require.resolve("cellgauge/bin/cellgauge.js");

  const args = [
    scriptPath,
    String(clampPercent(topPct)),
    String(clampPercent(bottomPct)),
    "--width",
    String(safeWidth),
  ];

  if (styleId[0] === "g") args.push("--gapped");
  if (styleId[1] === "f") args.push("--full");
  args.push(styleId[2] === "b" ? "--border" : "--no-border");

  const runner = typeof options.runCellGauge === "function"
    ? options.runCellGauge
    : defaultRunCellGauge;
  const raw = runner(args);
  return String(raw).replace(/[\r\n]+$/, "");
}

module.exports = {
  normalizeBarStyle,
  renderStackedDualBar,
};
