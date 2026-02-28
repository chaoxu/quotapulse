#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { renderStackedDualBar } = require("../lib/cellgauge-renderer");
const { attachResetDurations, secondsUntilReset } = require("../lib/reset-durations");
const { stackedLaneValues } = require("../lib/status-lanes");
const { getStatusIcons, resolveUseNf } = require("../lib/status-icons");
const { collectSelectedProviders, resolveBarWidth } = require("../lib/status-options");

const TIMEOUT_MS = 12000;

function expandHome(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return inputPath;
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function readJsonIfExists(inputPath) {
  const p = expandHome(inputPath);
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function decodeHexUtf8Maybe(value) {
  if (!value || typeof value !== "string") return null;
  let hex = value.trim();
  if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
  if (!hex || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    return Buffer.from(hex, "hex").toString("utf8");
  } catch {
    return null;
  }
}

function readKeychainJson(serviceName) {
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", serviceName, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    if (!out) return null;
    const trimmed = out.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const decoded = decodeHexUtf8Maybe(trimmed);
      if (!decoded) return null;
      try {
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

async function requestJson(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      body: opts.body,
      signal: controller.signal,
    });
    const text = await resp.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { resp, text, json };
  } finally {
    clearTimeout(timeout);
  }
}

function fmtPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "n/a";
}

function fmtNumber(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

function fmtIso(value) {
  return value && typeof value === "string" ? value : "n/a";
}

function toNumberMaybe(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIsoMaybe(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return null;
}

function codexResetIso(windowObj) {
  if (!windowObj || typeof windowObj !== "object") return null;
  const resetAt = toNumberMaybe(windowObj.reset_at);
  if (resetAt !== null) return toIsoMaybe(resetAt);
  const resetAfterSeconds = toNumberMaybe(windowObj.reset_after_seconds);
  if (resetAfterSeconds !== null) {
    const resetSec = Math.floor(Date.now() / 1000) + resetAfterSeconds;
    return toIsoMaybe(resetSec);
  }
  return null;
}

function pctIntMaybe(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function pctLabel(value) {
  const n = pctIntMaybe(value);
  return n === null ? "?%" : `${n}%`;
}

function shortCountdown(iso) {
  const seconds = secondsUntilReset(iso, Date.now());
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 0 ? "<1m" : `${minutes}m`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(seconds / 86400);
  return `${days}d`;
}

function earliestIso(values) {
  let bestMs = null;
  for (const value of values) {
    if (!value || typeof value !== "string") continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    if (bestMs === null || ms < bestMs) bestMs = ms;
  }
  return bestMs === null ? null : new Date(bestMs).toISOString();
}

function parseJwtPayload(jwt) {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  let base = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (base.length % 4 !== 0) base += "=";
  try {
    const decoded = Buffer.from(base, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isAuthStatus(status) {
  return status === 401 || status === 403;
}

function readFirstStringDeep(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const nested of Object.values(value)) {
    const found = readFirstStringDeep(nested, keys);
    if (found) return found;
  }
  return null;
}

async function getCodexUsage() {
  const codexHome = process.env.CODEX_HOME && process.env.CODEX_HOME.trim() ? process.env.CODEX_HOME.trim() : null;
  const authPaths = codexHome
    ? [path.join(codexHome, "auth.json")]
    : ["~/.config/codex/auth.json", "~/.codex/auth.json"];

  let auth = null;
  for (const p of authPaths) {
    const parsed = readJsonIfExists(p);
    if (parsed && parsed.tokens && parsed.tokens.access_token) {
      auth = parsed;
      break;
    }
  }
  if (!auth) {
    const keychain = readKeychainJson("Codex Auth");
    if (keychain && keychain.tokens && keychain.tokens.access_token) auth = keychain;
  }
  if (!auth || !auth.tokens || !auth.tokens.access_token) {
    throw new Error("not logged in");
  }

  let accessToken = auth.tokens.access_token;
  const accountId = auth.tokens.account_id || null;

  const refresh = async () => {
    if (!auth.tokens.refresh_token) return null;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      refresh_token: auth.tokens.refresh_token,
    }).toString();
    const { resp, json } = await requestJson("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok || !json || !json.access_token) return null;
    auth.tokens.access_token = json.access_token;
    if (json.refresh_token) auth.tokens.refresh_token = json.refresh_token;
    if (json.id_token) auth.tokens.id_token = json.id_token;
    auth.last_refresh = new Date().toISOString();
    return json.access_token;
  };

  const lastRefresh = Date.parse(auth.last_refresh || "");
  const refreshAgeMs = 8 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(lastRefresh) || Date.now() - lastRefresh > refreshAgeMs) {
    const refreshed = await refresh();
    if (refreshed) accessToken = refreshed;
  }

  const usageRequest = async (token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "quotapulse",
    };
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;
    return requestJson("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers,
    });
  };

  let usage = await usageRequest(accessToken);
  if (isAuthStatus(usage.resp.status)) {
    const refreshed = await refresh();
    if (refreshed) {
      accessToken = refreshed;
      usage = await usageRequest(accessToken);
    }
  }

  if (!usage.resp.ok) {
    throw new Error(`usage request failed (HTTP ${usage.resp.status})`);
  }
  if (!usage.json || typeof usage.json !== "object") {
    throw new Error("usage response invalid");
  }

  const data = usage.json;
  const headerSession = toNumberMaybe(usage.resp.headers.get("x-codex-primary-used-percent"));
  const headerWeekly = toNumberMaybe(usage.resp.headers.get("x-codex-secondary-used-percent"));
  const primaryWindow = data.rate_limit?.primary_window;
  const secondaryWindow = data.rate_limit?.secondary_window;
  const reviewWindow = data.code_review_rate_limit?.primary_window;
  const session = headerSession !== null ? headerSession : toNumberMaybe(primaryWindow?.used_percent);
  const weekly = headerWeekly !== null ? headerWeekly : toNumberMaybe(secondaryWindow?.used_percent);
  const reviews = toNumberMaybe(data.code_review_rate_limit?.primary_window?.used_percent);
  const headerCredits = toNumberMaybe(usage.resp.headers.get("x-codex-credits-balance"));
  const bodyCredits = toNumberMaybe(data.credits?.balance);
  const credits = headerCredits !== null ? headerCredits : bodyCredits;
  const sessionReset = codexResetIso(primaryWindow);
  const weeklyReset = codexResetIso(secondaryWindow);
  const reviewsReset = codexResetIso(reviewWindow);

  return {
    provider: "codex",
    plan: data.plan_type || null,
    session: Number.isFinite(session) ? session : null,
    weekly: Number.isFinite(weekly) ? weekly : null,
    reviews: Number.isFinite(reviews) ? reviews : null,
    credits: Number.isFinite(credits) ? credits : null,
    sessionReset,
    weeklyReset,
    reviewsReset,
  };
}

async function getClaudeUsage() {
  let creds = readJsonIfExists("~/.claude/.credentials.json");
  if (!creds || !creds.claudeAiOauth || !creds.claudeAiOauth.accessToken) {
    const keychain = readKeychainJson("Claude Code-credentials");
    if (keychain && keychain.claudeAiOauth && keychain.claudeAiOauth.accessToken) creds = keychain;
  }
  if (!creds || !creds.claudeAiOauth || !creds.claudeAiOauth.accessToken) {
    throw new Error("not logged in");
  }

  const oauth = creds.claudeAiOauth;
  let accessToken = oauth.accessToken;

  const refresh = async () => {
    if (!oauth.refreshToken) return null;
    const { resp, json } = await requestJson("https://platform.claude.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: oauth.refreshToken,
        client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        scope: "user:profile user:inference user:sessions:claude_code user:mcp_servers",
      }),
    });
    if (!resp.ok || !json || !json.access_token) return null;
    oauth.accessToken = json.access_token;
    if (json.refresh_token) oauth.refreshToken = json.refresh_token;
    if (typeof json.expires_in === "number") oauth.expiresAt = Date.now() + json.expires_in * 1000;
    return json.access_token;
  };

  const expiresAt = Number(oauth.expiresAt);
  const refreshBufferMs = 5 * 60 * 1000;
  if (Number.isFinite(expiresAt) && Date.now() + refreshBufferMs >= expiresAt) {
    const refreshed = await refresh();
    if (refreshed) accessToken = refreshed;
  }

  const usageRequest = async (token) =>
    requestJson("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "quotapulse",
      },
    });

  let usage = await usageRequest(accessToken);
  if (isAuthStatus(usage.resp.status)) {
    const refreshed = await refresh();
    if (refreshed) {
      accessToken = refreshed;
      usage = await usageRequest(accessToken);
    }
  }
  if (!usage.resp.ok) {
    throw new Error(`usage request failed (HTTP ${usage.resp.status})`);
  }
  if (!usage.json || typeof usage.json !== "object") {
    throw new Error("usage response invalid");
  }

  const data = usage.json;
  const session = Number(data.five_hour?.utilization);
  const weekly = Number(data.seven_day?.utilization);
  const sonnet = Number(data.seven_day_sonnet?.utilization);
  const opus = Number(data.seven_day_opus?.utilization);
  const extraUsed = Number(data.extra_usage?.used_credits);
  const extraLimit = Number(data.extra_usage?.monthly_limit);
  const sessionReset = toIsoMaybe(data.five_hour?.resets_at);
  const weeklyReset = toIsoMaybe(data.seven_day?.resets_at);
  const sonnetReset = toIsoMaybe(data.seven_day_sonnet?.resets_at);
  const opusReset = toIsoMaybe(data.seven_day_opus?.resets_at);

  return {
    provider: "claude",
    plan: oauth.subscriptionType || null,
    session: Number.isFinite(session) ? session : null,
    weekly: Number.isFinite(weekly) ? weekly : null,
    sonnet: Number.isFinite(sonnet) ? sonnet : null,
    opus: Number.isFinite(opus) ? opus : null,
    extraUsedCents: Number.isFinite(extraUsed) ? extraUsed : null,
    extraLimitCents: Number.isFinite(extraLimit) ? extraLimit : null,
    sessionReset,
    weeklyReset,
    sonnetReset,
    opusReset,
  };
}

function parseOauthClientCreds(text) {
  if (!text || typeof text !== "string") return null;
  const idMatch = text.match(/OAUTH_CLIENT_ID\s*=\s*['"]([^'"]+)['"]/);
  const secretMatch = text.match(/OAUTH_CLIENT_SECRET\s*=\s*['"]([^'"]+)['"]/);
  if (!idMatch || !secretMatch) return null;
  return { clientId: idMatch[1], clientSecret: secretMatch[1] };
}

function loadGeminiOauthClientCreds() {
  const paths = [
    "~/.bun/install/global/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
    "~/.npm-global/lib/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
    "~/.nvm/versions/node/current/lib/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
    "/opt/homebrew/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
    "/opt/homebrew/opt/gemini-cli/libexec/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
    "/usr/local/opt/gemini-cli/libexec/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
  ];

  for (const p of paths) {
    const abs = expandHome(p);
    try {
      const parsed = parseOauthClientCreds(fs.readFileSync(abs, "utf8"));
      if (parsed) return parsed;
    } catch {
      // ignore
    }
  }
  return null;
}

function collectQuotaBuckets(value, out) {
  if (Array.isArray(value)) {
    for (const v of value) collectQuotaBuckets(v, out);
    return;
  }
  if (!value || typeof value !== "object") return;

  if (typeof value.remainingFraction === "number") {
    const modelId = [value.modelId, value.model_id]
      .find((v) => typeof v === "string") || "unknown";
    out.push({
      modelId,
      remainingFraction: value.remainingFraction,
      resetTime: value.resetTime || value.reset_time || null,
    });
  }

  for (const nested of Object.values(value)) {
    collectQuotaBuckets(nested, out);
  }
}

function pickLowestRemainingBucket(buckets) {
  let best = null;
  for (const bucket of buckets) {
    if (!Number.isFinite(bucket.remainingFraction)) continue;
    if (!best || bucket.remainingFraction < best.remainingFraction) best = bucket;
  }
  return best;
}

function mapTierToPlan(tier, idTokenPayload) {
  if (!tier) return null;
  const normalized = String(tier).trim().toLowerCase();
  if (normalized === "standard-tier") return "Paid";
  if (normalized === "legacy-tier") return "Legacy";
  if (normalized === "free-tier") {
    return idTokenPayload && idTokenPayload.hd ? "Workspace" : "Free";
  }
  return null;
}

async function getGeminiUsage() {
  const settings = readJsonIfExists("~/.gemini/settings.json");
  const authType =
    settings && typeof settings.authType === "string" ? settings.authType.trim().toLowerCase() : null;
  if (authType && authType !== "oauth-personal") {
    throw new Error(`unsupported auth type: ${authType}`);
  }

  const creds = readJsonIfExists("~/.gemini/oauth_creds.json");
  if (!creds || (!creds.access_token && !creds.refresh_token)) {
    throw new Error("not logged in");
  }

  const refresh = async () => {
    if (!creds.refresh_token) return null;
    const client = loadGeminiOauthClientCreds();
    if (!client) return null;
    const body = new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }).toString();
    const { resp, json } = await requestJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok || !json || !json.access_token) return null;
    creds.access_token = json.access_token;
    if (json.id_token) creds.id_token = json.id_token;
    if (json.refresh_token) creds.refresh_token = json.refresh_token;
    if (typeof json.expires_in === "number") creds.expiry_date = Date.now() + json.expires_in * 1000;
    return json.access_token;
  };

  let accessToken = creds.access_token;
  const expiryRaw = Number(creds.expiry_date);
  const expiryMs = Number.isFinite(expiryRaw) ? (expiryRaw > 10_000_000_000 ? expiryRaw : expiryRaw * 1000) : 0;
  if (!accessToken || Date.now() + 5 * 60 * 1000 >= expiryMs) {
    const refreshed = await refresh();
    if (refreshed) accessToken = refreshed;
  }
  if (!accessToken) throw new Error("not logged in");

  const postJson = (url, token, body) =>
    requestJson(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });

  const withRetry = async (requestFn) => {
    let out = await requestFn(accessToken);
    if (isAuthStatus(out.resp.status)) {
      const refreshed = await refresh();
      if (!refreshed) return out;
      accessToken = refreshed;
      out = await requestFn(accessToken);
    }
    return out;
  };

  const loadResp = await withRetry((token) =>
    postJson("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", token, {
      metadata: {
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
        duetProject: "default",
      },
    })
  );
  if (isAuthStatus(loadResp.resp.status)) {
    throw new Error("session expired");
  }
  const loadData = loadResp.resp.ok && loadResp.json && typeof loadResp.json === "object" ? loadResp.json : {};

  const idTokenPayload = parseJwtPayload(creds.id_token);
  const tier = readFirstStringDeep(loadData, ["tier", "userTier", "subscriptionTier"]);
  const plan = mapTierToPlan(tier, idTokenPayload);

  let projectId = readFirstStringDeep(loadData, ["cloudaicompanionProject"]);
  if (!projectId) {
    const projects = await requestJson("https://cloudresourcemanager.googleapis.com/v1/projects", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (projects.resp.ok && projects.json && Array.isArray(projects.json.projects)) {
      for (const project of projects.json.projects) {
        if (!project || typeof project.projectId !== "string") continue;
        if (project.projectId.startsWith("gen-lang-client")) {
          projectId = project.projectId;
          break;
        }
        if (project.labels && typeof project.labels === "object" && project.labels["generative-language"] !== undefined) {
          projectId = project.projectId;
          break;
        }
      }
    }
  }

  const quotaResp = await withRetry((token) =>
    postJson("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", token, projectId ? { project: projectId } : {})
  );
  if (!quotaResp.resp.ok || !quotaResp.json || typeof quotaResp.json !== "object") {
    throw new Error(`quota request failed (HTTP ${quotaResp.resp.status})`);
  }

  const buckets = [];
  collectQuotaBuckets(quotaResp.json, buckets);
  const proBuckets = buckets.filter((b) => {
    const s = String(b.modelId || "").toLowerCase();
    return s.includes("gemini") && s.includes("pro");
  });
  const flashBuckets = buckets.filter((b) => {
    const s = String(b.modelId || "").toLowerCase();
    return s.includes("gemini") && s.includes("flash");
  });

  const pro = pickLowestRemainingBucket(proBuckets);
  const flash = pickLowestRemainingBucket(flashBuckets);
  const proUsed = pro ? Math.round((1 - Math.max(0, Math.min(1, pro.remainingFraction))) * 100) : null;
  const flashUsed = flash ? Math.round((1 - Math.max(0, Math.min(1, flash.remainingFraction))) * 100) : null;
  const proReset = pro ? toIsoMaybe(pro.resetTime) : null;
  const flashReset = flash ? toIsoMaybe(flash.resetTime) : null;
  const email = idTokenPayload && typeof idTokenPayload.email === "string" ? idTokenPayload.email : null;

  return {
    provider: "gemini",
    plan,
    proUsed,
    flashUsed,
    proReset,
    flashReset,
    account: email,
  };
}

function formatLine(result) {
  if (result.error) return `${result.provider}: ERROR ${result.error}`;
  if (result.provider === "codex") {
    return [
      "codex",
      `plan=${result.plan || "n/a"}`,
      `session=${fmtPercent(result.session)}`,
      `weekly=${fmtPercent(result.weekly)}`,
      `reviews=${fmtPercent(result.reviews)}`,
      `credits=${fmtNumber(result.credits)}`,
      `session_reset=${fmtIso(result.sessionReset)}`,
      `weekly_reset=${fmtIso(result.weeklyReset)}`,
      `reviews_reset=${fmtIso(result.reviewsReset)}`,
    ].join(" ");
  }
  if (result.provider === "claude") {
    const sonnetOrOpus = Number.isFinite(result.sonnet) ? result.sonnet : result.opus;
    const sonnetOrOpusReset =
      Number.isFinite(result.sonnet) ? result.sonnetReset : result.opusReset;
    const extra =
      Number.isFinite(result.extraUsedCents) && Number.isFinite(result.extraLimitCents) && result.extraLimitCents > 0
        ? `${(result.extraUsedCents / 100).toFixed(2)}/${(result.extraLimitCents / 100).toFixed(2)}`
        : "n/a";
    return [
      "claude",
      `plan=${result.plan || "n/a"}`,
      `session=${fmtPercent(result.session)}`,
      `weekly=${fmtPercent(result.weekly)}`,
      `sonnet_or_opus=${fmtPercent(sonnetOrOpus)}`,
      `extra_usd=${extra}`,
      `session_reset=${fmtIso(result.sessionReset)}`,
      `weekly_reset=${fmtIso(result.weeklyReset)}`,
      `sonnet_or_opus_reset=${fmtIso(sonnetOrOpusReset)}`,
    ].join(" ");
  }
  if (result.provider === "gemini") {
    return [
      "gemini",
      `plan=${result.plan || "n/a"}`,
      `pro=${fmtPercent(result.proUsed)}`,
      `flash=${fmtPercent(result.flashUsed)}`,
      `pro_reset=${fmtIso(result.proReset)}`,
      `flash_reset=${fmtIso(result.flashReset)}`,
      `account=${result.account || "n/a"}`,
    ].join(" ");
  }
  return `${result.provider}: unknown result`;
}

function statusToken(result, icons) {
  const icon = icons[result.provider] || result.provider;
  if (result.error) {
    return `${icon} ${icons.error}`;
  }

  if (result.provider === "codex" || result.provider === "claude") {
    const reset = shortCountdown(result.weeklyReset);
    return `${icon} ${pctLabel(result.weekly)}${reset ? ` ${reset}` : ""}`;
  }

  if (result.provider === "gemini") {
    const reset = shortCountdown(earliestIso([result.proReset, result.flashReset]));
    return `${icon} ${pctLabel(result.proUsed)}${reset ? ` ${reset}` : ""}`;
  }

  return `${icon} ?`;
}

function formatStatusLine(results, opts = {}) {
  const ordered = ["codex", "claude", "gemini"];
  const icons = getStatusIcons(!!opts.useNf);
  const statusStyleRaw = (process.env.OU_STATUS_STYLE || "").trim().toLowerCase();
  const statusStyle = opts.statusStyle || statusStyleRaw || "compact";
  const separator = process.env.OU_STATUS_SEPARATOR && process.env.OU_STATUS_SEPARATOR.trim()
    ? process.env.OU_STATUS_SEPARATOR
    : (statusStyle === "stacked" ? " " : " | ");
  const barWidth = opts.barWidth ?? 5;
  const byProvider = new Map(results.map((r) => [r.provider, r]));
  const parts = [];
  for (const provider of ordered) {
    const item = byProvider.get(provider);
    if (!item) continue;
    if (statusStyle === "stacked") {
      const providerIcon = icons[provider];
      if (item.error) {
        parts.push(`${providerIcon} ${icons.error}`);
        continue;
      }
      const lanes = stackedLaneValues(item);
      const bar = renderStackedDualBar(lanes.top, lanes.bottom, barWidth);
      parts.push(`${providerIcon} ${bar}`);
      continue;
    }
    parts.push(statusToken(item, icons));
  }
  if (parts.length === 0) return "usage unavailable";
  return parts.join(separator);
}

async function main() {
  const args = process.argv.slice(2);
  const stacked = args.includes("--stacked");
  const asStatus = args.includes("--status") || stacked;
  const useNf = resolveUseNf({ args, asStatus });
  const barWidth = resolveBarWidth({ args });
  const asText = args.includes("--text");
  const selected = collectSelectedProviders(args);
  const allowed = ["codex", "claude", "gemini"];
  const providers = selected.length ? allowed.filter((p) => selected.includes(p)) : allowed;

  const jobs = providers.map(async (provider) => {
    try {
      if (provider === "codex") {
        return await getCodexUsage();
      } else if (provider === "claude") {
        return await getClaudeUsage();
      } else if (provider === "gemini") {
        return await getGeminiUsage();
      }
      return { provider, error: "unsupported provider" };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      return { provider, error: msg };
    }
  });
  const results = await Promise.all(jobs);

  if (asStatus) {
    process.stdout.write(
      `${formatStatusLine(results, {
        useNf,
        barWidth,
        statusStyle: stacked ? "stacked" : undefined,
      })}\n`
    );
  } else if (asText) {
    for (const row of results) {
      process.stdout.write(`${formatLine(row)}\n`);
    }
  } else {
    process.stdout.write(`${JSON.stringify(results.map((row) => attachResetDurations(row)), null, 2)}\n`);
  }

  const hasSuccess = results.some((r) => !r.error);
  process.exit(hasSuccess ? 0 : 1);
}

main().catch((err) => {
  const msg = err && err.message ? err.message : String(err);
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
