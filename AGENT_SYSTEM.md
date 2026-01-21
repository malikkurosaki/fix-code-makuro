# AI Agent System Architecture

## Overview

This extension implements an advanced AI agent system inspired by Claude Code, featuring multi-turn conversations, tool usage, step-by-step reasoning, and intelligent code analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Request                          │
│              "Refactor this to use async/await"              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                        │
│  • Manages conversation flow                                 │
│  • Handles tool execution                                    │
│  • Tracks reasoning steps                                    │
│  • Controls multi-turn logic                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Tools                             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  read_file   │  │ search_code  │  │ analyze_code │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │list_directory│  │find_related  │                        │
│  └──────────────┘  └──────────────┘                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  OpenRouter API (AI)                         │
│           Claude / GPT / Gemini / Llama                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Final Code Fix                           │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Agent Orchestrator (`agentOrchestrator.ts`)

**Purpose:** Manages the entire agent execution lifecycle

**Key Features:**
- Multi-turn conversation management
- Tool call detection and execution
- Reasoning step tracking
- Progress reporting
- Conversation history management

**Flow:**
```typescript
1. Initialize with system prompt
2. While (not complete && turns < maxTurns):
   a. Get AI response
   b. Parse tool calls
   c. Execute tools
   d. Add results to conversation
   e. Check for completion
3. Extract final code
4. Return response
```

### 2. Agent Tools (`agentTools.ts`)

**Purpose:** Provide capabilities for the AI to understand code

**Available Tools:**

#### `read_file`
- Reads file content with analysis
- Counts functions, classes, imports
- Provides metadata

```typescript
// Usage
read_file(filePath: "src/utils.ts")

// Returns
File: src/utils.ts
Lines: 150
Functions: 8
Classes: 2
Content: ...
```

#### `search_code`
- Searches for patterns using regex
- Scans entire project
- Returns matches with locations

```typescript
// Usage
search_code(pattern: "async function \\w+")

// Returns
Found 12 matches:
src/api.ts:23
  async function fetchData() {
...
```

#### `analyze_code`
- Analyzes code quality
- Detects complexity issues
- Provides suggestions

```typescript
// Usage
analyze_code(filePath: "src/complex.ts")

// Returns
Code Analysis: src/complex.ts
Metrics:
  Long Functions: 3
  Deep Nesting: 5
  Complexity: High
Suggestions:
  • Break down long functions
  • Reduce nesting depth
```

#### `list_directory`
- Lists files in directory
- Filters by pattern
- Shows structure

#### `find_related_files`
- Finds files via imports
- Resolves dependencies
- Maps relationships

### 3. MCP Tools (`mcpTools.ts`)

**Purpose:** Enhanced project context understanding

**Capabilities:**
- Project structure reading
- Import analysis (JS/TS/Python/Go/Rust)
- Related file discovery
- Dependency mapping

### 4. System Prompts

**Philosophy:** Claude Code-like intelligence

**Key Principles:**
1. **Think Before Acting** - Analyze before making changes
2. **Use Tools Wisely** - Gather context systematically
3. **Reason Step-by-Step** - Break down complex tasks
4. **Verify Understanding** - Confirm before implementing
5. **Make Informed Changes** - Base decisions on analysis

**Workflow Steps:**
1. Understand the Request
2. Gather Context
3. Plan the Solution
4. Implement Changes
5. Verify Solution

## Agent Modes

### Enhanced Mode (Recommended)

**Characteristics:**
- Multi-turn conversation (up to 10 turns)
- Full tool access
- Step-by-step reasoning
- Context gathering
- Verification steps

**When to Use:**
- Complex refactoring
- Bug fixes requiring analysis
- Feature implementation
- Code quality improvements
- Anything requiring context

**Example Flow:**
```
Turn 1: 🤔 Understanding request
  → Analyzing user instruction
  → Identifying scope

Turn 2: 🔍 Gathering context
  → Tool: read_file
  → Tool: find_related_files
  → Understanding dependencies

Turn 3: 📊 Analyzing current code
  → Tool: analyze_code
  → Identifying issues
  → Planning approach

Turn 4: 💡 Planning solution
  → Reasoning about changes
  → Considering edge cases
  → Preparing implementation

Turn 5: ✅ Implementing fix
  → Generating code
  → Verifying completeness
  → Task complete
```

### Simple Mode

**Characteristics:**
- Single AI call
- No tool usage
- Faster response
- Lower API cost

**When to Use:**
- Simple syntax fixes
- Quick formatting changes
- Obvious bug fixes
- Small tweaks

## Tool Call Protocol

### Format

Tools are called using XML-like tags:

```xml
<tool_call>tool_name(param1="value1", param2="value2")</tool_call>
```

### Examples

```xml
<tool_call>read_file(filePath="src/app.ts")</tool_call>
<tool_call>search_code(pattern="useState", filePattern="*.tsx")</tool_call>
<tool_call>analyze_code(filePath="src/complex.ts")</tool_call>
```

### Tool Response

Tool results are added to conversation:

```
Tool: read_file
Result:
File: src/app.ts
Lines: 200
Functions: 15
...
```

## Code Extraction

### Final Code Tags

```xml
<final_code>
// Your fixed code here
</final_code>
```

### Alternative Formats

The system also detects:
- `<code_fix>` tags
- Markdown code blocks
- Raw code (when obvious)

## Configuration

### Settings

```json
{
  "fixCode.agentMode": "enhanced",
  "fixCode.maxAgentTurns": 5,
  "fixCode.enableAgentTools": true,
  "fixCode.showAgentReasoning": false,
  "fixCode.enableMCP": true,
  "fixCode.mcpDepth": 2
}
```

### Performance Tuning

**For Speed:**
```json
{
  "fixCode.agentMode": "simple",
  "fixCode.maxAgentTurns": 1,
  "fixCode.enableAgentTools": false
}
```

**For Accuracy:**
```json
{
  "fixCode.agentMode": "enhanced",
  "fixCode.maxAgentTurns": 10,
  "fixCode.enableAgentTools": true,
  "fixCode.enableMCP": true
}
```

**Balanced:**
```json
{
  "fixCode.agentMode": "enhanced",
  "fixCode.maxAgentTurns": 5,
  "fixCode.enableAgentTools": true,
  "fixCode.enableMCP": true
}
```

## Error Handling

### Retry Logic

- Tool failures are reported to AI
- AI can try alternative approaches
- Conversation continues on failure

### Timeout Protection

- Max turns limit prevents infinite loops
- Progress callbacks prevent UI freezing
- Graceful degradation on errors

### Fallback Behavior

If agent fails:
1. Try to extract partial code
2. Report detailed error
3. Suggest user adjustments

## Comparison with Claude Code

### Similarities

✅ Multi-turn reasoning
✅ Tool usage for context
✅ Step-by-step execution
✅ Progress reporting
✅ Context-aware fixes
✅ Intelligent analysis

### Differences

🔹 Claude Code: Direct file system access
🔸 This: Tool-based file access

🔹 Claude Code: Built-in LSP integration
🔸 This: Static code analysis

🔹 Claude Code: Native execution
🔸 This: API-based (OpenRouter)

### Advantages

✅ Multiple AI models (Claude, GPT, Gemini, Llama)
✅ Configurable agent behavior
✅ Lower barrier to entry (no CLI needed)
✅ VSCode integration
✅ Customizable system prompts

## Best Practices

### For Users

1. **Use Enhanced Mode** for complex tasks
2. **Enable Tools** for better context
3. **Show Reasoning** to understand agent thinking
4. **Increase Max Turns** for complex problems
5. **Enable MCP** for dependency understanding

### For Developers

1. **Add More Tools** as needed
2. **Tune System Prompts** for specific use cases
3. **Monitor Tool Usage** for optimization
4. **Implement Caching** for repeated reads
5. **Add Streaming** for better UX

## Future Enhancements

### Planned Features

- [ ] Streaming responses
- [ ] Multi-file editing
- [ ] Test generation
- [ ] Code verification
- [ ] Conversation persistence
- [ ] Agent memory
- [ ] Custom tool definitions
- [ ] Web search integration
- [ ] Documentation generation
- [ ] Automatic testing

### Possible Improvements

- More granular progress updates
- Better error recovery
- Conversation branching
- Agent ensembles
- Self-correction
- Confidence scoring
- Explanation generation
- Interactive refinement

## Contributing

Want to improve the agent system?

1. Add new tools in `agentTools.ts`
2. Enhance prompts in `agentOrchestrator.ts`
3. Improve parsing logic
4. Add verification steps
5. Optimize performance

## Examples

### Example 1: Simple Fix

**Request:** "Fix this typo"

**Agent Process:**
```
Turn 1: Read request → Identify typo → Fix directly
Result: ✅ Fixed in 1 turn
```

### Example 2: Complex Refactoring

**Request:** "Refactor to use modern React hooks"

**Agent Process:**
```
Turn 1: Read current code
  → Tool: read_file(component.tsx)
  → Analyzing class component

Turn 2: Find related files
  → Tool: find_related_files
  → Understanding dependencies

Turn 3: Analyze patterns
  → Tool: search_code("useState|useEffect")
  → Learning project patterns

Turn 4: Plan refactoring
  → Reasoning about hooks conversion
  → Considering state management

Turn 5: Implement changes
  → Converting class to functional
  → Adding hooks
  → Result: ✅ Complete refactoring
```

### Example 3: Bug Fix

**Request:** "Fix this memory leak"

**Agent Process:**
```
Turn 1: Understand the issue
  → Tool: read_file(component.tsx)
  → Analyzing code

Turn 2: Search for similar issues
  → Tool: search_code("useEffect.*return")
  → Finding cleanup patterns

Turn 3: Analyze current implementation
  → Tool: analyze_code
  → Identifying missing cleanup

Turn 4: Implement fix
  → Adding cleanup function
  → Result: ✅ Memory leak fixed
```

## Conclusion

This agent system brings Claude Code-like intelligence to your VSCode extension, enabling sophisticated code analysis, reasoning, and modification capabilities while maintaining flexibility and customization options.

The combination of multi-turn conversations, tool usage, and step-by-step reasoning makes it capable of handling complex coding tasks that would be difficult or impossible with single-turn AI interactions.
