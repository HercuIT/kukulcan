 # HTE-75 Testing Documentation

UIR-003 As a user, I want the upper left side of the interface to contain a hierarchy panel with a "Scheduler" element, so I can easily access and manage scheduling-related tasks and workflows.

## Test Cases

### TC-01: Scheduler element visible
**Steps:**
1. Open the application
2. Look at the upper left hierarchy panel

**Expected:** "Scheduler" element is visible in the panel

### TC-02: Scheduler expandable
**Steps:**
1. Click on "Scheduler" node

**Expected:** Expands showing Scheduled Tasks, Calendar, Timeline

### TC-03: Scheduler collapsible
**Steps:**
1. Click on "Scheduler" again

**Expected:** Collapses hiding its children

## Result
PASS - Scheduler element is present in the hierarchy panel with sub-elements
