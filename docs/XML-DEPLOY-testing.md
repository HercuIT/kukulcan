# XML-DEPLOY Testing Documentation

## Issue
A workflow compiled by either compiler was rejected by `/api/deploy-workflow`: `compile-xml` wrapped the workflow in a `<Controller>` document and `/api/compile` left out `<Parameters>`, so nothing the app produced could reach Ignition unchanged. Spec: [Compiled XML can't be deployed](https://claude.ai/code/artifact/6f4d1b1f-de3d-45c7-9a7f-93d1af0b8d81) (no Jira ticket yet; `XML-DEPLOY` is a placeholder ID).

What changed:
- `compiler.mjs` has two targets. `controller` (default) is the unchanged PLC document; `ignition` is the bare `<Workflow>` document the deploy validator accepts. Both come from one builder, `buildWorkflowXml`.
- For `ignition`, `validateDeployable` applies the deploy validator's node rules at compile time and names each node/parameter to fix.
- `POST /api/compile` (Option A) now uses the same compiler, `ignition` by default; its own copy was deleted.
- `validarWorkflow` moved to `server/src/validarWorkflow.js` (the deploy route uses it unchanged and re-exports it).
- The server's JSON and XML body limits went from Express's 100 kB default to 5 MB (the compiler's limit), and oversized bodies get a 413 instead of a 500.

## Automated tests (`npm run test:node`)

`supabase/tests/xml-contract.test.mjs` runs each case through `compile-xml` (`compileRequest` with `target: "ignition"`) and through `POST /api/compile` (the Express router mounted in-process), then passes each XML to `validarWorkflow`. It needs `server/`'s dependencies (`npm ci --prefix server`; CI does this).

| Kind | Scenario | Expected |
| --- | --- | --- |
| Positive | `complete.json`: Begin → Procedure Phase (grouped params) → Operation → End, all values set | Both outputs pass `validarWorkflow`; `workflowId` = `W-COMPLETE` |
| Positive | `flat-params.json`: a user-created definition with a flat `[{ name, dataType, defaultValue }]` array (number, `false`, string) | Both pass; values taken from `defaultValue` (`75.5`, `false`) |
| Positive | Begin → End only | Both pass (no parameters needed) |
| Positive | Ignition document shape | Starts with the XML declaration, `<Workflow>` root, no `<Controller>` |
| Positive | `/api/compile` response | Canvas ids and type names kept; `X-Compiler: local`; file name from the workflow name |
| Negative | `workflow.json` (empty `Temp` value) for Ignition | 400 `Fallo de compilación`, exactly `El nodo 'Mix & Heat' requiere un valor para el parámetro 'Temp'.`; no XML, on both paths |
| Negative | A middle node with no parameters | 400 `El nodo 'Dose' debe tener al menos un parámetro.` on both paths; the same workflow with `target: "controller"` still returns XML |
| Negative | A parameter with a value but no name (next to a named one) | 400 `El nodo 'Dose' tiene un parámetro sin nombre.`; as the only parameter → "debe tener al menos un parámetro" |
| Negative | `target: "plc"` | 400 `Target desconocido: 'plc'. Usa 'controller' o 'ignition'.` on both paths |
| Negative | The controller document posted to the validator | Rejected: `The root element <Workflow> was not found.` (why the target exists) |
| Negative | `/api/compile` body without `nodes` | 400 with the compiler's `Se esperan "nodes[]" y "connections[]"` |
| Edge | Names with `&`, `<`, `"`, `'` and accents, in the workflow, node and parameter | Escaped; valid; names and values round-trip through an XML parser on both paths |
| Edge | 5,000 nodes (the limit) with one parameter each | Both pass |
| Edge | Entirely empty parameter rows (`{name:"",value:""}`, `{}`, `null`) next to a valid one | Skipped; workflow passes |
| Edge | `target: "controller"` vs no target | Byte-identical output |
| Edge | String body over 5 MB with `target: "ignition"` | 413 |
| Regression | Deploy route | Still exports the validator it uses |

`supabase/tests/compile-xml.test.mjs` (existing suite plus new `target` cases):

| Kind | Scenario | Expected |
| --- | --- | --- |
| Positive | Today's fixture, no target | Byte-identical to `workflow.expected.xml` (the refactor onto `buildWorkflowXml` changed nothing) |
| Positive | `target: "ignition"` in a JSON string body | 200, bare `<Workflow>` |
| Negative | `target: 5` or `""` | 400 `Target desconocido` |
| Edge | `target: null` | Treated as `controller` |

Jest (`src/backend/workflowsApi.test.js`): `compileWorkflow(workflow, { target })` adds `target` to the body without mutating the workflow (positive); deployable errors are listed in the thrown message (negative); `{ target: undefined }` sends the workflow unchanged (edge).

## Test Cases

### TC-01: Compile download unchanged
**Steps:**
1. Open a workflow in the app and click Compile.

**Expected:** The same `<Controller>` XML file downloads as before this change.

### TC-02: Compile for Ignition through the local server
**Steps:**
1. `cd server && node src/index.js`.
2. POST a complete workflow JSON (every non-Begin/End node has named parameters with values) to `http://127.0.0.1:3001/api/compile`.

**Expected:** 200 with `Content-Type: application/xml`, a `<Workflow>` root, `<Parameters>` on every middle node, and canvas node ids.

### TC-03: Deploy what was compiled (needs a test Ignition gateway)
**Steps:**
1. POST the XML from TC-02 to `http://127.0.0.1:3001/api/deploy-workflow` with `Content-Type: application/xml`.
2. Repeat with XML from `compile-xml` with `"target": "ignition"` (e.g. via `compileWorkflow(workflow, { target: "ignition" })`).

**Expected:** `200 Workflow deployed successfully to Ignition.`; the file appears in the Ignition project.

### TC-04: Incomplete workflow fails at compile time (negative)
**Steps:**
1. POST a workflow whose middle node has a parameter with an empty value to `/api/compile`.

**Expected:** 400 `Fallo de compilación` with `El nodo '<name>' requiere un valor para el parámetro '<param>'.`; nothing reaches deploy.

### TC-05: Controller document is not deployable (negative)
**Steps:**
1. POST the file downloaded in TC-01 to `/api/deploy-workflow`.

**Expected:** 400 with cause `The root element <Workflow> was not found.` (unchanged).

### TC-06: Deploy the same workflow twice (edge)
**Steps:**
1. Repeat TC-03 step 1 with the same XML.

**Expected:** 502 with Ignition's "file already exists" message, as before.

### TC-07: Oversized body (edge)
**Steps:**
1. POST a JSON body over 5 MB to `/api/compile`.

**Expected:** 413 `Payload Too Large. The maximum body size is 5 MB.` (before: 500 for anything over 100 kB).

### TC-08: compile-xml without a session (negative)
**Steps:**
1. Call the `compile-xml` Edge Function without an `Authorization` header.

**Expected:** 401, as before.

## Result
Automated: `npm run test:node`, Jest, ESLint and Prettier pass locally. Manual TC-01 to TC-08: pending (TC-03 and TC-06 need a test Ignition gateway; the `compile-xml` change reaches the live project when this merges to `main`).
