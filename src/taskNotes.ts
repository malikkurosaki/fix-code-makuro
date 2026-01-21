/**
 * Task Notes System
 *
 * Generates and saves work summaries to help users understand what the AI did.
 * Similar to Claude Code's task summaries at the end of operations.
 */

import * as fs from "fs";
import * as path from "path";

export interface TaskNote {
  timestamp: Date;
  userRequest: string;
  codeContext: {
    fileName: string;
    linesModified: number;
    language: string;
  };
  whatIDid: string[];
  changesMade: {
    filesModified?: string[];
    packagesInstalled?: string[];
    filesCreated?: string[];
    foldersCreated?: string[];
    otherActions?: string[];
  };
  webSearchUsed: boolean;
  webSearchDetails?: {
    query: string;
    resultsCount: number;
    sources: string[];
  }[];
  validation: {
    passed: boolean;
    retries: number;
    errors?: string[];
  };
  complexity: "instant" | "smart" | "deep";
  executionTime: number;
  result: "success" | "failed";
  errorMessage?: string;
}

export interface TaskNotesConfig {
  enabled: boolean;
  filePath: string;
  workspacePath: string;
}

/**
 * Generate a human-readable task summary
 */
export function generateTaskSummary(note: TaskNote): string {
  const lines: string[] = [];

  // Header with timestamp
  const timestamp = note.timestamp.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  lines.push(`## 📝 Task Summary - ${timestamp}`);
  lines.push("");

  // Status badge
  const statusEmoji = note.result === "success" ? "✅" : "❌";
  const complexityEmoji =
    note.complexity === "instant" ? "⚡" :
    note.complexity === "smart" ? "🧠" : "🔬";

  lines.push(`**Status:** ${statusEmoji} ${note.result.toUpperCase()} | **Mode:** ${complexityEmoji} ${note.complexity.toUpperCase()} | **Time:** ${note.executionTime.toFixed(2)}s`);
  lines.push("");

  // User Request
  lines.push(`### 🎯 User Request`);
  lines.push(`> ${note.userRequest}`);
  lines.push("");

  // Code Context
  lines.push(`### 📄 Code Context`);
  lines.push(`- **File:** \`${note.codeContext.fileName}\``);
  lines.push(`- **Language:** ${note.codeContext.language}`);
  lines.push(`- **Lines:** ${note.codeContext.linesModified} lines`);
  lines.push("");

  // What I Did
  if (note.whatIDid.length > 0) {
    lines.push(`### 🔨 What I Did`);
    note.whatIDid.forEach((action) => {
      lines.push(`- ${action}`);
    });
    lines.push("");
  }

  // Changes Made
  const hasChanges = Object.values(note.changesMade).some((arr) => arr && arr.length > 0);
  if (hasChanges) {
    lines.push(`### 📦 Changes Made`);

    if (note.changesMade.filesModified && note.changesMade.filesModified.length > 0) {
      lines.push(`\n**Files Modified:**`);
      note.changesMade.filesModified.forEach((file) => {
        lines.push(`- \`${file}\``);
      });
    }

    if (note.changesMade.packagesInstalled && note.changesMade.packagesInstalled.length > 0) {
      lines.push(`\n**Packages Installed:**`);
      note.changesMade.packagesInstalled.forEach((pkg) => {
        lines.push(`- 📦 ${pkg}`);
      });
    }

    if (note.changesMade.filesCreated && note.changesMade.filesCreated.length > 0) {
      lines.push(`\n**Files Created:**`);
      note.changesMade.filesCreated.forEach((file) => {
        lines.push(`- 📄 ${file}`);
      });
    }

    if (note.changesMade.foldersCreated && note.changesMade.foldersCreated.length > 0) {
      lines.push(`\n**Folders Created:**`);
      note.changesMade.foldersCreated.forEach((folder) => {
        lines.push(`- 📁 ${folder}`);
      });
    }

    if (note.changesMade.otherActions && note.changesMade.otherActions.length > 0) {
      lines.push(`\n**Other Actions:**`);
      note.changesMade.otherActions.forEach((action) => {
        lines.push(`- ${action}`);
      });
    }

    lines.push("");
  }

  // Web Search
  if (note.webSearchUsed && note.webSearchDetails && note.webSearchDetails.length > 0) {
    lines.push(`### 🌐 Web Search Used`);
    note.webSearchDetails.forEach((search, idx) => {
      lines.push(`\n**Search ${idx + 1}:**`);
      lines.push(`- Query: "${search.query}"`);
      lines.push(`- Results: ${search.resultsCount} found`);
      if (search.sources.length > 0) {
        lines.push(`- Sources: ${search.sources.slice(0, 3).join(", ")}`);
      }
    });
    lines.push("");
  }

  // Validation
  lines.push(`### 🛡️ Code Validation`);
  if (note.validation.passed) {
    lines.push(`- ✅ **Passed** - Clean, error-free code generated`);
  } else {
    lines.push(`- ❌ **Failed** - Code has errors`);
    if (note.validation.errors && note.validation.errors.length > 0) {
      lines.push(`- Errors found:`);
      note.validation.errors.slice(0, 3).forEach((error) => {
        lines.push(`  - ${error}`);
      });
    }
  }

  if (note.validation.retries > 0) {
    lines.push(`- 🔄 Retries: ${note.validation.retries} attempt(s)`);
  }
  lines.push("");

  // Final Result
  lines.push(`### 🎉 Result`);
  if (note.result === "success") {
    lines.push(`✅ **Task completed successfully!**`);
    if (note.validation.passed) {
      lines.push(`- Code validated and error-free`);
    }
    if (note.whatIDid.length > 0) {
      lines.push(`- ${note.whatIDid.length} action(s) performed`);
    }
  } else {
    lines.push(`❌ **Task failed**`);
    if (note.errorMessage) {
      lines.push(`- Error: ${note.errorMessage}`);
    }
  }
  lines.push("");

  // Separator
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Write task note to file (prepend to top)
 */
export async function writeTaskNote(
  note: TaskNote,
  config: TaskNotesConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!config.enabled) {
      return { success: true }; // Silently skip if disabled
    }

    const filePath = path.isAbsolute(config.filePath)
      ? config.filePath
      : path.join(config.workspacePath, config.filePath);

    // Generate summary
    const summary = generateTaskSummary(note);

    // Read existing content if file exists
    let existingContent = "";
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, "utf-8");
    } else {
      // Create file with header
      existingContent = `# MAKURO Task Notes\n\nThis file contains a summary of tasks performed by the Fix Code AI agent.\nThe most recent tasks appear at the top.\n\n---\n\n`;
    }

    // Prepend new summary (newest on top)
    const newContent = summary + "\n" + existingContent;

    // Write to file
    fs.writeFileSync(filePath, newContent, "utf-8");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Clear task notes file
 */
export async function clearTaskNotes(
  config: TaskNotesConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = path.isAbsolute(config.filePath)
      ? config.filePath
      : path.join(config.workspacePath, config.filePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get task notes statistics
 */
export async function getTaskNotesStats(
  config: TaskNotesConfig
): Promise<{
  exists: boolean;
  size: number;
  taskCount: number;
  lastModified?: Date;
}> {
  try {
    const filePath = path.isAbsolute(config.filePath)
      ? config.filePath
      : path.join(config.workspacePath, config.filePath);

    if (!fs.existsSync(filePath)) {
      return { exists: false, size: 0, taskCount: 0 };
    }

    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");

    // Count task summaries (each starts with "## 📝 Task Summary")
    const taskCount = (content.match(/## 📝 Task Summary/g) || []).length;

    return {
      exists: true,
      size: stats.size,
      taskCount,
      lastModified: stats.mtime,
    };
  } catch (error) {
    return { exists: false, size: 0, taskCount: 0 };
  }
}

/**
 * Extract "what I did" actions from agent result
 */
export function extractWhatIDid(
  userPrompt: string,
  complexity: "instant" | "smart" | "deep",
  validationPassed: boolean,
  retries: number,
  webSearchUsed: boolean
): string[] {
  const actions: string[] = [];

  // Analyze the prompt to understand what was requested
  const prompt = userPrompt.toLowerCase();

  if (prompt.includes("refactor")) {
    actions.push("Refactored code to improve structure and readability");
  } else if (prompt.includes("optimize") || prompt.includes("performance")) {
    actions.push("Optimized code for better performance");
  } else if (prompt.includes("fix") || prompt.includes("error") || prompt.includes("bug")) {
    actions.push("Fixed errors and bugs in the code");
  } else if (prompt.includes("add") && prompt.includes("type")) {
    actions.push("Added TypeScript types for better type safety");
  } else if (prompt.includes("async") || prompt.includes("await")) {
    actions.push("Converted code to use async/await pattern");
  } else if (prompt.includes("improve")) {
    actions.push("Improved code quality and maintainability");
  } else if (prompt.includes("test")) {
    actions.push("Added unit tests for the code");
  } else if (prompt.includes("documentation") || prompt.includes("comment")) {
    actions.push("Added documentation and comments");
  } else {
    actions.push("Applied requested code modifications");
  }

  // Add complexity-based analysis
  if (complexity === "deep") {
    actions.push("Performed deep analysis of project context");
  } else if (complexity === "smart") {
    actions.push("Used cached project context for faster response");
  }

  // Add validation info
  if (validationPassed) {
    actions.push("Validated code to ensure it's error-free");
  }

  if (retries > 0) {
    actions.push(`Fixed validation errors through ${retries} retry attempt(s)`);
  }

  // Add web search info
  if (webSearchUsed) {
    actions.push("Searched the web for up-to-date information");
  }

  return actions;
}
