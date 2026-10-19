# Kukulcan

A browser-based visual editor for manufacturing workflows. Designers drag procedures, equipment, materials and personnel from a hierarchy panel onto a canvas, connect them into a workflow, send it through a review/approval process, compile it to XML and deploy it to an [Ignition](https://inductiveautomation.com/ignition/) gateway.

## Architecture

| Part | Location | Stack | Purpose |
| --- | --- | --- | --- |
| Web app | `src/` | React 19, Create React App, React Router 7 | Login, home, and the workflow designer (`/dashboard`) |
| Database | `supabase/migrations/` | Supabase Postgres, Row-Level Security | Users' roles, workflows, collaborators, history, server logs; status changes run as Postgres functions (RPC) |
| Edge Function | `supabase/functions/compile-xml/` | Supabase Edge Functions (Deno) | Validates a workflow and compiles it to XML (signed-in users only) |
| Local API server | `server/` | Express 5, Node | Health checks, local JSON→XML compile, and deploying workflow XML to Ignition |
| Auth | Supabase Auth | Email and password | Sign-in, sign-up, sessions |

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

Clients can only edit a workflow's `name` and `nodes`, and only while they are one of its designers and it is in `draft` or `changes_requested`. Every other change goes through a `security definer` RPC that rechecks the rules: `submit_for_review`, `assign_reviewer`, `approve_workflow`, `request_changes`, `add_designer`, `remove_designer` and `checkout_workflow`. Only the assigned reviewer can approve or request changes, and only while they still have the `reviewer` role. Choosing "-- Unassigned --" clears the reviewer without changing the status. Errors use fixed codes (`28000` no session, `42501` no permission, `P0002` not found, `P0001` wrong status), which `mappers.js` turns into the app's codes.

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
| POST | `/api/compile` | Validates a workflow JSON (`nodes`, `connections`; exactly one Begin and one End) and returns XML |
| POST | `/api/deploy-workflow` | Validates workflow XML (`Content-Type: application/xml`) and forwards it to Ignition |

### Database and Edge Function

```bash
supabase link --project-ref <ref>
supabase db push                          # apply supabase/migrations/
supabase functions deploy compile-xml     # JWT verification stays on (supabase/config.toml)
```

Every schema change ships as a new file in `supabase/migrations/`. `npm run test:node` runs the migrations against an in-memory Postgres (PGlite) and checks the RLS and RPC rules, so you can test them without Docker.

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

Claude Code asks you to approve project servers the first time you run `claude` in the repo; check them with `claude mcp list`. On native Windows, if the `firebase` server fails to start, change its `command` to `cmd` and put `"/c", "npx"` in front of its args. Don't commit tokens to `.mcp.json`.

## Scripts (root)

| Command | Description |
| --- | --- |
| `npm start` | Start the dev server |
| `npm run build` | Build for production into `build/` |
| `npm test` | Run Jest in watch mode |
| `npm run test:node` | Run the Node tests: database (PGlite), `compile-xml`, server logger, migration transforms |
| `npm run lint` | Run ESLint |
| `npm run format` / `npm run format-check` | Run Prettier (write / check) |
| `npm run lint:css` / `npm run lint:html` | Run Stylelint / HTMLHint on `public/` |

CI (`.github/workflows/code_check.yaml`) runs `npm run lint`, `npm run format-check`, the Jest unit tests (`npm test`) and `npm run test:node` on every pull request to `main`.

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
- `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_PUBLISHABLE_KEY` and `NODE_VERSION=22` go in **Settings → Build → Variables and secrets** (build variables). Create React App compiles them into the static bundle during `npm run build`, and the bundle can't read Worker runtime variables. (The dashboard also refuses runtime variables on this Worker because it serves assets without a script; a Worker with a script would accept them, but the app still wouldn't see them.)
- In Supabase **Authentication → URL Configuration**, set Site URL to the production URL and add exactly `https://kukulcan.ramirezgjennyg.workers.dev/set-password`. Don't add a wildcard for previews: anyone with the publishable key can request a recovery email with any allowed `redirectTo`, so a wildcard would let any preview build (from any branch) receive users' recovery tokens. To test password emails on a preview, add that preview's exact `/set-password` URL and remove it afterwards.
- The Express server isn't deployed here: it runs on each user's machine (`127.0.0.1:3001`).

## Project layout

```
src/
  App.js                       routing + auth/role loading
  backend/supabaseClient.js    Supabase client init
  backend/authApi.js           sign-in/up/out, session listener, roles
  backend/workflowsApi.js      workflows CRUD, Realtime subscription, RPC wrappers, compile
  backend/mappers.js           row ↔ legacy shape, error codes
  constants/uiStrings.js       user-facing strings, grouped by page and component (UI_STRINGS); catalog data and
                               PLC identifiers stay in code (see CLAUDE.md)
  pages/
    Login/, Home/              login and landing pages
    Dashboard/Dashboard.js     the workflow designer: hierarchy tree, canvas, menu bar, node modals
    Dashboard/*Modal.js        save / open / share / version history / checkout / unsaved-changes dialogs
    Dashboard/equipmentData.js, MaterialData.js   static catalog data
  components/                  shared UI (ModalMessage, EquipmentDetails)
  styles/                      CSS per page/modal
public/ICONOSPNG/              toolbar icons
supabase/migrations/           schema, RLS, triggers and RPC functions
supabase/functions/compile-xml Edge Function (compiler.mjs holds the XML logic)
supabase/tests/                Node tests for the database and the compiler
server/src/                    Express API (routes/, logger.js, supabaseAdmin.js)
scripts/migration/             one-off Firebase → Supabase migration scripts
docs/HTE-*-testing.md          manual test plans, one per Jira ticket
```

## Contributing

- Name branches after the Jira ticket, e.g. `HTE-91-filtering`.
- Start commit messages and PR titles with the ticket: `HTE-91: add hierarchy filtering by element type`.
- Add a manual test plan for each ticket at `docs/HTE-<n>-testing.md` (issue, test cases with steps and expected results, outcome).
- Open PRs against `main`. Lint and Prettier must pass.
- Don't put a trailing space or dot at the end of a filename. Windows can't check those files out.
