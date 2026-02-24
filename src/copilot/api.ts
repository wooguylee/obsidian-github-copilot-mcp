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
  ToolCall,
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
  return response.json;
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
  return response.json;
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
  return response.json;
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
    const response = await fetch("https://api.githubcopilot.com/models", {
        method: "GET",
        headers: {
            Accept: "application/json",
            "editor-version": "vscode/1.80.1",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
    }
    const data = await response.json();
    // Filter to chat-capable models and map to ModelOption
    return (data.data as Array<{ id: string; name?: string; capabilities?: { type?: string[] } }>)
        .filter((m) => !m.capabilities?.type || m.capabilities.type.includes("chat"))
        .map((m) => ({ label: m.name ?? m.id, value: m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// --- Streaming Chat Completion ---

export interface StreamCallbacks {
  onContent: (delta: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onDone: (finishReason: string) => void;
  onError: (error: string) => void;
}

/**
 * Send a streaming chat completion request.
 * Uses native fetch + ReadableStream to process SSE chunks in real-time.
 * This prevents timeout issues with large multi-tool responses.
 */
export async function sendChatCompletionStream(
  token: string,
  model: ModelOption,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  tools?: ToolDefinition[],
  abortSignal?: AbortSignal
): Promise<{ content: string; toolCalls: ToolCall[]; finishReason: string }> {
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

  const response = await fetch(
    "https://api.githubcopilot.com/chat/completions",
    {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "editor-version": "vscode/1.80.1",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: abortSignal,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Copilot API error (${response.status}): ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("No response body received from Copilot API");
  }

  // Accumulate the full response
  let fullContent = "";
  const toolCallAccumulator = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let finishReason = "stop";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6); // Remove "data: " prefix
        if (data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data);
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
                  id: tc.id || "",
                  name: tc.function?.name || "",
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
    }
  } finally {
    reader.releaseLock();
  }

  // Build final tool calls array
  const toolCalls: ToolCall[] = [];
  const sortedEntries = [...toolCallAccumulator.entries()].sort(
    ([a], [b]) => a - b
  );
  for (const [, acc] of sortedEntries) {
    const toolCall: ToolCall = {
      id: acc.id,
      type: "function",
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

  return response.json;
}
