---
name: kukulcan-ticket
description: Take a Kukulcan ticket (HTE-<n>, VCR-<n>, WFPR-<n>) from branch to pull request — read the spec and Linear issue, branch from main, build to the project rules, write docs/<TICKET>-testing.md, run every CI check, update the README and open the PR. Use when the user asks to implement, build, fix or ship a ticket or story.
---

# Kukulcan ticket workflow

Takes a ticket from branch to pull request. Follow `CLAUDE.md` wherever it is more specific than this.

## 1. Start

- Get the ticket ID (`HTE-<n>`, `VCR-<n>`, `WFPR-<n>`). If there's a spec, read it first: the README's "Specs" table links each one (Claude Docs). Read the Linear issue through the `linear` MCP server when it's available.
- Branch from an up-to-date `main`. Name the branch after the ID: `HTE-91-filtering`, or `feat/HTE-111` / `fix/HTE-108-compile-targets` for features and fixes.
- If the spec still has open questions, list them for the user before building. Go with the spec's defaults only when the user agrees, and write down which defaults you took.

## 2. Build to the project rules

- Components never import Supabase: go through `src/backend/authApi.js`, `workflowsApi.js` and `definitionsApi.js`, and shape rows in `mappers.js`.
- Database changes: use the `kukulcan-db-change` skill.
- Every UI string goes in `src/constants/uiStrings.js` (`UI_STRINGS`), in English. Translate older Spanish strings in any component you touch.
- Colors: only `var(--kk-…)`. Never a hex value, color function or named color in `src/`. SVG colors go in `style`, not in attributes. Token changes go through `src/styles/tokens.json` and then `npm run theme`; never edit `theme.css` by hand.
- XML compiler or deploy validator changes: add a fixture to `supabase/tests/xml-contract.test.mjs`. Any change to the `<Workflow>` contract also needs a change to Ignition's `recibirXML`: flag it, since it's a non-goal unless the story says otherwise.
- No filename may end in a space or a dot.

## 3. Test plan

Write `docs/<TICKET>-testing.md` with three parts:
- **Issue:** what was wrong or what's new, and a link to the spec.
- **Test cases:** numbered, each with preconditions (role, workflow status), steps and the expected result. Cover each role that's affected (designer, reviewer, deployer), both themes if the change touches the UI, and the error paths.
- **Outcome:** filled in after testing (pass/fail per case, the date, the build or preview URL).

## 4. Checks: run all of them before the PR, as CI does

```bash
npm ci && npm ci --prefix server
npm run lint
npm run format-check   # npm run format to fix
npm run typecheck
CI=true npm test
npm run test:node
```

Fix failures. Don't skip or disable a test to get green.

## 5. Docs

- README: update the spec's row in the "Specs" table (for example "Implemented on `<branch>` (PR #n); test plan `docs/<TICKET>-testing.md`"). Also update any section the change affects: Glossary, endpoints, Workflow lifecycle, Theme, Project layout.
- If a manual step is needed on the live project (Supabase dashboard, Cloudflare variables, Ignition), list it in order in the README and in the PR.

## 6. Commit and PR

- Start commit messages and the PR title with the ID: `HTE-91: add hierarchy filtering by element type`.
- Open the PR against `main`. In the description, cover what changed and why, a link to the spec, a link to the test plan, any manual deploy steps, and the spec defaults you took.
- The Claude code review workflow comments on the PR on its own. Address its findings or explain why you're leaving them.
