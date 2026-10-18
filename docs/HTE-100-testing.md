# HTE-100 Testing Documentation

## Issue
If user right clicks on any of the following Procedure Phase, Procedure Operation, Procedure Unit Procedure, Procedure, Area Procedure, Site Procedure, Work Instruction elements, a context menu will appear next to it that will provide the following shortcut of actions: New.

## Test Cases

### TC-01: Right click on Procedure Phase
**Steps:**
1. Expand Workflows > Node Definitions > Pre-Defined Definitions
2. Right click on "Procedure Phase"

**Expected:** Context menu appears with "New" option

### TC-02: Right click on Procedure Operation
**Steps:**
1. Right click on "Procedure Operation"

**Expected:** Context menu appears with "New" option

### TC-03: New action works
**Steps:**
1. Right click on any predefined element
2. Click "New"

**Expected:** Wizard opens to create new predefined node

## Result
PASS - Context menu with "New" action appears on all predefined hierarchy elements
