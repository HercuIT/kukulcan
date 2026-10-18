# HTE-96 - Testing for HTE-95

## Objective
Validate that canvas behavior works correctly when navigating the treeview using keyboard arrows.

## Test Scenarios

### 1. Navigate treeview with arrow keys
- Use ↑ ↓ to move between elements
- Use Enter to expand/collapse nodes

**Expected Result:**
- Canvas does NOT update or render anything


### 2. Select element intentionally
- Click on an element from treeview

**Expected Result:**
- Canvas updates normally


### 3. Edit mode validation
- Try editing while navigating with keyboard

**Expected Result:**
- No unintended edits occur


### 4. Compile test
- Click "Compile"

**Expected Result:**
- If error appears: "Failed to fetch"
- This is related to backend, NOT canvas behavior


## Conclusion
Canvas behavior works as expected. Navigation with keyboard does not trigger rendering or updates.

---


# HTE-96 - Testing for HTE-83 (Drag and Drop)

## Objective
Validate that drag-and-drop functionality works correctly in the hierarchy panel.

## Test Scenarios

### 1. Drag and drop nodes
- Drag a node and move it within the hierarchy

**Expected Result:**
- Node updates its position correctly

---

### 2. Manual node connection
- Connect nodes manually

**Expected Result:**
- Connection is created correctly

---

### 3. Prevent duplicate connections
- Try to connect the same nodes twice

**Expected Result:**
- Duplicate connection is not allowed

---

### 4. Compile validation
- Click "Compile"

**Expected Result:**
- If error appears: "Failed to fetch"
- This is due to backend not available, NOT frontend issue

---

## Conclusion
Drag-and-drop functionality works as expected. Node connections behave correctly and validation prevents errors.

