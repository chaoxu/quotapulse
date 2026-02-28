function stackedLaneValues(result) {
  if (!result || typeof result !== "object") {
    return { top: null, bottom: null };
  }

  if (result.provider === "codex" || result.provider === "claude") {
    // Top lane is primary session usage, bottom lane is longer-term usage.
    return {
      top: result.session,
      bottom: result.weekly,
    };
  }

  if (result.provider === "gemini") {
    // Gemini keeps model lanes: Pro over Flash.
    return {
      top: result.proUsed,
      bottom: result.flashUsed,
    };
  }

  return { top: null, bottom: null };
}

module.exports = {
  stackedLaneValues,
};
