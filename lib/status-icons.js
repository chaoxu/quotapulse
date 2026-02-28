function iconFromHex(hex, fallback) {
  if (!hex || typeof hex !== "string") return fallback;
  const trimmed = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(trimmed)) return fallback;
  try {
    return String.fromCodePoint(parseInt(trimmed, 16));
  } catch {
    return fallback;
  }
}

function envToBool(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function resolveUseNf({ args, asStatus, env = process.env }) {
  const wantsGlyph = args.includes("--nf") || args.includes("--nerdfont") || args.includes("--status-nf");
  const wantsAscii = args.includes("--no-nf") || args.includes("--status-ascii");
  if (wantsAscii) return false;
  if (wantsGlyph) return true;
  if (!asStatus) return false;

  const envChoice = envToBool(env.OU_STATUS_GLYPHS);
  if (envChoice !== null) return envChoice;
  return true;
}

function getStatusIcons(useNf, env = process.env) {
  if (!useNf) {
    return {
      codex: "Cx",
      claude: "Cl",
      gemini: "Gm",
      error: "!",
    };
  }

  const preset = (env.OU_ICON_PRESET || "").trim().toLowerCase();
  if (preset === "quotapulse" || preset === "openusage") {
    return {
      codex: env.OU_ICON_CODEX && env.OU_ICON_CODEX.trim()
        ? env.OU_ICON_CODEX.trim()
        : "\u{e900}",
      claude: env.OU_ICON_CLAUDE && env.OU_ICON_CLAUDE.trim()
        ? env.OU_ICON_CLAUDE.trim()
        : "\u{e901}",
      gemini: env.OU_ICON_GEMINI && env.OU_ICON_GEMINI.trim()
        ? env.OU_ICON_GEMINI.trim()
        : "\u{e902}",
      error: env.OU_ICON_ERROR && env.OU_ICON_ERROR.trim()
        ? env.OU_ICON_ERROR.trim()
        : iconFromHex("f06a", "!"),
    };
  }

  const defaultIcons = {
    codex: iconFromHex("f121", "Cx"), // nf-fa-code
    claude: iconFromHex("ee9c", "Cl"), // nf-fa-brain
    gemini: iconFromHex("f1a0", "Gm"), // nf-fa-google
    error: iconFromHex("f06a", "!"), // nf-fa-exclamation_circle
  };

  const fromEnv = (name, fallback) => {
    const value = env[name];
    if (!value || !value.trim()) return fallback;
    return value.trim();
  };

  return {
    codex: fromEnv("OU_ICON_CODEX", defaultIcons.codex),
    claude: fromEnv("OU_ICON_CLAUDE", defaultIcons.claude),
    gemini: fromEnv("OU_ICON_GEMINI", defaultIcons.gemini),
    error: fromEnv("OU_ICON_ERROR", defaultIcons.error),
  };
}

module.exports = {
  getStatusIcons,
  resolveUseNf,
};
