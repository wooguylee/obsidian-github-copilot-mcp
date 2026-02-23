// ============================================================
// Types for the GitHub Copilot MCP Plugin
// ============================================================

// --- Authentication ---

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface PATResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface TokenResponse {
  token: string;
  expires_at: number;
  refresh_in: number;
  chat_enabled: boolean;
  endpoints: {
    api: string;
    proxy: string;
    telemetry: string;
    "origin-tracker": string;
  };
}

export interface AuthState {
  deviceCode: string | null;
  pat: string | null;
  accessToken: {
    token: string | null;
    expiresAt: number | null;
  };
}

// --- Models ---

export interface ModelOption {
  label: string;
  value: string;
}

// --- Chat Messages ---

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: MessageRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// --- API Request/Response ---

export interface ChatCompletionRequest {
  intent: boolean;
  model: string;
  temperature: number;
  top_p: number;
  n: number;
  stream: boolean;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none";
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  created: number;
  choices: {
    index: number;
    finish_reason: string;
    message: {
      content: string | null;
      role: string;
      tool_calls?: ToolCall[];
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// --- MCP Tool Types ---

export type ToolCallStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "rejected";

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  error?: string;
}

// --- Conversation ---

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolResults?: ToolCallResult[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  model: ModelOption;
  createdAt: number;
  updatedAt: number;
}

// --- Settings ---

export interface PluginSettings {
  authState: AuthState;
  selectedModel: ModelOption;
  systemPrompt: string;
  maxAutoIterations: number;
  enableTools: boolean;
  debug: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  authState: {
    deviceCode: null,
    pat: null,
    accessToken: {
      token: null,
      expiresAt: null,
    },
  },
  selectedModel: { label: "GPT-4o", value: "gpt-4o" },
  systemPrompt: "",
  maxAutoIterations: 5,
  enableTools: true,
  debug: false,
};

// --- Available Models ---

export const AVAILABLE_MODELS: ModelOption[] = [
  { label: "GPT-4o", value: "gpt-4o" },
  { label: "GPT-4o Mini", value: "gpt-4o-mini" },
  { label: "GPT-4.1", value: "gpt-4.1-2025-04-14" },
  { label: "GPT-4.1 Mini", value: "gpt-4.1-mini" },
  { label: "Claude Sonnet 4", value: "claude-sonnet-4" },
  { label: "Claude Sonnet 4.5", value: "claude-sonnet-4.5" },
  { label: "Claude Haiku 4.5", value: "claude-haiku-4.5" },
  { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
  { label: "o3 Mini", value: "o3-mini" },
  { label: "o4 Mini", value: "o4-mini" },
];

export const COPILOT_CLIENT_ID = "Ov23liclmrr3b8tQdNjK";
