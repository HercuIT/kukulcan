# CLAUDE.md

Guidance for AI coding agents working in this repo. `AGENTS.md` is a symlink to this file. Read `README.md` for the architecture, setup and endpoints.

## What this is

A React (Create React App) visual editor for manufacturing workflows, backed by Firebase (Auth, Firestore, Cloud Functions in `functions/`) and a small Express server (`server/`) that compiles workflows and deploys their XML to an Ignition gateway.

## Commands

```bash
npm install && npm start      # web app on :3000; /api is proxied to :3001
npm run lint                  # ESLint (CI)
npm run format-check          # Prettier (CI); run `npm run format` to fix
npm run build                 # production build
npm test                      # Jest watch mode (CI); `CI=true npm test` runs once
cd server && node src/index.js    # local API on 127.0.0.1:3001
cd functions && npm run serve     # Functions emulator
```

CI runs lint, Prettier and the Jest unit tests. Run all three before you call a change done.

## Where things are

- `src/pages/Dashboard/Dashboard.js`: about 5,000 lines holding most of the designer UI. Its main components are `TreeNode` and `TreeViewExample` (the hierarchy panel), `MenuBar`, `Canvas`, `NodeParametersModal`, `CreateNodeModal`, `PredefinedNodeWizard`, `ContextMenu`, and the default-export `App({ user, userRoles })`, which holds the dashboard state. Search by component name rather than reading the whole file.
- `src/pages/Dashboard/*Modal.js`: the save, open, share, version-history, checkout and unsaved-changes dialogs.
- `src/backend/firebaseConfig.js`: exports `auth`, `db`, `functions` (region `us-central1`).
- `functions/index.js`: all callable functions (`submitForReview`, `approveWorkflow`, `requestChanges`, `addDesignerToWorkflow`, `removeDesignerFromWorkflow`, `assignReviewerToWorkflow`) and the `compileXML` HTTP function. The frontend calls `compileXML` through the hard-coded `COMPILE_URL` in `Dashboard.js`.
- `server/src/routes/`: `health`, `ignitionHealth`, `compile` (JSON→XML), `deployWorkflow` (XML→Ignition). `server/src/logger.js` writes logs to Firestore `server_logs`.

## MCP servers

`.mcp.json` registers two MCP servers for this repo:

- `firebase`: the Firebase CLI's MCP server (`firebase-tools mcp`), limited to the `auth` and `firestore` tools. It acts as whoever is logged into the Firebase CLI, against the shared `xicotencatl` project. Use it to read users and Firestore documents. Writes and deletes follow the Firebase rule under "Watch out for".
- `supabase`: Supabase's hosted MCP server in read-only mode, for the planned Firebase → Supabase migration. Once a Supabase project exists, add `&project_ref=<ref>` to its URL. Keep `read_only=true` unless the user asks for write access.

Never put tokens or other secrets in `.mcp.json`. Both servers sign in on their own: Firebase through `firebase login`, Supabase through OAuth in the browser.

## Domain facts

- Firestore paths: `roles/{uid}` holds the role flags (`designer`, `reviewer`, `deployer`); `artifacts/manufacturing-suite-v1/workflows/{id}` holds workflows, with state in `metadata`.
- Workflow `metadata.status`: `draft` → `pending_review` → `approved`, or `pending_review` → `changes_requested` → back to editing. Status changes go through Cloud Functions, which check `metadata.assignedReviewerId` and `metadata.designerIds`.
- A valid workflow has exactly one Begin/Start node with no inputs and one End node with no outputs. In XML, node types map to `BeginElement`, `EndElement`, `NodeDefinitionName`, etc. (`TYPE_TO_XML` in `server/src/routes/compileRoutes.js`). Deploy requires every non-Begin/End node to have at least one `<Parameter>` with a non-empty value.

## Rules for new code

- **Cover every scenario.** For every piece of new code, write test scenarios of three kinds:
  - **Positive:** the expected, valid use works.
  - **Negative:** invalid input, missing permissions or failing dependencies are rejected or handled gracefully.
  - **Edge:** empty, boundary, duplicate or unusually large inputs.

  Put automated tests next to the code where practical (Jest, `*.test.js`). Always list the scenarios in the ticket's `docs/HTE-<n>-testing.md`.
- **Keep all UI strings in one place.** Every user-facing string (labels, buttons, menus, tooltips, messages, errors, alerts) lives in `src/constants/uiStrings.js`, never inline in JSX or component logic. Group keys by page and component so each key shows where it's used, e.g. `UI_STRINGS.dashboard.menuBar.save` or `UI_STRINGS.login.errors.missingFields`. Components import `UI_STRINGS` and reference the key.
  - **Finding code from visible text:** to locate the code behind a piece of text on screen, search `uiStrings.js` for the text, take its key, then search `src/` for that key to reach the component to change.
  - **Migrating:** many strings are still inline, and `uiStrings.js` doesn't exist yet. Create it with the first change that needs it. When you touch a component, move its strings into `uiStrings.js` as part of the change, keeping the existing wording and language.
- **Keep the docs current.** When new code changes something either file describes, update `CLAUDE.md` or `README.md` in the same change. That includes commands, setup, environment variables, endpoints, Cloud Functions, Firestore paths, roles, workflow rules, project layout and conventions.

## Conventions

- Code comments and user-facing strings mix Spanish and English. Match whatever the surrounding code uses; don't translate existing text, including when you move it into `uiStrings.js`.
- Formatting comes from Prettier defaults (double quotes, trailing commas). Don't hand-format; run `npm run format`.
- Name branches `HTE-<n>-<short-name>`. Start commits and PR titles with `HTE-<n>: <description>`.
- Each ticket ships a manual test plan at `docs/HTE-<n>-testing.md` with sections Issue, Test Cases (TC-01… with Steps and Expected), and Result. Add or update it alongside the feature.
- Never end a filename with a space or dot. It breaks checkout on Windows (this already happened with an HTE-89 doc).

## Watch out for

- `Dashboard.js` sees many parallel feature branches, so merge conflicts there are common. Past merges have left duplicated JSX fragments outside conflict markers. After resolving a conflict, check that the file still parses (`npm run build` or `npx eslint src/pages/Dashboard/Dashboard.js`).
- `server/package.json` doesn't declare `dotenv` or `firebase-admin`. They currently resolve from the root `node_modules`.
- Secrets: `server/.env` and `server/serviceAccountKey.json` (and `server/node_modules/`) are git-ignored; GitHub push protection rejects pushes that contain them. Never print, copy or commit secret values, and don't add credentials to tracked files.
- The Firebase project is shared (`xicotencatl`). Don't run `firebase deploy` or write to Firestore unless the user explicitly asks.
