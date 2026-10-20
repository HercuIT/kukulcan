# CLAUDE.md

Guidance for AI coding agents working in this repo. `AGENTS.md` is a symlink to this file (git mode 120000), and `GEMINI.md` imports it for Gemini CLI (adding only Gemini-specific notes), so rules belong here, not in those files. On Windows without symlink support (Developer Mode off, or `core.symlinks=false`), git checks `AGENTS.md` out as a small text file containing `CLAUDE.md`; don't commit it back as a regular file (`git ls-files -s AGENTS.md` must show `120000`). Read `README.md` for the architecture, setup and endpoints.

## What this is

A React (Create React App) visual editor for manufacturing workflows, backed by Supabase (Auth, Postgres with RLS, RPC functions, Realtime, and the `compile-xml` Edge Function) and a small Express server (`server/`) that compiles workflows and deploys their XML to an Ignition gateway.

## Commands

```bash
npm install && npm start      # web app on :3000; /api is proxied to :3001
npm run lint                  # ESLint (CI)
npm run format-check          # Prettier (CI); run `npm run format` to fix
npm run typecheck             # TypeScript over the JavaScript, checkJs (CI)
npm run build                 # production build
npm run theme                 # regenerate src/styles/theme.css from src/styles/tokens.json
npm test                      # Jest watch mode (CI); `CI=true npm test` runs once
npm run test:node             # Node tests: migrations on PGlite, compile-xml, XML deploy contract, server logger, migration scripts (CI; the contract test needs `npm ci --prefix server`)
cd server && node src/index.js    # local API on 127.0.0.1:3001
```

CI runs lint, Prettier, the typecheck, the Jest unit tests and `npm run test:node`. Test files (`*.test.js`/`.mjs`, `src/setupTests.js`, `server/test/`, `supabase/tests/`, `scripts/migration/test/`) are left out of lint, Prettier and the typecheck (`.eslintignore`, `.prettierignore`, `tsconfig.typecheck.json`); Jest and `test:node` still run them. Merges to `main` that change `supabase/` also run `.github/workflows/deploy_supabase.yaml`, which pushes migrations and deploys `compile-xml` to the live project (`xiidwepvvjcqyhywmdrn`), so a migration merged to `main` is a production change. Run all five before you call a change done. On Windows, check Prettier with `npx prettier --check --end-of-line auto <files>`: `core.autocrlf` checks files out with CRLF, which plain `format-check` reports as errors.

## Where things are

- `src/pages/Dashboard/Dashboard.js`: about 5,000 lines holding most of the designer UI. Its main components are `TreeNode` and `TreeViewExample` (the hierarchy panel), `MenuBar`, `Canvas`, `NodeParametersModal`, `CreateNodeModal`, `PredefinedNodeWizard`, `ContextMenu`, and the default-export `App({ user, userRoles })`, which holds the dashboard state. Search by component name rather than reading the whole file.
- `src/pages/Dashboard/*Modal.js`: the save, open, share, version-history, checkout and unsaved-changes dialogs.
- `src/backend/`: the only code that talks to Supabase. `supabaseClient.js` (client from `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_PUBLISHABLE_KEY`), `authApi.js` (sign-in/up/out, `onSessionChange`, `getMyRoles`), `workflowsApi.js` (workflow CRUD, `subscribeToWorkflow`, `listMyWorkflows`, `listUsers`, one wrapper per RPC, `compileWorkflow`), `definitionsApi.js` (the User Created Definitions tree: RPC wrappers, `subscribeToDefinitions`, iterative tree helpers `buildDefinitionTree` / `visibleRows` / `expandForCanvas`), `mappers.js` (rows ↔ the legacy `{ id, name, content: { nodes, connections }, metadata }` shape, error codes; RPC rule hints are kept on `error.hint`). Components import these, never `@supabase/supabase-js`. The `user` prop is `{ uid, email }`.
- `supabase/migrations/`: schema, RLS policies, triggers and the RPC functions (`submit_for_review`, `assign_reviewer`, `approve_workflow`, `request_changes`, `add_designer`, `remove_designer`, `checkout_workflow`, `my_workflows`; WFPR-003: `create_definition`, `add_predefined_child`, `update_definition`, `move_definition`, `delete_definition`), plus `migrate_workflow` (service role only, used by `scripts/migration/migrate-data.js`). Every schema change is a new migration file, created with `npx supabase migration new <name>` (UTC timestamp). Never hand-pick a timestamp: one in the future makes later CLI-created migrations run before it. Once a migration is on the Supabase project, don't rename or edit it; add a new one.
- `supabase/functions/compile-xml/`: the Edge Function; `compiler.mjs` is the only compiler (validation, `buildWorkflowXml`, the `controller` and `ignition` targets, `validateDeployable`). `server/src/routes/compileRoutes.js` loads it with a dynamic `import()` (the server must run from a checkout that includes `supabase/`). The deploy validator is `server/src/validarWorkflow.js`; `supabase/tests/xml-contract.test.mjs` runs both compile paths through it.
- `server/src/app.js`: the Express app (body limits: JSON 5 MB, XML 10 MB; the JSON 413/400/500 error handler); `index.js` only starts it, and `server/test/app.test.js` tests it in-process with the Supabase variables blanked so nothing reaches the live `server_logs`.
- `server/src/routes/`: `health`, `ignitionHealth`, `compile` (JSON→XML), `deployWorkflow` (XML→Ignition). `server/src/logger.js` inserts one Supabase `server_logs` row per event through `supabaseAdmin.js` (service role).
- `scripts/migration/`: one-off Firebase → Supabase scripts (`import-users.js`, `migrate-data.js`, `verify.js`, `send-password-resets.js`) with their own `package.json`.
- `src/pages/SetPassword/`: the `/set-password` page that the password email links to (imported users have no password until they set one there).
- Theme (HTE-111): `src/styles/tokens.json` → `npm run theme` → `src/styles/theme.css` (`--kk-*`); `src/theme/ThemeContext.js` (`ThemeProvider`, `useTheme()`; the View menu's theme options call `setMode`); `src/components/Logo/Logo.js` (lockup used by every menu bar and the Login, Set Password and Home pages); brand SVGs in `public/brand/`.

## MCP servers

`.mcp.json` registers two MCP servers for this repo:

- `firebase`: the Firebase CLI's MCP server (`firebase-tools mcp`), limited to the `auth` and `firestore` tools. It acts as whoever is logged into the Firebase CLI, against the shared `xicotencatl` project. The app no longer uses Firebase; keep this only to inspect the old data until the project is deleted. Writes and deletes follow the Firebase rule under "Watch out for".
- `supabase`: Supabase's hosted MCP server in read-only mode. Once the Supabase project exists, add `&project_ref=<ref>` to its URL. Keep `read_only=true` unless the user asks for write access.

Never put tokens or other secrets in `.mcp.json`. Both servers sign in on their own: Firebase through `firebase login`, Supabase through OAuth in the browser.

## Domain facts

- Tables: `profiles` (one per `auth.users` row; role flags `designer`, `reviewer`, `deployer`, created by a sign-up trigger), `workflows` (canvas nodes in `nodes` jsonb, canvas edges in `connections` jsonb), `user_definitions` (the shared User Created Definitions tree: `parent_id`, manual `position` among siblings, `kind` = `user` or `predefined` for a reference to a pre-defined element; no depth limit; changed only through the WFPR-003 RPCs, which raise `P0001` with a `hint` such as `cycle` or `duplicate_sibling`), `workflow_designers`, `workflow_history` (`kind` = `checkout` or `changes_requested`), `server_logs` (service role only).
- Workflow `status`: `draft` → `pending_review` → `approved`, or `pending_review` → `changes_requested` → back to editing. Clients may only update `name`, `nodes` and `connections` (column grants + RLS; `checkout_description` is set by `checkout_workflow`); status, reviewer and collaborator changes go through the RPC functions, which check `assigned_reviewer_id` and `workflow_designers`. A trigger bumps `version` when `name`, `nodes` or `connections` change and stamps `last_modified_*` for user writes (service-role writes keep their values).
- A valid workflow has exactly one Begin/Start node with no inputs and one End node with no outputs. In XML, Begin/Start → `BeginElement`, End → `EndElement`, other types pass through (`TYPE_TO_XML` in `compiler.mjs`). Anything bound for Ignition is compiled with `target: "ignition"`; the default `controller` document is the PLC download and isn't deployable. Deploy requires every non-Begin/End node to have at least one `<Parameter>` with a non-empty value.

## Editor domain model

What specs and features in the designer have to work with (all in `src/pages/Dashboard/Dashboard.js` unless noted):

- **Hierarchy panel** (`TreeViewExample` → `renderTree`): roots in this order: Workflows (→ Node Definitions → User Created Definitions and Pre-Defined Definitions; Nodes), Equipment (`equipmentData.js`), Assets, Data Layer, Work Instructions, Materials (`MaterialData.js`), Scheduler. Rows have no ids: logic compares labels (`label === "User Created Definitions"`) and keys expand state by label.
- **Equipment hierarchy:**
  - The target structure for the Equipment root is in `README.md` → "Equipment and Assets hierarchy": Enterprise → Site → Area → Work Center → Equipment Module → Sequencer → Route / Control Loops → Control Module → Device / Field IO. It has a Definitions (classes) branch and an Instances branch, levels can be skipped, and some types nest inside themselves.
  - Specs that touch equipment use those level names and the containment table there. The table is a reading of the spreadsheet: confirm it before enforcing it.
- **Definitions:**
  - The ISA-88 levels are `NODE_DEFINITION_NAMES`, duplicated as `PREDEFINED_PROCEDURE_LABELS`: Procedure Phase, Procedure Operation, Procedure Unit Procedure, Procedure, Area Procedure, Site Procedure.
  - The predefined catalog is `PROCEDURE_PHASES` plus `OPERATIONS_BY_PHASE`, picked in `PredefinedNodeWizard`.
  - User-created definitions (WFPR-003) are stored in `user_definitions` as a tree of any depth, shared by everyone. `UserDefinitionsTree.js` renders that branch as a flat list (indentation capped at 8 levels, full path in the tooltip) with its own context menu (create inside, edit, move up/down, move to, delete) and drag-and-drop (drop a definition onto another to nest it, a pre-defined row to add a reference). `CreateNodeModal` creates and edits them (`initial`, `parentPath` props).
  - Pre-defined definitions created with the wizard still live only in React state (`preDefinedNodes`) and are lost on reload (WFPR-004 / VCR-001 move them to the rule set).
- **Canvas:** a flat list of nodes (`canvasNodes`) plus a separate list of connections (`manualConnections`, `{ id, from, to, fromPort, toPort }`), with no containment between nodes. Both are saved (`workflows.nodes`, `workflows.connections`) and restored on open; workflows saved before WFPR-003 have `connections` null and get the default Begin → Connection 1 → End edges (`connectionsForLoadedWorkflow` in `canvasConnections.js`); a saved `[]` stays empty. Deleting a node drops its connections (`dropDanglingConnections` in `mappers.js`), and `createWorkflow`/`saveWorkflow` drop any that still point at a missing node. `user_definitions.parameters` must be a JSON array and `implementation` an object (RPC hint `invalid_fields`, plus a table check).
  - A node has `id`, `type`, `label`, `x`, `y`, and optionally `parameters`, `implementation`, `procedurePhase`, `operation`.
  - `parameters` is either grouped (`{ <tab>: [ … ] }`, from `NodeParametersModal`) or flat (`[ … ]`, from `CreateNodeModal`).
  - A new canvas starts with Begin, Connection 1 and End (`getDefaultWorkflowNodes`).
  - Panel rows reach the canvas through `window._dragComponent`, which the panel's drag start sets (`handleDragStart` in `TreeViewExample`, `startDrag` in `UserDefinitionsTree`) and the Canvas's `handleDrop` reads and clears. The `TreeNode` component is not rendered anywhere (dead code).
  - Dropping a user-created definition expands it (WFPR-003, option B): `expandForCanvas` places the definition and all its descendants as nodes in pre-order, stacked, and chained with connections.
- **Validation, by operation.** These are separate flows, not one pipeline. A new rule must say which operation(s) enforce it, and whether both compiler copies change:

  | Operation | Where it's checked | What it checks |
  | --- | --- | --- |
  | Editing (live) and before compiling | `validateWorkflow` in `Dashboard.js` | Graph shape in the editor: one START, at least one END, no disconnected or unreachable nodes |
  | Saving, sharing, status changes | RLS, column grants and RPC functions in the database | Who may change what, and the workflow status rules |
  | Compiling in the app | `validateWorkflow` in `supabase/functions/compile-xml/compiler.mjs`; plus `validateDeployable` for `target: "ignition"` | Structure, node ids, Begin/End, connections, size limits; for Ignition, every non-Begin/End node has named parameters with values |
  | Compiling through the local server (`POST /api/compile`) | The same `compiler.mjs` (target `ignition` by default) | Same as above |
  | Deploying (`POST /api/deploy-workflow`) | `validarWorkflow` in `server/src/validarWorkflow.js` | The Ignition XML contract (see `README.md`); `supabase/tests/xml-contract.test.mjs` keeps both compile paths passing it |

## Rules for new code

- **Cover every scenario.** For every piece of new code, write test scenarios of three kinds:
  - **Positive:** the expected, valid use works.
  - **Negative:** invalid input, missing permissions or failing dependencies are rejected or handled gracefully.
  - **Edge:** empty, boundary, duplicate or unusually large inputs.

  Put automated tests next to the code where practical (Jest, `*.test.js`). Always list the scenarios in the ticket's `docs/<TICKET>-testing.md`.

- **Keep all UI strings in one place.** Every user-facing string (labels, buttons, menus, tooltips, messages, errors, alerts) lives in `src/constants/uiStrings.js`, never inline in JSX or component logic. Group keys by page and component so each key shows where it's used, e.g. `UI_STRINGS.dashboard.menuBar.save` or `UI_STRINGS.login.errors.missingFields`. Components import `UI_STRINGS` and reference the key.
  - **Finding code from visible text:** to locate the code behind a piece of text on screen, search `uiStrings.js` for the text, take its key, then search `src/` for that key to reach the component to change.
  - **Layout:** `UI_STRINGS.<page>.<component>.<key>`, with `errors`, `alerts` and `messages` sub-groups for `setError`, `alert` and `setModalMsg` text (`UI_STRINGS.dashboard.page` is the dashboard's `App` component). Text with values in it is a function: `UI_STRINGS.dashboard.shareWorkflowModal.title(workflow.name)`.
  - **Ids vs. labels:** when the code compares a value as an id (menu ids like `"File"`/`"Save"`), keep the id in code and render its label through a map: `UI_STRINGS.dashboard.menuBar.menuLabels[option] ?? option`.
  - **Not UI strings:** catalog and domain data (`equipmentData.js`, `MaterialData.js`, node definition names, hierarchy-tree labels, PLC types and program names) and `console.*` messages stay where they are.
  - `src/constants/uiStrings.test.js` fails if any `UI_STRINGS.…` key used in `src/` doesn't exist.
- **Colors come from the theme tokens.** In the app's CSS, JS and inline SVG, write `var(--kk-<token>)`, never a hex, a color function or a named color in any case (`src/styles/noHardcodedColors.test.js` fails otherwise; `transparent`, `currentColor` and `inherit` are fine). Exceptions, because CSS variables can't be resolved there: the `theme-color` tags in `public/index.html` and `manifest.json`'s `theme_color` (keep them equal to `raised`) and `background_color` (light `bg`), and the brand SVG files in `public/brand/`. Pick by role, not by look: `surface`/`raised`/`bg` for grounds, `ink`/`ink-muted` for text, `border`/`border-strong` for lines, `brand-mint` fills with `on-brand` text for primary actions, `status-*-bg`/`-fg` pairs for states, `--kk-scrim` for modal backdrops, `--kk-hover-overlay` (as an inset box-shadow) for hovering a filled button and one step up (`surface` → `raised`) for others, `shadow-node`/`shadow-overlay` for elevation. `brand-mint`/`brand-cyan` are fills only; use `mint-text`/`cyan-text` for colored text and lines. Each token's intended use is in `src/styles/tokens.json` (`usage`). To change a color, edit `tokens.json` and run `npm run theme`; never edit `theme.css`. In SVG, set colors through `style`, not presentation attributes. README → "Theme" has the details.
- **Keep the docs current.** When new code changes something either file describes, update `CLAUDE.md` or `README.md` in the same change. That includes commands, setup, environment variables, endpoints, database tables and functions, roles, workflow rules, project layout and conventions.

## Writing specs

A spec is written before implementation, as a Claude Doc (not a file in the repo), and listed in the **Specs** table in `README.md` with its link and status. Read the specs it depends on first (e.g. WFPR-003 builds on VCR-001's rules). Use these sections, in this order:

1. **Overview:** the user story verbatim, goals, non-goals, and a "Done when" list of checkable outcomes.
2. **Current state:** what the code does today, naming files, components and constants (see "Editor domain model" above), and the known defects the feature touches.
3. **Model or behaviour:** the concepts, operations and rules; a diagram when the content is a flow, tree or lifecycle.
4. **Data model and authorization:** tables and columns, RLS (who reads, who changes), and the RPC functions with the rules each enforces and its error codes (`28000` no session, `42501` no permission, `P0002` not found, `P0001` wrong state).
5. **Enforcement / canvas, compile and deploy:** which validation layer checks what, and whether the Ignition XML contract changes (it's a non-goal unless the story says otherwise; see `README.md`).
6. **UI changes and strings:** components touched, and the new `UI_STRINGS` keys with their text.
7. **Testing:** a Positive / Negative / Edge table per area, which becomes `docs/<TICKET>-testing.md`.
8. **Rollout, risks and open questions:** decisions the spec can't make alone are open questions, never silent assumptions.

## Recipe: adding a persisted feature

Both the Supabase migration and later specs follow the same pattern. A new table or server-side rule takes these steps:

1. Create the migration with `npx supabase migration new <ticket_name>` (never a hand-picked timestamp).
2. Enable RLS, revoke `insert`/`update`/`delete` from `anon` and `authenticated`, and grant only the reads (and column-level writes) clients really need.
3. Put every rule-checking change in a `security definer` function with `set search_path = ''`, raising the standard error codes (see "Writing specs"). Shared checks go in the `private` schema; revoke `execute` from `public, anon` and grant it to `authenticated` (or `service_role`).
4. Add the table to the `supabase_realtime` publication if open screens must refresh.
5. Test the SQL in `supabase/tests/*.test.mjs` on PGlite (`npm run test:node`), running as `authenticated`, `anon` and `service_role` with the helpers in `schema.test.mjs`.
6. Call it from a module in `src/backend/` (`<feature>Api.js`), mapping rows and errors in `mappers.js`; components never import `@supabase/supabase-js`.
7. Put new strings in `uiStrings.js`, and update `README.md`/`CLAUDE.md`.
8. Remember that merging to `main` runs the migration on the live project (`deploy_supabase.yaml`), and that an applied migration is never edited again.

## Conventions

- Code comments and user-facing strings mix Spanish and English. Match whatever the surrounding code uses; don't translate existing text, including when you move it into `uiStrings.js`.
- Types: `npm run typecheck` runs `tsc -p tsconfig.typecheck.json` (TypeScript 4.9, kept in `react-scripts` 5's peer range; `checkJs`, not strict) over `src/`, `server/src/`, `compiler.mjs` and `scripts/*.js`. Fix a type error rather than silencing it; where JS can't express a type, use a JSDoc annotation or cast (`/** @type {HTMLElement[]} */ (…)`). Globals such as `window._dragComponent` are declared in `src/types/globals.d.ts`. The file isn't named `tsconfig.json` because Create React App would then treat the app as TypeScript. In CommonJS, take axios as `require("axios").default` (the export its types describe).
- Formatting comes from Prettier defaults (double quotes, trailing commas). Don't hand-format; run `npm run format`. Markdown files (`*.md`) and `.claude/` are excluded in `.prettierignore`; don't run Prettier on them.
- `<TICKET>` below is the ticket or story ID exactly as the request gives it: Jira tickets (`HTE-<n>`) and story IDs from the backlog (`VCR-001`, `WFPR-003`, …).
- Name branches `<TICKET>-<short-name>`. Start commits and PR titles with `<TICKET>: <description>`.
- Each ticket ships a manual test plan at `docs/<TICKET>-testing.md` with sections Issue, Test Cases (TC-01… with Steps and Expected), and Result. Add or update it alongside the feature.
- Pull requests get an automatic Claude review (`.github/workflows/claude-code-review.yml`, Anthropic's `code-review` plugin, which also checks changes against this file), and `@claude` in a PR or issue comment asks Claude about it (`claude.yml`, read-only). Both came from `/install-github-app`; keep them as generated unless the user asks otherwise. Setup and the `CLAUDE_CODE_OAUTH_TOKEN` secret: README → "Claude Code review".
- Never end a filename with a space or dot. It breaks checkout on Windows (this already happened with an HTE-89 doc).

## Watch out for

- `Dashboard.js` sees many parallel feature branches, so merge conflicts there are common. Past merges have left duplicated JSX fragments outside conflict markers. After resolving a conflict, check that the file still parses (`npm run build` or `npx eslint src/pages/Dashboard/Dashboard.js`).
- Secrets: `server/.env`, `.env.local`, `server/serviceAccountKey.json` (legacy) and `server/node_modules/` are git-ignored; GitHub push protection rejects pushes that contain credentials. The Supabase service-role key belongs only in `server/.env` or the migration scripts' environment, never in the frontend. Never print, copy or commit secret values, and don't add credentials to tracked files.
- Shared projects: don't run `supabase db push`, `supabase functions deploy` or write to Supabase, and don't run `firebase deploy` or write to Firestore (`xicotencatl`), unless the user explicitly asks.
- Known defects and open decisions (record new ones here; fix them only in the ticket that owns them):

  | Defect | Where |
  | --- | --- |
  | `OPERATIONS_BY_PHASE` nests Operations inside Phases, the reverse of ISA-88 (Phases inside Operations); VCR-001 proposes flipping it | `Dashboard.js` |
  | Hierarchy panel expand state is keyed by label, so same-named rows expand together (fixed for User Created Definitions, which key by id) | `TreeViewExample` |
  | `/api/deploy-workflow` doesn't require a signed-in deployer (follow-up from PR #1) | `deployWorkflowRoutes.js` |
  | `MenuBar` ignores props `Dashboard` passes it (`userRoles`, `title`, `onApprove`, `isDeployer`), so the menu's Review button has no handler; `OpenWorkflowModal` ignores `workflows` (it loads its own list). Found by the typecheck; the components accept any props until this is cleaned up | `MenuBar` in `Dashboard.js`, `OpenWorkflowModal.js` |
  | `Selecto` gets the canvas ref object as `container` instead of the element (cast to `any` for the typecheck, behaviour left as is) | `Dashboard.js` |
  | The deploy validator's XML parser (`fast-xml-parser` 5.3) is quadratic on one long run of text: a single 100 kB text node takes about 19 s and 200 kB about a minute. Compiler output (many short elements) is fast (3 MB in under 1 s), and the server only listens on 127.0.0.1, but any local client can stall it. A fix needs a pre-parse guard or a parser change (found in the HTE-108 review) | `server/src/validarWorkflow.js`, `deployWorkflowRoutes.js` |
  | The deploy validator skips the connection check when `<Connections>` appears twice (the parser turns it into an array, so `.Connection` is undefined), and it never checks that `from`/`to` name an existing `<Node>`. Both compilers already reject such graphs; only hand-written XML posted to `/api/deploy-workflow` gets through (found in the HTE-108 review; HTE-108 kept the validator unchanged) | `server/src/validarWorkflow.js` |
  | The Equipment tree is sample data (*Enterprise Node* → four machines) that doesn't follow the documented Equipment hierarchy; Assets has its two branches (Assets Definitions, Assets Instances) but nothing beneath them | `equipmentData.js`, `assetsNode` in `Dashboard.js` |

- RLS gotchas: a client `insert … returning` on `workflows` fails because the read policy depends on `workflow_designers`, which the trigger fills after the insert. `createWorkflow` generates the id client-side and inserts without `returning`. An update that RLS filters out returns zero rows instead of an error, so `saveWorkflow` checks the row count.
