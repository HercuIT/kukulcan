# CLAUDE.md

Guidance for AI coding agents working in this repo. `AGENTS.md` is a symlink to this file. Read `README.md` for the architecture, setup and endpoints.

## What this is

A React (Create React App) visual editor for manufacturing workflows, backed by Supabase (Auth, Postgres with RLS, RPC functions, Realtime, and the `compile-xml` Edge Function) and a small Express server (`server/`) that compiles workflows and deploys their XML to an Ignition gateway.

## Commands

```bash
npm install && npm start      # web app on :3000; /api is proxied to :3001
npm run lint                  # ESLint (CI)
npm run format-check          # Prettier (CI); run `npm run format` to fix
npm run build                 # production build
npm test                      # Jest watch mode (CI); `CI=true npm test` runs once
npm run test:node             # Node tests: migrations on PGlite, compile-xml, server logger, migration scripts (CI)
cd server && node src/index.js    # local API on 127.0.0.1:3001
```

CI runs lint, Prettier, the Jest unit tests and `npm run test:node`. Run all four before you call a change done. On Windows, check Prettier with `npx prettier --check --end-of-line auto <files>`: `core.autocrlf` checks files out with CRLF, which plain `format-check` reports as errors.

## Where things are

- `src/pages/Dashboard/Dashboard.js`: about 5,000 lines holding most of the designer UI. Its main components are `TreeNode` and `TreeViewExample` (the hierarchy panel), `MenuBar`, `Canvas`, `NodeParametersModal`, `CreateNodeModal`, `PredefinedNodeWizard`, `ContextMenu`, and the default-export `App({ user, userRoles })`, which holds the dashboard state. Search by component name rather than reading the whole file.
- `src/pages/Dashboard/*Modal.js`: the save, open, share, version-history, checkout and unsaved-changes dialogs.
- `src/backend/`: the only code that talks to Supabase. `supabaseClient.js` (client from `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_PUBLISHABLE_KEY`), `authApi.js` (sign-in/up/out, `onSessionChange`, `getMyRoles`), `workflowsApi.js` (workflow CRUD, `subscribeToWorkflow`, `listMyWorkflows`, `listUsers`, one wrapper per RPC, `compileWorkflow`), `mappers.js` (rows ↔ the legacy `{ id, name, content, metadata }` shape, error codes). Components import these, never `@supabase/supabase-js`. The `user` prop is `{ uid, email }`.
- `supabase/migrations/`: schema, RLS policies, triggers and the RPC functions (`submit_for_review`, `assign_reviewer`, `approve_workflow`, `request_changes`, `add_designer`, `remove_designer`, `checkout_workflow`, `my_workflows`), plus `migrate_workflow` (service role only, used by `scripts/migration/migrate-data.js`). Every schema change is a new migration file.
- `supabase/functions/compile-xml/`: the Edge Function; `compiler.mjs` holds the validation and XML code (a second copy lives in `server/src/routes/compileRoutes.js`).
- `server/src/routes/`: `health`, `ignitionHealth`, `compile` (JSON→XML), `deployWorkflow` (XML→Ignition). `server/src/logger.js` inserts one Supabase `server_logs` row per event through `supabaseAdmin.js` (service role).
- `scripts/migration/`: one-off Firebase → Supabase scripts (`import-users.js`, `migrate-data.js`, `verify.js`, `send-password-resets.js`) with their own `package.json`.
- `src/pages/SetPassword/`: the `/set-password` page that the password email links to (imported users have no password until they set one there).

## MCP servers

`.mcp.json` registers two MCP servers for this repo:

- `firebase`: the Firebase CLI's MCP server (`firebase-tools mcp`), limited to the `auth` and `firestore` tools. It acts as whoever is logged into the Firebase CLI, against the shared `xicotencatl` project. The app no longer uses Firebase; keep this only to inspect the old data until the project is deleted. Writes and deletes follow the Firebase rule under "Watch out for".
- `supabase`: Supabase's hosted MCP server in read-only mode. Once the Supabase project exists, add `&project_ref=<ref>` to its URL. Keep `read_only=true` unless the user asks for write access.

Never put tokens or other secrets in `.mcp.json`. Both servers sign in on their own: Firebase through `firebase login`, Supabase through OAuth in the browser.

## Domain facts

- Tables: `profiles` (one per `auth.users` row; role flags `designer`, `reviewer`, `deployer`, created by a sign-up trigger), `workflows` (canvas graph in `nodes` jsonb), `workflow_designers`, `workflow_history` (`kind` = `checkout` or `changes_requested`), `server_logs` (service role only).
- Workflow `status`: `draft` → `pending_review` → `approved`, or `pending_review` → `changes_requested` → back to editing. Clients may only update `name`, `nodes` and `checkout_description` (column grants + RLS); status, reviewer and collaborator changes go through the RPC functions, which check `assigned_reviewer_id` and `workflow_designers`. A trigger bumps `version` when `name` or `nodes` change and stamps `last_modified_*` for user writes (service-role writes keep their values).
- A valid workflow has exactly one Begin/Start node with no inputs and one End node with no outputs. In XML, node types map to `BeginElement`, `EndElement`, `NodeDefinitionName`, etc. (`TYPE_TO_XML` in `server/src/routes/compileRoutes.js`). Deploy requires every non-Begin/End node to have at least one `<Parameter>` with a non-empty value.

## Rules for new code

- **Cover every scenario.** For every piece of new code, write test scenarios of three kinds:
  - **Positive:** the expected, valid use works.
  - **Negative:** invalid input, missing permissions or failing dependencies are rejected or handled gracefully.
  - **Edge:** empty, boundary, duplicate or unusually large inputs.

  Put automated tests next to the code where practical (Jest, `*.test.js`). Always list the scenarios in the ticket's `docs/HTE-<n>-testing.md`.

- **Keep all UI strings in one place.** Every user-facing string (labels, buttons, menus, tooltips, messages, errors, alerts) lives in `src/constants/uiStrings.js`, never inline in JSX or component logic. Group keys by page and component so each key shows where it's used, e.g. `UI_STRINGS.dashboard.menuBar.save` or `UI_STRINGS.login.errors.missingFields`. Components import `UI_STRINGS` and reference the key.
  - **Finding code from visible text:** to locate the code behind a piece of text on screen, search `uiStrings.js` for the text, take its key, then search `src/` for that key to reach the component to change.
  - **Layout:** `UI_STRINGS.<page>.<component>.<key>`, with `errors`, `alerts` and `messages` sub-groups for `setError`, `alert` and `setModalMsg` text (`UI_STRINGS.dashboard.page` is the dashboard's `App` component). Text with values in it is a function: `UI_STRINGS.dashboard.shareWorkflowModal.title(workflow.name)`.
  - **Ids vs. labels:** when the code compares a value as an id (menu ids like `"File"`/`"Save"`), keep the id in code and render its label through a map: `UI_STRINGS.dashboard.menuBar.menuLabels[option] ?? option`.
  - **Not UI strings:** catalog and domain data (`equipmentData.js`, `MaterialData.js`, node definition names, hierarchy-tree labels, PLC types and program names) and `console.*` messages stay where they are.
  - `src/constants/uiStrings.test.js` fails if any `UI_STRINGS.…` key used in `src/` doesn't exist.
- **Keep the docs current.** When new code changes something either file describes, update `CLAUDE.md` or `README.md` in the same change. That includes commands, setup, environment variables, endpoints, database tables and functions, roles, workflow rules, project layout and conventions.

## Conventions

- Code comments and user-facing strings mix Spanish and English. Match whatever the surrounding code uses; don't translate existing text, including when you move it into `uiStrings.js`.
- Formatting comes from Prettier defaults (double quotes, trailing commas). Don't hand-format; run `npm run format`.
- Name branches `HTE-<n>-<short-name>`. Start commits and PR titles with `HTE-<n>: <description>`.
- Each ticket ships a manual test plan at `docs/HTE-<n>-testing.md` with sections Issue, Test Cases (TC-01… with Steps and Expected), and Result. Add or update it alongside the feature.
- Never end a filename with a space or dot. It breaks checkout on Windows (this already happened with an HTE-89 doc).

## Watch out for

- `Dashboard.js` sees many parallel feature branches, so merge conflicts there are common. Past merges have left duplicated JSX fragments outside conflict markers. After resolving a conflict, check that the file still parses (`npm run build` or `npx eslint src/pages/Dashboard/Dashboard.js`).
- Secrets: `server/.env`, `.env.local`, `server/serviceAccountKey.json` (legacy) and `server/node_modules/` are git-ignored; GitHub push protection rejects pushes that contain credentials. The Supabase service-role key belongs only in `server/.env` or the migration scripts' environment, never in the frontend. Never print, copy or commit secret values, and don't add credentials to tracked files.
- Shared projects: don't run `supabase db push`, `supabase functions deploy` or write to Supabase, and don't run `firebase deploy` or write to Firestore (`xicotencatl`), unless the user explicitly asks.
- RLS gotchas: a client `insert … returning` on `workflows` fails because the read policy depends on `workflow_designers`, which the trigger fills after the insert. `createWorkflow` generates the id client-side and inserts without `returning`. An update that RLS filters out returns zero rows instead of an error, so `saveWorkflow` checks the row count.
