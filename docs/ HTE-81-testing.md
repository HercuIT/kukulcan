 # HTE-81 Testing

## Feature Tested
Highlight selected element in hierarchy panel



### 1. Select Node Highlight
- Clicked on different nodes (Workflows, Node Definitions, Equipment, Materials)
- Verified selected node is highlighted in blue
- Verified previously selected node loses highlight


### 2. Multiple Selection Changes
- Clicked different nodes consecutively
- Verified highlight updates correctly each time
- No UI glitches or delays


### 3. Interaction with Expand/Collapse
- Expanded and collapsed nodes
- Selected nodes inside nested hierarchy
- Verified highlight still applies correctly



### 4. Compatibility with Existing Features
- Tested keyboard navigation (ArrowUp, ArrowDown)
- Verified no conflicts with selection highlight
- Tested click + keyboard combination



### 5. Stability
- Repeated clicks on same node
- Rapid switching between nodes
- No crashes or unexpected behavior



## Result
- Feature works as expected
- No UI breaking
- No crashes