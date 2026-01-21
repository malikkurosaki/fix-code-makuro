#!/usr/bin/env node

/**
 * Verify Package Script
 *
 * This script verifies that the extension package is correctly configured
 * and ready for distribution.
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('📦 Verifying Extension Package');
console.log('='.repeat(60));
console.log('');

let errors = 0;
let warnings = 0;

// Check 1: package.json exists
console.log('✓ Checking package.json...');
const packagePath = path.join(__dirname, '..', 'package.json');
if (!fs.existsSync(packagePath)) {
  console.error('  ❌ ERROR: package.json not found!');
  errors++;
} else {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  // Check main entry point
  if (!pkg.main) {
    console.error('  ❌ ERROR: "main" field missing in package.json');
    errors++;
  } else if (pkg.main !== './out/extension.js') {
    console.error(`  ❌ ERROR: "main" should be "./out/extension.js", got "${pkg.main}"`);
    errors++;
  } else {
    console.log(`  ✓ Main entry point: ${pkg.main}`);
  }

  // Check version
  if (!pkg.version) {
    console.error('  ❌ ERROR: Version missing!');
    errors++;
  } else {
    console.log(`  ✓ Version: ${pkg.version}`);
  }

  // Check publisher
  if (!pkg.publisher) {
    console.warn('  ⚠️  WARNING: Publisher not set');
    warnings++;
  } else {
    console.log(`  ✓ Publisher: ${pkg.publisher}`);
  }
}

console.log('');

// Check 2: out/ folder exists
console.log('✓ Checking compiled output...');
const outPath = path.join(__dirname, '..', 'out');
if (!fs.existsSync(outPath)) {
  console.error('  ❌ ERROR: out/ folder not found! Run "npm run compile" first.');
  errors++;
} else {
  console.log('  ✓ out/ folder exists');

  // Check extension.js exists
  const extensionJsPath = path.join(outPath, 'extension.js');
  if (!fs.existsSync(extensionJsPath)) {
    console.error('  ❌ ERROR: out/extension.js not found!');
    errors++;
  } else {
    const stats = fs.statSync(extensionJsPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`  ✓ extension.js exists (${sizeKB} KB)`);

    if (stats.size < 1000) {
      console.error('  ❌ ERROR: extension.js is suspiciously small!');
      errors++;
    }
  }

  // Check other required files
  const requiredFiles = [
    'smartAgent.js',
    'codeValidator.js',
    'autonomousActions.js',
    'taskNotes.js',
    'webSearch.js',
    'mcpTools.js'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(outPath, file);
    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ ERROR: ${file} not found in out/`);
      errors++;
    }
  }

  if (errors === 0) {
    const files = fs.readdirSync(outPath).filter(f => f.endsWith('.js'));
    console.log(`  ✓ ${files.length} compiled files found`);
  }
}

console.log('');

// Check 3: .vscodeignore
console.log('✓ Checking .vscodeignore...');
const vscodeignorePath = path.join(__dirname, '..', '.vscodeignore');
if (!fs.existsSync(vscodeignorePath)) {
  console.warn('  ⚠️  WARNING: .vscodeignore not found (all files will be included)');
  warnings++;
} else {
  const content = fs.readFileSync(vscodeignorePath, 'utf8');

  // Check that out/ is not excluded (ignore comments)
  const lines = content.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });

  const excludesOut = lines.some(line => {
    const trimmed = line.trim();
    return trimmed === 'out/' ||
           trimmed === 'out/**' ||
           trimmed.startsWith('out/') ||
           trimmed.startsWith('out/**');
  });

  if (excludesOut) {
    console.error('  ❌ ERROR: out/ folder is excluded in .vscodeignore!');
    console.error('     This will cause "command not found" errors!');
    errors++;
  } else {
    console.log('  ✓ out/ folder will be included');
  }

  // Check that src/ is excluded
  if (!content.includes('src/') && !content.includes('src/**')) {
    console.warn('  ⚠️  WARNING: src/ folder is not excluded (source files will be included)');
    warnings++;
  } else {
    console.log('  ✓ src/ folder will be excluded');
  }

  // Check that node_modules is excluded
  if (!content.includes('node_modules')) {
    console.warn('  ⚠️  WARNING: node_modules not excluded (package will be huge!)');
    warnings++;
  } else {
    console.log('  ✓ node_modules will be excluded');
  }
}

console.log('');

// Check 4: README.md
console.log('✓ Checking documentation...');
const readmePath = path.join(__dirname, '..', 'README.md');
if (!fs.existsSync(readmePath)) {
  console.warn('  ⚠️  WARNING: README.md not found');
  warnings++;
} else {
  console.log('  ✓ README.md exists');
}

// Check CHANGELOG.md
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.warn('  ⚠️  WARNING: CHANGELOG.md not found');
  warnings++;
} else {
  console.log('  ✓ CHANGELOG.md exists');
}

console.log('');

// Summary
console.log('='.repeat(60));
console.log('📊 Verification Summary');
console.log('='.repeat(60));
console.log('');

if (errors > 0) {
  console.error(`❌ ${errors} ERROR(S) found - Package NOT ready for distribution!`);
  console.log('');
  console.log('Please fix the errors above before packaging.');
  process.exit(1);
} else if (warnings > 0) {
  console.warn(`⚠️  ${warnings} WARNING(S) found - Package may work but should be reviewed.`);
  console.log('');
  console.log('✅ VERIFICATION PASSED (with warnings)');
  console.log('');
  console.log('You can now run: npm run package');
  console.log('');
  process.exit(0);
} else {
  console.log('✅ VERIFICATION PASSED - Package is ready for distribution!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run: npm run package');
  console.log('  2. Test the .vsix file on another machine');
  console.log('  3. Publish: vsce publish');
  console.log('');
  process.exit(0);
}
