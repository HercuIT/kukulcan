 cat > docs/HTE-55-testing.md << 'EOF'
# HTE-55 Testing Documentation

## Issue
WFPR-001 As a user, I want the Workflows element in the hierarchy panel to be expandable, displaying sub-elements like Node Definitions and Nodes, so I can navigate the hierarchy.

## Test Cases

### TC-01: Workflows expandable
**Steps:**
1. Open the application
2. Click on "Workflows" node

**Expected:** Expands showing Node Definitions and Nodes

### TC-02: Workflows collapsible
**Steps:**
1. Click on "Workflows" again

**Expected:** Collapses hiding its children

### TC-03: Node Definitions expandable
**Steps:**
1. Expand Workflows
2. Click on "Node Definitions"

**Expected:** Expands showing User Created Definitions and Pre-Defined Definitions

### TC-04: Node Definitions collapsible
**Steps:**
1. Click on "Node Definitions" again

**Expected:** Collapses hiding its children

## Result
PASS - Workflows element is expandable displaying Node Definitions and Nodes
EOF
