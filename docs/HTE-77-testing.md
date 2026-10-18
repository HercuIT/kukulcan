 # HTE-77 Testing Documentation

## Issue
UIR-003 As a user, I want the hierarchy panel to be collapsible and expandable, so I can focus on specific elements (e.g., Workflows, Physical Model) without cluttering the interface.


### TC-01: Collapse a parent node
**Steps:**
1. Open the application
2. Locate the hierarchy panel on the left side
3. Click on "Workflows" node (shows "- ")

 Node collapses and children are hidden, icon changes to "+ "

### TC-02: Expand a collapsed node
**Steps:**
1. Find a collapsed node showing "+ "
2. Click on it

**Expected:** Node expands and children become visible, icon changes to "- "

### TC-03: Multiple nodes collapsible
**Steps:**
1. Collapse "Workflows"
2. Collapse "Equipment"
3. Collapse "Materials"

**Expected:** Each node collapses independently without affecting others

### TC-04: forceOpen nodes
**Steps:**
1. Reload the page
2. Observe "Node Definitions" node

**Expected:** "Node Definitions" opens by default due to forceOpen prop

## Result
PASS - Hierarchy panel is collapsible and expandable using +/- toggle