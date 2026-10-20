# GEMINI.md

Guidance for Gemini CLI working in this repo. The project's rules for every AI coding agent live in `CLAUDE.md`, which is imported at the end of this file so there is one source of truth. Everything there applies to you: wherever it says "Claude" or "AI coding agents", read it as you too. Read `README.md` for the architecture, setup and endpoints.

## Gemini-specific notes

- **Change rules in `CLAUDE.md`, not here.** This file only adds what differs for Gemini CLI. Don't copy `CLAUDE.md` content into it.
- **MCP servers:** `CLAUDE.md` describes `.mcp.json`, which is Claude Code's config. Gemini CLI reads MCP servers from `mcpServers` in `.gemini/settings.json` instead, and this repo doesn't ship one. To use the same two servers, add them there with the same limits: Firebase CLI with `--only auth,firestore`, and Supabase's hosted server with `read_only=true`. Never put tokens or other secrets in that file either.
- **GitHub workflows:** the Claude review on pull requests and `@claude` mentions (`.github/workflows/claude-code-review.yml`, `claude.yml`) run on GitHub whichever agent wrote the change. They answer to `@claude` only. Don't edit or remove them unless the user asks.
- **Commands and checks** are the same as in `CLAUDE.md` (lint, Prettier, typecheck, Jest, `npm run test:node`). Run them before you call a change done.
- **`AGENTS.md`** is meant to point to `CLAUDE.md` but is checked in as a plain file containing only that name, not a real symlink. Read `CLAUDE.md` (imported below), not `AGENTS.md`.

## Project rules (imported from CLAUDE.md)

@./CLAUDE.md
