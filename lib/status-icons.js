function envToBool(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function resolveUseNf({ args, asStatus, env = process.env }) {
  const wantsAscii = args.includes("--no-nf") || args.includes("--status-ascii");
  if (wantsAscii) return false;
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

  const fromEnv = (name, fallback) => {
    const value = env[name];
    if (!value || !value.trim()) return fallback;
    return value.trim();
  };

  return {
    codex: fromEnv("OU_ICON_CODEX", "\u{f1af1}"),
    claude: fromEnv("OU_ICON_CLAUDE", "\u{f1af2}"),
    gemini: fromEnv("OU_ICON_GEMINI", "\u{f1af3}"),
    error: fromEnv("OU_ICON_ERROR", "\u{f06a}"),
  };
}

module.exports = {
  getStatusIcons,
  resolveUseNf,
};
