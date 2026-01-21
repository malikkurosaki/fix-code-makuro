import * as vscode from "vscode";
import {
  AgentContext,
  ConversationMessage,
  executeTool,
  getToolsDocumentation,
  ToolResult,
} from "./agentTools";

/* ============================================================
 * Agent Orchestrator - Claude Code-like Agent System
 * ============================================================
 * This orchestrator manages multi-turn conversations, tool usage,
 * reasoning, and step-by-step execution similar to Claude Code.
 */

export interface AgentConfig {
  apiKey: string;
  model: string;
  maxTurns: number;
  enableTools: boolean;
  enableReasoning: boolean;
  streamResponse: boolean;
}

export interface AgentResponse {
  success: boolean;
  finalCode?: string;
  reasoning?: string[];
  toolsUsed?: string[];
  error?: string;
  conversationHistory: ConversationMessage[];
}

export interface AgentTask {
  type: "fix" | "refactor" | "analyze" | "implement";
  instruction: string;
  context: AgentContext;
  config: AgentConfig;
}

/* ============================================================
 * System Prompts - Claude Code Quality
 * ============================================================
 */

function getAgentSystemPrompt(task: AgentTask): string {
  const basePrompt = `You are an advanced AI coding assistant with deep expertise in software engineering, similar to Claude Code.

# Core Capabilities

You have access to powerful tools to understand and modify code:
- Read files and analyze their content
- Search for patterns across the codebase
- Analyze code quality and complexity
- Find related files through imports
- Understand project structure

# Workflow Philosophy

1. **Think Before Acting**: Always analyze the situation before making changes
2. **Use Tools Wisely**: Gather context using available tools
3. **Reason Step-by-Step**: Break down complex tasks into logical steps
4. **Verify Understanding**: Confirm your understanding of the code
5. **Make Informed Changes**: Base decisions on thorough analysis

# Task Analysis Process

When given a task, follow this process:

**Step 1: Understand the Request**
- Parse what the user wants
- Identify the scope of changes
- Note any constraints or requirements

**Step 2: Gather Context**
- Read the relevant files
- Search for related code
- Analyze existing patterns
- Understand dependencies

**Step 3: Plan the Solution**
- Think through the approach
- Consider edge cases
- Identify potential issues
- Plan the changes

**Step 4: Implement Changes**
- Make precise, targeted changes
- Maintain code style and conventions
- Preserve existing functionality
- Follow best practices

**Step 5: Verify Solution**
- Review the changes
- Check for errors
- Ensure completeness
- Consider testing needs

# Code Quality Standards

Always ensure:
- ✅ Type safety and proper typing
- ✅ Error handling where appropriate
- ✅ Clear, maintainable code
- ✅ Consistent with existing patterns
- ✅ Well-structured and organized
- ✅ Properly documented when needed
- ✅ No breaking changes unless intended
- ✅ Performance considerations

# Communication Style

- Be clear and concise
- Explain your reasoning when helpful
- Show your thought process
- Acknowledge uncertainties
- Ask for clarification when needed

# Output Format

When providing code fixes:
- Return ONLY the modified code
- NO markdown code fences
- NO explanations unless asked
- NO "Here's the fix:" prefixes
- Just the clean, working code

# Important Rules

- NEVER rename existing functions/variables unless explicitly asked
- NEVER add features not requested
- NEVER over-engineer solutions
- NEVER guess about unclear requirements
- ALWAYS preserve the user's intent
- ALWAYS maintain existing code style
- ALWAYS consider the full context

${getToolsDocumentation()}

# Current Task

Task Type: ${task.type}
Instruction: ${task.instruction}
File: ${task.context.currentFile}

${task.context.selectedCode ? `Selected Code:\n\`\`\`\n${task.context.selectedCode}\n\`\`\`\n` : ""}

Now, let's approach this task systematically. Think through what needs to be done and use the available tools to gather any necessary context.`;

  return basePrompt;
}

/* ============================================================
 * Tool Call Detection and Parsing
 * ============================================================
 */

interface ToolCall {
  toolName: string;
  params: any;
}

/**
 * Parse tool calls from AI response
 * Format: <tool_call>tool_name(param1="value1", param2="value2")</tool_call>
 */
function parseToolCalls(response: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
  let match;

  while ((match = toolCallRegex.exec(response)) !== null) {
    const callStr = match[1].trim();

    // Parse: tool_name(param1="value1", param2="value2")
    const nameMatch = callStr.match(/^(\w+)\s*\(/);
    if (!nameMatch) {continue;}

    const toolName = nameMatch[1];
    const paramsStr = callStr.substring(nameMatch[0].length, callStr.length - 1);

    // Parse parameters
    const params: any = {};
    const paramRegex = /(\w+)\s*=\s*"([^"]*)"/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }

    toolCalls.push({ toolName, params });
  }

  return toolCalls;
}

/**
 * Check if response indicates task completion
 */
function isTaskComplete(response: string): boolean {
  const completionMarkers = [
    /<final_code>/,
    /<code_fix>/,
    /TASK COMPLETE/i,
    /Here is the (?:fixed|improved|refactored) code/i,
  ];

  return completionMarkers.some((marker) => marker.test(response));
}

/**
 * Extract final code from response
 */
function extractFinalCode(response: string): string | null {
  // Try different code extraction patterns
  const patterns = [
    /<final_code>([\s\S]*?)<\/final_code>/,
    /<code_fix>([\s\S]*?)<\/code_fix>/,
    /```[\w]*\n([\s\S]*?)\n```/,
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // If no markers found but looks like code, return the whole response
  if (
    response.includes("function") ||
    response.includes("const") ||
    response.includes("class") ||
    response.includes("import")
  ) {
    return response.trim();
  }

  return null;
}

/* ============================================================
 * Agent Orchestration
 * ============================================================
 */

export class AgentOrchestrator {
  private conversationHistory: ConversationMessage[] = [];
  private toolsUsed: string[] = [];
  private reasoningSteps: string[] = [];

  constructor(private task: AgentTask) {
    // Initialize conversation with system prompt
    this.conversationHistory.push({
      role: "system",
      content: getAgentSystemPrompt(task),
      timestamp: Date.now(),
    });

    // Add user request
    this.conversationHistory.push({
      role: "user",
      content: task.instruction,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute the agent task with multi-turn conversation
   */
  async execute(
    progressCallback?: (message: string) => void
  ): Promise<AgentResponse> {
    const maxTurns = this.task.config.maxTurns;
    let currentTurn = 0;
    let finalCode: string | null = null;

    try {
      while (currentTurn < maxTurns && !finalCode) {
        currentTurn++;
        progressCallback?.(
          `Agent thinking... (turn ${currentTurn}/${maxTurns})`
        );

        // Get AI response
        const aiResponse = await this.callAI();

        if (!aiResponse) {
          throw new Error("Failed to get AI response");
        }

        // Add to conversation history
        this.conversationHistory.push({
          role: "assistant",
          content: aiResponse,
          timestamp: Date.now(),
        });

        // Check if task is complete
        if (isTaskComplete(aiResponse)) {
          finalCode = extractFinalCode(aiResponse);
          if (finalCode) {
            progressCallback?.("Agent completed task successfully");
            break;
          }
        }

        // Parse and execute tool calls
        if (this.task.config.enableTools) {
          const toolCalls = parseToolCalls(aiResponse);

          if (toolCalls.length > 0) {
            progressCallback?.(
              `Executing ${toolCalls.length} tool(s)...`
            );

            for (const toolCall of toolCalls) {
              await this.executeToolCall(toolCall, progressCallback);
            }
          }
        }

        // Extract reasoning if present
        const reasoningMatch = aiResponse.match(
          /<reasoning>([\s\S]*?)<\/reasoning>/
        );
        if (reasoningMatch && reasoningMatch[1]) {
          this.reasoningSteps.push(reasoningMatch[1].trim());
        }

        // If no tool calls and no completion, prompt for next step
        if (
          parseToolCalls(aiResponse).length === 0 &&
          !isTaskComplete(aiResponse)
        ) {
          this.conversationHistory.push({
            role: "user",
            content:
              "Please continue. If you have gathered enough context, provide the final code wrapped in <final_code> tags.",
            timestamp: Date.now(),
          });
        }
      }

      if (!finalCode && currentTurn >= maxTurns) {
        // Try to extract any code from the last response
        const lastResponse = this.conversationHistory[
          this.conversationHistory.length - 1
        ];
        if (lastResponse.role === "assistant") {
          finalCode = extractFinalCode(lastResponse.content);
        }
      }

      return {
        success: !!finalCode,
        finalCode: finalCode || undefined,
        reasoning: this.reasoningSteps,
        toolsUsed: this.toolsUsed,
        conversationHistory: this.conversationHistory,
        error: !finalCode ? "Failed to generate code fix" : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `Agent execution failed: ${error}`,
        reasoning: this.reasoningSteps,
        toolsUsed: this.toolsUsed,
        conversationHistory: this.conversationHistory,
      };
    }
  }

  /**
   * Execute a tool call and add result to conversation
   */
  private async executeToolCall(
    toolCall: ToolCall,
    progressCallback?: (message: string) => void
  ): Promise<void> {
    progressCallback?.(`Using tool: ${toolCall.toolName}`);

    const result = await executeTool(
      toolCall.toolName,
      toolCall.params,
      this.task.context
    );

    this.toolsUsed.push(toolCall.toolName);

    // Add tool result to conversation
    const toolResultMessage = result.success
      ? `Tool: ${toolCall.toolName}\nResult:\n${result.data}`
      : `Tool: ${toolCall.toolName}\nError: ${result.error}`;

    this.conversationHistory.push({
      role: "tool",
      content: toolResultMessage,
      toolName: toolCall.toolName,
      timestamp: Date.now(),
    });
  }

  /**
   * Call OpenRouter API with conversation history
   */
  private async callAI(): Promise<string | null> {
    try {
      const messages = this.conversationHistory
        .filter((msg) => msg.role !== "tool")
        .map((msg) => ({
          role: msg.role === "tool" ? "user" : msg.role,
          content: msg.content,
        }));

      // Add tool results as user messages
      const toolMessages = this.conversationHistory
        .filter((msg) => msg.role === "tool")
        .map((msg) => ({
          role: "user" as const,
          content: msg.content,
        }));

      const allMessages = [...messages, ...toolMessages].slice(-20); // Keep last 20 messages

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.task.config.apiKey}`,
            "HTTP-Referer": "https://github.com/malik-kurosaki/fix-code-makuro",
            "X-Title": "Fix Code Makuro - Agent",
          },
          body: JSON.stringify({
            model: this.task.config.model,
            messages: allMessages,
            max_tokens: 4096,
            temperature: 0.7,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as any;

      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response from API");
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error("AI call failed:", error);
      return null;
    }
  }

  /**
   * Get conversation summary
   */
  getSummary(): string {
    let summary = "Agent Execution Summary\n\n";

    if (this.reasoningSteps.length > 0) {
      summary += "Reasoning Steps:\n";
      this.reasoningSteps.forEach((step, i) => {
        summary += `${i + 1}. ${step}\n`;
      });
      summary += "\n";
    }

    if (this.toolsUsed.length > 0) {
      summary += `Tools Used: ${this.toolsUsed.join(", ")}\n`;
      summary += `Total Turns: ${
        this.conversationHistory.filter((m) => m.role === "assistant").length
      }\n`;
    }

    return summary;
  }
}

/* ============================================================
 * Simple Agent Mode (Single Turn)
 * ============================================================
 */

export async function executeSimpleAgent(
  task: AgentTask,
  progressCallback?: (message: string) => void
): Promise<AgentResponse> {
  const orchestrator = new AgentOrchestrator(task);
  return orchestrator.execute(progressCallback);
}

/* ============================================================
 * Enhanced Agent Mode (Multi-Turn with Tools)
 * ============================================================
 */

export async function executeEnhancedAgent(
  task: AgentTask,
  progressCallback?: (message: string) => void
): Promise<AgentResponse> {
  // Ensure tools are enabled
  task.config.enableTools = true;
  task.config.enableReasoning = true;

  const orchestrator = new AgentOrchestrator(task);
  return orchestrator.execute(progressCallback);
}
