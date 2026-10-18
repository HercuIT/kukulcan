cat > docs/HTE-57-testing.md << 'EOF'
# HTE-57 Testing Documentation

## Issue
WFPR-002 As a user, I want the Node Definitions element to be expandable, displaying sub-elements like User Created Definitions and Predefined Definitions, so I can manage node definitions.

## Test Cases

### TC-01: Node Definitions expandable
**Steps:**
1. Expand Workflows
2. Click on "Node Definitions"

**Expected:** Expands showing User Created Definitions and Pre-Defined Definitions

### TC-02: Node Definitions collapsible
**Steps:**
1. Click on "Node Definitions" again

**Expected:** Collapses hiding its children

### TC-03: Pre-Defined Definitions expandable
**Steps:**
1. Expand Node Definitions
2. Click on "Pre-Defined Definitions"

**Expected:** Shows Procedure Phase, Procedure Operation, Procedure Unit Procedure, Procedure, Area Procedure, Site Procedure

## Result
PASS - Node Definitions is expandable displaying User Created Definitions and Pre-Defined Definitions


