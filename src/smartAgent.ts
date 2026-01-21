import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { buildMCPContext } from "./mcpTools";
import {
  validateCode,
  formatValidationResult,
  generateErrorContext,
  getErrorSummary,
  ValidationResult,
} from "./codeValidator";
import {
  createActionExecutor,
  ActionParser,
  AutonomousActionExecutor,
  ActionRequest,
} from "./autonomousActions";
import {
  searchWeb,
  shouldTriggerSearch,
  formatSearchResultsForAI,
  SearchRequest,
  WebSearchResult,
} from "./webSearch";

/* ============================================================
 * Smart AI Agent System - Optimized & Efficient
 * ============================================================
 * This is a simplified, faster agent system that:
 * 1. Analyzes task complexity automatically
 * 2. Caches project context
 * 3. Uses single-call with full context (not multi-turn)
 * 4. Adapts to task requirements
 */

export interface SmartAgentConfig {
  apiKey: string;
  model: string;
  workspacePath: string | null;
  currentFile: string;
  selectedCode: string;
  fullFileContent: string;
  userPrompt: string;
  enableValidation?: boolean;
  maxRetries?: number;
  enableWebSearch?: boolean;
}

export interface SmartAgentResult {
  success: boolean;
  code?: string;
  error?: string;
  mode?: "instant" | "smart" | "deep";
  cachedUsed?: boolean;
  validated?: boolean;
  validationScore?: number;
  retries?: number;
  validationErrors?: string[];
  actionsExecuted?: ActionRequest[];
  actionsSummary?: string;
  webSearchUsed?: boolean;
  webSearchQuery?: string;
  webSearchResults?: number;
  webSearchDetails?: Array<{
    query: string;
    resultsCount: number;
    sources: string[];
  }>;
  executionTime?: number;
  changesMade?: {
    filesModified?: string[];
    packagesInstalled?: string[];
    filesCreated?: string[];
    foldersCreated?: string[];
    otherActions?: string[];
  };
}

export interface ProjectCache {
  projectStructure: string;
  commonPatterns: string;
  dependencies: string;
  timestamp: number;
}

// Global cache storage
const projectCaches = new Map<string, ProjectCache>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/* ============================================================
 * Task Complexity Analyzer
 * ============================================================
 */

type TaskComplexity = "simple" | "medium" | "complex";

interface TaskAnalysis {
  complexity: TaskComplexity;
  mode: "instant" | "smart" | "deep";
  needsContext: boolean;
  needsAnalysis: boolean;
  confidence: number;
}

/**
 * Analyze task complexity to choose best approach
 */
function analyzeTaskComplexity(
  userPrompt: string,
  selectedCode: string
): TaskAnalysis {
  const prompt = userPrompt.toLowerCase();
  const codeLength = selectedCode.length;
  const codeLines = selectedCode.split("\n").length;

  // Simple keywords - instant mode
  const simpleKeywords = [
    "fix typo",
    "add comment",
    "rename variable",
    "format",
    "prettier",
    "indent",
    "remove console",
    "add semicolon",
    "fix syntax",
  ];

  // Medium keywords - smart mode (with context)
  const mediumKeywords = [
    "refactor",
    "optimize",
    "improve",
    "add error handling",
    "add types",
    "convert to",
    "update",
    "modify",
  ];

  // Complex keywords - deep mode (full analysis)
  const complexKeywords = [
    "implement",
    "create",
    "build",
    "design",
    "architect",
    "restructure",
    "migrate",
    "rewrite",
  ];

  // Check for simple tasks
  if (simpleKeywords.some((k) => prompt.includes(k)) || codeLines < 10) {
    return {
      complexity: "simple",
      mode: "instant",
      needsContext: false,
      needsAnalysis: false,
      confidence: 0.9,
    };
  }

  // Check for complex tasks
  if (
    complexKeywords.some((k) => prompt.includes(k)) ||
    codeLines > 100 ||
    prompt.length > 100
  ) {
    return {
      complexity: "complex",
      mode: "deep",
      needsContext: true,
      needsAnalysis: true,
      confidence: 0.85,
    };
  }

  // Medium complexity by default
  return {
    complexity: "medium",
    mode: "smart",
    needsContext: true,
    needsAnalysis: false,
    confidence: 0.8,
  };
}

/* ============================================================
 * Context Caching System
 * ============================================================
 */

/**
 * Get or build project cache
 */
async function getProjectCache(
  workspacePath: string
): Promise<ProjectCache | null> {
  // Check existing cache
  const cached = projectCaches.get(workspacePath);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("Using cached project context");
    return cached;
  }

  // Build new cache
  try {
    console.log("Building project cache...");

    const cache: ProjectCache = {
      projectStructure: await buildProjectStructure(workspacePath),
      commonPatterns: await detectCommonPatterns(workspacePath),
      dependencies: await getDependencies(workspacePath),
      timestamp: Date.now(),
    };

    projectCaches.set(workspacePath, cache);
    return cache;
  } catch (error) {
    console.error("Failed to build cache:", error);
    return null;
  }
}

/**
 * Build lightweight project structure
 */
async function buildProjectStructure(
  workspacePath: string
): Promise<string> {
  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    const ignoredDirs = ["node_modules", ".git", "dist", "out", "build"];

    let structure = "Project Structure:\n";
    const dirs = entries.filter(
      (e) => e.isDirectory() && !ignoredDirs.includes(e.name)
    );
    const files = entries.filter((e) => e.isFile());

    dirs.forEach((d) => (structure += `  📁 ${d.name}/\n`));
    files.slice(0, 10).forEach((f) => (structure += `  📄 ${f.name}\n`));

    return structure;
  } catch {
    return "Project structure unavailable";
  }
}

/**
 * Detect common patterns in project
 */
async function detectCommonPatterns(workspacePath: string): Promise<string> {
  try {
    const packageJsonPath = path.join(workspacePath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(content);

    let patterns = "Common Patterns:\n";

    // Detect frameworks
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["react"]) {patterns += "  - React project\n";}
    if (deps["vue"]) {patterns += "  - Vue project\n";}
    if (deps["@angular/core"]) {patterns += "  - Angular project\n";}
    if (deps["next"]) {patterns += "  - Next.js project\n";}
    if (deps["express"]) {patterns += "  - Express backend\n";}
    if (deps["typescript"]) {patterns += "  - TypeScript enabled\n";}

    return patterns;
  } catch {
    return "No patterns detected";
  }
}

/**
 * Get project dependencies
 */
async function getDependencies(workspacePath: string): Promise<string> {
  try {
    const packageJsonPath = path.join(workspacePath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(content);

    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});

    let depList = "Key Dependencies:\n";
    deps.slice(0, 10).forEach((d) => (depList += `  - ${d}\n`));

    return depList;
  } catch {
    return "No dependencies found";
  }
}

/* ============================================================
 * Smart System Prompts
 * ============================================================
 */

function getSmartSystemPrompt(
  mode: "instant" | "smart" | "deep",
  cache: ProjectCache | null,
  webSearchEnabled: boolean = true
): string {
  const basePrompt = `You are an expert AI coding assistant focused on precision and efficiency.

# Core Rules

1. **Output Format**: Return ONLY the fixed/improved code
   - NO markdown code fences (\`\`\`)
   - NO explanations unless explicitly asked
   - NO "Here's the fix:" or similar text
   - Just clean, working code

2. **Code Quality**:
   - Maintain existing style and conventions
   - Preserve comments unless outdated
   - Keep user's naming unless asked to change
   - Follow language best practices

3. **Scope**: Only change what's requested
   - Don't add unrequested features
   - Don't refactor surrounding code
   - Focus on the specific instruction

4. **Safety**:
   - Add error handling where critical
   - Ensure type safety
   - Avoid breaking changes
   - Consider edge cases

# Autonomous Actions

You can request automatic actions using special tags:

**Install Packages:**
<action:install_package packages="react,react-dom" />
<action:install_package packages="typescript" dev="true" />

**Create Files:**
<action:create_file path="src/components/Button.tsx" />
(Follow with the file content in next code block)

**Create Folders:**
<action:create_folder path="src/components" />

**Run Scripts:**
<action:run_script script="build" />
<action:run_script script="test" args="--watch" />

These actions execute automatically without user confirmation (configurable).
Use them when the task requires packages, files, or folders that don't exist.

${webSearchEnabled ? `
# Web Search Access

You have access to up-to-date information from the web.
If web search results are provided in the user prompt, use them to:
- Get latest package versions and best practices
- Find solutions to errors
- Learn about new APIs and features
- Understand current documentation

Web search results include:
- Stack Overflow solutions for errors
- GitHub code examples
- Official documentation
- Latest package information

Trust these results as they contain current, real-world information.
` : ""}
`;

  if (mode === "instant") {
    return (
      basePrompt +
      `
# Mode: INSTANT (Quick Fix)

This is a simple task requiring a quick, focused change.
- Make the minimal necessary change
- No need for deep analysis
- Fast and precise

Provide the fixed code immediately.`
    );
  }

  if (mode === "smart") {
    return (
      basePrompt +
      `
# Mode: SMART (Context-Aware)

This task benefits from project context understanding.

${cache ? `## Project Context\n\n${cache.projectStructure}\n${cache.commonPatterns}\n${cache.dependencies}\n` : ""}

- Consider the project patterns
- Maintain consistency with codebase
- Use appropriate dependencies
- Follow project conventions

Provide the improved code.`
    );
  }

  // Deep mode
  return (
    basePrompt +
    `
# Mode: DEEP (Comprehensive Analysis)

This is a complex task requiring thorough understanding.

${cache ? `## Project Context\n\n${cache.projectStructure}\n${cache.commonPatterns}\n${cache.dependencies}\n` : ""}

- Analyze the full context
- Consider architectural implications
- Plan before implementing
- Ensure robustness

Think through the solution, then provide the complete implementation.`
  );
}

/**
 * Build context-aware user prompt
 */
function buildUserPrompt(
  config: SmartAgentConfig,
  analysis: TaskAnalysis,
  cache: ProjectCache | null,
  webSearchResult?: WebSearchResult | null,
  searchRequest?: SearchRequest | null
): string {
  let prompt = "";

  // Add file context
  const fileName = path.basename(config.currentFile);
  prompt += `File: ${fileName}\n\n`;

  // Add task
  prompt += `Task: ${config.userPrompt}\n\n`;

  // Add web search results if available
  if (webSearchResult && searchRequest && webSearchResult.success && webSearchResult.results.length > 0) {
    prompt += formatSearchResultsForAI(webSearchResult, searchRequest);
    prompt += "\n";
  }

  // Add selected code
  prompt += `Selected Code:\n${config.selectedCode}\n\n`;

  // Add full file context for medium/complex tasks
  if (analysis.needsContext && config.selectedCode !== config.fullFileContent) {
    const fullLines = config.fullFileContent.split("\n").length;
    if (fullLines < 500) {
      // Only include if file is reasonable size
      prompt += `Full File Context:\n${config.fullFileContent}\n\n`;
    }
  }

  // Add MCP context for complex tasks
  if (analysis.mode === "deep" && config.workspacePath) {
    prompt += `\nNote: Consider the full project context and dependencies when making changes.\n`;
  }

  prompt += `\nProvide the fixed code (no explanations, no markdown):`;

  return prompt;
}

/* ============================================================
 * Smart Agent Execution
 * ============================================================
 */

/**
 * Build web search details for task notes
 */
function buildWebSearchDetails(
  webSearchResult: WebSearchResult | null,
  searchRequest: SearchRequest | null
): Array<{ query: string; resultsCount: number; sources: string[] }> | undefined {
  if (!webSearchResult || !searchRequest || !webSearchResult.success || webSearchResult.results.length === 0) {
    return undefined;
  }

  const sources = webSearchResult.results
    .slice(0, 5)
    .map((r) => r.source || "unknown");

  return [
    {
      query: searchRequest.query,
      resultsCount: webSearchResult.results.length,
      sources,
    },
  ];
}

/**
 * Build changes made summary from executed actions
 */
function buildChangesMade(executedActions: ActionRequest[]): {
  filesModified?: string[];
  packagesInstalled?: string[];
  filesCreated?: string[];
  foldersCreated?: string[];
  otherActions?: string[];
} {
  const changes: {
    filesModified?: string[];
    packagesInstalled?: string[];
    filesCreated?: string[];
    foldersCreated?: string[];
    otherActions?: string[];
  } = {};

  for (const action of executedActions) {
    switch (action.type) {
      case "install_package":
        if (!changes.packagesInstalled) changes.packagesInstalled = [];
        changes.packagesInstalled.push(
          ...(action.params.packages || [])
        );
        break;
      case "create_file":
        if (!changes.filesCreated) changes.filesCreated = [];
        changes.filesCreated.push(action.params.path || "unknown");
        break;
      case "create_folder":
        if (!changes.foldersCreated) changes.foldersCreated = [];
        changes.foldersCreated.push(action.params.path || "unknown");
        break;
      case "modify_file":
        if (!changes.filesModified) changes.filesModified = [];
        changes.filesModified.push(action.params.path || "unknown");
        break;
      case "format_code":
      case "update_imports":
      case "run_script":
      case "git_operation":
        if (!changes.otherActions) changes.otherActions = [];
        changes.otherActions.push(action.description || action.type);
        break;
    }
  }

  return changes;
}

/**
 * Execute smart agent with automatic mode selection and validation
 */
export async function executeSmartAgent(
  config: SmartAgentConfig,
  progressCallback?: (message: string) => void
): Promise<SmartAgentResult> {
  const startTime = Date.now(); // Track execution time
  const enableValidation = config.enableValidation !== false; // Default: true
  const maxRetries = config.maxRetries || 2;
  const enableWebSearch = config.enableWebSearch !== false; // Default: true
  let retryCount = 0;
  let lastValidationResult: ValidationResult | null = null;
  let webSearchResult: WebSearchResult | null = null;
  let searchRequest: SearchRequest | null = null;

  try {
    // Step 1: Analyze task complexity
    progressCallback?.("Analyzing task complexity...");
    const analysis = analyzeTaskComplexity(
      config.userPrompt,
      config.selectedCode
    );

    console.log(
      `Task analysis: ${analysis.complexity} complexity, ${analysis.mode} mode`
    );

    // Step 2: Get project cache if needed
    let cache: ProjectCache | null = null;
    if (
      analysis.needsContext &&
      config.workspacePath &&
      analysis.mode !== "instant"
    ) {
      progressCallback?.("Loading project context...");
      cache = await getProjectCache(config.workspacePath);
    }

    // Step 2.5: Check if web search is needed
    if (enableWebSearch) {
      searchRequest = shouldTriggerSearch({
        userPrompt: config.userPrompt,
      });

      if (searchRequest) {
        progressCallback?.(`Searching web for: "${searchRequest.query}"...`);
        console.log(`Web search triggered: ${searchRequest.type} - ${searchRequest.query}`);

        webSearchResult = await searchWeb(searchRequest);

        if (webSearchResult.success && webSearchResult.results.length > 0) {
          progressCallback?.(`Found ${webSearchResult.results.length} result(s)`);
          console.log(`Web search found ${webSearchResult.results.length} results`);
        } else {
          console.log("Web search returned no results");
        }
      }
    }

    // Step 3: Retry loop with validation
    while (retryCount <= maxRetries) {
      try {
        // Build prompt
        const systemPrompt = getSmartSystemPrompt(analysis.mode, cache, enableWebSearch);
        let userPrompt = buildUserPrompt(config, analysis, cache, webSearchResult, searchRequest);

        // Add error context if retrying
        if (retryCount > 0 && lastValidationResult && !lastValidationResult.isValid) {
          progressCallback?.(`Retry ${retryCount}/${maxRetries} - Fixing errors...`);
          const errorContext = generateErrorContext(lastValidationResult);
          userPrompt += `\n\n⚠️ PREVIOUS ATTEMPT HAD ERRORS:\n${errorContext}`;
        } else {
          progressCallback?.(
            `Processing with ${analysis.mode} mode... (${analysis.complexity})`
          );
        }

        // AI call
        const code = await callAI(
          config.apiKey,
          config.model,
          systemPrompt,
          userPrompt
        );

        if (!code) {
          throw new Error("AI did not return code");
        }

        // Clean the response
        const cleanedCode = cleanCodeResponse(code);

        // Step 4: Execute autonomous actions if any
        let actionExecutor: AutonomousActionExecutor | null = null;
        const executedActions: ActionRequest[] = [];

        if (config.workspacePath) {
          // Parse actions from AI response
          const suggestedActions = ActionParser.parseActions(code);

          if (suggestedActions.length > 0) {
            progressCallback?.(`Executing ${suggestedActions.length} action(s)...`);

            actionExecutor = createActionExecutor(config.workspacePath);

            for (const action of suggestedActions) {
              action.workspacePath = config.workspacePath;
              const result = await actionExecutor.execute(action);

              if (result.success) {
                executedActions.push(action);
                progressCallback?.(`✓ ${action.description}`);
              } else {
                console.warn(`Action failed: ${action.description}`, result.error);
              }
            }
          }
        }

        // Step 5: Validate if enabled
        if (enableValidation) {
          progressCallback?.("Validating generated code...");
          const fileName = path.basename(config.currentFile);
          const validationResult = validateCode(cleanedCode, fileName);

          lastValidationResult = validationResult;

          console.log(
            `Validation: ${validationResult.isValid ? "✅ PASSED" : "❌ FAILED"} (Score: ${validationResult.score}/100)`
          );

          if (validationResult.isValid) {
            // Success!
            const executionTime = (Date.now() - startTime) / 1000; // Convert to seconds
            return {
              success: true,
              code: cleanedCode,
              mode: analysis.mode,
              cachedUsed: !!cache,
              validated: true,
              validationScore: validationResult.score,
              retries: retryCount,
              actionsExecuted: executedActions,
              actionsSummary: actionExecutor?.getSummary(),
              webSearchUsed: !!webSearchResult && webSearchResult.success && webSearchResult.results.length > 0,
              webSearchQuery: searchRequest?.query,
              webSearchResults: webSearchResult?.results.length || 0,
              webSearchDetails: buildWebSearchDetails(webSearchResult, searchRequest),
              executionTime,
              changesMade: buildChangesMade(executedActions),
            };
          } else {
            // Validation failed
            const errorSummary = getErrorSummary(validationResult);
            console.log(`Validation errors: ${errorSummary}`);

            if (retryCount < maxRetries) {
              // Retry
              retryCount++;
              continue;
            } else {
              // Max retries reached, return with errors
              const executionTime = (Date.now() - startTime) / 1000;
              return {
                success: false,
                error: `Code validation failed after ${maxRetries} retries: ${errorSummary}`,
                code: cleanedCode, // Return code anyway for user review
                mode: analysis.mode,
                cachedUsed: !!cache,
                validated: false,
                validationScore: validationResult.score,
                retries: retryCount,
                validationErrors: validationResult.errors.map((e) => e.message),
                actionsExecuted: executedActions,
                actionsSummary: actionExecutor?.getSummary(),
                webSearchUsed: !!webSearchResult && webSearchResult.success && webSearchResult.results.length > 0,
                webSearchQuery: searchRequest?.query,
                webSearchResults: webSearchResult?.results.length || 0,
                webSearchDetails: buildWebSearchDetails(webSearchResult, searchRequest),
                executionTime,
                changesMade: buildChangesMade(executedActions),
              };
            }
          }
        } else {
          // No validation, return immediately
          const executionTime = (Date.now() - startTime) / 1000;
          return {
            success: true,
            code: cleanedCode,
            mode: analysis.mode,
            cachedUsed: !!cache,
            validated: false,
            retries: 0,
            actionsExecuted: executedActions,
            actionsSummary: actionExecutor?.getSummary(),
            webSearchUsed: !!webSearchResult && webSearchResult.success && webSearchResult.results.length > 0,
            webSearchQuery: searchRequest?.query,
            webSearchResults: webSearchResult?.results.length || 0,
            webSearchDetails: buildWebSearchDetails(webSearchResult, searchRequest),
            executionTime,
            changesMade: buildChangesMade(executedActions),
          };
        }
      } catch (innerError) {
        if (retryCount < maxRetries) {
          retryCount++;
          progressCallback?.(`Error occurred, retrying (${retryCount}/${maxRetries})...`);
          continue;
        } else {
          throw innerError;
        }
      }
    }

    // Should not reach here
    throw new Error("Unexpected error in retry loop");
  } catch (error) {
    console.error("Smart agent error:", error);
    const executionTime = (Date.now() - startTime) / 1000;
    return {
      success: false,
      error: `Failed to process: ${error}`,
      retries: retryCount,
      executionTime,
    };
  }
}

/**
 * Call AI with single request
 */
async function callAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer":
            "https://github.com/malikkurosaki/fix-code-makuro",
          "X-Title": "Fix Code Makuro",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as any;

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from AI");
    }

    return data.choices[0].message.content;
  } catch (error) {
    console.error("AI call failed:", error);
    throw error;
  }
}

/**
 * Clean AI response to extract pure code
 */
function cleanCodeResponse(response: string): string {
  let cleaned = response.trim();

  // Remove markdown code fences
  const codeBlockPattern = /^```[\w]*\n([\s\S]*?)\n```$/;
  const match = cleaned.match(codeBlockPattern);
  if (match && match[1]) {
    cleaned = match[1];
  }

  // Remove common AI explanation patterns
  const explanationPatterns = [
    /^Here'?s?\s+(?:the\s+)?(?:fixed|improved|refactored|updated)\s+code[\s:]+/im,
    /^Here\s+is\s+(?:the\s+)?(?:fixed|improved)\s+code[\s:]+/im,
    /^(?:Fixed|Improved|Refactored)\s+code[\s:]+/im,
  ];

  for (const pattern of explanationPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Remove opening/closing fences if still present
  cleaned = cleaned.replace(/^```[\w]*\s*\n?/, "");
  cleaned = cleaned.replace(/\n?```\s*$/, "");

  return cleaned.trim();
}

/* ============================================================
 * Cache Management
 * ============================================================
 */

/**
 * Clear cache for a project
 */
export function clearProjectCache(workspacePath: string): void {
  projectCaches.delete(workspacePath);
  console.log("Cache cleared for:", workspacePath);
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  projectCaches.clear();
  console.log("All caches cleared");
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalCaches: number;
  cacheKeys: string[];
} {
  return {
    totalCaches: projectCaches.size,
    cacheKeys: Array.from(projectCaches.keys()),
  };
}
