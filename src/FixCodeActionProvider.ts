import * as vscode from "vscode";

/**
 * Code Action Provider for Fix Code Extension
 * Shows "Fix Code with Claude" action when text is selected
 */
export class FixCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.RefactorRewrite,
  ];

  /**
   * Provide code actions for the given document and range
   */
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    // Only show action if there is a selection
    if (range.isEmpty) {
      return undefined;
    }

    // Create the code action
    const action = new vscode.CodeAction(
      "✨ Fix Code with makuro",
      vscode.CodeActionKind.QuickFix
    );

    action.command = {
      command: "fixCode.open",
      title: "Fix Code with makuro",
      tooltip: "Use makuro AI to fix or improve the selected code",
    };

    // Also create a refactor action
    const refactorAction = new vscode.CodeAction(
      "🔧 Improve Code with makuro",
      vscode.CodeActionKind.RefactorRewrite
    );

    refactorAction.command = {
      command: "fixCode.open",
      title: "Improve Code with makuro",
      tooltip: "Use makuro AI to refactor or improve the selected code",
    };

    return [action, refactorAction];
  }
}
