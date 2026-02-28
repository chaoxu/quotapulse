# quotapulse

`quotapulse` is a small CLI for checking subscription usage across Codex, Claude, and Gemini from locally logged-in CLI sessions.

## Install

```bash
npm install -g quotapulse
```

## Usage

```bash
quotapulse                              # JSON output (all providers)
quotapulse --text                       # line-per-provider summary
quotapulse --status                     # compact status line
quotapulse --stacked                    # stacked dual-bar status
quotapulse --stacked --bar-width 3
quotapulse codex --status               # single provider
quotapulse claude gemini --text         # multiple providers
```

Positional arguments filter providers. Valid names: `codex`, `claude`, `gemini`.

## Output modes

### JSON (default)

Prints a JSON array with one object per provider. Each object includes
usage percentages, plan info, and ISO-8601 reset timestamps.

When reset timestamps are present, extra fields are appended:

- `resetInSeconds` — object keyed by reset field name (e.g. `sessionReset`)
- `nextResetInSeconds` — soonest reset countdown
- `allResetsInSeconds` — latest reset countdown

### Text (`--text`)

One key=value line per provider with plan, usage percentages, reset
timestamps, and (for Claude) extra-usage dollars.

### Status (`--status`)

Compact single-line output intended for shell prompts or status bars.
Each provider shows an icon, a percentage, and a reset countdown.

Default separator is ` | `. Stacked mode uses a single space.

### Stacked status (`--stacked`)

Each provider is rendered as a two-lane stacked bar (via `cellgauge`)
instead of a plain percentage.

| Provider | Top lane (row 1) | Bottom lane (row 2) |
|----------|-------------------|---------------------|
| Codex    | session usage     | weekly usage        |
| Claude   | 5-hour session    | 7-day usage         |
| Gemini   | Pro usage         | Flash usage         |

## CLI flags

| Flag | Description |
|------|-------------|
| `--text` | Text output mode |
| `--status` | Status-line output mode |
| `--stacked` | Stacked dual-bar status (implies `--status`) |
| `--no-nf`, `--status-ascii` | Force ASCII icons (`Cx`, `Cl`, `Gm`) |
| `--bar-width <n>` | Bar width in cells (default `5`) |

### Icon mode

In `--status` mode, glyph icons are used by default. Pass `--no-nf` (or
`--status-ascii`) to switch to ASCII fallbacks (`Cx`, `Cl`, `Gm`).

Outside `--status` mode, icons default to ASCII.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OU_STATUS_STYLE` | Status style (`compact` or `stacked`) | `compact` |
| `OU_STATUS_SEPARATOR` | Separator between providers in status output | ` \| ` (compact) / ` ` (stacked) |
| `OU_STATUS_GLYPHS` | Enable/disable glyph icons (`1`/`true`/`yes`/`on` or `0`/`false`/`no`/`off`) | `true` in status mode |
| `OU_BAR_WIDTH` | Default bar width in cells | `5` |
| `OU_ICON_CODEX` | Custom Codex icon | (glyph default) |
| `OU_ICON_CLAUDE` | Custom Claude icon | (glyph default) |
| `OU_ICON_GEMINI` | Custom Gemini icon | (glyph default) |
| `OU_ICON_ERROR` | Custom error icon | (glyph default) |
| `CODEX_HOME` | Custom Codex config directory | `~/.config/codex` or `~/.codex` |

CLI flags override environment variables when both are set.

### Icon glyphs

Glyph icons use `QuotaPulseLogos` private-use-area codepoints
(`U+F1AF1`–`U+F1AF3`). Install `QuotaPulseLogos` in your terminal font
fallback chain for logo rendering.

Individual icons can be overridden with `OU_ICON_CODEX`, `OU_ICON_CLAUDE`,
`OU_ICON_GEMINI`, and `OU_ICON_ERROR`.

## Notes

- Reads local auth files and macOS keychain entries for each provider.
- Designed for subscription usage tracking rather than API billing usage.
- Tokens are refreshed automatically when expired or stale.
