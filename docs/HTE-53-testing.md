# HTE-53 Testing Documentation

## Issue
VCR-001 As a user, I want context menu actions (e.g., New, Delete, Configure) to be version-controlled, so I can track changes to their definitions and usage.

## Test Cases

### TC-01: Context menu on User Created Definitions
**Steps:**
1. Right click on User Created Definitions

**Expected:** Context menu appears with "New" option

### TC-02: Create node via context menu
**Steps:**
1. Right click on User Created Definitions
2. Click "New"
3. Fill in node details and click OK

**Expected:** New node appears under User Created Definitions

### TC-03: Context menu not available on other nodes
**Steps:**
1. Right click on Workflows or Equipment

**Expected:** No context menu appears

## Result
PASS - Context menu actions are available and functional on User Created Definitions
