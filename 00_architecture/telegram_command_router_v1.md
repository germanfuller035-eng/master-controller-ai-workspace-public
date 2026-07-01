# Telegram Command Router v1

Status: Block A established (registry is single source of truth).
Source of truth: `tools/telegram_gateway/telegram_command_registry.mjs`

## Purpose

One declared contract for every Telegram command: slash commands, free-form
Russian text intents, and voice (transcribed → text → same registry). No command
or intent may be lost when blocks B..I are rebuilt.

## Routing order (live bot)

1. **Slash command (exact / token-prefix)** — `text.startsWith('/')`
   - `/ping` is the absolute top-priority direct route.
   - Then exact-name and `name arg` token matches against `SLASH_COMMANDS`.
2. **Free-form text intent** — non-slash text is normalized (lowercase, ё→е,
   trailing punctuation stripped) and matched against `TEXT_INTENTS`, which map
   to a canonical slash command via `maps_to`.
3. **Voice** — audio transcribed elsewhere; transcript is treated as text and
   re-enters at step 2. Voice fallback help surfaces `VOICE_FALLBACK_COMMANDS`.
4. **Unknown** — never silent: reply with help pointing at current commands.

## Registry entry shape

```
{ name, aliases[], type: slash|text|voice, status: active|fallback|planned,
  handler: "<module>#<export>" | "...#DIRECT" | "PLANNED:...", block: A..I, desc }
```

- `active` — supported primary path.
- `fallback` — kept working, not the daily primary path.
- `planned` — declared for v1, handler wired in its owning block.

## Lookup API

- `resolveCommand(rawText)` → matching slash entry (handles slash, alias, prefix, text intent) or `null`.
- `getCommand(name)` → exact canonical entry.
- `allCommandNames()` → all canonical names.
- `commandsWithHandler()` → entries with a real (non-PLANNED) handler.

## Required-working set (Block I preflight)

`REQUIRED_WORKING` must every one resolve to an entry with a real handler:
`/sales_status /lead_run_pipeline /sales_next /sales_history /help /menu /ping
/health /today /mail status /lead_status /lead_template /lead_add /leadadd
/newleads /gateway status`.

## Preserved text/voice phrases

`REQUIRED_TEXT_PHRASES` must each resolve via `resolveCommand`:
`задачи · пора заработать · лиды · на сегодня · что с системой? · бот жив? ·
пинг · ты работаешь? · что делать сейчас`.

## Voice fallback

`/sales_status /lead_run_pipeline /sales_next /sales_history /health /ping`.
