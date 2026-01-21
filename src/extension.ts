import * as vscode from "vscode";
import path from "path";
import fs from "fs/promises";
import { FixCodeActionProvider } from "./FixCodeActionProvider";
import {
  executeSmartAgent,
  SmartAgentConfig,
  clearProjectCache,
  clearAllCaches,
  getCacheStats,
} from "./smartAgent";
import {
  writeTaskNote,
  TaskNote,
  TaskNotesConfig,
  extractWhatIDid,
  clearTaskNotes,
  getTaskNotesStats,
} from "./taskNotes";

/* ============================================================
 * Types
 * ============================================================
 */

interface FixPayload {
  fileName: string;
  filePath: string;
  workspacePath: string | null;
  prompt: string;
  rangeText: string;
  fullText: string;
}

interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter" | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/* ============================================================
 * Constants
 * ============================================================
 */

const SECRET_KEY = "openRouterApiKey";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5:beta";

// Legacy fallback (.env) – optional
const ENV_FILE_PATH = (() => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) { return null; }
  return path.join(homeDir, ".openrouter.env");
})();

/* ============================================================
 * Helper Functions
 * ============================================================
 */

/**
 * Write task note from agent result
 */
async function writeTaskNoteFromResult(
  payload: FixPayload,
  result: any,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const config = vscode.workspace.getConfiguration("fixCode");
    const enableTaskNotes = config.get<boolean>("enableTaskNotes", true);
    const taskNotesFile = config.get<string>("taskNotesFile", "MAKURO_NOTE.md");

    if (!enableTaskNotes) {
      return;
    }

    // Get language from file extension
    const fileExt = path.extname(payload.fileName);
    const language = fileExt.replace(".", "");

    // Build task note
    const taskNote: TaskNote = {
      timestamp: new Date(),
      userRequest: payload.prompt,
      codeContext: {
        fileName: payload.fileName,
        linesModified: (payload.rangeText.match(/\n/g) || []).length + 1,
        language: language || "unknown",
      },
      whatIDid: extractWhatIDid(
        payload.prompt,
        result.mode || "smart",
        result.validated !== false,
        result.retries || 0,
        result.webSearchUsed || false
      ),
      changesMade: result.changesMade || {},
      webSearchUsed: result.webSearchUsed || false,
      webSearchDetails: result.webSearchDetails,
      validation: {
        passed: result.validated !== false,
        retries: result.retries || 0,
        errors: result.validationErrors,
      },
      complexity: result.mode || "smart",
      executionTime: result.executionTime || 0,
      result: result.success ? "success" : "failed",
      errorMessage: result.error,
    };

    // Write task note
    const taskNotesConfig: TaskNotesConfig = {
      enabled: true,
      filePath: taskNotesFile,
      workspacePath: payload.workspacePath || process.cwd(),
    };

    await writeTaskNote(taskNote, taskNotesConfig);
  } catch (error) {
    console.error("Failed to write task note:", error);
    // Don't show error to user, just log it
  }
}

/* ============================================================
 * Extension Lifecycle
 * ============================================================
 */

export function activate(context: vscode.ExtensionContext) {
  console.log("===================================");
  console.log("Fix Code with makuro - ACTIVATING");
  console.log("Version: 1.0.17");
  console.log("===================================");

  // Show activation notification (only on first install)
  const hasShownWelcome = context.globalState.get<boolean>("hasShownWelcome");
  if (!hasShownWelcome) {
    vscode.window
      .showInformationMessage(
        "✨ Fix Code with makuro activated! Select code and right-click to get started.",
        "Open Commands",
        "Set API Key"
      )
      .then((action) => {
        if (action === "Open Commands") {
          vscode.commands.executeCommand(
            "workbench.action.showCommands",
            "Fix Code"
          );
        } else if (action === "Set API Key") {
          vscode.commands.executeCommand("fixCode.setApiKey");
        }
      });
    context.globalState.update("hasShownWelcome", true);
  }

  // Code Action Provider - Show fix button when text is selected
  const codeActionProvider = new FixCodeActionProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file", language: "*" },
      codeActionProvider,
      {
        providedCodeActionKinds: FixCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  console.log("✓ Code Action Provider registered");

  // Main Command: Fix Code
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "fixCode.open",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("No active editor found.");
          return;
        }

        const document = editor.document;
        const selection = editor.selection;

        // Determine range: use selection if exists, otherwise use full document
        let range: vscode.Range;
        let isFullFile = false;

        if (selection.isEmpty) {
          // No selection - use entire file
          range = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );
          isFullFile = true;
        } else {
          // Has selection - use selected range
          range = new vscode.Range(selection.start, selection.end);
          isFullFile = false;
        }

        // 1. Ensure API Key exists
        const apiKey = await ensureApiKey(context);
        if (!apiKey) { return; }

        // 2. File & workspace info
        const fileName = path.basename(document.fileName);
        const filePath = document.fileName;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          document.uri
        );
        const workspacePath = workspaceFolder?.uri.fsPath ?? null;

        // 3. Decoration (highlight)
        const decoration = vscode.window.createTextEditorDecorationType({
          isWholeLine: true,
          backgroundColor: "rgba(80, 140, 255, 0.2)",
          border: "1px solid rgba(80, 140, 255, 0.5)",
        });

        try {
          editor.setDecorations(decoration, [range]);

          // 4. Prompt user
          const linesCount = range.end.line - range.start.line + 1;
          const scopeInfo = isFullFile
            ? `Full file (${linesCount} lines)`
            : `Selected code (${linesCount} lines)`;

          const prompt = await vscode.window.showInputBox({
            title: `Fix Code - ${scopeInfo}`,
            prompt: "Describe what you want to fix or improve",
            placeHolder: "e.g. Refactor this function to be async",
            ignoreFocusOut: true,
          });

          if (!prompt) {
            vscode.window.showInformationMessage("Operation cancelled.");
            return;
          }

          // 5. Payload
          const payload: FixPayload = {
            fileName,
            filePath,
            workspacePath,
            prompt,
            rangeText: document.getText(range),
            fullText: document.getText(),
          };

          vscode.window.showInformationMessage(
            `Processing "${fileName}"...`
          );

          console.log("Fix payload prepared", payload);

          // 6. Send to Smart AI Agent
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Smart AI analyzing code...",
              cancellable: false,
            },
            async (progress) => {
              return await sendToAIAgent(payload, apiKey, (message) => {
                progress.report({ message });
              });
            }
          );

          if (result.success && result.code) {
            // Show mode used
            const modeEmoji: { [key: string]: string } = {
              instant: "⚡",
              smart: "🧠",
              deep: "🔬",
            };
            const mode = result.mode || "smart";
            const emoji = modeEmoji[mode] || "🧠";
            const cacheInfo = result.cachedUsed ? " (cached)" : "";

            // Build success message with validation info
            let successMsg = `${emoji} ${mode.toUpperCase()} mode used${cacheInfo}`;

            if (result.validated) {
              const scoreEmoji = result.validationScore && result.validationScore >= 90 ? "✅" : result.validationScore && result.validationScore >= 70 ? "✓" : "⚠️";
              successMsg += ` ${scoreEmoji} Validated (${result.validationScore}/100)`;

              if (result.retries && result.retries > 0) {
                successMsg += ` - Fixed after ${result.retries} ${result.retries === 1 ? "retry" : "retries"}`;
              }
            }

            // Show actions executed
            if (result.actionsExecuted && result.actionsExecuted.length > 0) {
              successMsg += ` 🤖 ${result.actionsExecuted.length} action(s)`;
            }

            // Show web search usage
            if (result.webSearchUsed && result.webSearchResults && result.webSearchResults > 0) {
              successMsg += ` 🌐 Web search: ${result.webSearchResults} result(s)`;
            }

            vscode.window.showInformationMessage(successMsg);

            // Show detailed actions if any
            if (result.actionsSummary) {
              vscode.window.showInformationMessage(
                `Autonomous Actions:\n${result.actionsSummary}`,
                "OK"
              );
            }

            await applyCodeFix(editor, range, result.code);

            // Write task note
            await writeTaskNoteFromResult(
              payload,
              result,
              context
            );
          } else if (!result.success && result.code && result.validationErrors) {
            // Validation failed but we have code
            const config = vscode.workspace.getConfiguration("fixCode");
            const showDetails = config.get<boolean>("showValidationDetails", true);

            let errorMsg = `⚠️ Validation failed (Score: ${result.validationScore}/100)`;
            if (result.retries) {
              errorMsg += ` after ${result.retries} retries`;
            }

            if (showDetails && result.validationErrors.length > 0) {
              errorMsg += `\n\nErrors:\n${result.validationErrors.slice(0, 3).join("\n")}`;
              if (result.validationErrors.length > 3) {
                errorMsg += `\n... and ${result.validationErrors.length - 3} more`;
              }
            }

            const action = await vscode.window.showWarningMessage(
              errorMsg,
              "Apply Anyway",
              "Cancel"
            );

            if (action === "Apply Anyway") {
              await applyCodeFix(editor, range, result.code);

              // Write task note even for failed validation
              await writeTaskNoteFromResult(
                payload,
                result,
                context
              );
            }
          } else {
            throw new Error(result.error || "Agent failed to generate fix");
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error: ${error instanceof Error ? error.message : String(error)
            }`
          );
          console.error("Fix code error:", error);
        } finally {
          decoration.dispose();
        }
      }
    )
  );

  // Command: Reset API Key
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.resetApiKey", async () => {
      try {
        await context.secrets.delete(SECRET_KEY);
        vscode.window.showInformationMessage(
          "API Key removed successfully. You'll be prompted for a new one next time."
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to remove API Key: ${error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Command: Select Model
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.selectModel", async () => {
      try {
        // Fetch models from OpenRouter
        const models = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Fetching available models from OpenRouter...",
            cancellable: false,
          },
          async () => {
            return await fetchModelsFromOpenRouter();
          }
        );

        if (!models || models.length === 0) {
          vscode.window.showErrorMessage("Failed to fetch models from OpenRouter.");
          return;
        }

        // Get current model
        const config = vscode.workspace.getConfiguration("fixCode");
        const currentModel = config.get<string>("model") || DEFAULT_MODEL;

        // Create QuickPick items
        const quickPickItems: vscode.QuickPickItem[] = models.map((model) => {
          const promptPrice = parseFloat(model.pricing.prompt) * 1000000;
          const completionPrice = parseFloat(model.pricing.completion) * 1000000;

          return {
            label: model.name,
            description: model.id,
            detail: `Context: ${model.context_length.toLocaleString()} tokens | Pricing: $${promptPrice.toFixed(2)}/$${completionPrice.toFixed(2)} per 1M tokens`,
            picked: model.id === currentModel,
          };
        });

        // Show QuickPick
        const selected = await vscode.window.showQuickPick(quickPickItems, {
          placeHolder: "Search and select a model to set as default",
          matchOnDescription: true,
          matchOnDetail: true,
          title: "Select Default AI Model",
        });

        if (!selected || !selected.description) {
          vscode.window.showInformationMessage("Model selection cancelled.");
          return;
        }

        // Save selected model to settings
        await config.update("model", selected.description, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `Default model set to: ${selected.label}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to select model: ${error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Command: Set API Key
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.setApiKey", async () => {
      const input = await vscode.window.showInputBox({
        title: "Set OpenRouter API Key",
        prompt: "Enter your OpenRouter API Key",
        placeHolder: "sk-or-v1-...",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) =>
          value.trim().length === 0 ? "API Key cannot be empty" : null,
      });

      if (!input) {
        vscode.window.showInformationMessage("Operation cancelled.");
        return;
      }

      try {
        await context.secrets.store(SECRET_KEY, input.trim());
        vscode.window.showInformationMessage("API Key saved securely.");
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to save API Key: ${error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Command: Clear Project Cache
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.clearCache", async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }

      clearProjectCache(workspaceFolder.uri.fsPath);
      vscode.window.showInformationMessage("Project cache cleared!");
    })
  );

  // Command: Clear All Caches
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.clearAllCaches", async () => {
      clearAllCaches();
      vscode.window.showInformationMessage("All caches cleared!");
    })
  );

  // Command: Show Cache Stats
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.cacheStats", async () => {
      const stats = getCacheStats();
      const message = `Cache Statistics:\nTotal Caches: ${stats.totalCaches}\nProjects: ${stats.cacheKeys.length > 0 ? "\n- " + stats.cacheKeys.map((k) => path.basename(k)).join("\n- ") : "None"}`;
      vscode.window.showInformationMessage(message);
    })
  );

  // Command: Show Current Model Info
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.showCurrentModel", async () => {
      const config = vscode.workspace.getConfiguration("fixCode");
      const currentModel = config.get<string>("model") || DEFAULT_MODEL;
      const maxTokens = config.get<number>("maxTokens", 4096);
      const smartMode = config.get<boolean>("useSmartMode", true);
      const cacheDuration = config.get<number>("cacheDuration", 5);
      const autoApply = config.get<boolean>("autoApply", true);

      // Parse model info
      const modelParts = currentModel.split("/");
      const provider = modelParts[0] || "unknown";
      const modelName = modelParts[1] || currentModel;

      // Get provider emoji
      const providerEmojis: { [key: string]: string } = {
        anthropic: "🤖",
        openai: "🔷",
        google: "🔵",
        "meta-llama": "🦙",
      };
      const emoji = providerEmojis[provider] || "🤖";

      // Build friendly model name
      let friendlyName = modelName;
      if (modelName.includes("claude")) {
        if (modelName.includes("opus")) { friendlyName = "Claude Opus (Most Powerful)"; }
        else if (modelName.includes("sonnet")) { friendlyName = "Claude Sonnet (Balanced)"; }
        else if (modelName.includes("haiku")) { friendlyName = "Claude Haiku (Fastest)"; }
      } else if (modelName.includes("gpt")) {
        if (modelName.includes("gpt-4o")) { friendlyName = "GPT-4o (Latest)"; }
        else if (modelName.includes("gpt-4")) { friendlyName = "GPT-4 Turbo"; }
      } else if (modelName.includes("gemini")) {
        friendlyName = "Gemini Pro";
      } else if (modelName.includes("llama")) {
        friendlyName = "Llama 3.1 70B";
      }

      // Build info message
      const info = `${emoji} Current Model Configuration

Model: ${friendlyName}
ID: ${currentModel}
Provider: ${provider.toUpperCase()}

Settings:
• Max Tokens: ${maxTokens}
• Smart Mode: ${smartMode ? "✅ Enabled" : "❌ Disabled"}
• Cache Duration: ${cacheDuration} minutes
• Auto Apply: ${autoApply ? "✅ Enabled" : "❌ Disabled"}

Performance:
• Simple fixes: ~1-2 seconds
• Medium tasks: ~3-5 seconds
• Complex tasks: ~5-10 seconds

Tip: Use "Fix Code: Select Default Model" to change`;

      // Show in panel with options
      const action = await vscode.window.showInformationMessage(
        info,
        "Change Model",
        "View All Settings"
      );

      if (action === "Change Model") {
        await vscode.commands.executeCommand("fixCode.selectModel");
      } else if (action === "View All Settings") {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "fixCode"
        );
      }
    })
  );

  // Command: Open Task Notes
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.openTaskNotes", async () => {
      const config = vscode.workspace.getConfiguration("fixCode");
      const taskNotesFile = config.get<string>("taskNotesFile", "MAKURO_NOTE.md");
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (!workspaceFolder) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }

      const notesPath = path.isAbsolute(taskNotesFile)
        ? taskNotesFile
        : path.join(workspaceFolder.uri.fsPath, taskNotesFile);

      try {
        // Check if file exists
        const fileExists = await fs
          .access(notesPath)
          .then(() => true)
          .catch(() => false);

        if (!fileExists) {
          vscode.window.showInformationMessage(
            "No task notes found yet. Complete a task to create notes."
          );
          return;
        }

        // Open file
        const document = await vscode.workspace.openTextDocument(notesPath);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open task notes: ${error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Command: Clear Task Notes
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.clearTaskNotes", async () => {
      const config = vscode.workspace.getConfiguration("fixCode");
      const taskNotesFile = config.get<string>("taskNotesFile", "MAKURO_NOTE.md");
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (!workspaceFolder) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }

      const action = await vscode.window.showWarningMessage(
        "Are you sure you want to clear all task notes? This cannot be undone.",
        "Clear",
        "Cancel"
      );

      if (action !== "Clear") {
        return;
      }

      try {
        const taskNotesConfig: TaskNotesConfig = {
          enabled: true,
          filePath: taskNotesFile,
          workspacePath: workspaceFolder.uri.fsPath,
        };

        const result = await clearTaskNotes(taskNotesConfig);

        if (result.success) {
          vscode.window.showInformationMessage("Task notes cleared successfully!");
        } else {
          vscode.window.showErrorMessage(`Failed to clear task notes: ${result.error}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to clear task notes: ${error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Command: Show Task Notes Statistics
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.taskNotesStats", async () => {
      const config = vscode.workspace.getConfiguration("fixCode");
      const taskNotesFile = config.get<string>("taskNotesFile", "MAKURO_NOTE.md");
      const enableTaskNotes = config.get<boolean>("enableTaskNotes", true);
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (!workspaceFolder) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }

      try {
        const taskNotesConfig: TaskNotesConfig = {
          enabled: true,
          filePath: taskNotesFile,
          workspacePath: workspaceFolder.uri.fsPath,
        };

        const stats = await getTaskNotesStats(taskNotesConfig);

        let message = `📝 Task Notes Statistics\n\n`;
        message += `Status: ${enableTaskNotes ? "✅ Enabled" : "❌ Disabled"}\n`;
        message += `File: ${taskNotesFile}\n`;
        message += `Exists: ${stats.exists ? "Yes" : "No"}\n\n`;

        if (stats.exists) {
          message += `Tasks Recorded: ${stats.taskCount}\n`;
          message += `File Size: ${(stats.size / 1024).toFixed(2)} KB\n`;
          if (stats.lastModified) {
            message += `Last Modified: ${stats.lastModified.toLocaleString()}\n`;
          }
        } else {
          message += `No task notes file found yet.\n`;
          message += `Complete a task to create notes automatically.`;
        }

        // Build action buttons
        const buttons: string[] = [];
        if (stats.exists) {
          buttons.push("Open Notes");
        }
        if (stats.exists && stats.taskCount > 0) {
          buttons.push("Clear Notes");
        }

        const action = await vscode.window.showInformationMessage(
          message,
          ...buttons
        );

        if (action === "Open Notes") {
          await vscode.commands.executeCommand("fixCode.openTaskNotes");
        } else if (action === "Clear Notes") {
          await vscode.commands.executeCommand("fixCode.clearTaskNotes");
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to get task notes stats: ${error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Log successful activation
  const commandCount = context.subscriptions.length;
  console.log(`✓ All commands registered (${commandCount} subscriptions)`);
  console.log("✓ Fix Code with makuro - READY");
  console.log("===================================");
}

export function deactivate() {
  console.log("Extension 'fixCode' deactivated");
}

/* ============================================================
 * Configuration Helpers
 * ============================================================
 */

/**
 * Get the selected Claude model from VS Code settings
 */
function getSelectedModel(): string {
  const config = vscode.workspace.getConfiguration("fixCode");
  const model = config.get<string>("model");
  return model || DEFAULT_MODEL;
}

/**
 * Fetch available models from OpenRouter API
 */
async function fetchModelsFromOpenRouter(): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch models: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data: OpenRouterModelsResponse = await response.json() as OpenRouterModelsResponse;

    if (!data.data || data.data.length === 0) {
      throw new Error("No models received from OpenRouter API");
    }

    // Sort models by name for better UX
    const sortedModels = data.data.sort((a, b) => {
      // Prioritize popular models
      const priorityProviders = ['anthropic', 'openai', 'google', 'meta-llama'];
      const aProvider = a.id.split('/')[0];
      const bProvider = b.id.split('/')[0];

      const aPriority = priorityProviders.indexOf(aProvider);
      const bPriority = priorityProviders.indexOf(bProvider);

      if (aPriority !== -1 && bPriority !== -1) {
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
      } else if (aPriority !== -1) {
        return -1;
      } else if (bPriority !== -1) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });

    return sortedModels;
  } catch (error) {
    console.error("Error fetching models from OpenRouter:", error);
    throw error;
  }
}

/* ============================================================
 * Smart AI Agent Integration
 * ============================================================
 */

async function sendToAIAgent(
  payload: FixPayload,
  apiKey: string,
  progressCallback?: (message: string) => void
): Promise<any> {
  const model = getSelectedModel();
  const config = vscode.workspace.getConfiguration("fixCode");

  // Build smart agent config with validation options
  const agentConfig: SmartAgentConfig = {
    apiKey,
    model,
    workspacePath: payload.workspacePath,
    currentFile: payload.filePath,
    selectedCode: payload.rangeText,
    fullFileContent: payload.fullText,
    userPrompt: payload.prompt,
    enableValidation: config.get<boolean>("enableValidation", true),
    maxRetries: config.get<number>("maxRetries", 2),
    enableWebSearch: config.get<boolean>("enableWebSearch", true),
  };

  // Execute smart agent (auto-detects complexity and chooses best mode)
  return await executeSmartAgent(agentConfig, progressCallback);
}

/* ============================================================
 * OpenRouter API Integration (Legacy - kept for fallback)
 * ============================================================
 */

async function sendToOpenRouter(
  payload: FixPayload,
  apiKey: string
): Promise<string | null> {
  try {
    // Default system prompt
    let systemPrompt = `You are a code improvement assistant. You will receive code snippets and instructions on how to fix or improve them ,
    focused on delivering production-ready, maintainable code that follows industry best practices.

Guidelines:
- Provide ONLY the fixed/improved code without explanations unless asked
- DO NOT wrap your response in markdown code fences (no \`\`\`tsx, \`\`\`ts, \`\`\`javascript, etc.)
- DO NOT include phrases like "Here's the fixed code:" or similar explanations
- Return ONLY the raw code that can be directly inserted into the file
- Maintain the original code style and formatting conventions
- Preserve comments unless they're outdated
- If the request is unclear, provide the most reasonable interpretation
- Focus on the selected code range while considering the full file context

Core Principles:
- Code Quality & Standards
- Type Safety & Robustness
- Error Handling & Null Safety
- Code Structure & Maintainability
- Performance & Optimization
- Security & Best Practices
- Refactoring Guidelines: NEVER rename user's existing functions, classes, or variables unless explicitly asked
- Code Improvement Approach

Before delivering code, ensure:
- ✅ All inputs are validated
- ✅ Errors are properly handled
- ✅ Types are explicit and safe
- ✅ Code is well-documented
- ✅ Edge cases are covered
- ✅ User's original names are preserved
- ✅ Code follows language-specific conventions
- ✅ Suggestions are provided as comments when valuable

`;

    // Append package information if package.json exists
    const packageInfo = await loadPackageInfo(payload.workspacePath);
    if (packageInfo) {
      systemPrompt += `\n\n---\n\nProject Dependencies:\n${packageInfo}`;
    }

    // Append custom system prompt if exists
    const customPrompt = await loadSystemPrompt(payload.workspacePath);
    if (customPrompt) {
      systemPrompt += `\n\n---\n\nAdditional Instructions:\n${customPrompt}`;
    }

    // Note: This function is legacy and kept for reference
    // Smart agent now handles context automatically

    const userPrompt = `File: ${payload.fileName}
${payload.workspacePath ? `Workspace: ${payload.workspacePath}` : ""}

Instructions: ${payload.prompt}

Code to fix:
\`\`\`
${payload.rangeText}
\`\`\`

${payload.rangeText !== payload.fullText
        ? `\nFull file context:\n\`\`\`\n${payload.fullText}\n\`\`\``
        : ""
      }

Please provide the improved code.`;

    // Get selected model from settings
    const selectedModel = getSelectedModel();
    console.log(`Using model: ${selectedModel}`);

    // Call with continuation support
    const result = await callOpenRouterWithContinuation(
      systemPrompt,
      userPrompt,
      apiKey,
      selectedModel
    );

    return result;
  } catch (error) {
    console.error("OpenRouter API error:", error);
    throw error;
  }
}

/**
 * Call OpenRouter API with automatic continuation support for truncated responses
 */
async function callOpenRouterWithContinuation(
  systemPrompt: string,
  initialUserPrompt: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<string> {
  const MAX_CONTINUATION_ATTEMPTS = 10;
  const CONTINUATION_TAIL_LENGTH = 1000;

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: initialUserPrompt,
    },
  ];

  let accumulatedOutput = "";
  let continuationCount = 0;

  while (continuationCount < MAX_CONTINUATION_ATTEMPTS) {
    console.log(`API call attempt ${continuationCount + 1}/${MAX_CONTINUATION_ATTEMPTS}`);

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/malik-kurosaki/fix-code-makuro",
        "X-Title": "Fix Code Makuro",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4096,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data: OpenRouterResponse = await response.json() as OpenRouterResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No choices received from API");
    }

    // Extract text content from response
    const textContent = data.choices[0].message.content;

    if (!textContent) {
      throw new Error("Empty text content received from API");
    }

    // Accumulate the output
    accumulatedOutput += textContent;

    console.log(`Received ${textContent.length} characters. Finish reason: ${data.choices[0].finish_reason}`);

    // Check if response was truncated
    if (data.choices[0].finish_reason === "length") {
      console.log("Response truncated due to max_tokens. Preparing continuation...");

      // Add assistant's response to conversation history
      messages.push({
        role: "assistant",
        content: textContent,
      });

      // Build continuation prompt
      const tailText = getTailText(accumulatedOutput, CONTINUATION_TAIL_LENGTH);
      const continuationPrompt = buildContinuationPrompt(tailText);

      // Add continuation request to conversation
      messages.push({
        role: "user",
        content: continuationPrompt,
      });

      continuationCount++;

      // Continue to next iteration
      continue;
    }

    // Response is complete
    console.log(`Response complete after ${continuationCount} continuation(s)`);
    break;
  }

  if (continuationCount >= MAX_CONTINUATION_ATTEMPTS) {
    console.warn(`Reached maximum continuation attempts (${MAX_CONTINUATION_ATTEMPTS})`);
    vscode.window.showWarningMessage(
      `AI response may be incomplete. Reached maximum continuation limit of ${MAX_CONTINUATION_ATTEMPTS} attempts.`
    );
  }

  // Validate output is not cut mid-statement
  if (!isOutputComplete(accumulatedOutput)) {
    console.warn("Output appears to be incomplete (ends mid-statement)");
    vscode.window.showWarningMessage(
      "The generated code may be incomplete. Please review carefully."
    );
  }

  return accumulatedOutput;
}

/**
 * Get the last N characters of text for continuation context
 */
function getTailText(text: string, length: number): string {
  if (text.length <= length) {
    return text;
  }
  return text.slice(-length);
}

/**
 * Build continuation prompt that resumes from last character
 */
function buildContinuationPrompt(lastOutputEnd: string): string {
  return `Continue generating the code.
Resume EXACTLY from the last character below.
Do NOT repeat or explain anything.
Do NOT add markdown code fences or any formatting.
Just continue with the raw code.

<<<LAST_OUTPUT_END>>>
${lastOutputEnd}`;
}

/**
 * Basic validation to check if code output appears complete
 */
function isOutputComplete(output: string): boolean {
  const trimmed = output.trim();

  if (trimmed.length === 0) {
    return false;
  }

  // Check for obvious incomplete patterns
  const incompleteSigns = [
    /\(\s*$/,           // Ends with opening parenthesis
    /\[\s*$/,           // Ends with opening bracket
    /\{\s*$/,           // Ends with opening brace
    /,\s*$/,            // Ends with comma
    /\.\s*$/,           // Ends with dot (member access)
    /->\s*$/,           // Ends with arrow
    /=\s*$/,            // Ends with assignment
    /:\s*$/,            // Ends with colon
    /\+\s*$/,           // Ends with plus
    /-\s*$/,            // Ends with minus
    /\|\s*$/,           // Ends with pipe
    /&\s*$/,            // Ends with ampersand
    /\/\*[^*]*$/,       // Unclosed block comment
    /\/\/[^\n]*$/,      // Ends with line comment (incomplete)
    /"\s*[^"]*$/,       // Unclosed double quote
    /'\s*[^']*$/,       // Unclosed single quote
    /`\s*[^`]*$/,       // Unclosed backtick
  ];

  for (const pattern of incompleteSigns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  return true;
}

/* ============================================================
 * Code Application
 * ============================================================
 */

async function applyCodeFix(
  editor: vscode.TextEditor,
  range: vscode.Range,
  fixedCode: string
): Promise<void> {
  // Clean markdown code fences and explanatory text
  const cleanedCode = cleanMarkdownCodeFences(fixedCode);

  // Check autoApply setting
  const config = vscode.workspace.getConfiguration("fixCode");
  const autoApply = config.get<boolean>("autoApply", true);

  if (autoApply) {
    // Auto apply without confirmation
    await editor.edit((editBuilder) => {
      editBuilder.replace(range, cleanedCode);
    });
    vscode.window.showInformationMessage("Code replaced successfully!");
    return;
  }

  // Show diff and ask for confirmation
  const action = await vscode.window.showInformationMessage(
    "Code fix ready. What would you like to do?",
    "Replace",
    "Show Diff",
    "Copy to Clipboard",
    "Cancel"
  );

  if (!action || action === "Cancel") {
    return;
  }

  switch (action) {
    case "Replace":
      await editor.edit((editBuilder) => {
        editBuilder.replace(range, cleanedCode);
      });
      vscode.window.showInformationMessage("Code replaced successfully!");
      break;

    case "Show Diff":
      await showDiff(editor.document, range, cleanedCode);
      break;

    case "Copy to Clipboard":
      await vscode.env.clipboard.writeText(cleanedCode);
      vscode.window.showInformationMessage("Code copied to clipboard!");
      break;
  }
}

/**
 * Clean markdown code fences from AI response
 * Handles various formats: ```tsx, ```ts, ```javascript, ```python, etc.
 */
function cleanMarkdownCodeFences(text: string): string {
  let cleaned = text;

  // Pattern 1: Standard markdown code block with language identifier
  // Matches: ```typescript\ncode\n```  or  ```tsx\ncode\n```
  const standardPattern = /^```[\w\-+#]*\s*\n([\s\S]*?)\n```\s*$/;
  let match = standardPattern.exec(cleaned.trim());
  if (match && match[1]) {
    console.log("Detected standard markdown code block with language identifier");
    return match[1];
  }

  // Pattern 2: Code block without newline after opening fence
  // Matches: ```typescriptcode\n```
  const noNewlinePattern = /^```[\w\-+#]*([\s\S]*?)```\s*$/;
  match = noNewlinePattern.exec(cleaned.trim());
  if (match && match[1]) {
    console.log("Detected markdown code block without newline after opening");
    return match[1].trim();
  }

  // Pattern 3: Multiple code blocks - extract the largest one
  const multipleBlocksPattern = /```[\w\-+#]*\s*\n([\s\S]*?)\n```/g;
  const matches = Array.from(cleaned.matchAll(multipleBlocksPattern));
  if (matches.length > 0) {
    console.log(`Detected ${matches.length} code block(s)`);
    // Find the largest code block (likely the main code)
    let largestBlock = "";
    for (const m of matches) {
      if (m[1] && m[1].length > largestBlock.length) {
        largestBlock = m[1];
      }
    }
    if (largestBlock) {
      return largestBlock;
    }
  }

  // Pattern 4: Text explanation followed by code block
  // Remove any leading explanation text before first code fence
  const withExplanationPattern = /^[\s\S]*?```[\w\-+#]*\s*\n([\s\S]*?)\n```[\s\S]*$/;
  match = withExplanationPattern.exec(cleaned);
  if (match && match[1]) {
    console.log("Detected code block with surrounding explanation text");
    return match[1];
  }

  // Pattern 5: Remove only the fence markers if present at start/end
  // This handles cases where the fence might be malformed
  cleaned = cleaned.trim();
  if (cleaned.startsWith("```")) {
    // Remove opening fence and language identifier
    cleaned = cleaned.replace(/^```[\w\-+#]*\s*\n?/, "");
    console.log("Removed opening code fence");
  }
  if (cleaned.endsWith("```")) {
    // Remove closing fence
    cleaned = cleaned.replace(/\n?```\s*$/, "");
    console.log("Removed closing code fence");
  }

  // Pattern 6: Remove common AI explanation patterns
  // Remove phrases like "Here's the fixed code:", "Here is the improved version:", etc.
  const explanationPhrases = [
    /^Here'?s?\s+(?:the\s+)?(?:fixed|improved|refactored|updated|corrected)\s+(?:code|version)[\s:]+/im,
    /^Here\s+is\s+(?:the\s+)?(?:fixed|improved|refactored|updated|corrected)\s+(?:code|version)[\s:]+/im,
    /^The\s+(?:fixed|improved|refactored|updated|corrected)\s+code[\s:]+/im,
    /^Fixed\s+code[\s:]+/im,
    /^Improved\s+code[\s:]+/im,
  ];

  for (const pattern of explanationPhrases) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, "");
      console.log("Removed AI explanation phrase");
      break;
    }
  }

  return cleaned.trim();
}

async function showDiff(
  document: vscode.TextDocument,
  range: vscode.Range,
  newCode: string
): Promise<void> {
  const originalContent = document.getText(range);

  // Create temporary documents for diff
  const originalUri = vscode.Uri.parse(
    `untitled:Original - ${path.basename(document.fileName)}`
  );
  const fixedUri = vscode.Uri.parse(
    `untitled:Fixed - ${path.basename(document.fileName)}`
  );

  const originalDoc = await vscode.workspace.openTextDocument(
    originalUri.with({ scheme: "untitled" })
  );
  const fixedDoc = await vscode.workspace.openTextDocument(
    fixedUri.with({ scheme: "untitled" })
  );

  const originalEdit = new vscode.WorkspaceEdit();
  originalEdit.insert(originalDoc.uri, new vscode.Position(0, 0), originalContent);
  await vscode.workspace.applyEdit(originalEdit);

  const fixedEdit = new vscode.WorkspaceEdit();
  fixedEdit.insert(fixedDoc.uri, new vscode.Position(0, 0), newCode);
  await vscode.workspace.applyEdit(fixedEdit);

  // Show diff
  await vscode.commands.executeCommand(
    "vscode.diff",
    originalDoc.uri,
    fixedDoc.uri,
    `Code Fix Comparison - ${path.basename(document.fileName)}`
  );
}

/* ============================================================
 * API Key Handling (SecretStorage FIRST)
 * ============================================================
 */

async function ensureApiKey(
  context: vscode.ExtensionContext
): Promise<string | null> {
  // 1. SecretStorage
  const stored = await context.secrets.get(SECRET_KEY);
  if (stored) { return stored; }

  // 2. Legacy .env fallback
  const legacy = await loadEnvApiKey();
  if (legacy) {
    await context.secrets.store(SECRET_KEY, legacy);
    vscode.window.showInformationMessage(
      "API Key loaded from .env file and saved to secure storage."
    );
    return legacy;
  }

  // 3. Prompt user
  const input = await vscode.window.showInputBox({
    title: "Setup OpenRouter API Key",
    prompt: "Enter your OpenRouter API Key (get it from https://openrouter.ai/keys)",
    placeHolder: "sk-or-v1-...",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) { return "API Key cannot be empty"; }
      return null;
    },
  });

  if (!input) {
    vscode.window.showErrorMessage(
      "API Key is required to use this extension. Use 'Fix Code: Set API Key' command to set it later."
    );
    return null;
  }

  await context.secrets.store(SECRET_KEY, input.trim());
  vscode.window.showInformationMessage("API Key saved securely.");

  return input.trim();
}

/* ============================================================
 * Legacy ENV Support (Optional)
 * ============================================================
 */

async function loadEnvApiKey(): Promise<string | null> {
  if (!ENV_FILE_PATH) { return null; }

  try {
    const content = await fs.readFile(ENV_FILE_PATH, "utf8");
    const env = parseEnv(content);
    return env.OPENROUTER_API_KEY ?? null;
  } catch {
    return null;
  }
}

/* ============================================================
 * System Prompt Loader
 * ============================================================
 */

async function loadSystemPrompt(workspacePath: string | null): Promise<string | null> {
  if (!workspacePath) {
    return null;
  }

  const systemPromptPath = path.join(workspacePath, "SYSTEM_PROMPT.md");

  try {
    const content = await fs.readFile(systemPromptPath, "utf8");
    if (content.trim().length > 0) {
      console.log("Custom system prompt loaded from SYSTEM_PROMPT.md");
      return content.trim();
    }
    return null;
  } catch (error) {
    // File doesn't exist or can't be read, silently fall back to default
    return null;
  }
}

/* ============================================================
 * Package Info Loader
 * ============================================================
 */

async function loadPackageInfo(workspacePath: string | null): Promise<string | null> {
  if (!workspacePath) {
    return null;
  }

  const packageJsonPath = path.join(workspacePath, "package.json");

  try {
    const content = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(content);

    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    const allDeps = [
      ...Object.keys(dependencies),
      ...Object.keys(devDependencies)
    ];

    if (allDeps.length === 0) {
      return null;
    }

    let info = "This project uses the following packages:\n";

    if (Object.keys(dependencies).length > 0) {
      info += "\nDependencies:\n";
      info += Object.entries(dependencies)
        .map(([name, version]) => `- ${name}@${version}`)
        .join("\n");
    }

    if (Object.keys(devDependencies).length > 0) {
      info += "\n\nDev Dependencies:\n";
      info += Object.entries(devDependencies)
        .map(([name, version]) => `- ${name}@${version}`)
        .join("\n");
    }

    console.log("Package info loaded from package.json");
    return info;
  } catch (error) {
    // File doesn't exist or can't be parsed, silently skip
    return null;
  }
}

/* ============================================================
 * ENV Parser
 * ============================================================
 */

export function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) { continue; }

    const index = trimmed.indexOf("=");
    if (index === -1) { continue; }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replace(/\\n/g, "\n");

    env[key] = value;
  }

  return env;
}