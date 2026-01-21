# Installation & Troubleshooting Guide

## 📦 Installation

### From VSIX File

1. **Download** the `.vsix` file
2. **Open VSCode**
3. **Install** using one of these methods:

   **Method 1: Command Palette**
   ```
   Ctrl/Cmd + Shift + P
   → "Extensions: Install from VSIX..."
   → Select the .vsix file
   ```

   **Method 2: Extensions View**
   ```
   Click Extensions icon (or Ctrl/Cmd + Shift + X)
   → Click "..." menu (top-right)
   → "Install from VSIX..."
   → Select the .vsix file
   ```

   **Method 3: Command Line**
   ```bash
   code --install-extension fix-code-makuro-1.0.15.vsix
   ```

4. **Reload VSCode** when prompted

### From Marketplace (When Published)

```
Ctrl/Cmd + Shift + X
→ Search "Fix Code with makuro"
→ Click Install
```

## ✅ Verify Installation

### 1. Check Extension is Active

**Open Output Panel:**
```
View → Output → Select "Log (Extension Host)"
```

**Look for these logs:**
```
===================================
Fix Code with makuro - ACTIVATING
Version: 1.0.15
===================================
✓ Code Action Provider registered
✓ All commands registered (12 subscriptions)
✓ Fix Code with makuro - READY
===================================
```

### 2. Check Commands are Available

**Open Command Palette:**
```
Ctrl/Cmd + Shift + P
→ Type "Fix Code"
```

**You should see:**
- ✨ Fix Code with makuro
- Fix Code: Set API Key
- Fix Code: Reset API Key
- Fix Code: Select Default Model
- Fix Code: Show Current Model Info
- Fix Code: Clear Project Cache
- Fix Code: Clear All Caches
- Fix Code: Show Cache Statistics
- Fix Code: Open Task Notes
- Fix Code: Clear Task Notes
- Fix Code: Show Task Notes Statistics

### 3. Check Context Menu

**In any code file:**
```
1. Select some code (or don't select anything)
2. Right-click
3. Look for "Fix Code with makuro" in the menu
```

### 4. Check Toolbar Button

**Look at the top-right of your editor:**
- You should see a wand icon (✨) in the toolbar
- Click it to run "Fix Code with makuro"

## 🐛 Troubleshooting

### Issue 1: Commands Not Showing

**Symptoms:**
- No "Fix Code" commands in Command Palette
- No context menu item
- No toolbar button

**Solutions:**

**1. Reload Window**
```
Ctrl/Cmd + Shift + P → "Developer: Reload Window"
```

**2. Check Extension is Enabled**
```
Extensions view → Search "Fix Code"
→ Make sure it's not disabled
```

**3. Check for Errors**
```
Help → Toggle Developer Tools → Console tab
Look for errors related to "fixCode" or "makuro"
```

**4. Check Extension Host Log**
```
View → Output → "Log (Extension Host)"
Look for activation errors
```

**5. Reinstall Extension**
```
1. Uninstall: Extensions view → Right-click → Uninstall
2. Reload window
3. Reinstall from VSIX
4. Reload window again
```

### Issue 2: Extension Not Activating

**Symptoms:**
- No activation logs in Output
- Extension shows as installed but doesn't work

**Solutions:**

**1. Open a Code File**
```
The extension activates when you open supported files:
- JavaScript (.js)
- TypeScript (.ts)
- Python (.py)
- Java (.java)
- Go (.go)
- Rust (.rs)
- PHP (.php)
- Ruby (.rb)
- C# (.cs)
- C++ (.cpp)
```

**2. Trigger Manual Activation**
```
Ctrl/Cmd + Shift + P → "Fix Code: Set API Key"
This forces activation
```

**3. Check Activation Events**
```
Open package.json and verify activationEvents includes:
- "onStartupFinished"
- "onCommand:fixCode.open"
- Language-specific events
```

### Issue 3: Context Menu Not Showing

**Symptoms:**
- Commands work from Command Palette
- But no right-click context menu item

**Solutions:**

**1. Reload Window**
```
Ctrl/Cmd + Shift + P → "Developer: Reload Window"
```

**2. Check File Type**
```
Extension works best with code files
Try opening a .js, .ts, .py file
```

**3. Check Editor Focus**
```
Click inside the editor to ensure focus
Then right-click
```

### Issue 4: Button Not in Toolbar

**Symptoms:**
- Commands work
- Context menu works
- But no toolbar button

**Solutions:**

**1. Check Toolbar Visibility**
```
View → Appearance → Show Editor Actions
(Make sure toolbar is visible)
```

**2. Look for Wand Icon**
```
The button shows a wand icon (✨)
It's in the top-right of the editor
```

**3. Reload Window**
```
Ctrl/Cmd + Shift + P → "Developer: Reload Window"
```

### Issue 5: "No Active Editor" Error

**Symptoms:**
- Commands show up
- But clicking gives "No active editor found"

**Solutions:**

**1. Open a File**
```
You must have a file open in the editor
The command won't work in Settings or Extensions view
```

**2. Focus Editor**
```
Click inside the editor before running command
```

### Issue 6: "Please Select Code" Warning

**Symptoms:**
- Extension works
- But always asks to select code first

**Solutions:**

**This is FIXED in version 1.0.15:**
- You can now use it WITHOUT selecting code
- It will process the entire file
- Or select specific code for targeted fixes

**To verify you have the fix:**
```
Ctrl/Cmd + Shift + P → "Fix Code: Show Current Model Info"
Look for "Version: 1.0.15" in logs
```

### Issue 7: API Key Issues

**Symptoms:**
- "API Key is required" error
- Commands fail silently

**Solutions:**

**1. Set API Key**
```
Ctrl/Cmd + Shift + P → "Fix Code: Set API Key"
Enter your OpenRouter API key
```

**2. Verify API Key is Stored**
```
Run any Fix Code command
If it prompts for API key, it wasn't stored
```

**3. Get API Key**
```
1. Visit https://openrouter.ai
2. Sign in or create account
3. Go to Keys section
4. Generate new API key
5. Copy and set in extension
```

### Issue 8: Package Installation Issues

**Symptoms:**
- VSIX file won't install
- "Unable to install extension" error

**Solutions:**

**1. Check VSCode Version**
```
Help → About
Version must be 1.80.0 or higher
```

**2. Check File Integrity**
```bash
# On macOS/Linux
ls -lh fix-code-makuro-1.0.15.vsix

# Should be ~100-500 KB
# If very small (< 10 KB), file is corrupted
```

**3. Install via CLI**
```bash
code --install-extension fix-code-makuro-1.0.15.vsix --force
```

**4. Check Permissions**
```bash
# On macOS/Linux
chmod 644 fix-code-makuro-1.0.15.vsix
```

### Issue 9: Extension Shows but Doesn't Work

**Symptoms:**
- Extension appears in list
- Commands show but fail
- No error messages

**Solutions:**

**1. Check Developer Console**
```
Help → Toggle Developer Tools
Console tab → Look for red errors
```

**2. Check Dependencies**
```
Extension has NO external dependencies
If it fails, likely a packaging issue
```

**3. Full Reinstall**
```
1. Uninstall extension
2. Close VSCode completely
3. Reopen VSCode
4. Install extension
5. Reload window
```

### Issue 10: Commands Work but No Response

**Symptoms:**
- Commands execute
- No progress or feedback
- Nothing happens

**Solutions:**

**1. Check Notifications**
```
Look at bottom-right for notification popups
They might be showing errors
```

**2. Check API Key**
```
Ctrl/Cmd + Shift + P → "Fix Code: Set API Key"
Verify your OpenRouter key is correct
```

**3. Check Network**
```
Extension needs internet for:
- OpenRouter API calls
- Web search (if enabled)

Check your network connection
```

**4. Check Output Logs**
```
View → Output → "Extension Host"
Look for error messages
```

## 📋 Pre-Installation Checklist

Before installing on a new device:

- [ ] VSCode version 1.80.0 or higher
- [ ] VSIX file downloaded completely (not corrupted)
- [ ] Have OpenRouter API key ready
- [ ] Internet connection available
- [ ] Sufficient disk space (extension is ~1-2 MB)

## 📝 Post-Installation Checklist

After installing:

- [ ] Extension appears in Extensions list
- [ ] Activation logs show in Output
- [ ] Commands appear in Command Palette
- [ ] Context menu shows "Fix Code with makuro"
- [ ] Toolbar button (wand icon) visible
- [ ] API key is set
- [ ] Test fix on sample code

## 🎯 Quick Test

**To verify everything works:**

1. **Create test file:**
   ```javascript
   // test.js
   function hello() {
     console.log("Hello World")
   }
   ```

2. **Select the function**

3. **Right-click → "Fix Code with makuro"**

4. **Enter prompt:** "Add JSDoc comments"

5. **Should see:**
   - Processing notification
   - Progress messages
   - Success message
   - Code updated with comments

## 🔧 Developer Mode Testing

**For development/testing:**

1. **Clone repository**
   ```bash
   git clone https://github.com/malikkurosaki/fix-code-makuro
   cd fix-code-makuro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile**
   ```bash
   npm run compile
   ```

4. **Open in VSCode**
   ```bash
   code .
   ```

5. **Press F5** to launch Extension Development Host

6. **Test in new window**

## 📞 Getting Help

If issues persist:

1. **Check logs:**
   - Extension Host logs
   - Developer Console
   - Network requests

2. **Report issue:**
   - GitHub: https://github.com/malikkurosaki/fix-code-makuro/issues
   - Include:
     - VSCode version
     - Extension version
     - Error logs
     - Steps to reproduce

3. **Common fixes that work 90% of the time:**
   - Reload window
   - Restart VSCode
   - Reinstall extension
   - Check API key

## 🎉 Success Indicators

**You know it's working when:**

✅ Welcome notification appears on first install
✅ Wand icon visible in editor toolbar
✅ Right-click shows "Fix Code with makuro"
✅ Command Palette shows all Fix Code commands
✅ Activation logs show "READY" message
✅ Test fix completes successfully
✅ Task notes created in project

## 📊 Version Info

**Current Version:** 1.0.15

**Key Features:**
- ✨ Works with or without code selection
- 🎯 Multiple access points (toolbar, context menu, keyboard)
- 📝 Automatic task notes
- 🌐 Web search integration
- 🛡️ Code validation
- 🤖 Autonomous actions

**Minimum Requirements:**
- VSCode: 1.80.0+
- Node.js: Not required (bundled)
- Internet: Required for API calls

---

**Last Updated:** Version 1.0.15
**Tested On:** VSCode 1.80.0+, macOS, Windows, Linux
**Status:** ✅ Production Ready
