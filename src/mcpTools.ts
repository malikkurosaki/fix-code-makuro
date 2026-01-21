import * as path from "path";
import * as fs from "fs/promises";

/* ============================================================
 * MCP Tools - Model Context Protocol Integration
 * ============================================================
 * These tools help AI agents understand project structure,
 * read related files, and analyze imports for better context.
 */

export interface MCPTool {
  name: string;
  description: string;
  execute: (params: any, workspacePath: string) => Promise<string>;
}

/* ============================================================
 * File System Analysis Tools
 * ============================================================
 */

/**
 * Read project directory structure
 */
async function readProjectStructure(
  workspacePath: string,
  maxDepth: number = 3,
  currentDepth: number = 0
): Promise<string> {
  if (currentDepth >= maxDepth) {
    return "";
  }

  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    let structure = "";

    // Filter out common ignored directories
    const ignoredDirs = [
      "node_modules",
      ".git",
      "dist",
      "out",
      "build",
      ".vscode",
      "coverage",
      ".next",
      ".nuxt",
      "__pycache__",
      "venv",
      ".env",
    ];

    for (const entry of entries) {
      if (ignoredDirs.includes(entry.name)) {
        continue;
      }

      const indent = "  ".repeat(currentDepth);
      const prefix = entry.isDirectory() ? "📁" : "📄";

      structure += `${indent}${prefix} ${entry.name}\n`;

      if (entry.isDirectory()) {
        const subPath = path.join(workspacePath, entry.name);
        structure += await readProjectStructure(
          subPath,
          maxDepth,
          currentDepth + 1
        );
      }
    }

    return structure;
  } catch (error) {
    console.error("Error reading project structure:", error);
    return `Error: Unable to read directory structure - ${error}`;
  }
}

/**
 * Read file content with error handling
 */
async function readFileContent(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch (error) {
    return `Error: Unable to read file - ${error}`;
  }
}

/**
 * Extract imports from file content
 */
function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];
  const extension = path.extname(filePath);

  // JavaScript/TypeScript imports
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extension)) {
    // ES6 imports
    const es6ImportRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // CommonJS requires
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Dynamic imports
    const dynamicImportRegex = /import\s*\(['"]([^'"]+)['"]\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  // Python imports
  if (extension === ".py") {
    const pythonImportRegex = /^(?:from\s+([\w.]+)\s+)?import\s+([\w\s,*]+)/gm;
    let match;
    while ((match = pythonImportRegex.exec(content)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
  }

  // Go imports
  if (extension === ".go") {
    const goImportRegex = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
    let match;
    while ((match = goImportRegex.exec(content)) !== null) {
      if (match[1]) {
        // Multi-line imports
        const multiImports = match[1].match(/"([^"]+)"/g);
        if (multiImports) {
          imports.push(...multiImports.map((i) => i.replace(/"/g, "")));
        }
      } else if (match[2]) {
        imports.push(match[2]);
      }
    }
  }

  // Rust imports
  if (extension === ".rs") {
    const rustUseRegex = /use\s+([\w:]+)/g;
    let match;
    while ((match = rustUseRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

/**
 * Resolve import path to absolute file path
 */
async function resolveImportPath(
  importPath: string,
  sourceFilePath: string,
  workspacePath: string
): Promise<string | null> {
  // Skip node_modules and external packages
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  const sourceDir = path.dirname(sourceFilePath);
  let resolvedPath = path.resolve(sourceDir, importPath);

  // Try different extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"];

  // Check if path exists as-is
  try {
    const stats = await fs.stat(resolvedPath);
    if (stats.isFile()) {
      return resolvedPath;
    }
    if (stats.isDirectory()) {
      // Try index files
      for (const ext of extensions) {
        const indexPath = path.join(resolvedPath, `index${ext}`);
        try {
          await fs.access(indexPath);
          return indexPath;
        } catch {
          continue;
        }
      }
    }
  } catch {
    // Try adding extensions
    for (const ext of extensions) {
      try {
        await fs.access(resolvedPath + ext);
        return resolvedPath + ext;
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Analyze and read files related to imports
 */
async function analyzeImports(
  filePath: string,
  workspacePath: string
): Promise<string> {
  try {
    const content = await readFileContent(filePath);
    if (content.startsWith("Error:")) {
      return content;
    }

    const imports = extractImports(content, filePath);
    if (imports.length === 0) {
      return "No imports found in this file.";
    }

    let result = `Found ${imports.length} imports in ${path.basename(filePath)}:\n\n`;

    // Categorize imports
    const localImports = imports.filter(
      (imp) => imp.startsWith(".") || imp.startsWith("/")
    );
    const externalImports = imports.filter(
      (imp) => !imp.startsWith(".") && !imp.startsWith("/")
    );

    if (externalImports.length > 0) {
      result += "📦 External Dependencies:\n";
      externalImports.forEach((imp) => {
        result += `  - ${imp}\n`;
      });
      result += "\n";
    }

    if (localImports.length > 0) {
      result += "📁 Local Imports:\n";
      for (const imp of localImports) {
        const resolvedPath = await resolveImportPath(
          imp,
          filePath,
          workspacePath
        );
        if (resolvedPath) {
          const relativePath = path.relative(workspacePath, resolvedPath);
          result += `  - ${imp} → ${relativePath}\n`;
        } else {
          result += `  - ${imp} (not resolved)\n`;
        }
      }
    }

    return result;
  } catch (error) {
    return `Error analyzing imports: ${error}`;
  }
}

/**
 * Search for files by pattern
 */
async function searchFiles(
  workspacePath: string,
  pattern: string,
  maxResults: number = 20
): Promise<string> {
  try {
    const files: string[] = [];
    const rootPath = workspacePath;

    async function searchDir(dir: string, depth: number = 0) {
      if (depth > 5 || files.length >= maxResults) {
        return;
      }

      const entries = await fs.readdir(dir, { withFileTypes: true });
      const ignoredDirs = [
        "node_modules",
        ".git",
        "dist",
        "out",
        "build",
        ".vscode",
        "coverage",
      ];

      for (const entry of entries) {
        if (files.length >= maxResults) {
          break;
        }

        if (entry.isDirectory()) {
          if (!ignoredDirs.includes(entry.name)) {
            await searchDir(path.join(dir, entry.name), depth + 1);
          }
        } else if (entry.isFile()) {
          const fullPath = path.join(dir, entry.name);
          if (
            entry.name.includes(pattern) ||
            fullPath.includes(pattern)
          ) {
            const relativePath = path.relative(rootPath, fullPath);
            files.push(relativePath);
          }
        }
      }
    }

    await searchDir(workspacePath);

    if (files.length === 0) {
      return `No files found matching pattern: ${pattern}`;
    }

    let result = `Found ${files.length} file(s) matching "${pattern}":\n\n`;
    files.forEach((file) => {
      result += `📄 ${file}\n`;
    });

    return result;
  } catch (error) {
    return `Error searching files: ${error}`;
  }
}

/**
 * Get file context (read multiple related files)
 */
async function getFileContext(
  filePath: string,
  workspacePath: string,
  includeImports: boolean = true
): Promise<string> {
  try {
    let result = `\n=== File Context for: ${path.basename(filePath)} ===\n\n`;

    // Read main file
    const content = await readFileContent(filePath);
    if (content.startsWith("Error:")) {
      return content;
    }

    result += `📄 Main File: ${path.relative(workspacePath, filePath)}\n`;
    result += `Lines: ${content.split("\n").length}\n`;
    result += `Size: ${Buffer.byteLength(content, "utf8")} bytes\n\n`;

    // Analyze imports if requested
    if (includeImports) {
      result += "--- Import Analysis ---\n";
      const importsInfo = await analyzeImports(filePath, workspacePath);
      result += importsInfo + "\n";

      // Read related local files (first 3)
      const imports = extractImports(content, filePath);
      const localImports = imports
        .filter((imp) => imp.startsWith(".") || imp.startsWith("/"))
        .slice(0, 3);

      if (localImports.length > 0) {
        result += "\n--- Related Files Content (Preview) ---\n\n";
        for (const imp of localImports) {
          const resolvedPath = await resolveImportPath(
            imp,
            filePath,
            workspacePath
          );
          if (resolvedPath) {
            const relatedContent = await readFileContent(resolvedPath);
            if (!relatedContent.startsWith("Error:")) {
              const relativePath = path.relative(workspacePath, resolvedPath);
              const preview = relatedContent.split("\n").slice(0, 50).join("\n");
              result += `\n📄 ${relativePath}:\n\`\`\`\n${preview}\n${
                relatedContent.split("\n").length > 50 ? "... (truncated)" : ""
              }\n\`\`\`\n`;
            }
          }
        }
      }
    }

    return result;
  } catch (error) {
    return `Error getting file context: ${error}`;
  }
}

/* ============================================================
 * MCP Tools Registry
 * ============================================================
 */

export const mcpTools: MCPTool[] = [
  {
    name: "read_project_structure",
    description:
      "Read the directory structure of the project (max depth: 3 levels)",
    execute: async (params: any, workspacePath: string) => {
      const maxDepth = params.maxDepth || 3;
      const structure = await readProjectStructure(
        workspacePath,
        maxDepth
      );
      return `\n=== Project Structure ===\n\n${structure}`;
    },
  },
  {
    name: "read_file",
    description: "Read the content of a specific file",
    execute: async (params: { filePath: string }, workspacePath: string) => {
      if (!params.filePath) {
        return "Error: filePath parameter is required";
      }
      const fullPath = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.join(workspacePath, params.filePath);
      const content = await readFileContent(fullPath);
      return `\n=== File: ${params.filePath} ===\n\n\`\`\`\n${content}\n\`\`\``;
    },
  },
  {
    name: "analyze_imports",
    description: "Analyze imports/dependencies in a file",
    execute: async (params: { filePath: string }, workspacePath: string) => {
      if (!params.filePath) {
        return "Error: filePath parameter is required";
      }
      const fullPath = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.join(workspacePath, params.filePath);
      return await analyzeImports(fullPath, workspacePath);
    },
  },
  {
    name: "search_files",
    description: "Search for files matching a pattern",
    execute: async (
      params: { pattern: string; maxResults?: number },
      workspacePath: string
    ) => {
      if (!params.pattern) {
        return "Error: pattern parameter is required";
      }
      return await searchFiles(
        workspacePath,
        params.pattern,
        params.maxResults || 20
      );
    },
  },
  {
    name: "get_file_context",
    description:
      "Get comprehensive context for a file including imports and related files",
    execute: async (
      params: { filePath: string; includeImports?: boolean },
      workspacePath: string
    ) => {
      if (!params.filePath) {
        return "Error: filePath parameter is required";
      }
      const fullPath = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.join(workspacePath, params.filePath);
      return await getFileContext(
        fullPath,
        workspacePath,
        params.includeImports !== false
      );
    },
  },
];

/* ============================================================
 * MCP Context Builder
 * ============================================================
 */

/**
 * Build enhanced context using MCP tools
 */
export async function buildMCPContext(
  filePath: string,
  workspacePath: string | null
): Promise<string> {
  if (!workspacePath) {
    return "";
  }

  try {
    let context = "\n\n=== Enhanced Context (MCP Tools) ===\n";

    // Get file context with imports
    const fileContext = await getFileContext(filePath, workspacePath, true);
    context += fileContext;

    return context;
  } catch (error) {
    console.error("Error building MCP context:", error);
    return "";
  }
}

/**
 * Generate MCP tools documentation for AI prompt
 */
export function getMCPToolsDocumentation(): string {
  let doc = `\n\n=== Available MCP Tools ===\n\n`;
  doc += `You have access to the following tools to understand the project better:\n\n`;

  mcpTools.forEach((tool, index) => {
    doc += `${index + 1}. **${tool.name}**: ${tool.description}\n`;
  });

  doc += `\nThese tools help you understand:\n`;
  doc += `- Project structure and file organization\n`;
  doc += `- Dependencies and imports between files\n`;
  doc += `- Related code that might affect the changes\n`;
  doc += `- Full context of the codebase\n`;

  return doc;
}
