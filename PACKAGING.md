# 📦 Packaging & Distribution Guide

Complete guide untuk packaging dan distributing "Fix Code with makuro" extension.

## ⚠️ CRITICAL: Masalah "Command Not Found"

**Jika setelah install .vsix di PC lain, commands muncul tapi error "not found":**

**Root Cause:** Compiled files (`out/` folder) **TIDAK ter-include** dalam .vsix package!

**Solution:** Ikuti guide ini **EXACTLY** untuk memastikan packaging correct.

---

## 🚀 Quick Start (Recommended)

### Method 1: Automated (Easiest)

```bash
# 1. Verify package is ready
npm run verify-package

# 2. If verification passes, package it
npm run package

# 3. You'll get: fix-code-makuro-1.0.16.vsix
```

### Method 2: Manual

```bash
# 1. Clean previous build
rm -rf out/

# 2. Compile TypeScript
npm run compile

# 3. Verify compilation
ls -la out/extension.js

# 4. Package with vsce
vsce package

# 5. You'll get: fix-code-makuro-1.0.16.vsix
```

---

## 📋 Step-by-Step Guide

### Prerequisites

**1. Install VSCE (VSCode Extension Manager)**
```bash
npm install -g @vscode/vsce
```

**2. Verify Installation**
```bash
vsce --version
# Should show: 2.x.x or higher
```

### Step 1: Clean Build

```bash
# Remove old compiled files
rm -rf out/

# Remove old .vsix files
rm -f *.vsix
```

**Why?** Start fresh to avoid including stale files.

### Step 2: Compile TypeScript

```bash
npm run compile
```

**Expected Output:**
```
> fix-code-makuro@1.0.16 compile
> tsc -p ./

(No errors should appear)
```

**Verify Compilation:**
```bash
ls -la out/extension.js
# Should show file size ~50KB
```

**If compilation fails:**
- Check for TypeScript errors
- Fix errors in `src/` files
- Run `npm run compile` again

### Step 3: Verify Package Configuration

```bash
npm run verify-package
```

**Expected Output:**
```
============================================================
📦 Verifying Extension Package
============================================================

✓ Checking package.json...
  ✓ Main entry point: ./out/extension.js
  ✓ Version: 1.0.16
  ✓ Publisher: malikkurosaki

✓ Checking compiled output...
  ✓ out/ folder exists
  ✓ extension.js exists (49.00 KB)
  ✓ 24 compiled files found

✓ Checking .vscodeignore...
  ✓ out/ folder will be included
  ✓ src/ folder will be excluded
  ✓ node_modules will be excluded

✓ Checking documentation...
  ✓ README.md exists
  ✓ CHANGELOG.md exists

============================================================
📊 Verification Summary
============================================================

✅ VERIFICATION PASSED - Package is ready for distribution!

Next steps:
  1. Run: npm run package
  2. Test the .vsix file on another machine
  3. Publish: vsce publish
```

**If verification fails:**
- Read the error messages carefully
- Fix the issues
- Run verification again

### Step 4: Package Extension

```bash
npm run package
```

**OR manually:**
```bash
vsce package
```

**Expected Output:**
```
Executing prepublish script 'npm run compile'...

> fix-code-makuro@1.0.16 compile
> tsc -p ./

 DONE  Packaged: /path/to/fix-code-makuro-1.0.16.vsix (24 files, 150.5KB)
```

**Verify Package Created:**
```bash
ls -lh fix-code-makuro-1.0.16.vsix
# Should show ~150-200 KB
```

**If package is too small (< 50 KB):**
- ❌ Something went wrong!
- Check .vscodeignore is not excluding out/
- Re-run verify-package script

**If package is too large (> 5 MB):**
- ⚠️  Might include unnecessary files
- Check .vscodeignore excludes node_modules
- Check .vscodeignore excludes src/

### Step 5: Inspect Package Contents (Optional)

```bash
# Extract package to temp folder
mkdir -p temp-inspect
cd temp-inspect
unzip ../fix-code-makuro-1.0.16.vsix
ls -la extension/

# Should see:
# - out/ folder with .js files ✅
# - package.json ✅
# - README.md ✅
# - NO src/ folder ✅
# - NO node_modules/ folder ✅

cd ..
rm -rf temp-inspect
```

---

## 🧪 Testing Package

### Test Locally (Same Machine)

```bash
# Method 1: Via Command Line
code --install-extension fix-code-makuro-1.0.16.vsix

# Method 2: Via VSCode UI
# 1. Open VSCode
# 2. Ctrl/Cmd + Shift + P
# 3. "Extensions: Install from VSIX..."
# 4. Select the .vsix file
```

**Verify Installation:**
```
1. Reload VSCode window
2. Open any .js or .ts file
3. Check Output → "Log (Extension Host)"
4. Should see: "Fix Code with makuro - READY"
5. Press Ctrl/Cmd + Shift + P
6. Type "Fix Code"
7. Should see all 11 commands
```

### Test on Another Machine (Critical!)

**This is the REAL test!**

1. **Transfer .vsix to another PC:**
   ```bash
   # Via USB, email, or cloud storage
   # File: fix-code-makuro-1.0.16.vsix
   ```

2. **On the other PC:**
   ```bash
   code --install-extension fix-code-makuro-1.0.16.vsix
   ```

3. **Verify on other PC:**
   - Open VSCode
   - Open any code file
   - Look for ✨ wand icon in toolbar
   - Right-click → See "Fix Code with makuro"
   - Press Ctrl/Cmd + Shift + P → Type "Fix Code"
   - All commands should appear

4. **Test Functionality:**
   - Select some code
   - Click "Fix Code with makuro"
   - Enter API key when prompted
   - Enter a fix prompt
   - Should work WITHOUT "command not found" error

**If you get "command not found" error:**
- ❌ Package tidak correct!
- Check .vscodeignore tidak exclude out/
- Re-package dan test again

---

## 🔍 Troubleshooting Packaging Issues

### Issue 1: "command not found" After Install

**Symptoms:**
- Commands appear in Command Palette
- But clicking gives "command not found" error

**Cause:** `out/` folder not included in package

**Solution:**
```bash
# 1. Check .vscodeignore
cat .vscodeignore | grep -E "(^out/|^out/\*\*)"

# If you see "out/" or "out/**", REMOVE IT!

# 2. Verify .vscodeignore
npm run verify-package

# 3. Re-package
rm *.vsix
npm run package

# 4. Re-test on another machine
```

### Issue 2: Package Too Small

**Symptoms:**
- .vsix file < 50 KB

**Cause:** Compiled files not included

**Solution:**
```bash
# 1. Ensure files compiled
npm run compile
ls -la out/

# 2. Check .vscodeignore
npm run verify-package

# 3. Package again
vsce package
```

### Issue 3: Package Too Large

**Symptoms:**
- .vsix file > 5 MB

**Cause:** Including unnecessary files (node_modules, src)

**Solution:**
```bash
# 1. Check what's included
mkdir temp && cd temp
unzip ../fix-code-makuro-1.0.16.vsix
du -sh *
cd .. && rm -rf temp

# 2. Update .vscodeignore to exclude large folders

# 3. Package again
rm *.vsix
vsce package
```

### Issue 4: Extension Not Activating

**Symptoms:**
- Extension installed
- But no commands appear

**Cause:** Activation events not triggering

**Solution:**
See INSTALLATION_GUIDE.md for complete troubleshooting

---

## 📦 .vscodeignore Best Practices

**Current .vscodeignore should look like:**

```
# Source files (not needed in package)
src/**
**/tsconfig.json
**/*.ts

# Development files
.vscode/**
.vscode-test/**
node_modules/**

# Source maps (optional)
**/*.map

# CRITICAL: Do NOT exclude out/!
# out/ contains compiled .js files that MUST be included
```

**❌ NEVER DO THIS:**
```
out/          # ❌ This will cause "command not found"!
out/**        # ❌ This will cause "command not found"!
**/*.js       # ❌ This will exclude compiled files!
```

**✅ ALWAYS VERIFY:**
```bash
# out/ should NOT be in .vscodeignore
cat .vscodeignore | grep -E "(^out/|^out/\*\*)"
# Should return empty (no output)
```

---

## 🚀 Publishing to Marketplace

### Prerequisites

1. **Create Publisher Account:**
   - Visit: https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft/GitHub account
   - Create a publisher

2. **Get Personal Access Token:**
   - Azure DevOps: https://dev.azure.com
   - User Settings → Personal Access Tokens
   - Create token with "Marketplace (publish)" scope

### Publish Command

```bash
# Login (first time only)
vsce login YOUR_PUBLISHER_NAME

# Publish
vsce publish

# Or publish with specific version
vsce publish 1.0.16

# Or publish patch/minor/major
vsce publish patch   # 1.0.16 → 1.0.17
vsce publish minor   # 1.0.16 → 1.1.0
vsce publish major   # 1.0.16 → 2.0.0
```

---

## ✅ Pre-Distribution Checklist

Before distributing .vsix file:

- [ ] Code compiled: `npm run compile`
- [ ] No TypeScript errors
- [ ] Verification passed: `npm run verify-package`
- [ ] Package created: `npm run package`
- [ ] Package size ~150-200 KB (not too small, not too large)
- [ ] Tested locally (same machine)
- [ ] **Tested on another machine** (CRITICAL!)
- [ ] Commands work without "not found" error
- [ ] API key prompt works
- [ ] Fix code functionality works
- [ ] Documentation updated (README, CHANGELOG)
- [ ] Version number updated in package.json

---

## 📊 Expected Package Contents

**When you extract .vsix, you should see:**

```
extension/
├── out/                          ✅ Compiled files (MUST be here!)
│   ├── extension.js              ✅ Main file (~50 KB)
│   ├── smartAgent.js             ✅
│   ├── codeValidator.js          ✅
│   ├── autonomousActions.js      ✅
│   ├── taskNotes.js              ✅
│   ├── webSearch.js              ✅
│   ├── mcpTools.js               ✅
│   └── ... (other .js files)     ✅
├── package.json                  ✅ Extension manifest
├── README.md                     ✅ Documentation
├── CHANGELOG.md                  ✅ Version history
├── icon.png                      ✅ Extension icon (if you have one)
└── [Content_Types].xml          ✅ Package metadata

NOT IN PACKAGE:
├── src/                          ❌ Source files (excluded)
├── node_modules/                 ❌ Dependencies (excluded)
├── .vscode/                      ❌ Dev settings (excluded)
└── *.ts files                    ❌ TypeScript source (excluded)
```

---

## 🎯 Quick Commands Reference

```bash
# Verify package ready
npm run verify-package

# Package extension
npm run package

# Install locally
code --install-extension fix-code-makuro-1.0.16.vsix

# Uninstall
code --uninstall-extension malikkurosaki.fix-code-makuro

# List installed extensions
code --list-extensions

# Publish to marketplace
vsce publish
```

---

## 📝 Summary

**Critical Steps to Avoid "Command Not Found":**

1. ✅ Compile TypeScript: `npm run compile`
2. ✅ Verify package: `npm run verify-package`
3. ✅ Ensure `out/` NOT in .vscodeignore
4. ✅ Package correctly: `npm run package`
5. ✅ **Test on another machine!**

**If you follow this guide exactly, packaging akan success!**

---

## 🆘 Need Help?

**If packaging masih gagal:**

1. Run verification script:
   ```bash
   npm run verify-package
   ```

2. Check logs for errors

3. Fix errors and try again

4. If still stuck, check:
   - INSTALLATION_GUIDE.md
   - GitHub Issues: https://github.com/malikkurosaki/fix-code-makuro/issues

---

**Version:** 1.0.16
**Last Updated:** January 21, 2026
**Status:** ✅ Tested & Working
