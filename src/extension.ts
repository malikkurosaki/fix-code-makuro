import * as vscode from "vscode";
import path from "path";
import fs from "fs/promises";
import { FixCodeActionProvider } from "./FixCodeActionProvider";

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

interface AnthropicResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  stop_reason?: string;
}

/* ============================================================
 * Constants
 * ============================================================
 */

const SECRET_KEY = "anthropicApiKey";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL_NAME = "claude-opus-4-5-20251101";

// Legacy fallback (.env) – optional
const ENV_FILE_PATH = (() => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {return null;}
  return path.join(homeDir, ".anthropic.env");
})();

/* ============================================================
 * Extension Lifecycle
 * ============================================================
 */

export function activate(context: vscode.ExtensionContext) {
  console.log("Extension 'fixCode' activated");

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

        // Validate selection
        if (selection.isEmpty) {
          vscode.window.showWarningMessage(
            "Please select code to fix first."
          );
          return;
        }

        // Use selection as range
        const range = new vscode.Range(selection.start, selection.end);

        // 1. Ensure API Key exists
        const apiKey = await ensureApiKey(context);
        if (!apiKey) {return;}

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
          const prompt = await vscode.window.showInputBox({
            title: "Fix Code",
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

          // 6. Send to Anthropic
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Fixing code with makuro...",
              cancellable: false,
            },
            async () => {
              return await sendToAnthropic(payload, apiKey);
            }
          );

          if (result) {
            await applyCodeFix(editor, range, result);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error: ${
              error instanceof Error ? error.message : String(error)
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
          `Failed to remove API Key: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Command: Set API Key
  context.subscriptions.push(
    vscode.commands.registerCommand("fixCode.setApiKey", async () => {
      const input = await vscode.window.showInputBox({
        title: "Set Anthropic API Key",
        prompt: "Enter your ANTHROPIC_API_KEY",
        placeHolder: "sk-ant-...",
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
          `Failed to save API Key: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );
}

export function deactivate() {
  console.log("Extension 'fixCode' deactivated");
}

/* ============================================================
 * Anthropic API Integration
 * ============================================================
 */

async function sendToAnthropic(
  payload: FixPayload,
  apiKey: string
): Promise<string | null> {
  try {
    // Default system prompt
    let systemPrompt = `You are a code improvement assistant. You will receive code snippets and instructions on how to fix or improve them.

Guidelines:
- Provide ONLY the fixed/improved code without explanations unless asked
- Maintain the original code style and formatting conventions
- Preserve comments unless they're outdated
- If the request is unclear, provide the most reasonable interpretation
- Focus on the selected code range while considering the full file context`;

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

    const userPrompt = `File: ${payload.fileName}
${payload.workspacePath ? `Workspace: ${payload.workspacePath}` : ""}

Instructions: ${payload.prompt}

Code to fix:
\`\`\`
${payload.rangeText}
\`\`\`

${
  payload.rangeText !== payload.fullText
    ? `\nFull file context:\n\`\`\`\n${payload.fullText}\n\`\`\``
    : ""
}

Please provide the improved code.`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data: AnthropicResponse = await response.json() as AnthropicResponse;

    if (!data.content || data.content.length === 0) {
      throw new Error("No content received from API");
    }

    const textContent = data.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    return textContent || null;
  } catch (error) {
    console.error("Anthropic API error:", error);
    throw error;
  }
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
  // Extract code from markdown code blocks if present
  let cleanedCode = fixedCode;
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  const match = codeBlockRegex.exec(fixedCode);

  if (match && match[1]) {
    cleanedCode = match[1].trim();
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
  if (stored) {return stored;}

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
    title: "Setup Anthropic API Key",
    prompt: "Enter your ANTHROPIC_API_KEY (get it from https://console.anthropic.com)",
    placeHolder: "sk-ant-...",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {return "API Key cannot be empty";}
      if (!trimmed.startsWith("sk-ant-")) {return "API Key should start with 'sk-ant-'";}
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
  if (!ENV_FILE_PATH) {return null;}

  try {
    const content = await fs.readFile(ENV_FILE_PATH, "utf8");
    const env = parseEnv(content);
    return env.ANTHROPIC_API_KEY ?? null;
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
    if (!trimmed || trimmed.startsWith("#")) {continue;}

    const index = trimmed.indexOf("=");
    if (index === -1) {continue;}

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