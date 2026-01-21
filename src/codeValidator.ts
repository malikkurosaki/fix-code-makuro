import * as ts from "typescript";
import * as path from "path";

/* ============================================================
 * Code Validator - Error Detection & Analysis
 * ============================================================
 * Validates code for syntax errors, type errors, and common issues
 * Supports: TypeScript, JavaScript, Python, and more
 */

export interface ValidationResult {
  isValid: boolean;
  errors: CodeError[];
  warnings: CodeWarning[];
  suggestions: string[];
  score: number; // 0-100
}

export interface CodeError {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
  code?: string;
  suggestion?: string;
}

export interface CodeWarning {
  line: number;
  message: string;
  type: string;
}

/* ============================================================
 * TypeScript/JavaScript Validation
 * ============================================================
 */

/**
 * Validate TypeScript/JavaScript code using TS compiler
 */
export function validateTypeScript(
  code: string,
  fileName: string
): ValidationResult {
  const errors: CodeError[] = [];
  const warnings: CodeWarning[] = [];
  const suggestions: string[] = [];

  try {
    // Determine if it's TypeScript or JavaScript
    const isTypeScript = fileName.endsWith(".ts") || fileName.endsWith(".tsx");
    const scriptKind = fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : isTypeScript
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

    // Create source file
    const sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // Check for syntax errors
    const syntaxDiagnostics = (sourceFile as any).parseDiagnostics || [];

    syntaxDiagnostics.forEach((diagnostic: ts.Diagnostic) => {
      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
          diagnostic.start
        );

        errors.push({
          line: line + 1,
          column: character + 1,
          message: ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            "\n"
          ),
          severity: "error",
          code: `TS${diagnostic.code}`,
        });
      }
    });

    // Basic semantic checks
    const semanticIssues = performSemanticChecks(sourceFile, code);
    warnings.push(...semanticIssues);

    // Generate suggestions
    if (errors.length === 0) {
      suggestions.push(...generateSuggestions(sourceFile, code));
    }

    // Calculate score
    const score = calculateScore(errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      score,
    };
  } catch (error) {
    // Fallback to basic syntax check
    return performBasicValidation(code, fileName);
  }
}

/**
 * Perform semantic checks
 */
function performSemanticChecks(
  sourceFile: ts.SourceFile,
  code: string
): CodeWarning[] {
  const warnings: CodeWarning[] = [];

  // Check for common issues
  const lines = code.split("\n");

  lines.forEach((line, index) => {
    // Check for console.log (warning only)
    if (line.includes("console.log") && !line.trim().startsWith("//")) {
      warnings.push({
        line: index + 1,
        message: "console.log found - consider removing for production",
        type: "code-quality",
      });
    }

    // Check for TODO/FIXME
    if (line.includes("TODO") || line.includes("FIXME")) {
      warnings.push({
        line: index + 1,
        message: "TODO/FIXME comment found",
        type: "todo",
      });
    }

    // Check for debugger statement
    if (line.includes("debugger") && !line.trim().startsWith("//")) {
      warnings.push({
        line: index + 1,
        message: "debugger statement found",
        type: "code-quality",
      });
    }
  });

  return warnings;
}

/**
 * Generate code improvement suggestions
 */
function generateSuggestions(
  sourceFile: ts.SourceFile,
  code: string
): string[] {
  const suggestions: string[] = [];

  // Check for async/await usage
  if (code.includes(".then(") && code.includes(".catch(")) {
    suggestions.push("Consider using async/await instead of .then()/.catch()");
  }

  // Check for var usage
  if (code.includes("var ")) {
    suggestions.push("Consider using 'const' or 'let' instead of 'var'");
  }

  // Check for missing error handling
  if (code.includes("await ") && !code.includes("try")) {
    suggestions.push("Consider adding try/catch for async operations");
  }

  return suggestions;
}

/* ============================================================
 * Python Validation
 * ============================================================
 */

/**
 * Validate Python code
 */
export function validatePython(code: string, fileName: string): ValidationResult {
  const errors: CodeError[] = [];
  const warnings: CodeWarning[] = [];
  const suggestions: string[] = [];

  try {
    const lines = code.split("\n");

    // Basic Python syntax checks
    let indentStack: number[] = [0];
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Check for indentation issues
      const indent = line.length - line.trimStart().length;

      // Check for common syntax errors
      if (trimmed.includes("=") && !trimmed.includes("==")) {
        const beforeEquals = trimmed.split("=")[0].trim();
        if (
          beforeEquals.startsWith("if ") ||
          beforeEquals.startsWith("while ") ||
          beforeEquals.startsWith("elif ")
        ) {
          errors.push({
            line: lineNumber,
            column: line.indexOf("=") + 1,
            message: "Use '==' for comparison, not '='",
            severity: "error",
            suggestion: "Replace '=' with '=='",
          });
        }
      }

      // Check for missing colons
      if (
        /^(if|elif|else|for|while|def|class|try|except|finally|with)\s/.test(
          trimmed
        ) &&
        !trimmed.endsWith(":")
      ) {
        errors.push({
          line: lineNumber,
          column: line.length,
          message: "Missing colon ':' at end of statement",
          severity: "error",
          suggestion: "Add ':' at the end",
        });
      }

      // Check for unmatched parentheses
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        warnings.push({
          line: lineNumber,
          message: "Unmatched parentheses",
          type: "syntax",
        });
      }
    }

    const score = calculateScore(errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      score,
    };
  } catch (error) {
    return performBasicValidation(code, fileName);
  }
}

/* ============================================================
 * Basic Validation (Fallback)
 * ============================================================
 */

/**
 * Basic validation for any language
 */
function performBasicValidation(
  code: string,
  fileName: string
): ValidationResult {
  const errors: CodeError[] = [];
  const warnings: CodeWarning[] = [];
  const suggestions: string[] = [];

  const lines = code.split("\n");

  // Check for basic syntax issues
  const brackets = { "{": 0, "[": 0, "(": 0 };
  const closeBrackets = { "}": "{", "]": "[", ")": "(" };

  lines.forEach((line, index) => {
    // Count brackets
    for (const char of line) {
      if (char in brackets) {
        brackets[char as keyof typeof brackets]++;
      } else if (char in closeBrackets) {
        const open = closeBrackets[char as keyof typeof closeBrackets];
        brackets[open as keyof typeof brackets]--;
      }
    }

    // Check for very long lines
    if (line.length > 200) {
      warnings.push({
        line: index + 1,
        message: "Line is very long (>200 characters)",
        type: "code-quality",
      });
    }

    // Check for trailing spaces
    if (line.endsWith(" ")) {
      warnings.push({
        line: index + 1,
        message: "Trailing whitespace",
        type: "formatting",
      });
    }
  });

  // Check for unmatched brackets
  for (const [bracket, count] of Object.entries(brackets)) {
    if (count !== 0) {
      errors.push({
        line: 0,
        column: 0,
        message: `Unmatched ${bracket === "{" ? "braces" : bracket === "[" ? "brackets" : "parentheses"}`,
        severity: "error",
        suggestion: `Check for missing closing ${bracket === "{" ? "}" : bracket === "[" ? "]" : ")"}`,
      });
    }
  }

  const score = calculateScore(errors, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    score,
  };
}

/* ============================================================
 * Main Validation Function
 * ============================================================
 */

/**
 * Validate code based on file extension
 */
export function validateCode(code: string, fileName: string): ValidationResult {
  const ext = path.extname(fileName).toLowerCase();

  // TypeScript/JavaScript
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return validateTypeScript(code, fileName);
  }

  // Python
  if (ext === ".py") {
    return validatePython(code, fileName);
  }

  // Fallback to basic validation
  return performBasicValidation(code, fileName);
}

/* ============================================================
 * Error Analysis
 * ============================================================
 */

/**
 * Calculate code quality score (0-100)
 */
function calculateScore(errors: CodeError[], warnings: CodeWarning[]): number {
  let score = 100;

  // Deduct points for errors (10 points each)
  score -= errors.length * 10;

  // Deduct points for warnings (2 points each)
  score -= warnings.length * 2;

  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, score));
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: ValidationResult): string {
  let output = "";

  if (result.isValid) {
    output += `✅ Code is valid (Score: ${result.score}/100)\n`;
  } else {
    output += `❌ Code has errors (Score: ${result.score}/100)\n\n`;
  }

  // Show errors
  if (result.errors.length > 0) {
    output += `Errors (${result.errors.length}):\n`;
    result.errors.forEach((error) => {
      output += `  Line ${error.line}:${error.column} - ${error.message}\n`;
      if (error.suggestion) {
        output += `    💡 ${error.suggestion}\n`;
      }
    });
    output += "\n";
  }

  // Show warnings
  if (result.warnings.length > 0) {
    output += `Warnings (${result.warnings.length}):\n`;
    result.warnings.slice(0, 5).forEach((warning) => {
      output += `  Line ${warning.line} - ${warning.message}\n`;
    });
    if (result.warnings.length > 5) {
      output += `  ... and ${result.warnings.length - 5} more\n`;
    }
    output += "\n";
  }

  // Show suggestions
  if (result.suggestions.length > 0) {
    output += `Suggestions:\n`;
    result.suggestions.forEach((suggestion) => {
      output += `  💡 ${suggestion}\n`;
    });
  }

  return output;
}

/**
 * Generate error context for AI retry
 */
export function generateErrorContext(result: ValidationResult): string {
  if (result.isValid) {
    return "";
  }

  let context = "The generated code has the following errors:\n\n";

  result.errors.forEach((error, index) => {
    context += `${index + 1}. Line ${error.line}: ${error.message}\n`;
    if (error.suggestion) {
      context += `   Suggestion: ${error.suggestion}\n`;
    }
  });

  context += "\nPlease fix these errors and regenerate the code.";

  return context;
}

/**
 * Quick error check - just returns boolean
 */
export function hasErrors(code: string, fileName: string): boolean {
  const result = validateCode(code, fileName);
  return !result.isValid;
}

/**
 * Get error summary
 */
export function getErrorSummary(result: ValidationResult): string {
  if (result.isValid) {
    return "No errors found";
  }

  return `${result.errors.length} error(s), ${result.warnings.length} warning(s)`;
}
