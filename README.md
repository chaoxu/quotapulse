# quotapulse

`quotapulse` is a small CLI for checking subscription usage across Codex, Claude, and Gemini from locally logged-in CLI sessions.

## Install

```bash
npm install -g quotapulse
```

## Usage

```bash
quotapulse
quotapulse --text
quotapulse --status
quotapulse codex --status
quotapulse claude gemini --text
```

## Output modes

- default: JSON array
- `--text`: line-per-provider summary
- `--status`: compact status line

## Notes

- Reads local auth files / keychain entries for each provider.
- Designed for subscription usage tracking rather than API billing usage.
