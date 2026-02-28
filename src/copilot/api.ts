// ============================================================
// GitHub Copilot Authentication & API Client
// ============================================================

import { requestUrl } from "obsidian";
import type {
  DeviceCodeResponse,
  PATResponse,
  TokenResponse,
  AuthState,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ToolDefinition,
  ModelOption,
} from "../types";
import { COPILOT_CLIENT_ID } from "../types";

const COMMON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  accept: "application/json",
  "editor-version": "Neovim/0.6.1",
  "editor-plugin-version": "copilot.vim/1.16.0",
  "user-agent": "GithubCopilot/1.155.0",
  "accept-encoding": "gzip, deflate, br",
};

// --- Authentication Functions ---

export async function fetchDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await requestUrl({
    url: "https://github.com/login/device/code",
    method: "POST",
    headers: COMMON_HEADERS,
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user",
    }),
  });
  return response.json as DeviceCodeResponse;
}

export async function fetchPAT(deviceCode: string): Promise<PATResponse> {
  const response = await requestUrl({
    url: "https://github.com/login/oauth/access_token",
    method: "POST",
    headers: COMMON_HEADERS,
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  return response.json as PATResponse;
}

export async function fetchToken(pat: string): Promise<TokenResponse> {
  const response = await requestUrl({
    url: "https://api.github.com/copilot_internal/v2/token",
    method: "GET",
    headers: {
      ...COMMON_HEADERS,
      authorization: `token ${pat}`,
    },
  });
  return response.json as TokenResponse;
}

// --- Token Management ---

export async function ensureValidToken(
  authState: AuthState,
  onUpdate: (auth: Partial<AuthState>) => void
): Promise<string> {
  const { accessToken, pat } = authState;

  if (
    accessToken.token &&
    accessToken.expiresAt &&
    Date.now() < accessToken.expiresAt * 1000
  ) {
    return accessToken.token;
  }

  if (!pat) {
    throw new Error("Not authenticated. Please sign in first.");
  }

  const tokenResponse = await fetchToken(pat);
  onUpdate({
    accessToken: {
      token: tokenResponse.token,
      expiresAt: tokenResponse.expires_at,
    },
  });

  return tokenResponse.token;
}

// --- Available Models ---

export async function fetchAvailableModels(
    authState: AuthState,
    onUpdate: (auth: Partial<AuthState>) => void
): Promise<ModelOption[]> {
    const token = await ensureValidToken(authState, onUpdate);
    const response = await requestUrl({
        url: "https://api.githubcopilot.com/models",
        method: "GET",
        headers: {
            Accept: "application/json",
            "editor-version": "vscode/1.80.1",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });
    const data = response.json as { data: Array<{ id: string; name?: string; capabilities?: { type?: string[] } }> };
    // Filter to chat-capable models and map to ModelOption
    return data.data
        .filter((m) => !m.capabilities?.type || m.capabilities.type.includes("chat"))
        .map((m) => ({ label: m.name ?? m.id, value: m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// --- Streaming Chat Completion ---

export interface StreamCallbacks {
  onContent: (delta: string) => void;
  onToolCall: (toolCall: { id: string; type: "function"; function: { name: string; arguments: string } }) => void;
  onDone: (finishReason: string) => void;
  onError: (error: string) => void;
}

/**
 * Send a chat completion request using requestUrl with stream: true.
 * requestUrl buffers the entire SSE response, then we parse all events
 * and call callbacks sequentially. This preserves correct finish_reason
 * behavior for the agentic tool-call loop.
 */
export async function sendChatCompletionStream(
  token: string,
  model: ModelOption,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  tools?: ToolDefinition[],
  abortSignal?: AbortSignal
): Promise<{ content: string; toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[]; finishReason: string }> {
  if (abortSignal?.aborted) {
    throw new Error("Request aborted");
  }

  const request: ChatCompletionRequest = {
    intent: false,
    model: model.value,
    temperature: 0,
    top_p: 1,
    n: 1,
    stream: true,
    messages,
    ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
  };

  const response = await requestUrl({
    url: "https://api.githubcopilot.com/chat/completions",
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "editor-version": "vscode/1.80.1",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  // Parse SSE events from the buffered response text
  let fullContent = "";
  const toolCallAccumulator = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let finishReason = "stop";

  const lines = response.text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data: ")) continue;

    const data = trimmed.slice(6);
    if (data === "[DONE]") continue;

    try {
      const chunk = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string;
        }>;
      };
      const delta = chunk.choices?.[0]?.delta;
      const chunkFinishReason = chunk.choices?.[0]?.finish_reason;

      if (chunkFinishReason) {
        finishReason = chunkFinishReason;
      }

      if (!delta) continue;

      // Content delta
      if (delta.content) {
        fullContent += delta.content;
        callbacks.onContent(delta.content);
      }

      // Tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;

          if (!toolCallAccumulator.has(idx)) {
            toolCallAccumulator.set(idx, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: "",
            });
          }

          const acc = toolCallAccumulator.get(idx)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) {
            acc.arguments += tc.function.arguments;
          }
        }
      }
    } catch {
      // Skip malformed JSON chunks
    }
  }

  // Build final tool calls array
  const toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[] = [];
  const sortedEntries = [...toolCallAccumulator.entries()].sort(
    ([a], [b]) => a - b
  );
  for (const [, acc] of sortedEntries) {
    const toolCall = {
      id: acc.id,
      type: "function" as const,
      function: {
        name: acc.name,
        arguments: acc.arguments,
      },
    };
    toolCalls.push(toolCall);
    callbacks.onToolCall(toolCall);
  }

  callbacks.onDone(finishReason);
  return { content: fullContent, toolCalls, finishReason };
}

// --- Non-streaming fallback (kept for simple requests) ---

export async function sendChatCompletion(
  token: string,
  model: ModelOption,
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<ChatCompletionResponse> {
  const request: ChatCompletionRequest = {
    intent: false,
    model: model.value,
    temperature: 0,
    top_p: 1,
    n: 1,
    stream: false,
    messages,
    ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
  };

  const response = await requestUrl({
    url: "https://api.githubcopilot.com/chat/completions",
    method: "POST",
    headers: {
      Accept: "*/*",
      "editor-version": "vscode/1.80.1",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return response.json as ChatCompletionResponse;
}
