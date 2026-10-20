# HTE-112 Testing Documentation

## Issue

File → New reset the canvas to Begin → Connection 1 → End but kept the previously opened workflow as the current one (`currentWorkflowId` in `Dashboard.js`). Pressing Save afterwards updated that old workflow with the blank canvas, replacing its nodes and connections. Linear: [HTE-112](https://linear.app/htechnologies-mx/issue/HTE-112/defect-clicking-file-new-likely-doesnt-forget-the-workflow-that-was).

What changed:
- File → New (`startNewWorkflow`) clears the current workflow: id, loaded workflow, read-only session, dirty flag and selection. Its Realtime subscription closes, the header reads "New Workflow(Without save)", Share and Review are hidden, and the File menu has no Checkout or Version History. Save then asks for a name and creates a new workflow.
- File → New on a canvas with unsaved changes asks first (`UnsavedChangesModal` with `reason="new"`): **Save now**, **Discard changes** or **Cancel**. Save now on an opened workflow updates it and then starts the new canvas; on an unsaved canvas it opens the name dialog first. If the save fails, the user stays on the current canvas with the edits.
- The session-expiry prompt (`reason="logout"`) now signs out only if Save now succeeds. Before, a failed save showed an alert and signed out anyway, losing the edits.
- The save functions take the follow-up action as an argument (`executeUpdateWorkflow({ onSaved })`, `executeSaveAsNew(name, { onSaved })`) and run it only after a successful save, replacing the shared `pendingAfterSave` ref.
- `UnsavedChangesModal` takes one `reason` prop instead of `title`, `message` and an optional `onCancel`; its new strings are `newWorkflowTitle`, `newWorkflowMessage` and `cancel` (English).

No database, compiler or deploy changes.

## Automated tests (`CI=true npm test`)

`src/pages/Dashboard/newWorkflow.test.js` renders the whole dashboard with `workflowsApi`, `definitionsApi` and `authApi` mocked. An opened workflow is read-only until File → Checkout, so tests that edit one check it out first. `src/pages/Dashboard/UnsavedChangesModal.test.js` tests the dialog alone.

| Kind | Scenario | Expected |
| --- | --- | --- |
| Positive | Open draft W1, New, Save, name it "W2" | `createWorkflow` called with "W2"; `saveWorkflow` never called, so W1 is untouched |
| Positive | After New | Title "New Workflow(Without save)"; Share and Review hidden; File has no Checkout or Version History |
| Positive | New with no workflow open | Editable default canvas, unsaved title |
| Positive | Open W1, New, Save As | Name dialog; a new workflow is created |
| Positive | Open W1, New, open W1 again | W1 loads read-only with its saved nodes and connections |
| Negative | Non-designer: New, then Save | Permission alert; no API call |
| Negative | Open an approved W1, New | Editable canvas (the old read-only status doesn't carry over) |
| Negative | Open a `pending_review` W1, New, Save | Name dialog, not the "cannot edit" alert |
| Edge | New twice in a row | Same state as once |
| Edge | Realtime update to W1 after New | Ignored: the subscription is closed |
| Positive | Edit W1, New, Discard changes | Default canvas; W1 not saved |
| Positive | Edit W1, New, Save now | `saveWorkflow("wf-1", …)`, then blank canvas |
| Positive | Edit an unsaved canvas, New, Save now, name it | `createWorkflow` with that name, then blank canvas |
| Negative | Edit W1, New, Cancel | Stays on W1 with the edits; nothing saved |
| Negative | Edit an unsaved canvas, New, Save now, cancel the name dialog | Edits kept; nothing created |
| Negative | Edit W1, New, Save now fails | Alert with the error; still on W1, no reset |
| Negative | Session expires with unsaved edits, Save now fails | Alert with the error; `signOut` not called; the prompt stays open |
| Positive | Session expires with unsaved edits, Save now succeeds | W1 saved, then signed out |
| Positive | Modal `reason="logout"` (default) | Session-expired title and message; no Cancel |
| Positive | Modal `reason="new"` | New-workflow title and message; Cancel calls `onCancel` |
| Negative | Modal `reason="logout"` with `onCancel` passed | Cancel still hidden |
| Edge | Modal `open={false}`; `isSaving` | Renders nothing; buttons disabled with the saving spinner |
| Edge | `uiStrings.test.js` | Every `UI_STRINGS` key used exists |

## Test Cases

Preconditions: signed in as a user with the `designer` role, with at least one `draft` workflow ("W1") that has a few nodes and connections. Run each case in the light and dark themes (View menu).

### TC-01: New then Save creates a new workflow
**Steps:**
1. File → Open → W1.
2. File → New.
3. File → Save, enter "W2", Save.
4. File → Open → W1.

**Expected:** After step 2 the header reads "New Workflow(Without save)" and the canvas shows Begin → Connection 1 → End. Step 3 creates "W2". In step 4, W1 still has its original nodes and connections.

### TC-02: New hides workflow actions
**Steps:**
1. Open W1.
2. File → New.
3. Open the File menu.

**Expected:** Share and Review are hidden; File shows no Checkout or Version History.

### TC-03: New from an approved workflow
**Steps:**
1. Open an `approved` workflow.
2. File → New.
3. Drag a node onto the canvas.

**Expected:** The canvas is editable; Save asks for a name.

### TC-04: Unsaved changes, Discard
**Steps:**
1. Open W1, File → Checkout with a description.
2. Drag a node onto the canvas.
3. File → New, then Discard changes.
4. Open W1.

**Expected:** Step 3 shows "New workflow" and "You have unsaved changes. If you create a new workflow, they will be lost." After Discard the canvas is blank; W1 doesn't have the dragged node.

### TC-05: Unsaved changes, Save now
**Steps:**
1. Repeat TC-04 steps 1–2.
2. File → New, then Save now.
3. Open W1.

**Expected:** The canvas resets after the save; W1 has the dragged node.

### TC-06: Unsaved changes on a new canvas, Save now
**Steps:**
1. File → New on a clean canvas, drag a node.
2. File → New, then Save now.
3. Enter "Saved Before New", Save.

**Expected:** The name dialog opens; "Saved Before New" is created with the node; then the canvas resets. Cancelling the name dialog instead keeps the edits and doesn't reset.

### TC-07: Unsaved changes, Cancel
**Steps:**
1. Repeat TC-04 steps 1–2.
2. File → New, then Cancel.

**Expected:** Still on W1 with the dragged node; nothing saved.

### TC-08: Save now fails during New
**Steps:**
1. Repeat TC-04 steps 1–2.
2. Stop the network (browser dev tools → Offline).
3. File → New, then Save now.

**Expected:** An error alert; still on W1 with the edits; no reset.

### TC-09: Save now fails when the session expires
**Steps:**
1. Repeat TC-04 steps 1–2.
2. Go offline, then let the session end (sign out in another tab, or wait 15 minutes idle).
3. In the "Your session has expired" prompt, click Save now.

**Expected:** An error alert; you stay signed in and the prompt stays open, so you can go back online and retry or discard. Retrying online saves W1 and then signs you out.

### TC-10: Non-designer
**Steps:**
1. Sign in as a user without the `designer` role.
2. File → New, then File → Save.

**Expected:** Permission message; nothing saved.

## Result

| Case | Light | Dark | Notes |
| --- | --- | --- | --- |
| TC-01 | | | |
| TC-02 | | | |
| TC-03 | | | |
| TC-04 | | | |
| TC-05 | | | |
| TC-06 | | | |
| TC-07 | | | |
| TC-08 | | | |
| TC-09 | | | |
| TC-10 | | | |

Tested on: (date) · Build / preview URL: (url) · Tester: (name)
