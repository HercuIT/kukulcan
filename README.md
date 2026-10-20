# Kukulcan

A browser-based visual editor for manufacturing workflows. Designers drag procedures, equipment, materials and personnel from a hierarchy panel onto a canvas, connect them into a workflow, send it through a review/approval process, compile it to XML and deploy it to an [Ignition](https://inductiveautomation.com/ignition/) gateway.

## Architecture

| Part | Location | Stack | Purpose |
| --- | --- | --- | --- |
| Web app | `src/` | React 19, Create React App, React Router 7 | Login, home, and the workflow designer (`/dashboard`) |
| Database | `supabase/migrations/` | Supabase Postgres, Row-Level Security | Users' roles, workflows, collaborators, history, server logs; status changes run as Postgres functions (RPC) |
| Edge Function | `supabase/functions/compile-xml/` | Supabase Edge Functions (Deno) | Validates a workflow and compiles it to XML (signed-in users only) |
| Local API server | `server/` | Express 5, Node | Health checks, local JSON→XML compile, and deploying workflow XML to Ignition |
| Auth | Supabase Auth | Email and password, email confirmation required | Sign-in, sign-up (`/register`, confirmed through `/auth/confirm`), sessions |

```
Browser (React, :3000)
 ├── Supabase Auth, tables and RPC (src/backend/*Api.js; RLS checks every request)
 ├── Supabase Realtime (live updates of the open workflow)
 ├── Edge Function compile-xml (supabase.functions.invoke)
 └── /api/*  ──proxy──▶  Express server (:3001)  ──▶  Ignition Gateway (webdev API)
                                                └──▶  Supabase `server_logs` (service role)
```

Components never import Supabase directly: they call `src/backend/authApi.js` and `src/backend/workflowsApi.js`, which return workflows in the shape the UI has always used (`{ id, name, content: { nodes }, metadata: { … } }`, built in `src/backend/mappers.js`).

### Roles

Each user's roles live in the `profiles` table (`designer`, `reviewer`, `deployer`) and are loaded after login (`src/App.js`). Signing up creates a profile with every role off (a trigger on `auth.users`). Roles are granted by an admin in the Supabase dashboard or with the service role; clients can't change them.

### Workflow lifecycle

Workflows live in the `workflows` table. Their designers are in `workflow_designers`, and checkout notes and change requests are in `workflow_history`:

```
draft ──submit_for_review / assign_reviewer──▶ pending_review ──approve_workflow──▶ approved
  ▲                                                   │
  └──────── (edit) ◀── changes_requested ◀──request_changes──┘
```

Clients can only edit a workflow's `name`, `nodes` and `connections`, and only while they are one of its designers and it is in `draft` or `changes_requested`. Every other change goes through a `security definer` RPC that rechecks the rules: `submit_for_review`, `assign_reviewer`, `approve_workflow`, `request_changes`, `add_designer`, `remove_designer` and `checkout_workflow`. Only the assigned reviewer can approve or request changes, and only while they still have the `reviewer` role. Choosing "-- Unassigned --" clears the reviewer without changing the status. Errors use fixed codes (`28000` no session, `42501` no permission, `P0002` not found, `P0001` wrong status), which `mappers.js` turns into the app's codes.

### Glossary

| Term | Meaning |
| --- | --- |
| Workflow | A designed process: a row in `workflows`, whose `nodes` hold the canvas nodes. Its status moves `draft` → `pending_review` → `approved`, or from `pending_review` to `changes_requested` and back to editing (see "Workflow lifecycle") |
| Node | One element on the canvas (`type`, `label`, position, and optionally `parameters` and `implementation`). Begin/Start and End are special node types |
| Connection | A directed link `from` → `to` between two nodes, saved with the workflow in `workflows.connections` (a JSON array; `null` on workflows saved before WFPR-003, which reopen with the default Begin → Connection 1 → End edges). Connections to a deleted node are dropped on the canvas and never saved |
| Node definition | A reusable template placed on the canvas from the hierarchy panel. **Pre-defined** ones come from the built-in catalog. **User-created** ones come from the Create Node modal (name, version, implementation, parameters), are shared by everyone through `user_definitions`, and can nest inside each other to any depth or contain references to pre-defined ones (WFPR-003). Dropping a user-created definition on the canvas places it and all its descendants as connected nodes |
| ISA-88 levels | The procedural hierarchy definitions belong to, outermost first: Site Procedure, Area Procedure, Procedure, (Procedure) Unit Procedure, (Procedure) Operation, (Procedure) Phase |
| Operation / Phase | The two lowest ISA-88 levels. **Intended rule:** a Phase (e.g. Add Ingredient) runs inside an Operation (e.g. Mixing). **Current catalog:** it's inverted: `PROCEDURE_PHASES` lists Mixing, Drying and Inspection as phases, and `OPERATIONS_BY_PHASE` lists Add Ingredient and the others as their operations. VCR-001 proposes flipping it |
| Parameter | A named value on a node (`name`, `value` or `defaultValue`, units, data type). Deploy requires every non-Begin/End node to have at least one, and every `<Parameter>` to have a non-empty `name` and `value` (see "Ignition XML contract") |
| Rule set | The version-controlled hierarchy rules proposed in VCR-001 (which levels and definitions may contain which) |
| Roles | Flags in `profiles`: **designer** (creates and edits workflows), **reviewer** (approves or requests changes when assigned), **deployer** (sees approved workflows to deploy). VCR-001 proposes **rule_admin** |
| Ignition | The Inductive Automation gateway that receives the compiled XML through its `recibirXML` webdev endpoint |

### Equipment and Assets hierarchy

The target structure for the **Equipment** root of the hierarchy panel, from the business's *Equipment and Assets Hierarchy* spreadsheet. Every element is user-defined, and each exists twice under the enterprise instance:
- **Site Definitions:** the classes, e.g. *Site 1 Class*.
- **Sites:** the instances built from them, e.g. *Site 1 Instance*.

The two branches have the same shape. The tree shows one example path from the spreadsheet, with "User Defined" dropped and examples shortened. **The containment table below is the rule**; the tree only illustrates it.

```
Equipment
└── Enterprise
    └── Enterprise instance (e.g. Enterprise 1)
        ├── Site Definitions                                  ← classes ("… Class")
        │   └── Site Definition (e.g. Site 1 Class)
        │       └── Area Definition (Area 1 Class)
        │           ├── Work Center Definition (Work Center 1 Class)
        │           │   └── Equipment Module 1
        │           │       └── Sequencer 1
        │           │           ├── Route 1
        │           │           │   └── Control Module 1
        │           │           │       ├── Device 1
        │           │           │       └── Field IO 1
        │           │           ├── Control Loops (Control Loop 1)
        │           │           │   └── Control Module 1
        │           │           │       ├── Device 1
        │           │           │       └── Field IO 1
        │           │           └── Control Module 2
        │           │               ├── Device 2
        │           │               ├── Field IO 2
        │           │               └── Control Module 3
        │           │                   ├── Device 3
        │           │                   └── Field IO 3
        │           └── …                                     other types an Area may hold directly: see the table
        └── Sites                                             ← instances ("… Instance")
            └── Site 1 → Area 1 → Work Center 1 → …           same shape as Site Definitions
```

**Containment rules (authoritative).** Each branch of the spreadsheet ends with blocks that repeat Equipment Module, Sequencer, Route, Control Module and Control Loops, one level deeper each time. Laid out as a tree, they'd look like Equipment Modules nested inside Control Loops. We read them as the types each level may contain directly, which matches the main chain, so the tree above leaves them out. This table is that reading, still to be confirmed with the business:

| Level (Definition or Instance) | May contain |
| --- | --- |
| Enterprise instance | Site Definitions, Sites |
| Site | Area |
| Area | Work Center, Equipment Module, Sequencer, Route, Control Module, Control Loops |
| Work Center | Equipment Module, Sequencer, Route, Control Module, Control Loops |
| Equipment Module | Equipment Module, Sequencer, Route, Control Module, Control Loops |
| Sequencer | Sequencer, Route, Control Module, Control Loops |
| Route | Control Module |
| Control Loops | Control Module |
| Control Module | Device, Field IO, Control Module |
| Device, Field IO | Nothing (leaves) |

Levels may be skipped: an Area can hold a Control Module directly, without a Work Center, Equipment Module or Sequencer between them. Equipment Module, Sequencer and Control Module can nest inside their own type.

**Not covered yet:**
- **Assets:** the spreadsheet only details Equipment. The Assets root has its two branches, Assets Definitions and Assets Instances, but nothing defined beneath them.
- **The app's Equipment tree:** today it's sample data in `src/pages/Dashboard/equipmentData.js` (*Enterprise Node* → four machines) and doesn't follow this hierarchy.

## Getting started

### Prerequisites

- Node.js 22 or later (CI and the Docker build use 22; `@supabase/supabase-js` requires it)
- npm
- A Supabase project with `supabase/migrations/` applied, and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) if you change the database or the Edge Function

### Web app

```bash
npm install
cp .env.example .env.local   # then fill in the two values below
npm start                    # http://localhost:3000
```

| Variable (`.env.local`, git-ignored) | Meaning |
| --- | --- |
| `REACT_APP_SUPABASE_URL` | Supabase project URL |
| `REACT_APP_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key. Safe in the browser because RLS guards the data |
| `REACT_APP_LOCAL_SERVER_CHECK` | Optional. `true` makes Home check `http://localhost:3001/api/health` every 3 s and show the "server not available" dialog until the local server answers. Unset (the default, and on the deployed site) skips the check |

The dev server sends `/api/*` requests to `http://localhost:3001` (the `proxy` setting in `package.json`). Start the local API server if you need health checks or deploy.

### Local API server

```bash
cd server
npm install
node src/index.js      # or: npx nodemon src/index.js
```

The server listens on `127.0.0.1:3001` and reads these settings from `server/.env`:

| Variable | Meaning |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key, used to write `server_logs` and to check the caller's token. Server-side only |
| `IP_IGNITION` | Ignition gateway host |
| `PORT_IGNITION` | Ignition gateway port |
| `USER_IGNITION` / `PASSWORD_IGNITION` | Gateway basic-auth credentials |
| `PROJECT_NAME_IGNITION` | Ignition project hosting the `recibirXML` webdev endpoint |

`server/.env.example` lists them. `server/.env` is git-ignored: create it locally and never commit it. Each log call inserts one `server_logs` row (`level`, `event`, `request_id`, `workflow_id`, `user_id`, other fields in `details`); a failed insert is printed to the console and never breaks the request. `/api/deploy-workflow` logs the caller's Supabase user id when the request carries `Authorization: Bearer <access token>`, and `unknown` otherwise.

Endpoints:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness check |
| GET | `/api/ignition-health` | Checks that the Ignition gateway is reachable and `RUNNING` |
| POST | `/api/compile` | Compiles a workflow JSON with the same compiler as `compile-xml` (`supabase/functions/compile-xml/compiler.mjs`; the server must run from a checkout that includes `supabase/`). Target `ignition` by default: returns the `<Workflow>` document `/api/deploy-workflow` accepts, or 400 naming each node/parameter that would fail deploy. Send `"target": "controller"` for the PLC document. Bodies up to 5 MB |
| POST | `/api/deploy-workflow` | Validates workflow XML (`Content-Type: application/xml`, up to 10 MB) and forwards it to Ignition. Its request log stores the body's size and a 2,000-character preview, not the whole body |
| POST | `/api/deploy-siemens` | Stub (HTE-110): checks the request shape and logs it, but always answers `501 NOT_CONFIGURED`. There is no TIA Portal Openness server to push to yet — see `CLAUDE.md` → "Watch out for" |

### Ignition XML contract

`/api/deploy-workflow` checks the XML (`validarWorkflow` in `server/src/validarWorkflow.js`, used by `server/src/routes/deployWorkflowRoutes.js`), then POSTs it unchanged to `http://<IP_IGNITION>:<PORT_IGNITION>/system/webdev/<PROJECT_NAME_IGNITION>/api/recibirXML` with basic auth. The XML it accepts:

```xml
<Workflow id="W-001" name="…" version="…">            <!-- root element; id required, non-empty -->
  <Nodes>
    <Node id="n1" type="BeginElement" name="Begin"/>   <!-- Begin/End: no parameters needed -->
    <Node id="n2" type="NodeDefinitionName" name="Mixing">
      <Parameters>                                    <!-- required on every other node -->
        <Parameter name="Speed" value="10" unit="rpm"/> <!-- name and value required, non-empty -->
      </Parameters>
    </Node>
    <Node id="n3" type="EndElement" name="End"/>
  </Nodes>
  <Connections>
    <Connection from="n1" to="n2"/>                    <!-- from and to required -->
  </Connections>
</Workflow>
```

- **One builder, two targets.** There is one compiler, `supabase/functions/compile-xml/compiler.mjs`, used by the `compile-xml` Edge Function and by `POST /api/compile`. `buildWorkflowXml(wf)` renders the `<Workflow>` element above; the body's `target` picks the document:
  - `controller` (the default for `compile-xml`, unchanged): the PLC document, which embeds that `<Workflow>` inside `<Controller>`/`<Programs>`/`<SFCContent>`. It is what the app's Compile button downloads, and it is **not** deployable (no `<Workflow>` root).
  - `ignition` (the default for `/api/compile`): exactly the document above. In the frontend it's available as `compileWorkflow(workflow, { target: "ignition" })`, but no screen calls it yet: the Compile button still downloads the controller document, and there's no Deploy button. The document is capped at 10 MB (`LIMITS.maxXmlBytes`, a 413 at compile time), the same size `/api/deploy-workflow` accepts, so anything that compiles for Ignition fits the deploy endpoint. Before building it, `validateDeployable` applies the deploy validator's node rules to the JSON, so an incomplete workflow fails at compile time with `400 Fallo de compilación` and one error per node or parameter (`El workflow necesita un id que no esté en blanco.`, `El nodo '<name>' debe tener al menos un parámetro.`, `El nodo '<name>' tiene un parámetro sin nombre.`, `El nodo '<name>' requiere un valor para el parámetro '<param>'.`). An unknown target returns `400 Target desconocido: '<value>'. Usa 'controller' o 'ignition'.`
- `supabase/tests/xml-contract.test.mjs` (in `npm run test:node`) compiles a set of fixtures through both paths and feeds each result to `validarWorkflow`: complete workflows with grouped and flat parameters, Begin → End only, escaped names, 5,000 nodes, skipped empty rows, and the failing cases (missing values or names, blank id, unknown target). It catches drift in those scenarios; it doesn't prove every possible workflow deploys, so add a fixture when you change either side.
- Node types: Begin/Start → `BeginElement`, End → `EndElement`, and any other type passes through unchanged (an ISA-88 level stays e.g. `Procedure Phase`; node ids stay the canvas ids). The deploy validator doesn't check `type`. What `recibirXML` expects for procedural nodes is unconfirmed.
- Parameters come from grouped (`{ group: [...] }`) or flat (`[{ name, dataType, defaultValue }]`) arrays; `value` falls back to `defaultValue` only when it's missing, and rows with no name, value or units are skipped.
- Ignition answers with a JSON `status`/`message`. "The file already exists in the destination folder." means a workflow with that file name was already deployed.
- **Changing the contract:** any change (new elements such as nested nodes, new required attributes) needs the Ignition project's `recibirXML` script to change too. Specs treat it as a non-goal unless the story says otherwise.

### Database and Edge Function

```bash
supabase link --project-ref <ref>
supabase db push                          # apply supabase/migrations/
supabase functions deploy compile-xml     # JWT verification stays on (supabase/config.toml)
```

Every schema change ships as a new file in `supabase/migrations/`. `npm run test:node` runs the migrations against an in-memory Postgres (PGlite) and checks the RLS and RPC rules, so you can test them without Docker.

The project is `xiidwepvvjcqyhywmdrn`. Merges to `main` that touch `supabase/` deploy automatically: `.github/workflows/deploy_supabase.yaml` runs `supabase db push` and `supabase functions deploy compile-xml` (it can also be run by hand from the Actions tab). It needs three repository secrets (GitHub → Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | A **scoped** Supabase personal access token limited to this project (see below), not an account-wide one |
| `SUPABASE_DB_PASSWORD` | The project's database password |
| `SUPABASE_PROJECT_ID` | The project ref, `xiidwepvvjcqyhywmdrn` |

Create the token at Supabase → Account → **Access Tokens**: choose **Resources** → selected projects → only `xiidwepvvjcqyhywmdrn`, an **expiry** (at most one year; rotate the secret before it expires), and only these **permissions** ([what each covers](https://supabase.com/docs/guides/platform/personal-access-tokens)):

| Permission | Level | Used by |
| --- | --- | --- |
| Project Settings | Read | `supabase link` |
| API Keys, API Key Secrets | Read | `supabase link` |
| Database | Read-write | `supabase db push` (creates its temporary login role) |
| Migrations | Read-write | `supabase db push` (migration history) |
| Edge Functions | Read-write | `supabase functions deploy compile-xml` |

If a step fails with a permission error, the message names the missing permission: create a new token with it added (scoped tokens can't be edited). Don't use the token from the browser `supabase login`, which is account-wide.

The job only runs for `main`, including manual runs, and its actions are pinned to commit SHAs. The workflow doesn't touch Auth settings: Site URL and redirect URLs are set in the dashboard. Don't run `supabase config push`, which would overwrite them with the local values in `supabase/config.toml`.

### Firebase → Supabase data migration

One-off scripts in `scripts/migration/`, with their own `package.json`. Run every command below from that folder (`cd scripts/migration && npm install` first). They don't read `server/.env`: set these variables in the shell instead:

| Variable | Meaning |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a Firebase service-account key file (outside the repo, never committed); used to read Firestore |
| `FIREBASE_PROJECT_ID` | Optional; defaults to `xicotencatl` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Target Supabase project and its service-role key |
| `SITE_URL` | App URL, for step 4 only |

Steps:

1. `firebase auth:export users.json --format=json --project xicotencatl`, then `node import-users.js users.json`: creates each user in Supabase Auth without a password, copies their roles to `profiles` (creating the profile if it's missing) and writes `out/uid_map.json`.
2. `node migrate-data.js [--dry-run] [--skip-logs]`: copies workflows, designers, history and `server_logs`, rewriting every Firebase UID (workflows and logs). It reads and validates everything first and writes nothing if any UID is unmapped. Each workflow is written in one transaction by the `migrate_workflow` RPC (service role only). Logs are inserted under a run id, and earlier runs' logs are deleted only after every insert succeeds. Safe to rerun after a failure.
3. `node verify.js [--skip-logs]`: compares counts and per-workflow node checksums, status, version and designers. Exits 1 on any mismatch. Pass `--skip-logs` if step 2 did.
4. On cutover day: `SITE_URL=<app URL> node send-password-resets.js [--dry-run]`: emails every imported user a link to `<SITE_URL>/set-password`, where the app asks for their new password. Users that already had a Supabase account with the same email are tagged in step 1 and get the email too. Before running it, add exactly `<SITE_URL>/set-password` to Supabase Auth's redirect URLs (only that page, not a wildcard) and configure custom SMTP (the built-in mailer is rate-limited).

`/users.json`, `scripts/migration/users.json` and `out/` are git-ignored.

### MCP servers for AI coding agents

`.mcp.json` registers MCP servers for Claude Code and other MCP-capable agents working in this repo:

| Server | What it is | Access |
| --- | --- | --- |
| `firebase` | Firebase CLI MCP server (`npx firebase-tools@latest mcp --only auth,firestore`), kept to inspect the old data until the Firebase project is deleted | Your Firebase CLI login (`firebase login`) on project `xicotencatl` |
| `supabase` | Supabase hosted MCP server (`https://mcp.supabase.com/mcp?read_only=true`) | OAuth in the browser on first use; read-only |
| `linear` | Linear hosted MCP server (`https://mcp.linear.app/mcp`), used to post spec links on `HTE-<n>` issues (see "Specs") | OAuth in the browser on first use; acts as you, with your Linear permissions |
| `context7` | Hosted MCP server (`https://mcp.context7.com/mcp`) for public library/framework/API documentation lookups | No sign-in; no repo access, public docs only |
| `postman` | Postman hosted MCP server (`https://mcp.postman.com/mcp`, Full mode; `https://mcp.eu.postman.com/mcp` for EU workspaces), used to build a mock server standing in for the TIA Portal Openness endpoint (HTE-110) until that real server exists | OAuth in the browser on first use; acts as you, with your Postman workspaces |

Agent instructions live in `CLAUDE.md`; `GEMINI.md` imports it for Gemini CLI (which reads MCP servers from `.gemini/settings.json`, not `.mcp.json`). Claude Code asks you to approve project servers the first time you run `claude` in the repo; check them with `claude mcp list`. On native Windows, if the `firebase` server fails to start, change its `command` to `cmd` and put `"/c", "npx"` in front of its args. Don't commit tokens to `.mcp.json`.

## Scripts (root)

| Command | Description |
| --- | --- |
| `npm start` | Start the dev server |
| `npm run build` | Build for production into `build/` |
| `npm test` | Run Jest in watch mode |
| `npm run test:node` | Run the Node tests: database (PGlite), `compile-xml`, the XML deploy contract, server logger, migration transforms. The contract test needs `server/`'s dependencies: run `npm ci --prefix server` once (CI does) |
| `npm run lint` | Run ESLint |
| `npm run format` / `npm run format-check` | Run Prettier (write / check) |
| `npm run typecheck` | Type-check the JavaScript with TypeScript (`checkJs`, `tsconfig.typecheck.json`): `src/`, `server/src/`, the compiler and `scripts/*.js`. Needs `server/`'s dependencies (`npm ci --prefix server`) for the Express and axios types |
| `npm run lint:css` / `npm run lint:html` | Run Stylelint / HTMLHint on `public/` |
| `npm run theme` | Regenerate `src/styles/theme.css` from `src/styles/tokens.json` (see "Theme") |

CI (`.github/workflows/code_check.yaml`) installs the root and `server/` dependencies, then runs `npm run lint`, `npm run format-check`, `npm run typecheck`, the Jest unit tests (`npm test`) and `npm run test:node` on every pull request to `main`. Test files are left out of lint, Prettier and the typecheck (`.eslintignore`, `.prettierignore`, `tsconfig.typecheck.json`); Jest and `test:node` still run them.

## Sign-up and email confirmation

New accounts must confirm their email before they can sign in (HTE-107).

- **Register:** the login page links to `/register` (`src/pages/Register/`): email, password and confirmation, validated on blur and on submit with the shared rules in `src/constants/passwordRules.js` (8–72 characters, at least one letter and one digit; the same rules Supabase enforces). Submitting calls `signUp` with `emailRedirectTo = <origin>/auth/confirm` and shows "Check your email". The screen is the same whether or not the address is already registered, so the form never reveals who has an account. Resend is allowed once every 60 seconds.
- **Confirm:** the email links to `{{ .RedirectTo }}?token_hash=…&type=email`, where `RedirectTo` is the `emailRedirectTo` the app sent (`<origin>/auth/confirm`, `src/pages/AuthConfirm/`), which calls `verifyOtp`. Each origin gets its own link only if it's listed in Supabase's Redirect URLs; otherwise Supabase uses the Site URL (production), and the app forwards a link that lands on `/?token_hash=…` to `/auth/confirm`. As with `/set-password`, don't add a wildcard for previews (a preview build would receive users' confirmation tokens); add a preview's exact `/auth/confirm` URL only while testing it. Supabase confirms the account and opens a session, and the app goes to Home. An expired or used link (24 h, one use) or a malformed one offers to resend; a network error offers Retry. The link carries a token hash, so it works on another device.
- **Sign in unconfirmed:** the login page says to confirm the email and shows a Resend button instead of "incorrect password".
- **Profiles:** a `profiles` row (no roles) is created when the account is confirmed, not when it signs up (migration `hte_107_profile_on_confirm`), so unconfirmed accounts don't appear in the share dialog and can't be added as designers. Accounts created already confirmed (service role, imports) still get it on insert.
- **Settings:** `supabase/config.toml` turns this on for the local stack (`enable_confirmations`, `otp_expiry = 86400`, `max_frequency = "60s"`, the password rules, the `/auth/confirm` redirect and the template `supabase/templates/confirmation.html`). That file isn't deployed. On the live project, in this order:
  1. Set up custom SMTP and send a test email (the built-in sender only reaches team members, about 2 emails an hour).
  2. Add `https://kukulcan.ramirezgjennyg.workers.dev/auth/confirm` to the redirect URLs and paste `supabase/templates/confirmation.html` under Email Templates → Confirm signup.
  3. Merge the PR (the migration runs through `deploy_supabase.yaml`; it's safe before step 4 because every current user is confirmed, and it refuses to run otherwise).
  4. Turn on Confirm email, set the email OTP expiry to 86400 s, and set the minimum password length to 8 with letters and digits required.
  5. Register a test account end to end, then delete it.

  Rollback: turn Confirm email off. Accounts created meanwhile stay unconfirmed until they open their link.

## Theme

The app uses the Kukulcan design system ([design system artifact](https://claude.ai/artifact/HtfdxXknT5ywmgbgJZTrt4)), with a light and a dark theme.

- **Tokens:** `src/styles/tokens.json` is an exact copy of the design system's tokens. `npm run theme` (`scripts/build-theme.js`) generates `src/styles/theme.css` from it: `--kk-*` custom properties (colors and shadows per theme, spacing, radii, font families) and `.kk-text-<style>` classes. Don't edit `theme.css` by hand; `src/styles/theme.test.js` fails if it differs from the generator's output, or if (read from the generated CSS, both themes) `ink`/`ink-muted` on `bg`/`surface`/`raised`, any status pill (Deployed included) or `on-brand` on brand fills drop below 4.5:1, or `border-strong` below 3:1 on `surface`. Body text uses the generated `.kk-text-body` class (on `<body>`); the logo uses `.kk-text-wordmark` / `.kk-text-display`.
- **No color literals in app code:** every design color in the app's CSS and JS (`src/`, test files aside) is a `var(--kk-…)`. `src/styles/noHardcodedColors.test.js` fails on a hex value, a color function (`rgb()`, `hsl()`, `oklch()`…) or any of the 148 CSS named colors in any letter case, in CSS values and in JS style strings. The keywords `transparent`, `currentColor` and `inherit` aren't design colors and stay allowed. Two places can't read CSS variables and keep literals on purpose: the `theme-color` tags in `public/index.html` (the `raised` values) and `manifest.json`, and the brand SVGs in `public/brand/`. Backdrops use `--kk-scrim` and filled-button hovers `--kk-hover-overlay` (both in `src/index.css`); secondary controls hover one step up (`surface` → `raised`). SVG colors go in `style` (`style={{ stroke: "var(--kk-cyan-text)" }}`), because presentation attributes don't resolve `var()`.
- **Switching:** View → Light theme / Dark theme / Use system theme. `src/theme/ThemeContext.js` (`ThemeProvider`, `useTheme()`) sets `data-theme` on `<html>` and saves the choice per browser in `localStorage` key `kukulcan.theme` (no key = follow the OS, live). An inline script in `public/index.html` applies the same choice before React loads, so the page doesn't flash the wrong theme, and both set the browser chrome color (`theme-color`) to the chosen theme's `raised`. **Installed app (PWA) limitation:** `manifest.json` can't vary by color scheme, so its `background_color` (the launch splash) is the light `bg`; an installed app opened in dark mode can show that light splash for a moment before the page applies the dark theme. The no-flash guarantee covers the page itself, not the splash.
- **Logo:** `src/components/Logo/Logo.js` renders the lockup (`size="sm"` in menu bars, `"lg"` on Login, Set Password and Home; `to` makes it a link). Brand files live in `public/brand/` (`kukulcan-mark.svg`, `-mark-ink`, `-mark-white`, `-favicon`); `favicon.ico`, `logo192.png` and `logo512.png` are rendered from them.
- **Fonts:** loaded from Google Fonts in `public/index.html`. Use one of `var(--kk-font-sans)`, `var(--kk-font-display)` or `var(--kk-font-mono)`, or a `.kk-text-<style>` class.

## Deployment

The `Dockerfile` builds the React app and serves `build/` with nginx on port 80:

```bash
docker build -t kukulcan \
  --build-arg REACT_APP_SUPABASE_URL=<project URL> \
  --build-arg REACT_APP_SUPABASE_PUBLISHABLE_KEY=<publishable key> .
docker run -p 8080:80 kukulcan
```

Create React App compiles `REACT_APP_SUPABASE_*` into the bundle, so pass them as build args (or set them in your hosting provider's build settings). Without them the app stops at load with an error naming the missing variables. CI doesn't need them: the Jest tests mock the Supabase client. The database and Edge Function deploy separately with the Supabase CLI (see above).

### Cloudflare Workers

The app is also deployed as a static-assets Worker, `kukulcan` (production: `https://kukulcan.ramirezgjennyg.workers.dev`; previews: `https://*-kukulcan.ramirezgjennyg.workers.dev`). `wrangler.jsonc` serves `build/` and falls back to `index.html` for React Router paths.

- Build command `npm run build`, deploy command `npx wrangler deploy` (Workers Builds, connected to this repo).
- `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_PUBLISHABLE_KEY` go in **Settings → Build → Variables and secrets** (build variables). The Node version comes from `.node-version` (22). Create React App compiles them into the static bundle during `npm run build`, and the bundle can't read Worker runtime variables. (The dashboard also refuses runtime variables on this Worker because it serves assets without a script; a Worker with a script would accept them, but the app still wouldn't see them.)
- In Supabase **Authentication → URL Configuration**, set Site URL to the production URL and add exactly `https://kukulcan.ramirezgjennyg.workers.dev/set-password` and `https://kukulcan.ramirezgjennyg.workers.dev/auth/confirm` (see "Sign-up and email confirmation"). Don't add a wildcard for previews: anyone with the publishable key can request a recovery email with any allowed `redirectTo`, so a wildcard would let any preview build (from any branch) receive users' recovery tokens. To test password emails on a preview, add that preview's exact `/set-password` URL and remove it afterwards.
- The Express server isn't deployed here: it runs on each user's machine (`127.0.0.1:3001`).

## Project layout

```
src/
  App.js                       routing + auth/role loading
  backend/supabaseClient.js    Supabase client init
  backend/authApi.js           sign-in/up/out, session listener, roles
  backend/workflowsApi.js      workflows CRUD, Realtime subscription, RPC wrappers, compile
  backend/definitionsApi.js    User Created Definitions tree: RPC wrappers, Realtime, tree helpers, expand-on-drop
  backend/mappers.js           row ↔ legacy shape, error codes
  constants/uiStrings.js       user-facing strings, grouped by page and component (UI_STRINGS); catalog data and
                               PLC identifiers stay in code (see CLAUDE.md)
  pages/
    Login/, Home/              login and landing pages
    Dashboard/Dashboard.js     the workflow designer: hierarchy tree, canvas, menu bar, node modals
    Dashboard/*Modal.js        save / open / share / version history / checkout / unsaved-changes / move- and delete-definition dialogs
    Dashboard/UserDefinitionsTree.js   the User Created Definitions branch of the hierarchy panel (WFPR-003)
    Dashboard/canvasConnections.js     connections for a workflow being opened
    Dashboard/equipmentData.js, MaterialData.js   static catalog data
  components/                  shared UI (ModalMessage, EquipmentDetails, Logo)
  theme/ThemeContext.js        light/dark/system theme (ThemeProvider, useTheme)
  styles/                      CSS per page/modal; tokens.json + generated theme.css (see "Theme")
public/brand/                  Kukulcan logo SVGs
public/ICONOSPNG/              toolbar icons
supabase/migrations/           schema, RLS, triggers and RPC functions
supabase/functions/compile-xml Edge Function (compiler.mjs holds the XML logic; /api/compile uses it too)
supabase/tests/                Node tests for the database and the compiler
server/src/                    Express API (routes/, logger.js, supabaseAdmin.js)
scripts/migration/             one-off Firebase → Supabase migration scripts
docs/<TICKET>-testing.md       manual test plans, one per ticket or story (HTE-, VCR-, WFPR-…)
```

## Specs

Features are specified before they're built, as Claude Docs, using the section template in `CLAUDE.md` ("Writing specs"). Add each new spec here, and post its link as a comment on its Linear issue (`HTE-<n>`).

| Ticket | Spec | Status |
| --- | --- | --- |
| Supabase migration (HTE-supabase-migration) | [Kukulcan: Firebase → Supabase Migration Spec](https://claude.ai/code/artifact/30984f03-013f-4dd7-a1ae-8fe059596380) | Implemented (PR #1) |
| VCR-001 | [Version-Controlled Hierarchy Rules](https://claude.ai/code/artifact/b8a553aa-eeb5-4048-a173-d6b268216a3b) | Draft, partly written |
| WFPR-003 | [Nested User Created Node Definitions](https://claude.ai/code/artifact/9753755e-5f4d-43bb-93af-e9e59d416800) | Implemented (PR #6, merged); test plan `docs/WFPR-003-testing.md` |
| WFPR-004 | [Expandable Pre-Defined Definitions](https://claude.ai/code/artifact/cf5b6f1e-aa6f-400f-bc6f-f425c4349488) | Draft, depends on VCR-001; open questions pending |
| HTE-111 | [Spec: Theme and logo](https://claude.ai/code/artifact/bbc1a1f8-71e3-4839-834b-d630c81cae85) | Implemented on `feat/HTE-111` (PR #7); test plan `docs/HTE-111-testing.md` |
| HTE-107 | [HTE-107: Email confirmation and registration form](https://claude.ai/code/artifact/6b732d1e-e3b8-461c-8c72-2d61864a50d0) | Implemented on `feat/HTE-107-email-confirmation` (strings in English; open questions taken at the spec's defaults); test plan `docs/HTE-107-testing.md` |
| HTE-108 | [Spec: Compiled XML can't be deployed](https://claude.ai/code/artifact/6f4d1b1f-de3d-45c7-9a7f-93d1af0b8d81) | Implemented on `fix/HTE-108-compile-targets` (Option A); test plan `docs/HTE-108-testing.md` |
| HTE-113 | [HTE-113: Diagram saved as JSON, XML as build output](https://claude.ai/code/artifact/13541544-59af-4896-8390-492cb7f44ba8) | Draft; the base for VCR-018, HTE-14, HTE-16 and HTE-18 |
| VCR-018 | [VCR-018: Version-controlled workflow nodes](https://claude.ai/code/artifact/f577c7e5-399d-40d8-9ecd-7887fe73d658) | Draft, depends on HTE-113 |
| HTE-14 (VCR-003) | [HTE-14 (VCR-003): Version-controlled equipment entities](https://claude.ai/code/artifact/4a98385d-a73b-43a3-ad5e-4d30a18b2530) | Draft, depends on HTE-113 and VCR-018 |
| HTE-16 (VCR-004) | [HTE-16 (VCR-004): Version-controlled parameters](https://claude.ai/code/artifact/7b05ac16-d1cd-4866-9aca-ed32d789cd9f) | Draft, depends on HTE-113 and VCR-018 |
| HTE-115 | [HTE-115: Material id on canvas nodes](https://claude.ai/code/artifact/089baea3-d9cc-417c-8ebc-a0dda444bd48) | Draft; ids created by the app and checked against the database |
| HTE-18 (VCR-005) | [HTE-18 (VCR-005): Version-controlled materials](https://claude.ai/code/artifact/16b2cc43-65ec-4dc6-a2e6-661417e6a72f) | Draft, depends on HTE-115, HTE-113 and VCR-018 |
| HTE-20 (VCR-006) | [HTE-20 (VCR-006): Version-controlled work masters](https://claude.ai/code/artifact/a64fb9a3-23fe-4e2b-ae4a-2bf23a90f7c9) | Draft, depends on HTE-113; open questions pending |

## Claude Code review

Two workflows use Anthropic's [`claude-code-action`](https://github.com/anthropics/claude-code-action). They were created by `/install-github-app` in Claude Code, which also installed the Claude GitHub app and added the `CLAUDE_CODE_OAUTH_TOKEN` secret (the Claude subscription token of whoever ran it, not API billing):

- `.github/workflows/claude-code-review.yml` reviews every pull request when it's opened, updated, reopened or marked ready, with Anthropic's official `code-review` plugin (`/code-review:code-review --comment`). The plugin checks the change, including against `CLAUDE.md`, and posts its findings as inline comments plus a summary comment. With `track_progress: true` a progress comment appears on the PR as soon as the review starts and is updated with the result, so every new PR gets a comment even when nothing is found. The job may read the PR and comment (`gh pr view`, `gh pr diff`, `gh pr comment`, inline comments) but can't push: its repository contents permission is read-only. If a run stops before reaching the model (the action reports `is_error:true` after at most one turn, with no cost and no model usage, usually a usage limit or an expired token), the job stays green: a warning and the job summary say the review was skipped, and a `Claude Code Review (skipped)` check run is added to the PR with the conclusion *skipped*. Any other review error still fails the job. Push again or re-run the job to get the review.
- `.github/workflows/claude.yml` answers `@claude` in PR comments, review comments, reviews and issues (title or body). It also runs with read-only permissions (plus reading CI results), so it answers and comments but doesn't push changes.

Both use the action's moving `@v1` tag (and `actions/checkout@v4`), as the installer generates them. To redo the setup (for example after the token expires), run `/install-github-app` again or replace the secret with a new `claude setup-token` value. To filter which PRs get reviewed (authors, paths), see the commented options in `claude-code-review.yml`.

## Contributing

- Name branches after the ticket or story ID, e.g. `HTE-91-filtering` or `WFPR-003-nested-definitions`.
- Start commit messages and PR titles with it: `HTE-91: add hierarchy filtering by element type`.
- Add a manual test plan for each ticket at `docs/<TICKET>-testing.md` (issue, test cases with steps and expected results, outcome).
- Open PRs against `main`. Lint and Prettier must pass.
- All UI strings (`src/constants/uiStrings.js`) are in English; Spanish isn't supported yet. Older Spanish strings are translated when their component is touched.
- Don't put a trailing space or dot at the end of a filename. Windows can't check those files out.
