# WFPR-003: Nested User Created Node Definitions

## Issue

As a user, I want the User Created Definitions element to support a nested hierarchy, allowing User Created Node Definitions to contain other User Created Node Definitions at any level, so I can create complex structures. Spec: [WFPR-003: Nested User Created Node Definitions](https://claude.ai/code/artifact/9753755e-5f4d-43bb-93af-e9e59d416800).

Decisions taken in the spec's open questions:

- Option B: dropping a definition on the canvas expands it into connected nodes.
- Any designer edits any definition.
- No depth limit (at least 1,000 levels).
- Manual ordering among siblings.
- Definitions can contain pre-defined definitions.

What changed:

- **Persistence:** definitions are stored in Supabase (`user_definitions`), shared by everyone, as a tree of any depth.
- **Panel:** create inside, edit, move up/down, move to, delete (with or without children), and drag-and-drop to nest. Pre-defined rows can be dropped into a definition as references.
- **Canvas:** dropping a definition places it and all its descendants as connected nodes. The canvas connections are now saved with the workflow (`workflows.connections`).
- **Fixed along the way:**
  - Dragging any panel row onto the canvas placed nothing (`window._dragComponent` was never set).
  - User-created rows couldn't be dragged at all.
  - INT default values were always rejected in the Create Node modal (bad regex).

## Test Cases

Setup: the WFPR-003 migration applied to the Supabase project. Two designers (D1, D2) and a user without the designer role (U).

### TC-01: Create and nest

Steps:

1. As D1, click **+** on User Created Definitions and create "Line 1".
2. Right-click Line 1 → **New definition inside** → create "Mixer A". The modal shows *Inside: Line 1*.
3. Right-click Mixer A → **New definition inside** → create "Dosing".

Expected: the tree shows Line 1 › Mixer A › Dosing. Each definition's Parameters, Equipment, Material, Personnel and Elements groups appear after its child definitions. Hovering Dosing shows the path *Line 1 › Mixer A › Dosing*.

### TC-02: Shared and persisted

Steps: reload the page as D1, then sign in as D2.

Expected: both see the same tree. A definition D2 creates appears for D1 without a reload (Realtime).

### TC-03: Move and reorder

Steps:

1. Create "Packer" and "Cleaning" at the top level.
2. Drag Cleaning onto Line 1.
3. Right-click Cleaning → **Move up**.
4. Right-click Mixer A → **Move to…** → **Top level**.

Expected:

1. Both appear at the top level.
2. Cleaning moves inside Line 1, after its existing children.
3. Cleaning moves above the sibling before it.
4. Mixer A and Dosing move to the top level together.

### TC-04: Rules

Steps:

1. Drag Line 1 onto one of its own descendants.
2. Create a definition with the same name and version as a sibling (different case, extra spaces).
3. Create a definition with an empty name.

Expected:

1. The row doesn't accept the drop, and nothing moves.
2. "A definition with this name and version already exists here."
3. The modal blocks it.

### TC-05: Pre-defined references

Steps:

1. Drag **Procedure Phase** (under Pre-Defined Definitions) onto Line 1.
2. Drag it onto Line 1 again.
3. Right-click the reference.

Expected:

1. A blue "Procedure Phase (pre-defined)" row appears inside Line 1.
2. "A definition with this name and version already exists here."
3. No **New definition inside** and no **Edit**.

### TC-06: Delete

Steps:

1. Delete a leaf.
2. Delete Line 1 and choose **Keep children**.
3. Delete a definition with children and choose **Delete with everything inside (n definitions)**.

Expected:

1. The leaf disappears.
2. Line 1's children move up one level, after its siblings.
3. The whole subtree disappears.

### TC-07: Expand on drop, and connections saved

Steps:

1. Drag Line 1 (with children) onto the canvas.
2. Save the workflow, reload, and open it again.
3. Compile.

Expected:

1. One node per definition in the subtree, in tree order, stacked and connected in a chain.
2. All nodes and connections are back.
3. The XML has one `<Node>` per definition, with the definitions' parameters.

### TC-08: Panel drags reach the canvas

Steps: drag a Pre-Defined Definitions row and an Equipment row onto the canvas.

Expected: each places a node. Before this change, nothing was placed.

### TC-09: Permissions

Steps: sign in as U.

Expected:
- U sees the tree read-only: no **+**, no context menu, and rows can't be dragged.
- Calling `create_definition` directly fails with code `42501`.

### TC-10: Deep trees

Steps: as D1, create a 30-level chain (or seed 1,000 levels through the RPC), then search for the deepest name.

Expected: search reveals the deepest node with all its ancestors. Indentation stops growing after 8 levels.

### TC-11: Older workflows

Steps: open a workflow saved before this change.

Expected: its nodes load, and the default Begin → Connection 1 → End edges are shown.

## Automated scenarios

Run with `CI=true npm test` (Jest) and `npm run test:node` (Node).

| Area | Positive | Negative | Edge |
| --- | --- | --- | --- |
| RPCs (`supabase/tests/definitions.test.mjs`, PGlite) | Create top-level and nested with fields; append order; pre-defined references; edit; move with subtree and to top level; manual reorder with positions renumbered; delete leaf and subtree; keep_children puts children after siblings; connections saved and bump the version | Non-designers rejected (`42501`); anon can't call or read; direct writes denied; unknown parent (`P0002`); empty name; duplicate name+version ignoring case and spaces; cycles into self or descendant; pre-defined can't have children or be top level, duplicates rejected; keep_children clash rolls back; keep_children of a top-level definition with pre-defined children | Same name under different parents; 1,000-level chain with a deep cycle rejected and the deepest node moved out; index past the end appends; top-level keep_children promotes children; table published to Realtime |
| Data layer (`src/backend/definitionsApi.test.js`) | Tree building and ordering; visible rows with groups after children; search keeps ancestors; paths; pre-defined keys; expand-on-drop positions, chain and copies; RPC arguments; row mapping | Rule hint kept on errors; orphan rows shown at the top and logged; corrupted parent loops don't hang | 1,000-level chain builds, flattens, paths and expands (indent capped at 8); empty input; Realtime reload and unsubscribe |
| Panel (`src/pages/Dashboard/UserDefinitionsTree.test.js`) | Count and nested expand; create inside with parent path; edit; drag to move; drop a pre-defined element; move up; delete with children | Non-designer read-only; server rule error shown with its UI text; drop onto own descendant ignored; `canDropOn` / `definitionErrorText` | Search reveals a deep match; pre-defined rows have no create/edit; 1,000-level chain renders with indentation capped |
| Workflows (`workflowsApi.test.js`, `canvasConnections.test.js`) | Connections stored on create and save; returned on get | Older rows return `[]` | Older workflows get the default edges on open |

## Result

Automated: Jest 128/128, Node 93/93, ESLint and Prettier clean, `npm run build` compiles.

Manual TC-01 to TC-11: pending. The migration reaches the Supabase project when this branch merges to `main` (`deploy_supabase.yaml`).
