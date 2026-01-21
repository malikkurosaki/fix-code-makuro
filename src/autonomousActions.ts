import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/* ============================================================
 * Autonomous Actions System
 * ============================================================
 * Allows AI agent to perform project actions automatically
 * without user confirmation (configurable)
 */

export interface ActionConfig {
  allowPackageInstall: boolean;
  allowFileCreation: boolean;
  allowFolderCreation: boolean;
  allowFileModification: boolean;
  allowScriptExecution: boolean;
  allowGitOperations: boolean;
  allowFormatting: boolean;
  requireConfirmation: boolean;
}

export interface ActionRequest {
  type: ActionType;
  description: string;
  params: any;
  workspacePath: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
  changes?: string[];
}

export type ActionType =
  | "install_package"
  | "create_file"
  | "create_folder"
  | "modify_file"
  | "run_script"
  | "git_operation"
  | "format_code"
  | "update_imports";

/* ============================================================
 * Action Executor
 * ============================================================
 */

export class AutonomousActionExecutor {
  private config: ActionConfig;
  private executedActions: ActionRequest[] = [];
  private workspacePath: string;

  constructor(workspacePath: string, config: ActionConfig) {
    this.workspacePath = workspacePath;
    this.config = config;
  }

  /**
   * Execute an action
   */
  async execute(action: ActionRequest): Promise<ActionResult> {
    // Check if action is allowed
    if (!this.isActionAllowed(action.type)) {
      return {
        success: false,
        message: `Action ${action.type} is disabled in settings`,
        error: "Action not allowed",
      };
    }

    // Request confirmation if needed
    if (this.config.requireConfirmation) {
      const confirmed = await this.requestConfirmation(action);
      if (!confirmed) {
        return {
          success: false,
          message: "Action cancelled by user",
        };
      }
    }

    // Execute the action
    let result: ActionResult;

    try {
      switch (action.type) {
        case "install_package":
          result = await this.installPackage(action.params);
          break;
        case "create_file":
          result = await this.createFile(action.params);
          break;
        case "create_folder":
          result = await this.createFolder(action.params);
          break;
        case "modify_file":
          result = await this.modifyFile(action.params);
          break;
        case "run_script":
          result = await this.runScript(action.params);
          break;
        case "git_operation":
          result = await this.gitOperation(action.params);
          break;
        case "format_code":
          result = await this.formatCode(action.params);
          break;
        case "update_imports":
          result = await this.updateImports(action.params);
          break;
        default:
          result = {
            success: false,
            message: "Unknown action type",
            error: `Action type ${action.type} not supported`,
          };
      }

      // Track executed actions
      if (result.success) {
        this.executedActions.push(action);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: "Action execution failed",
        error: String(error),
      };
    }
  }

  /**
   * Check if action is allowed
   */
  private isActionAllowed(type: ActionType): boolean {
    const permissions: { [key in ActionType]: boolean } = {
      install_package: this.config.allowPackageInstall,
      create_file: this.config.allowFileCreation,
      create_folder: this.config.allowFolderCreation,
      modify_file: this.config.allowFileModification,
      run_script: this.config.allowScriptExecution,
      git_operation: this.config.allowGitOperations,
      format_code: this.config.allowFormatting,
      update_imports: this.config.allowFileModification,
    };

    return permissions[type] || false;
  }

  /**
   * Request user confirmation
   */
  private async requestConfirmation(action: ActionRequest): Promise<boolean> {
    const message = `Allow action: ${action.description}?`;
    const choice = await vscode.window.showInformationMessage(
      message,
      "Yes",
      "No"
    );
    return choice === "Yes";
  }

  /* ============================================================
   * Action Implementations
   * ============================================================
   */

  /**
   * Install npm package
   */
  private async installPackage(params: {
    packages: string[];
    dev?: boolean;
  }): Promise<ActionResult> {
    const { packages, dev = false } = params;
    const packageList = packages.join(" ");
    const devFlag = dev ? "-D" : "";

    try {
      vscode.window.showInformationMessage(
        `📦 Installing ${packageList}...`
      );

      const { stdout, stderr } = await execAsync(
        `npm install ${devFlag} ${packageList}`,
        { cwd: this.workspacePath }
      );

      return {
        success: true,
        message: `Successfully installed: ${packageList}`,
        output: stdout,
        changes: packages,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to install ${packageList}`,
        error: error.message,
      };
    }
  }

  /**
   * Create file
   */
  private async createFile(params: {
    filePath: string;
    content: string;
  }): Promise<ActionResult> {
    const { filePath, content } = params;
    const fullPath = path.join(this.workspacePath, filePath);

    try {
      // Create directory if needed
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content, "utf8");

      // Open file in editor
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);

      return {
        success: true,
        message: `Created file: ${filePath}`,
        changes: [filePath],
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to create ${filePath}`,
        error: error.message,
      };
    }
  }

  /**
   * Create folder
   */
  private async createFolder(params: {
    folderPath: string;
  }): Promise<ActionResult> {
    const { folderPath } = params;
    const fullPath = path.join(this.workspacePath, folderPath);

    try {
      await fs.mkdir(fullPath, { recursive: true });

      return {
        success: true,
        message: `Created folder: ${folderPath}`,
        changes: [folderPath],
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to create ${folderPath}`,
        error: error.message,
      };
    }
  }

  /**
   * Modify file
   */
  private async modifyFile(params: {
    filePath: string;
    content: string;
  }): Promise<ActionResult> {
    const { filePath, content } = params;
    const fullPath = path.join(this.workspacePath, filePath);

    try {
      await fs.writeFile(fullPath, content, "utf8");

      return {
        success: true,
        message: `Modified file: ${filePath}`,
        changes: [filePath],
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to modify ${filePath}`,
        error: error.message,
      };
    }
  }

  /**
   * Run npm script
   */
  private async runScript(params: {
    script: string;
    args?: string;
  }): Promise<ActionResult> {
    const { script, args = "" } = params;

    try {
      vscode.window.showInformationMessage(`⚙️ Running: npm run ${script}`);

      const { stdout, stderr } = await execAsync(
        `npm run ${script} ${args}`,
        { cwd: this.workspacePath }
      );

      return {
        success: true,
        message: `Script executed: ${script}`,
        output: stdout,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Script failed: ${script}`,
        error: error.message,
      };
    }
  }

  /**
   * Git operations
   */
  private async gitOperation(params: {
    operation: "add" | "commit" | "push";
    files?: string[];
    message?: string;
  }): Promise<ActionResult> {
    const { operation, files = ["."], message = "Auto-commit by AI" } = params;

    try {
      let command: string;

      switch (operation) {
        case "add":
          command = `git add ${files.join(" ")}`;
          break;
        case "commit":
          command = `git commit -m "${message}"`;
          break;
        case "push":
          command = "git push";
          break;
        default:
          throw new Error("Unknown git operation");
      }

      const { stdout } = await execAsync(command, {
        cwd: this.workspacePath,
      });

      return {
        success: true,
        message: `Git ${operation} completed`,
        output: stdout,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Git ${operation} failed`,
        error: error.message,
      };
    }
  }

  /**
   * Format code
   */
  private async formatCode(params: {
    filePath: string;
  }): Promise<ActionResult> {
    const { filePath } = params;

    try {
      // Try to use Prettier if available
      try {
        const { stdout } = await execAsync(`npx prettier --write ${filePath}`, {
          cwd: this.workspacePath,
        });

        return {
          success: true,
          message: `Formatted: ${filePath}`,
          output: stdout,
        };
      } catch {
        // Fallback to VSCode formatting
        const fullPath = path.join(this.workspacePath, filePath);
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand(
          "editor.action.formatDocument"
        );

        return {
          success: true,
          message: `Formatted: ${filePath}`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to format ${filePath}`,
        error: error.message,
      };
    }
  }

  /**
   * Update imports
   */
  private async updateImports(params: {
    filePath: string;
    imports: Array<{ from: string; to: string }>;
  }): Promise<ActionResult> {
    const { filePath, imports } = params;
    const fullPath = path.join(this.workspacePath, filePath);

    try {
      let content = await fs.readFile(fullPath, "utf8");

      // Replace imports
      for (const { from, to } of imports) {
        const regex = new RegExp(
          `(import.*from\\s+['"])${from}(['"])`,
          "g"
        );
        content = content.replace(regex, `$1${to}$2`);
      }

      await fs.writeFile(fullPath, content, "utf8");

      return {
        success: true,
        message: `Updated imports in ${filePath}`,
        changes: [filePath],
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to update imports in ${filePath}`,
        error: error.message,
      };
    }
  }

  /**
   * Get executed actions summary
   */
  getExecutedActions(): ActionRequest[] {
    return this.executedActions;
  }

  /**
   * Get actions summary
   */
  getSummary(): string {
    if (this.executedActions.length === 0) {
      return "No actions executed";
    }

    let summary = `Executed ${this.executedActions.length} action(s):\n`;
    this.executedActions.forEach((action, i) => {
      summary += `${i + 1}. ${action.description}\n`;
    });

    return summary;
  }
}

/* ============================================================
 * Action Parser - Parse AI suggestions to actions
 * ============================================================
 */

export class ActionParser {
  /**
   * Parse AI response for action commands
   */
  static parseActions(aiResponse: string): ActionRequest[] {
    const actions: ActionRequest[] = [];

    // Look for action markers in AI response
    const actionPatterns = [
      // Install package: <action:install_package packages="react,react-dom" />
      {
        regex: /<action:install_package\s+packages="([^"]+)"(?:\s+dev="(true|false)")?\s*\/>/g,
        handler: (match: RegExpMatchArray) => ({
          type: "install_package" as ActionType,
          description: `Install packages: ${match[1]}`,
          params: {
            packages: match[1].split(",").map((p) => p.trim()),
            dev: match[2] === "true",
          },
        }),
      },
      // Create file: <action:create_file path="src/App.tsx" />
      {
        regex: /<action:create_file\s+path="([^"]+)"\s*\/>/g,
        handler: (match: RegExpMatchArray) => ({
          type: "create_file" as ActionType,
          description: `Create file: ${match[1]}`,
          params: {
            filePath: match[1],
            content: "", // Will be filled with next code block
          },
        }),
      },
      // Create folder: <action:create_folder path="src/components" />
      {
        regex: /<action:create_folder\s+path="([^"]+)"\s*\/>/g,
        handler: (match: RegExpMatchArray) => ({
          type: "create_folder" as ActionType,
          description: `Create folder: ${match[1]}`,
          params: {
            folderPath: match[1],
          },
        }),
      },
      // Run script: <action:run_script script="build" />
      {
        regex: /<action:run_script\s+script="([^"]+)"(?:\s+args="([^"]*)")?\s*\/>/g,
        handler: (match: RegExpMatchArray) => ({
          type: "run_script" as ActionType,
          description: `Run script: ${match[1]}`,
          params: {
            script: match[1],
            args: match[2] || "",
          },
        }),
      },
    ];

    // Parse each pattern
    for (const { regex, handler } of actionPatterns) {
      let match;
      while ((match = regex.exec(aiResponse)) !== null) {
        const action = handler(match);
        actions.push({
          ...action,
          workspacePath: "", // Will be set by executor
        });
      }
    }

    return actions;
  }

  /**
   * Detect implicit actions from AI response
   */
  static detectImplicitActions(
    aiResponse: string,
    context: {
      missingPackages?: string[];
      missingFolders?: string[];
      currentFile?: string;
    }
  ): ActionRequest[] {
    const actions: ActionRequest[] = [];

    // Detect missing packages mentioned in response
    if (context.missingPackages && context.missingPackages.length > 0) {
      actions.push({
        type: "install_package",
        description: `Install missing packages: ${context.missingPackages.join(", ")}`,
        params: {
          packages: context.missingPackages,
        },
        workspacePath: "",
      });
    }

    // Detect if AI suggests creating files/folders
    const createFilePattern = /create\s+(?:a\s+)?(?:new\s+)?file\s+(?:at\s+)?['"]?([^'"]+)['"]?/gi;
    let match;

    while ((match = createFilePattern.exec(aiResponse)) !== null) {
      actions.push({
        type: "create_file",
        description: `Create file: ${match[1]}`,
        params: {
          filePath: match[1],
          content: "",
        },
        workspacePath: "",
      });
    }

    return actions;
  }
}

/* ============================================================
 * Configuration Helpers
 * ============================================================
 */

/**
 * Get action config from VSCode settings
 */
export function getActionConfig(): ActionConfig {
  const config = vscode.workspace.getConfiguration("fixCode");

  return {
    allowPackageInstall: config.get("allowPackageInstall", true),
    allowFileCreation: config.get("allowFileCreation", true),
    allowFolderCreation: config.get("allowFolderCreation", true),
    allowFileModification: config.get("allowFileModification", true),
    allowScriptExecution: config.get("allowScriptExecution", false),
    allowGitOperations: config.get("allowGitOperations", false),
    allowFormatting: config.get("allowFormatting", true),
    requireConfirmation: config.get("requireConfirmation", false),
  };
}

/**
 * Create action executor for workspace
 */
export function createActionExecutor(
  workspacePath: string
): AutonomousActionExecutor {
  const config = getActionConfig();
  return new AutonomousActionExecutor(workspacePath, config);
}
