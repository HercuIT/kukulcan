# HTE-supabase-migration: Firebase → Supabase migration and UI strings

## Issue

Kukulcan moves auth, data and server-side logic from the Firebase project `xicotencatl` to Supabase. Spec: [Kukulcan: Firebase → Supabase Migration Spec](https://claude.ai/code/artifact/30984f03-013f-4dd7-a1ae-8fe059596380).

- Firebase Auth → Supabase Auth. Users are imported by email and set a new password through a reset email.
- Firestore → Postgres tables: `profiles`, `workflows`, `workflow_designers`, `workflow_history`, `server_logs`. Permissions are enforced by RLS.
- The 6 callable Cloud Functions plus the client-side checkout → Postgres RPC functions. `compileXML` → the `compile-xml` Edge Function, now signed-in users only.
- Express logger → one Supabase `server_logs` row per event.
- Firebase packages, config and `functions/` are removed.
- Every user-facing string moves to `src/constants/uiStrings.js`.

The app's screens, roles and review lifecycle don't change.

## Test Cases

Setup: a Supabase project with `supabase/migrations/` applied, `compile-xml` deployed, `.env.local` and `server/.env` filled in, and four users: a designer (D1), a second designer (D2), a reviewer (R) and a deployer (P).

### TC-01: Sign up

Steps:

1. On the login page, enter a new email and password, then click **Registrar**.
2. Open Supabase → Table Editor → `profiles`.

Expected: the success alert appears. A `profiles` row exists for the email with `designer`, `reviewer` and `deployer` all `false`. Home shows empty roles.

### TC-02: Sign in, wrong password, sign out

Steps:

1. Sign in as D1 with a wrong password.
2. Sign in as D1 with the right password.
3. Click **Cerrar Sesión**.

Expected:

1. "Correo o contraseña incorrectos. Por favor, verifica tus datos."
2. Home shows D1's roles (`designer: true`).
3. The app returns to the login page.

### TC-03: Create and save a workflow

Steps:

1. As D1, open the dashboard, build a Begin → node → End graph and choose **File → Save**. Name it "TC-03".
2. Change a node and choose **File → Save** again.

Expected: the workflow appears in **File → Open** with status Draft and role Designer. After the second save, `version` is 2 in `workflows` and `last_modified_by` is D1.

### TC-04: A user without the designer role can't save

Steps: sign in as R and try **File → Save**.

Expected: "No tienes permisos para realizar esta acción. Se requiere el rol de 'Designer'." Nothing is written.

### TC-05: Share with a collaborator

Steps:

1. As D1, open TC-03, then **Workflow Actions → Share & Assign**.
2. Add D2's email in upper case with surrounding spaces.
3. Add `ghost@example.com`.
4. Remove D2, then try to remove D1.

Expected:

1. The share dialog opens.
2. D2 appears under Design Team without a page reload.
3. "No se encontró un usuario con el email ghost@example.com."
4. D2 disappears. Removing the last designer shows "No se puede eliminar al último diseñador del workflow."

### TC-06: Submit for review and approve

Steps:

1. As D1, assign R as reviewer.
2. As D1, try to save.
3. Sign in as R, open TC-03 and approve it.
4. Sign in as P and open **File → Open**.

Expected:

1. Status becomes Pending Review.
2. Saving is blocked: "Cannot edit a workflow that is not in "draft" or "changes_requested" status…"
3. Status becomes Approved and `approved_by` = R.
4. P sees TC-03 with role Deployer.

### TC-07: Request changes

Steps: as D1, assign R on a second workflow. As R, choose **Request Changes**.

Expected: status becomes Changes Requested and the reviewer is cleared. D1 can edit and save again.

### TC-08: Only the assigned reviewer can act

Steps: with a workflow in Pending Review assigned to R, call `approve_workflow` as D2 (from the browser console: `supabase.rpc('approve_workflow', { wf })`).

Expected: the call fails with code `42501` and "No eres el revisor asignado." The status doesn't change.

### TC-09: The client can't change status directly

Steps: as D1, run `supabase.from('workflows').update({ status: 'approved' }).eq('id', wf)` in the browser console.

Expected: permission error (`42501`). The status doesn't change.

### TC-10: Checkout and version history

Steps: as D1, open a workflow (read-only), choose **File → Checkout** with "TC-10 notes", then **File → Version History**.

Expected: "Checkout successful. Edit mode enabled." The history lists "TC-10 notes", D1's id and the local time.

### TC-11: Live updates

Steps: open the same workflow as D1 in two browsers. In one, add D2 as designer.

Expected: the other browser's share dialog shows D2 without a reload.

### TC-12: Compile

Steps:

1. Compile a valid graph.
2. Compile a graph without an End node.
3. Call the Edge Function URL without an `Authorization` header (e.g. with curl).

Expected:

1. "Flujo válido y compilado. ¡Descargue su XML!" The downloaded XML matches what the Firebase function produced for the same graph.
2. The validation errors are listed.
3. HTTP 401.

### TC-13: Server logs

Steps: with the local server running, POST valid XML to `/api/deploy-workflow`, once with `Authorization: Bearer <D1 access token>` and once without.

Expected: `server_logs` gets one row per event (API_REQUEST, DEPLOY_ATTEMPT, …) sharing a `request_id`. `user_id` is D1's id with the token and `unknown` without it. Stopping Supabase doesn't break the request; the server prints "No se pudo guardar el log…".

### TC-14: Data migration dry run and verification

Steps: in `scripts/migration/`, run `import-users.js users.json`, then `migrate-data.js --dry-run`, `migrate-data.js` and `verify.js`. Run `migrate-data.js` a second time, then `verify.js` again.

Expected: the dry run lists the workflow count and writes nothing. `verify.js` prints matching counts and "Todo coincide." The second run leaves the same counts (no duplicates). An unmapped UID makes `migrate-data.js` stop before writing.

### TC-15: UI strings

Steps: open every screen (login, home, dashboard, every dialog and menu) and compare its text with `main` before this change.

Expected: all text is unchanged. Searching `src/constants/uiStrings.js` for any visible text finds its key, and searching `src/` for that key finds the component.

## Automated scenarios

Run with `CI=true npm test` (Jest) and `npm run test:node` (Node).

| Area                                                               | Positive                                                                                                                                                                                                                                 | Negative                                                                                                                                                                                                                                                                                                                                                                    | Edge                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database (`supabase/tests/schema.test.mjs`, PGlite)                | Sign-up creates the profile; creator becomes first designer; save bumps version; full submit → request changes → reassign → approve lifecycle; reviewer and deployer read access; add/remove designers; checkout history; `my_workflows` | Non-designer insert; insert for another user; direct status/reviewer/approval/version updates; outsiders can't read or edit; edit while in review; non-reviewer approve/request; status rules; reviewer must have the role; non-designer collaborator changes; unknown email; last designer; anon has no access; `server_logs` closed to clients; clients can't grant roles | Duplicate add and case/space-insensitive email; blank comment adds no history; blank checkout rejected; status changes don't bump version; service-role writes keep timestamps; 5,000-node graph; auth user delete cascades |
| `compile-xml` (`supabase/tests/compile-xml.test.mjs`)              | Byte-identical XML to the Firebase function (golden file); object body                                                                                                                                                                   | Invalid JSON; missing arrays; every graph rule; Begin inputs / End outputs                                                                                                                                                                                                                                                                                                  | Begin+End only; XML escaping; file names with accents; 2,000-node graph                                                                                                                                                     |
| Server (`server/test/logger.test.js`)                              | One row per event with known fields as columns; bearer token → user id                                                                                                                                                                   | Insert error and missing config logged, not thrown; invalid token → `unknown`                                                                                                                                                                                                                                                                                               | Undefined fields dropped; no header / non-bearer / failing client → `unknown`                                                                                                                                               |
| Migration scripts (`scripts/migration/test/transform.test.js`)     | Workflow and log transforms rewrite every UID                                                                                                                                                                                            | Unmapped UIDs, unknown status, missing creator reported; bad log level / non-UUID id                                                                                                                                                                                                                                                                                        | Missing fields get defaults; duplicate designers; timestamps in every shape; key-order-independent checksums                                                                                                                |
| Data layer (`src/backend/*.test.js`)                               | Sign-in/up, session events, roles; create/save/get/list; every RPC wrapper; compile returns a Blob                                                                                                                                       | Supabase error codes mapped; zero updated rows = permission-denied; RLS insert rejection; compile errors listed                                                                                                                                                                                                                                                             | Token refresh doesn't re-fire; no callback after unsubscribe; missing profile/workflow; empty reviewer → null; Realtime reload and unsubscribe; load errors reported                                                        |
| App and Login (`src/App.test.js`, `src/pages/Login/Login.test.js`) | Routes by session; sign-in and sign-up                                                                                                                                                                                                   | Signed out → Login; role load failure; wrong password; email in use; generic failure                                                                                                                                                                                                                                                                                        | Loading state; empty roles; unknown routes; empty fields; dev shortcut                                                                                                                                                      |
| UI strings (`src/constants/uiStrings.test.js`)                     | Every entry is a non-empty string or a string function; templates interpolate                                                                                                                                                            | Every `UI_STRINGS` key used in `src/` exists                                                                                                                                                                                                                                                                                                                                | Menu labels cover every menu id; wording, trailing spaces and line breaks preserved                                                                                                                                         |

## Result

Automated: Jest 72/72 and Node 54/54 pass. ESLint and Prettier pass on the changed files, and `npm run build` compiles.

Manual TC-01 to TC-15: pending. They need a Supabase project, which doesn't exist yet.
