# Change Log

All notable changes to "Fix Code with makuro" extension.

## [1.0.16] - 2026-01-21

### 🎯 Major Improvements - Installation & Activation

**Problem Solved:** Extension commands not showing up after installation on new devices.

#### Added
- **Multiple Activation Events** - Extension now activates on:
  - `onStartupFinished` (general activation)
  - `onCommand:fixCode.open` (when command is invoked)
  - Language-specific events (JS, TS, Python, Java, Go, Rust, PHP, Ruby, C#, C++)
- **Editor Toolbar Button** - Added wand icon (✨) in editor toolbar for quick access
- **Enhanced Context Menu** - Context menu now shows whether code is selected or not
- **Full File Support** - Can now fix entire file without selecting code first
- **Welcome Notification** - Shows helpful message on first install with quick actions
- **Detailed Logging** - Comprehensive activation logs for debugging
- **Installation Guide** - Complete troubleshooting documentation

#### Changed
- **Selection Behavior** - No longer requires code selection; works with full file
- **Input Prompt** - Now shows scope info (full file or selection with line count)
- **Activation Reliability** - More reliable activation across different scenarios

#### Fixed
- Commands not appearing in Command Palette after fresh install
- Context menu not showing on new devices
- Extension not activating on startup
- Selection requirement preventing full-file fixes

## [1.0.15] - 2026-01-21

### 📝 Task Notes System

#### Added
- **Automatic Task Documentation** - AI explains what it did after each task (like Claude Code)
- **Task Notes File** - Creates `MAKURO_NOTE.md` with chronological history
- **Comprehensive Summaries** - Includes:
  - User request
  - What AI did
  - Files modified, packages installed
  - Web searches performed
  - Validation results
  - Execution time
- **Task Notes Commands**:
  - `Fix Code: Open Task Notes`
  - `Fix Code: Clear Task Notes`
  - `Fix Code: Show Task Notes Statistics`
- **Configuration Options**:
  - `fixCode.enableTaskNotes` (default: true)
  - `fixCode.taskNotesFile` (default: "MAKURO_NOTE.md")

## [1.0.14] - 2026-01-21

### 🌐 Web Search Integration

#### Added
- **Automatic Web Search** - AI searches internet for:
  - Latest documentation
  - Error solutions
  - Current best practices
  - Code examples
- **Multiple Search Providers**:
  - DuckDuckGo (general search)
  - Stack Overflow (error solutions)
  - GitHub (code examples)
- **Smart Triggering** - Automatically detects when to search based on:
  - Keywords: "latest", "up-to-date", "documentation"
  - Error messages
  - Documentation requests
- **Result Caching** - 1-hour cache to avoid redundant searches
- **Rate Limiting** - 2-second minimum between searches
- **Configuration**: `fixCode.enableWebSearch` (default: true)

## [1.0.13] - 2026-01-20

### 🤖 Autonomous Actions System

#### Added
- **AI Can Now**:
  - Install npm packages automatically
  - Create files and folders
  - Modify existing files
  - Format code
  - Update imports
- **Permission System** - Granular control over actions
- **Safe by Default** - Dangerous actions (scripts, git) disabled
- **Configuration Options**:
  - `fixCode.allowPackageInstall` (default: true)
  - `fixCode.allowFileCreation` (default: true)
  - `fixCode.allowFolderCreation` (default: true)
  - `fixCode.allowFileModification` (default: true)
  - `fixCode.allowScriptExecution` (default: false)
  - `fixCode.allowGitOperations` (default: false)
  - `fixCode.requireConfirmation` (default: false)

## [1.0.12] - 2026-01-20

### 🛡️ Code Validation System

#### Added
- **Automatic Error Detection** - Validates code before applying
- **Intelligent Retry** - AI fixes errors automatically
- **Multiple Language Support**:
  - TypeScript/JavaScript (TS compiler API)
  - Python (syntax validation)
- **Quality Scoring** - 0-100 score for code quality
- **Configuration Options**:
  - `fixCode.enableValidation` (default: true)
  - `fixCode.maxRetries` (default: 2)
  - `fixCode.showValidationDetails` (default: true)

## [1.0.11] - 2026-01-19

### 🚀 Smart Agent System

#### Added
- **Single-Call Efficiency** - No more multi-turn overhead (5x faster!)
- **Automatic Complexity Detection** - Three modes:
  - ⚡ INSTANT (1-2s) - Simple fixes
  - 🧠 SMART (3-5s) - Medium tasks
  - 🔬 DEEP (5-10s) - Complex features
- **Intelligent Caching** - Project context cached for 5 minutes
- **Performance Improvements**:
  - Simple fixes: 2.5x faster
  - Refactoring: 5x faster
  - Complex tasks: 4x faster
- **Configuration Options**:
  - `fixCode.useSmartMode` (default: true)
  - `fixCode.cacheDuration` (default: 5 minutes)

#### Changed
- Replaced slow multi-turn agent with fast single-call system
- Automatic mode selection based on task complexity

#### Fixed
- Slow performance on simple tasks (was 25-40s, now 1-2s)
- Overkill context gathering for trivial fixes

## [1.0.10] - 2026-01-18

### 📊 Model Information Command

#### Added
- **Show Current Model Info** - New command to display:
  - Current model and provider
  - Configuration settings
  - Expected performance times
  - Quick actions (Change Model, View Settings)

## [1.0.9] - 2026-01-18

### 🔧 MCP Tools Integration

#### Added
- **Model Context Protocol (MCP) Tools**:
  - Read project structure
  - Read file contents
  - Analyze imports (JS/TS/Python/Go/Rust)
  - Search files
  - Find related files
- **Better Context Understanding** - AI gets full project context when needed

## [1.0.0 - 1.0.8] - 2026-01-15 to 2026-01-17

### Initial Releases

#### Added
- Basic code fixing functionality
- OpenRouter API integration
- Multiple AI models support (Claude, GPT, Gemini, Llama)
- CodeLens provider
- Context menu integration
- Keyboard shortcuts (Ctrl/Cmd+Shift+F)
- Secure API key storage
- Configuration options
- Cache management commands

---

## Version Highlights

### Performance Evolution

| Version | Simple Fix | Refactoring | Complex Task |
|---------|-----------|-------------|--------------|
| 1.0.8   | 25s       | 40s         | 60s          |
| 1.0.11  | 1-2s      | 3-5s        | 5-10s        |
| Current | 1-2s      | 3-5s        | 5-10s        |

**Improvement:** 12x faster on simple fixes, 8x faster on refactoring!

### Feature Progression

1. **v1.0.0-1.0.8**: Basic AI code fixing
2. **v1.0.9**: MCP tools for context
3. **v1.0.10**: Model info command
4. **v1.0.11**: Smart agent (major speed improvement)
5. **v1.0.12**: Code validation
6. **v1.0.13**: Autonomous actions
7. **v1.0.14**: Web search integration
8. **v1.0.15**: Task notes system
9. **v1.0.16**: Installation & activation fixes

### Current Capabilities

✅ **Smart & Fast** - Automatic complexity detection
✅ **Validated** - Automatic error detection & retry
✅ **Autonomous** - Can install packages, create files
✅ **Up-to-Date** - Web search for latest info
✅ **Transparent** - Task notes explain what AI did
✅ **Reliable** - Works on all devices with proper activation

---

**Latest Version:** 1.0.16
**Status:** ✅ Production Ready
**Next:** User feedback & improvements
