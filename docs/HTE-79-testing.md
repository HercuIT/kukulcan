 # HTE-79 Testing Documentation

UIR-003 As a user, I want the hierarchy panel to provide tooltips for each element (e.g., Workflows, Physical Model), so I can understand their purpose and functionality.

## Test Cases

### TC-01: Tooltip on Equipment node
**Steps:**
1. Expand Equipment > Enterprise Node
2. Hover over "Laser Cutter-01"

**Expected:** Tooltip shows Capacity, Status, and Model

### TC-02: Tooltip on Data Layer node
**Steps:**
1. Expand Data Layer > Devices
2. Hover over "Sensor de Temperatura"

**Expected:** Tooltip shows Tag Path: /Linea1/Temp

### TC-03: No tooltip on nodes without data
**Steps:**
1. Hover over "Workflows" or "Nodes"

**Expected:** No tooltip appears

## Result
PASS - Tooltips appear on hover for nodes with desc, abstract, or details data