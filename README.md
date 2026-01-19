# Fix Code with Claude

AI-powered code fixing and improvement extension for Visual Studio Code using Claude AI from Anthropic.

## ✨ Features

- 🔍 **Smart CodeLens Integration** - "Fix Code" buttons appear above functions and classes
- 🎯 **Context-Aware Fixes** - Understands full file context while fixing selected code
- 🔒 **Secure API Key Storage** - Uses VSCode's SecretStorage API
- 📝 **Interactive Workflow** - Choose to replace, diff, or copy fixed code
- ⚡ **Multiple Trigger Methods** - CodeLens, context menu, keyboard shortcut, or command palette

## 🚀 Getting Started

### 1. Install the Extension

Install from VSCode Marketplace or build from source.

### 2. Get Your API Key

1. Visit [Anthropic Console](https://console.anthropic.com)
2. Create an account or sign in
3. Generate an API key

### 3. Configure the Extension

The extension will prompt for your API key on first use, or you can:

- **Command Palette**: `Fix Code: Set API Key`
- **Legacy Method**: Create `~/.anthropic.env` with:
  ```
  ANTHROPIC_API_KEY=sk-ant-your-key-here
  ```

## 📖 Usage

### Method 1: CodeLens (Easiest)

1. Open any code file
2. Look for **"✨ Fix Code"** buttons above functions/classes
3. Click the button
4. Enter what you want to fix
5. Choose how to apply the fix

### Method 2: Text Selection

1. Select code you want to fix
2. Right-click → **"Fix Code with Claude"**
3. Or use keyboard shortcut: `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (Mac)

### Method 3: Command Palette

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type "Fix Code"
3. Select **"Fix Code: Fix Code with Claude"**

## 🎯 Example Prompts

- "Refactor this to use async/await"
- "Add error handling"
- "Optimize for performance"
- "Add TypeScript types"
- "Convert to functional component"
- "Add unit tests"
- "Improve readability"
- "Fix the bug in this function"

## ⚙️ Configuration

Access settings via `File > Preferences > Settings` and search for "Fix Code":

| Setting | Default | Description |
|---------|---------|-------------|
| `fixCode.model` | `claude-sonnet-4-20250514` | Claude model to use |
| `fixCode.maxTokens` | `4096` | Maximum response length |
| `fixCode.autoApply` | `false` | Auto-apply without confirmation |

### Available Models

- `claude-opus-4-5-20251101` - Most powerful
- `claude-sonnet-4-5-20250929` - Balanced (recommended)
- `claude-sonnet-4-20250514` - Fast and efficient
- `claude-haiku-4-5-20251001` - Ultra-fast

## 🔧 Commands

| Command | Description |
|---------|-------------|
| `Fix Code: Fix Code with Claude` | Fix selected code |
| `Fix Code: Set API Key` | Update API key |
| `Fix Code: Reset API Key` | Remove stored API key |

## 🛠️ Development

### Prerequisites

- Node.js 18+
- VSCode 1.80+

### Setup

```bash
# Clone repository
git clone https://github.com/yourusername/fix-code-extension
cd fix-code-extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run in development mode
# Press F5 in VSCode to launch Extension Development Host
```

### Project Structure

```
fix-code-extension/
├── src/
│   ├── extension.ts           # Main extension code
│   └── FixCodeLensProvider.ts # CodeLens provider
├── package.json               # Extension manifest
├── tsconfig.json             # TypeScript config
└── README.md                 # This file
```

## 🔒 Privacy & Security

- API keys are stored securely using VSCode's SecretStorage API
- Code is sent to Anthropic's API for processing
- No code is stored or logged by this extension
- Review Anthropic's [Privacy Policy](https://www.anthropic.com/privacy)

## 🐛 Troubleshooting

### "No active editor found"
Make sure you have a file open and code selected.

### "API Key is required"
Set your API key using `Fix Code: Set API Key` command.

### "API request failed: 401"
Your API key is invalid. Reset it with `Fix Code: Reset API Key` and enter a new one.

### CodeLens not showing
Try:
1. Reload VSCode window (`Ctrl+R` or `Cmd+R`)
2. Check if CodeLens is enabled in settings
3. Ensure file is saved with proper extension

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Credits

Built with ❤️ using [Claude](https://claude.ai) by [Anthropic](https://anthropic.com)

## 📮 Support

- Report issues on [GitHub Issues](https://github.com/yourusername/fix-code-extension/issues)
- Star the repo if you find it useful!

---

**Note**: This extension requires an Anthropic API key and will incur API usage costs based on your usage.