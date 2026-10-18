# Kukulcan

A browser-based visual editor for manufacturing workflows. Designers drag procedures, equipment, materials and personnel from a hierarchy panel onto a canvas, connect them into a workflow, send it through a review/approval process, compile it to XML and deploy it to an [Ignition](https://inductiveautomation.com/ignition/) gateway.

## Architecture

| Part | Location | Stack | Purpose |
| --- | --- | --- | --- |
| Web app | `src/` | React 19, Create React App, React Router 7 | Login, home, and the workflow designer (`/dashboard`) |
| Cloud Functions | `functions/` | Firebase Functions v2, Node 20 | Review workflow (submit, approve, request changes), designer/reviewer assignment, `compileXML` endpoint |
| Local API server | `server/` | Express 5, Node | Health checks, local JSON→XML compile, and deploying workflow XML to Ignition |
| Data / auth | Firebase project `xicotencatl` | Firebase Auth, Firestore | Users, roles, workflows and their version history, server logs |

```
Browser (React, :3000)
 ├── Firebase Auth / Firestore (direct, via src/backend/firebaseConfig.js)
 ├── Cloud Functions (httpsCallable: approveWorkflow, submitForReview, …; fetch: compileXML)
 └── /api/*  ──proxy──▶  Express server (:3001)  ──▶  Ignition Gateway (webdev API)
                                                └──▶  Firestore `server_logs`
```

### Roles

Each user's roles are stored in Firestore at `roles/{uid}` and loaded after login (`src/App.js`). The app checks the `designer`, `reviewer` and `deployer` flags.

### Workflow lifecycle

Workflows live at `artifacts/manufacturing-suite-v1/workflows/{workflowId}`, with state under `metadata`:

```
draft ──submitForReview / assignReviewerToWorkflow──▶ pending_review ──approveWorkflow──▶ approved
  ▲                                                        │
  └──────────── (edit) ◀── changes_requested ◀──requestChanges──┘
```

Only the assigned reviewer (`metadata.assignedReviewerId`) can approve a workflow or request changes. Designers who can edit a workflow are listed in `metadata.designerIds`.

## Getting started

### Prerequisites

- Node.js 20 (the version Cloud Functions and CI use; Docker uses 18)
- npm
- Firebase CLI (`npm i -g firebase-tools`) if you work on Cloud Functions
- Access to the `xicotencatl` Firebase project

### Web app

```bash
npm install
npm start          # http://localhost:3000
```

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
| `IP_IGNITION` | Ignition gateway host |
| `PORT_IGNITION` | Ignition gateway port |
| `USER_IGNITION` / `PASSWORD_IGNITION` | Gateway basic-auth credentials |
| `PROJECT_NAME_IGNITION` | Ignition project hosting the `recibirXML` webdev endpoint |

It also needs a Firebase service-account key at `server/serviceAccountKey.json` to write logs to Firestore. Both `server/.env` and the key are git-ignored: create them locally and never commit them.

Endpoints:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness check |
| GET | `/api/ignition-health` | Checks that the Ignition gateway is reachable and `RUNNING` |
| POST | `/api/compile` | Validates a workflow JSON (`nodes`, `connections`; exactly one Begin and one End) and returns XML |
| POST | `/api/deploy-workflow` | Validates workflow XML (`Content-Type: application/xml`) and forwards it to Ignition |

### Cloud Functions

```bash
cd functions
npm install
npm run serve      # local emulator
npm run deploy     # firebase deploy --only functions
```

### MCP servers for AI coding agents

`.mcp.json` registers MCP servers for Claude Code and other MCP-capable agents working in this repo:

| Server | What it is | Access |
| --- | --- | --- |
| `firebase` | Firebase CLI MCP server (`npx firebase-tools@latest mcp --only auth,firestore`) | Your Firebase CLI login (`firebase login`) on project `xicotencatl` |
| `supabase` | Supabase hosted MCP server (`https://mcp.supabase.com/mcp?read_only=true`) | OAuth in the browser on first use; read-only |

Claude Code asks you to approve project servers the first time you run `claude` in the repo; check them with `claude mcp list`. On native Windows, if the `firebase` server fails to start, change its `command` to `cmd` and put `"/c", "npx"` in front of its args. Don't commit tokens to `.mcp.json`.

## Scripts (root)

| Command | Description |
| --- | --- |
| `npm start` | Start the dev server |
| `npm run build` | Build for production into `build/` |
| `npm test` | Run Jest in watch mode |
| `npm run lint` | Run ESLint |
| `npm run format` / `npm run format-check` | Run Prettier (write / check) |
| `npm run lint:css` / `npm run lint:html` | Run Stylelint / HTMLHint on `public/` |

CI (`.github/workflows/code_check.yaml`) runs `npm run lint`, `npm run format-check` and the Jest unit tests (`npm test`) on every pull request to `main`.

## Deployment

The `Dockerfile` builds the React app and serves `build/` with nginx on port 80:

```bash
docker build -t kukulcan .
docker run -p 8080:80 kukulcan
```

Cloud Functions deploy separately with the Firebase CLI (see above).

## Project layout

```
src/
  App.js                       routing + auth/role loading
  backend/firebaseConfig.js    Firebase client init (auth, db, functions)
  pages/
    Login/, Home/              login and landing pages
    Dashboard/Dashboard.js     the workflow designer: hierarchy tree, canvas, menu bar, node modals
    Dashboard/*Modal.js        save / open / share / version history / checkout / unsaved-changes dialogs
    Dashboard/equipmentData.js, MaterialData.js   static catalog data
  components/                  shared UI (ModalMessage, EquipmentDetails)
  styles/                      CSS per page/modal
public/ICONOSPNG/              toolbar icons
functions/index.js             all Cloud Functions
server/src/                    Express API (routes/, logger.js)
docs/HTE-*-testing.md          manual test plans, one per Jira ticket
```

## Contributing

- Name branches after the Jira ticket, e.g. `HTE-91-filtering`.
- Start commit messages and PR titles with the ticket: `HTE-91: add hierarchy filtering by element type`.
- Add a manual test plan for each ticket at `docs/HTE-<n>-testing.md` (issue, test cases with steps and expected results, outcome).
- Open PRs against `main`. Lint and Prettier must pass.
- Don't put a trailing space or dot at the end of a filename. Windows can't check those files out.
