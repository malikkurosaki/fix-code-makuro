import * as path from "path";
import * as fs from "fs/promises";

/* ============================================================
 * Agent Tools System - Similar to Claude Code
 * ============================================================
 * This module implements tools that the AI agent can use
 * to understand code, search files, analyze patterns, etc.
 */

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    [key: string]: {
      type: string;
      description: string;
      required: boolean;
    };
  };
  execute: (params: any, context: AgentContext) => Promise<ToolResult>;
}

export interface AgentContext {
  workspacePath: string;
  currentFile: string;
  selectedCode?: string;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  timestamp?: number;
}

export interface ToolResult {
  success: boolean;
  data: string;
  error?: string;
  metadata?: any;
}

/* ============================================================
 * Code Analysis Tools
 * ============================================================
 */

/**
 * Read a file with syntax awareness
 */
async function readFileWithContext(
  filePath: string,
  workspacePath: string
): Promise<ToolResult> {
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspacePath, filePath);

    const content = await fs.readFile(fullPath, "utf8");
    const lines = content.split("\n");
    const extension = path.extname(fullPath);
    const relativePath = path.relative(workspacePath, fullPath);

    // Extract key information
    let analysis = "";

    // Count functions, classes, imports
    const functions = content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g)?.length || 0;
    const classes = content.match(/class\s+\w+/g)?.length || 0;
    const imports = content.match(/^import\s+.+$/gm)?.length || 0;

    analysis = `File: ${relativePath}
Lines: ${lines.length}
Type: ${extension}
Functions: ${functions}
Classes: ${classes}
Imports: ${imports}

Content:
\`\`\`
${content}
\`\`\``;

    return {
      success: true,
      data: analysis,
      metadata: {
        path: relativePath,
        lines: lines.length,
        functions,
        classes,
        imports,
      },
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: `Failed to read file: ${error}`,
    };
  }
}

/**
 * Search for code patterns using regex
 */
async function searchCodePattern(
  pattern: string,
  workspacePath: string,
  filePattern?: string
): Promise<ToolResult> {
  try {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const regex = new RegExp(pattern, "gm");
    const ignoredDirs = ["node_modules", ".git", "dist", "out", "build", "coverage"];

    async function searchDir(dir: string, depth: number = 0) {
      if (depth > 4 || results.length > 50) {
        return;
      }

      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length > 50) {
          break;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoredDirs.includes(entry.name)) {
            await searchDir(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          // Check file pattern if provided
          if (filePattern && !entry.name.match(new RegExp(filePattern))) {
            continue;
          }

          // Only search text files
          const ext = path.extname(entry.name);
          const textExtensions = [
            ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs",
            ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".php",
            ".rb", ".swift", ".kt", ".scala", ".sh", ".md", ".txt",
            ".json", ".yaml", ".yml", ".xml", ".html", ".css", ".scss",
          ];

          if (!textExtensions.includes(ext)) {
            continue;
          }

          try {
            const content = await fs.readFile(fullPath, "utf8");
            const lines = content.split("\n");

            lines.forEach((line, index) => {
              if (regex.test(line)) {
                results.push({
                  file: path.relative(workspacePath, fullPath),
                  line: index + 1,
                  content: line.trim(),
                });
              }
            });
          } catch {
            // Skip files that can't be read
          }
        }
      }
    }

    await searchDir(workspacePath);

    if (results.length === 0) {
      return {
        success: true,
        data: `No matches found for pattern: ${pattern}`,
        metadata: { count: 0 },
      };
    }

    let output = `Found ${results.length} matches for pattern "${pattern}":\n\n`;
    results.forEach((result) => {
      output += `${result.file}:${result.line}\n  ${result.content}\n\n`;
    });

    return {
      success: true,
      data: output,
      metadata: { count: results.length, results },
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: `Search failed: ${error}`,
    };
  }
}

/**
 * List files in directory with filtering
 */
async function listFiles(
  directory: string,
  workspacePath: string,
  filter?: string
): Promise<ToolResult> {
  try {
    const targetDir = path.isAbsolute(directory)
      ? directory
      : path.join(workspacePath, directory);

    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const files: string[] = [];
    const dirs: string[] = [];

    for (const entry of entries) {
      if (filter && !entry.name.includes(filter)) {
        continue;
      }

      if (entry.isDirectory()) {
        dirs.push(entry.name + "/");
      } else {
        files.push(entry.name);
      }
    }

    const relativePath = path.relative(workspacePath, targetDir);
    let output = `Directory: ${relativePath || "."}\n\n`;

    if (dirs.length > 0) {
      output += "Directories:\n";
      dirs.forEach((dir) => (output += `  📁 ${dir}\n`));
      output += "\n";
    }

    if (files.length > 0) {
      output += "Files:\n";
      files.forEach((file) => (output += `  📄 ${file}\n`));
    }

    return {
      success: true,
      data: output,
      metadata: { files, dirs, total: files.length + dirs.length },
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: `Failed to list directory: ${error}`,
    };
  }
}

/**
 * Analyze code complexity and issues
 */
async function analyzeCode(
  filePath: string,
  workspacePath: string
): Promise<ToolResult> {
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspacePath, filePath);

    const content = await fs.readFile(fullPath, "utf8");
    const lines = content.split("\n");

    // Analyze code quality
    const analysis = {
      totalLines: lines.length,
      codeLines: lines.filter((l) => l.trim() && !l.trim().startsWith("//")).length,
      commentLines: lines.filter((l) => l.trim().startsWith("//") || l.trim().startsWith("/*")).length,
      blankLines: lines.filter((l) => !l.trim()).length,
      longLines: lines.filter((l) => l.length > 100).length,
      functions: (content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length,
      todos: (content.match(/\/\/\s*TODO/gi) || []).length,
      fixmes: (content.match(/\/\/\s*FIXME/gi) || []).length,
      complexityIndicators: {
        nestedCallbacks: (content.match(/\)\s*=>\s*{[^}]*=>\s*{/g) || []).length,
        longFunctions: detectLongFunctions(content),
        deepNesting: detectDeepNesting(lines),
      },
    };

    const relativePath = path.relative(workspacePath, fullPath);
    let output = `Code Analysis: ${relativePath}\n\n`;
    output += `Metrics:\n`;
    output += `  Total Lines: ${analysis.totalLines}\n`;
    output += `  Code Lines: ${analysis.codeLines}\n`;
    output += `  Comment Lines: ${analysis.commentLines}\n`;
    output += `  Blank Lines: ${analysis.blankLines}\n`;
    output += `  Long Lines (>100 chars): ${analysis.longLines}\n`;
    output += `  Functions: ${analysis.functions}\n`;
    output += `  Classes: ${analysis.classes}\n`;
    output += `  TODOs: ${analysis.todos}\n`;
    output += `  FIXMEs: ${analysis.fixmes}\n\n`;

    output += `Complexity Indicators:\n`;
    output += `  Nested Callbacks: ${analysis.complexityIndicators.nestedCallbacks}\n`;
    output += `  Long Functions (>50 lines): ${analysis.complexityIndicators.longFunctions}\n`;
    output += `  Deep Nesting (>4 levels): ${analysis.complexityIndicators.deepNesting}\n\n`;

    // Suggestions
    const suggestions: string[] = [];
    if (analysis.longLines > 10) {
      suggestions.push("Consider breaking long lines for better readability");
    }
    if (analysis.complexityIndicators.nestedCallbacks > 3) {
      suggestions.push("Consider refactoring nested callbacks to async/await or separate functions");
    }
    if (analysis.complexityIndicators.longFunctions > 2) {
      suggestions.push("Consider breaking down long functions into smaller, focused functions");
    }
    if (analysis.todos > 0 || analysis.fixmes > 0) {
      suggestions.push("Address TODO and FIXME comments");
    }

    if (suggestions.length > 0) {
      output += `Suggestions:\n`;
      suggestions.forEach((s) => (output += `  • ${s}\n`));
    }

    return {
      success: true,
      data: output,
      metadata: analysis,
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: `Analysis failed: ${error}`,
    };
  }
}

function detectLongFunctions(content: string): number {
  const functionRegex = /function\s+\w+\s*\([^)]*\)\s*{|const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{/g;
  let count = 0;
  let match;

  while ((match = functionRegex.exec(content)) !== null) {
    const startIndex = match.index;
    let braceCount = 1;
    let endIndex = startIndex + match[0].length;

    // Find matching closing brace
    for (let i = endIndex; i < content.length && braceCount > 0; i++) {
      if (content[i] === "{") {braceCount++;}
      if (content[i] === "}") {braceCount--;}
      endIndex = i;
    }

    const functionBody = content.substring(startIndex, endIndex);
    const lines = functionBody.split("\n").length;

    if (lines > 50) {
      count++;
    }
  }

  return count;
}

function detectDeepNesting(lines: string[]): number {
  let maxNesting = 0;
  let currentNesting = 0;

  for (const line of lines) {
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;

    currentNesting += openBraces - closeBraces;
    maxNesting = Math.max(maxNesting, currentNesting);
  }

  return maxNesting;
}

/**
 * Find related files based on imports
 */
async function findRelatedFiles(
  filePath: string,
  workspacePath: string
): Promise<ToolResult> {
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspacePath, filePath);

    const content = await fs.readFile(fullPath, "utf8");

    // Extract imports
    const imports: string[] = [];
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Resolve local imports
    const relatedFiles: string[] = [];
    const sourceDir = path.dirname(fullPath);

    for (const imp of imports) {
      if (imp.startsWith(".") || imp.startsWith("/")) {
        let resolvedPath = path.resolve(sourceDir, imp);

        // Try different extensions
        const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
        for (const ext of extensions) {
          try {
            await fs.access(resolvedPath + ext);
            relatedFiles.push(path.relative(workspacePath, resolvedPath + ext));
            break;
          } catch {
            try {
              const indexPath = path.join(resolvedPath, `index${ext}`);
              await fs.access(indexPath);
              relatedFiles.push(path.relative(workspacePath, indexPath));
              break;
            } catch {
              continue;
            }
          }
        }
      }
    }

    const relativePath = path.relative(workspacePath, fullPath);
    let output = `Related files for ${relativePath}:\n\n`;

    if (relatedFiles.length === 0) {
      output += "No local related files found.\n";
    } else {
      output += "Local imports:\n";
      relatedFiles.forEach((file) => (output += `  📄 ${file}\n`));
    }

    const externalImports = imports.filter(
      (imp) => !imp.startsWith(".") && !imp.startsWith("/")
    );
    if (externalImports.length > 0) {
      output += "\nExternal dependencies:\n";
      externalImports.forEach((imp) => (output += `  📦 ${imp}\n`));
    }

    return {
      success: true,
      data: output,
      metadata: { relatedFiles, externalImports },
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: `Failed to find related files: ${error}`,
    };
  }
}

/* ============================================================
 * Tools Registry
 * ============================================================
 */

export const agentTools: AgentTool[] = [
  {
    name: "read_file",
    description: "Read the content of a file with context and analysis",
    parameters: {
      filePath: {
        type: "string",
        description: "Path to the file (relative to workspace or absolute)",
        required: true,
      },
    },
    execute: async (params, context) => {
      return readFileWithContext(params.filePath, context.workspacePath);
    },
  },
  {
    name: "search_code",
    description: "Search for code patterns using regex across the project",
    parameters: {
      pattern: {
        type: "string",
        description: "Regex pattern to search for",
        required: true,
      },
      filePattern: {
        type: "string",
        description: "File name pattern to filter (optional)",
        required: false,
      },
    },
    execute: async (params, context) => {
      return searchCodePattern(
        params.pattern,
        context.workspacePath,
        params.filePattern
      );
    },
  },
  {
    name: "list_directory",
    description: "List files and directories in a specific path",
    parameters: {
      directory: {
        type: "string",
        description: "Directory path to list",
        required: true,
      },
      filter: {
        type: "string",
        description: "Filter files by name (optional)",
        required: false,
      },
    },
    execute: async (params, context) => {
      return listFiles(params.directory, context.workspacePath, params.filter);
    },
  },
  {
    name: "analyze_code",
    description: "Analyze code quality, complexity, and potential issues",
    parameters: {
      filePath: {
        type: "string",
        description: "Path to the file to analyze",
        required: true,
      },
    },
    execute: async (params, context) => {
      return analyzeCode(params.filePath, context.workspacePath);
    },
  },
  {
    name: "find_related_files",
    description: "Find files related to the current file through imports",
    parameters: {
      filePath: {
        type: "string",
        description: "Path to the file",
        required: true,
      },
    },
    execute: async (params, context) => {
      return findRelatedFiles(params.filePath, context.workspacePath);
    },
  },
];

/**
 * Execute a tool by name
 */
export async function executeTool(
  toolName: string,
  params: any,
  context: AgentContext
): Promise<ToolResult> {
  const tool = agentTools.find((t) => t.name === toolName);

  if (!tool) {
    return {
      success: false,
      data: "",
      error: `Tool not found: ${toolName}`,
    };
  }

  // Validate required parameters
  for (const [paramName, paramConfig] of Object.entries(tool.parameters)) {
    if (paramConfig.required && !params[paramName]) {
      return {
        success: false,
        data: "",
        error: `Missing required parameter: ${paramName}`,
      };
    }
  }

  return tool.execute(params, context);
}

/**
 * Get tools documentation for AI prompt
 */
export function getToolsDocumentation(): string {
  let doc = `\n\n=== Available Tools ===\n\n`;
  doc += `You have access to the following tools to analyze and understand code:\n\n`;

  agentTools.forEach((tool) => {
    doc += `**${tool.name}**\n`;
    doc += `  Description: ${tool.description}\n`;
    doc += `  Parameters:\n`;

    for (const [paramName, paramConfig] of Object.entries(tool.parameters)) {
      const required = paramConfig.required ? "(required)" : "(optional)";
      doc += `    - ${paramName}: ${paramConfig.type} ${required} - ${paramConfig.description}\n`;
    }

    doc += `\n`;
  });

  doc += `\nHow to use tools:\n`;
  doc += `1. Think about what information you need\n`;
  doc += `2. Use the appropriate tool to gather that information\n`;
  doc += `3. Analyze the results\n`;
  doc += `4. Make informed decisions about code changes\n`;
  doc += `5. Always verify your understanding before suggesting changes\n\n`;

  doc += `Best practices:\n`;
  doc += `- Use read_file to understand the current code\n`;
  doc += `- Use search_code to find similar patterns or related code\n`;
  doc += `- Use analyze_code to identify complexity and issues\n`;
  doc += `- Use find_related_files to understand dependencies\n`;
  doc += `- Always consider the full context before making changes\n`;

  return doc;
}
