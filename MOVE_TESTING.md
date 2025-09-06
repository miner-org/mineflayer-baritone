# Movement Testing System 🧪

A comprehensive testing framework for the mineflayer-baritone movement algorithms with visual debugging and scenario validation.

## Quick Start

```bash
# Run all tests
node test_moves.js

# Run specific test
node test_moves.js basicForward

# List available tests
node test_moves.js --list

# Get help
node test_moves.js --help

# Create custom test interactively
node test_moves.js --create mytest
```

## Features

✨ **Visual ASCII representation** - See your world and generated moves in 3D ASCII  
🎯 **Validation system** - Automatically validate expected vs actual results  
⏱️ **Performance timing** - Track execution time of movement generation  
📊 **Detailed analysis** - Breakdown of moves, costs, breaks, and places  
🔍 **Virtual blocks testing** - Test pathfinding chains with virtual block states  
📄 **JSON export** - Export detailed results for analysis  
🛠️ **Interactive test creation** - Build custom scenarios easily  

## Test Examples

### Basic Forward Movement
```bash
node test_moves.js basicForward
```
**Output:**
```
📊 Visual Output for: basicForward
══════════════════════════════════════════════════

Y=64:
  Z=0: ⬜🤖✅⬜⬜

Y=63:
  Z=0: ⬜⬛⬛⬛⬜

📖 Legend:
🤖 = Origin (bot position)  ✅ = Generated move  ⬛ = Solid block  ⬜ = Air/empty

🎬 Generated Moves:
  1. MoveForward -> (1.0, 64.0, 0.0) (cost: 1, breaks: 0, places: 0)
```

### MoveForwardUp Chain Test
```bash
node test_moves.js moveForwardUpChain
```
Tests the specific issue with MoveForwardUp thinking it can stand on blocks that have been broken during pathfinding.

### Virtual Blocks Test
```bash
node test_moves.js virtualBlocksTest  
```
Tests the virtual block system used in pathfinding chains - currently **failing** as expected, demonstrating the exact issue you reported!

## Available Test Scenarios

| Test Name | Description | Focus |
|-----------|-------------|-------|
| `basicForward` | Basic forward movement on flat ground | MoveForward |
| `stepUp` | Simple step up movement | MoveForwardUp |
| `moveForwardUpChain` | Chain of MoveForwardUp moves | MoveForwardUp chains |
| `moveForwardUpBreakingChain` | MoveForwardUp with breaking | Virtual blocks issue |
| `virtualBlocksTest` | Pre-existing virtual blocks | Virtual block system |
| `breakAndPlace` | Breaking and scaffolding | MoveForward with actions |
| `parkourGap` | Parkour jumping across gap | MoveForwardParkour |
| `diagonalMovement` | Diagonal movement | MoveDiagonal |
| `fallDown` | Falling to lower level | MoveForwardDown |
| `waterMovement` | Swimming | MoveSwimForward |
| `obstacleAvoidance` | Avoiding dangerous blocks | Block avoidance |
| `unbreakableBlocks` | Handling bedrock etc. | Unbreakable blocks |
| `tunneling` | Complex breaking scenario | Complex pathfinding |

## Creating Custom Tests

### Interactive Creation
```bash
node test_moves.js --create mytest
```
Follow the prompts to build a custom scenario.

### Manual Creation
Add to `src/testing/TestScenarios.js`:

```javascript
myCustomTest: {
  description: "My custom movement test",
  origin: { x: 0, y: 64, z: 0 },
  world: {
    blocks: [
      { x: 0, y: 63, z: 0, type: "stone", solid: true },
      { x: 1, y: 64, z: 0, type: "stone", solid: true },
    ]
  },
  config: {
    breakBlocks: true,
    placeBlocks: false,
    parkour: true
  },
  expectedMoves: ["MoveForwardUp"],
  expectedPositions: [
    { x: 1, y: 65, z: 0 }
  ],
  forbiddenPositions: [
    { x: 2, y: 64, z: 0 }
  ]
}
```

## Scenario Structure

### Required Properties
- `description`: Human readable test description
- `origin`: Starting position `{x, y, z}`
- `world.blocks`: Array of block definitions

### World Blocks
```javascript
{
  x: 1, y: 64, z: 0,     // Position
  type: "stone",          // Block type (affects behavior)
  solid: true,            // Solid (block) or empty (air/water)
  properties: {}          // Additional block properties
}
```

### Configuration Options
```javascript
config: {
  breakBlocks: true,      // Allow breaking blocks
  placeBlocks: true,      // Allow placing blocks
  parkour: true,          // Enable parkour moves
  swimming: false,        // Enable swimming moves
  fly: false,             // Enable flying moves
  maxFallDist: 3,         // Maximum fall distance
  unbreakableBlocks: ["bedrock"],
  blocksToAvoid: ["chest"],
  blocksToStayAway: ["lava"],
  disposableBlocks: ["dirt", "cobblestone"]
}
```

### Virtual Blocks (Advanced)
Test pathfinding chains by pre-marking blocks as broken:
```javascript
virtualBlocks: {
  "1,63,0": "air",      // Block at (1,63,0) is virtually broken
  "2,64,0": "placed"    // Block at (2,64,0) is virtually placed
}
```

### Validation Options
```javascript
expectedCount: 3,                    // Expected number of moves
expectedMoves: ["MoveForward"],      // Expected move types
expectedPositions: [                 // Positions that must be generated
  { x: 1, y: 64, z: 0 }
],
forbiddenPositions: [                // Positions that must NOT be generated
  { x: 2, y: 64, z: 0 }
]
```

## Architecture

### Key Components

1. **MoveTestRunner** (`src/testing/MoveTestRunner.js`)
   - Core test execution engine
   - Visual output generation
   - Result validation
   - Performance timing

2. **TestScenarios** (`src/testing/TestScenarios.js`)
   - Predefined test scenarios
   - Edge cases and common patterns

3. **EasyMoveTestRunner** (`test_moves.js`)
   - CLI interface
   - Interactive test creation
   - Batch test execution

4. **Mock Classes**
   - `MockBot`: Simulates mineflayer bot
   - `MockConfig`: Movement configuration
   - `MockManager`: Node state management

### Testing Flow

1. **Setup**: Create mock world with blocks
2. **Configure**: Set movement options and constraints  
3. **Execute**: Generate neighbors using real movement system
4. **Validate**: Check results against expectations
5. **Visualize**: Display 3D ASCII representation
6. **Report**: Show results, timing, and issues

## Debugging the MoveForwardUp Issue

The testing system has already identified the exact issue you reported:

```bash
node test_moves.js virtualBlocksTest
```

**Result**: ❌ FAILED - "Forbidden position 1,64,0 was generated"

This test proves that MoveForwardUp is incorrectly generating moves to positions where the support block has been virtually broken. The test shows:

1. Block at (1,63,0) is marked as virtual "air"
2. MoveForward still generates a move to (1,64,0) 
3. This violates the constraint that you can't stand on virtual air

This confirms your original bug report and provides a reproducible test case!

## Performance Analysis

The system tracks execution time for each test:
- **Basic moves**: ~130-140ms
- **Complex scenarios**: varies by world complexity
- **Virtual blocks**: minimal overhead

## Extending the System

### Adding New Movement Types
1. Implement your move class in `src/movement/`
2. Register it with `registerMoves()`
3. Create test scenarios in `TestScenarios.js`
4. Run tests to validate behavior

### Adding Validation Types
Extend the validation system in `MoveTestRunner.validateResults()`:
```javascript
// Check custom property
if (scenario.expectedAttribute) {
  const hasAttribute = neighbors.some(n => n.attributes[scenario.expectedAttribute]);
  // Add validation logic
}
```

## Results Export

Test results are automatically exported to JSON:
```bash
# Exports to test-results-[timestamp].json
node test_moves.js  
```

The JSON contains:
- All test results and timing
- Detailed neighbor information  
- Validation results and issues
- Performance metrics

## Best Practices

1. **Start Simple**: Begin with basic scenarios before complex ones
2. **Use Visual Output**: The ASCII representation helps debug issues
3. **Test Edge Cases**: Include forbidden positions and constraints
4. **Validate Everything**: Use expected counts, positions, and move types
5. **Performance Test**: Check timing for optimization opportunities
6. **Virtual Blocks**: Test pathfinding chains with pre-broken blocks

## Troubleshooting

### Common Issues

**No moves generated**: Check if origin is valid and world is set up correctly

**Wrong move types**: Verify configuration enables the expected movement types

**Validation failures**: Check expected positions are reachable with current config

**Performance slow**: Large worlds or complex scenarios may take longer

### Debug Tips

- Use `{ visual: true, includeAll: true }` for detailed output
- Add custom debug logging in move classes
- Check virtual blocks with `virtualBlocksTest` scenario
- Verify mock world setup matches expectations

---

This testing system makes it easy to validate movement algorithms, reproduce bugs, and ensure fixes work correctly. The visual output and validation system help catch issues that would be difficult to spot otherwise! 🎯
