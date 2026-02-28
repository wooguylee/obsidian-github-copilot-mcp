// ============================================================
// Chat Engine - Agentic Loop with Streaming + Tool Calling
// ============================================================

import { App } from "obsidian";
import {
  sendChatCompletionStream,
  ensureValidToken,
} from "../copilot/api";
import { getVaultToolDefinitions, executeVaultTool } from "../mcp/tools";
import type {
  AuthState,
  ChatMessage,
  ModelOption,
  ToolCallResult,
  ConversationMessage,
} from "../types";

interface ChatEngineOptions {
  app: App;
  authState: AuthState;
  model: ModelOption;
  systemPrompt: string;
  maxIterations: number;
  enableTools: boolean;
  onAuthUpdate: (auth: Partial<AuthState>) => void;
  onMessage: (messages: ConversationMessage[]) => void;
  onContentDelta: (delta: string) => void;
  onToolCall: (result: ToolCallResult) => void;
  onError: (error: string) => void;
  onDebug: (msg: string) => void;
  abortSignal?: AbortSignal;
}

function generateId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
  );
}

export async function runChatEngine(
  history: ConversationMessage[],
  userMessage: string,
  options: ChatEngineOptions
): Promise<ConversationMessage[]> {
  const {
    app,
    authState,
    model,
    systemPrompt,
    maxIterations,
    enableTools,
    onAuthUpdate,
    onMessage,
    onContentDelta,
    onToolCall,
    onError,
    onDebug,
    abortSignal,
  } = options;

  // Build result messages array (user message + all assistant/tool messages)
  const newMessages: ConversationMessage[] = [
    {
      id: generateId(),
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    },
  ];

  onMessage(newMessages);

  // Build the full chat messages array for the API
  const buildApiMessages = (): ChatMessage[] => {
    const msgs: ChatMessage[] = [];

    // System prompt
    if (systemPrompt) {
      msgs.push({ role: "system", content: systemPrompt });
    }

    // Default system instructions for vault tools
    msgs.push({
      role: "system",
      content: `You are a helpful AI assistant embedded in Obsidian, a note-taking application. You have access to vault tools that let you read, write, edit, search, and manage files in the user's vault.

IMPORTANT RULES:
1. When the user asks you to create files, examples, or templates - you MUST use the vault tools (vault_write_file, vault_create_folder, etc.) to actually create them. Do NOT just describe what to do - actually do it by calling the tools.
2. Always read a file before editing it to understand its current content.
3. Use vault_edit_file for targeted edits and vault_write_file for creating new files or completely replacing content.
4. When a task requires creating multiple files, create ALL of them using tool calls. Do not stop after describing what you plan to do.
5. For complex tasks that require many files, create them one by one using multiple tool calls in sequence.
6. After creating/modifying files, confirm what you did with a summary.
7. The vault uses Markdown files (.md) with possible YAML frontmatter, wiki-links ([[link]]), and other Obsidian-specific syntax.
8. Obsidian .canvas files use JSON format. When creating canvas files, use proper JSON structure.
9. If you want to create an example or template, always use tool calls to create the actual files - never just show the content in chat.`,
    });

    // History
    for (const msg of history) {
      if (msg.role === "user" || msg.role === "assistant") {
        const apiMsg: ChatMessage = {
          role: msg.role,
          content: msg.content,
        };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          apiMsg.tool_calls = msg.toolCalls;
          apiMsg.content = msg.content || null;
        }
        msgs.push(apiMsg);
      } else if (msg.role === "tool" && msg.toolCallId) {
        msgs.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
      }
    }

    // New messages from this turn
    for (const msg of newMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const apiMsg: ChatMessage = {
          role: msg.role,
          content: msg.content,
        };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          apiMsg.tool_calls = msg.toolCalls;
          apiMsg.content = msg.content || null;
        }
        msgs.push(apiMsg);
      } else if (msg.role === "tool" && msg.toolCallId) {
        msgs.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
      }
    }

    return msgs;
  };

  const tools = enableTools ? getVaultToolDefinitions() : undefined;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (abortSignal?.aborted) {
      onDebug(`[Engine] Aborted at iteration ${iteration}`);
      break;
    }

    onDebug(
      `[Engine] Iteration ${iteration + 1}/${maxIterations}, model=${model.value}`
    );

    try {
      // Ensure valid token
      const token = await ensureValidToken(authState, onAuthUpdate);

      // Send to API with streaming
      const apiMessages = buildApiMessages();
      onDebug(
        `[Engine] Sending ${apiMessages.length} messages, tools=${tools ? tools.length : 0}`
      );

      const streamResult = await sendChatCompletionStream(
        token,
        model,
        apiMessages,
        {
          onContent: (delta) => {
            onContentDelta(delta);
          },
          onToolCall: (tc) => {
            onDebug(
              `[Engine] Tool call received: ${tc.function.name}`
            );
          },
          onDone: (reason) => {
            onDebug(`[Engine] Stream done, finish_reason=${reason}`);
          },
          onError: (err) => {
            onDebug(`[Engine] Stream error: ${err}`);
          },
        },
        tools,
        abortSignal
      );

      // Create assistant message from accumulated stream
      const assistantConvMsg: ConversationMessage = {
        id: generateId(),
        role: "assistant",
        content: streamResult.content || "",
        timestamp: Date.now(),
        toolCalls:
          streamResult.toolCalls.length > 0
            ? streamResult.toolCalls
            : undefined,
      };

      newMessages.push(assistantConvMsg);
      onMessage([...newMessages]);

      onDebug(
        `[Engine] Assistant message: content=${streamResult.content.length} chars, toolCalls=${streamResult.toolCalls.length}, finishReason=${streamResult.finishReason}`
      );

      // If no tool calls, we're done
      if (streamResult.toolCalls.length === 0) {
        onDebug(`[Engine] No tool calls, ending`);
        break;
      }

      // Execute tool calls
      onDebug(
        `[Engine] Executing ${streamResult.toolCalls.length} tool call(s)`
      );
      for (const toolCall of streamResult.toolCalls) {
        if (abortSignal?.aborted) break;

        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          onDebug(
            `[Engine] Failed to parse tool args: ${toolCall.function.arguments}`
          );
          const toolConvMsg: ConversationMessage = {
            id: generateId(),
            role: "tool",
            content: `Error: Failed to parse arguments: ${toolCall.function.arguments}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          };
          newMessages.push(toolConvMsg);

          onToolCall({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            args: {},
            status: "error",
            error: `Failed to parse arguments`,
          });
          continue;
        }

        const toolResult: ToolCallResult = {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          args: parsedArgs,
          status: "running",
        };
        onToolCall(toolResult);

        try {
          onDebug(
            `[Engine] Executing: ${toolCall.function.name}(${JSON.stringify(parsedArgs).substring(0, 200)})`
          );
          const result = await executeVaultTool(
            app,
            toolCall.function.name,
            parsedArgs
          );

          toolResult.status = "success";
          toolResult.result = result;
          onToolCall(toolResult);
          onDebug(
            `[Engine] Tool success: ${result.substring(0, 100)}`
          );

          // Add tool result message
          const toolConvMsg: ConversationMessage = {
            id: generateId(),
            role: "tool",
            content: result,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          };
          newMessages.push(toolConvMsg);
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : String(err);
          toolResult.status = "error";
          toolResult.error = errorMsg;
          onToolCall(toolResult);
          onDebug(`[Engine] Tool error: ${errorMsg}`);

          const toolConvMsg: ConversationMessage = {
            id: generateId(),
            role: "tool",
            content: `Error: ${errorMsg}`,
            timestamp: Date.now(),
            toolCallId: toolCall.id,
          };
          newMessages.push(toolConvMsg);
        }
      }

      onMessage([...newMessages]);

      // Continue the loop ONLY if finish_reason indicates tool_calls
      // "tool_calls" or "function_call" means the model wants to continue
      // "stop" means the model is done (even if it had tool calls in this response)
      if (
        streamResult.finishReason !== "tool_calls" &&
        streamResult.finishReason !== "function_call"
      ) {
        onDebug(
          `[Engine] finish_reason=${streamResult.finishReason}, not continuing loop`
        );
        break;
      }

      onDebug(`[Engine] Continuing to next iteration...`);
      // Continue the loop to let the model process tool results
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Check for abort
      if (
        abortSignal?.aborted ||
        errorMsg.includes("abort") ||
        errorMsg.includes("AbortError")
      ) {
        onDebug(`[Engine] Request aborted`);
        break;
      }

      onError(errorMsg);
      onDebug(`[Engine] Error: ${errorMsg}`);

      newMessages.push({
        id: generateId(),
        role: "assistant",
        content: `Error: ${errorMsg}`,
        timestamp: Date.now(),
      });
      onMessage([...newMessages]);
      break;
    }
  }

  onDebug(
    `[Engine] Finished. Total new messages: ${newMessages.length}`
  );
  return newMessages;
}
