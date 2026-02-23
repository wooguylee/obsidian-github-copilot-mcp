// ============================================================
// Chat View - Obsidian ItemView for the Chat Sidebar
// ============================================================

import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer } from "obsidian";
import type CopilotMCPPlugin from "../main";
import type {
  ConversationMessage,
  ToolCallResult,
} from "../types";
import { AVAILABLE_MODELS } from "../types";
import { fetchDeviceCode, fetchPAT, fetchToken } from "../copilot/api";
import { runChatEngine } from "../copilot/engine";

export const CHAT_VIEW_TYPE = "github-copilot-mcp-chat";

export class ChatView extends ItemView {
  plugin: CopilotMCPPlugin;
  private containerEl_!: HTMLElement;
  private messagesContainer!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private conversationHistory: ConversationMessage[] = [];
  private isProcessing = false;
  private abortController: AbortController | null = null;
  private streamingContentEl: HTMLElement | null = null;
  private streamingContent = "";

  constructor(leaf: WorkspaceLeaf, plugin: CopilotMCPPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Copilot MCP Chat";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("copilot-mcp-container");
    this.containerEl_ = container;

    this.renderView();
  }

  private renderView() {
    this.containerEl_.empty();

    const isAuthed = !!this.plugin.settings.authState.pat;

    if (!isAuthed) {
      this.renderAuthView();
    } else {
      this.renderChatView();
    }
  }

  // --- Auth View ---
  private renderAuthView() {
    const authContainer = this.containerEl_.createDiv({
      cls: "copilot-mcp-auth",
    });

    authContainer.createEl("h3", { text: "GitHub Copilot MCP" });
    authContainer.createEl("p", {
      text: "Sign in with your GitHub account to use Copilot models.",
    });

    const signInBtn = authContainer.createEl("button", {
      text: "Sign in with GitHub",
      cls: "mod-cta",
    });

    const statusEl = authContainer.createDiv({
      cls: "copilot-mcp-auth-status",
    });

    signInBtn.addEventListener("click", async () => {
      try {
        signInBtn.disabled = true;
        signInBtn.textContent = "Getting device code...";

        const deviceCode = await fetchDeviceCode();

        // Show code to user
        statusEl.empty();
        statusEl.createEl("p", {
          text: "Enter this code on GitHub:",
        });
        const codeEl = statusEl.createEl("div", {
          cls: "copilot-mcp-device-code",
        });
        codeEl.createEl("code", { text: deviceCode.user_code });

        const copyBtn = statusEl.createEl("button", {
          text: "Copy code & open GitHub",
          cls: "mod-cta",
        });

        copyBtn.addEventListener("click", () => {
          navigator.clipboard.writeText(deviceCode.user_code);
          window.open(deviceCode.verification_uri, "_blank");
          new Notice("Code copied! Paste it on GitHub.");
        });

        statusEl.createEl("p", {
          text: "After entering the code on GitHub, click below:",
          cls: "copilot-mcp-auth-hint",
        });

        const confirmBtn = statusEl.createEl("button", {
          text: "I've entered the code",
        });

        confirmBtn.addEventListener("click", async () => {
          try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Authenticating...";

            const pat = await fetchPAT(deviceCode.device_code);

            if (!pat.access_token) {
              new Notice(
                "Authentication not yet complete. Please enter the code on GitHub first."
              );
              confirmBtn.disabled = false;
              confirmBtn.textContent = "I've entered the code";
              return;
            }

            const tokenResp = await fetchToken(pat.access_token);

            this.plugin.settings.authState = {
              deviceCode: deviceCode.device_code,
              pat: pat.access_token,
              accessToken: {
                token: tokenResp.token,
                expiresAt: tokenResp.expires_at,
              },
            };
            await this.plugin.saveSettings();

            new Notice("Successfully signed in to GitHub Copilot!");
            this.renderView();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Auth error: ${msg}`);
            confirmBtn.disabled = false;
            confirmBtn.textContent = "I've entered the code";
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Error: ${msg}`);
        signInBtn.disabled = false;
        signInBtn.textContent = "Sign in with GitHub";
      }
    });
  }

  // --- Chat View ---
  private renderChatView() {
    // Header
    const header = this.containerEl_.createDiv({ cls: "copilot-mcp-header" });

    // Model selector
    const modelSelect = header.createEl("select", {
      cls: "copilot-mcp-model-select dropdown",
    });
    for (const model of AVAILABLE_MODELS) {
      const opt = modelSelect.createEl("option", {
        text: model.label,
        value: model.value,
      });
      if (model.value === this.plugin.settings.selectedModel.value) {
        opt.selected = true;
      }
    }
    modelSelect.addEventListener("change", async () => {
      const selected = AVAILABLE_MODELS.find(
        (m) => m.value === modelSelect.value
      );
      if (selected) {
        this.plugin.settings.selectedModel = selected;
        await this.plugin.saveSettings();
      }
    });

    // New chat button
    const newChatBtn = header.createEl("button", {
      cls: "copilot-mcp-new-chat clickable-icon",
      attr: { "aria-label": "New chat" },
    });
    newChatBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
    newChatBtn.addEventListener("click", () => {
      this.conversationHistory = [];
      this.renderMessages();
    });

    // Sign out button
    const signOutBtn = header.createEl("button", {
      cls: "copilot-mcp-signout clickable-icon",
      attr: { "aria-label": "Sign out" },
    });
    signOutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
    signOutBtn.addEventListener("click", async () => {
      this.plugin.settings.authState = {
        deviceCode: null,
        pat: null,
        accessToken: { token: null, expiresAt: null },
      };
      await this.plugin.saveSettings();
      this.conversationHistory = [];
      new Notice("Signed out from GitHub Copilot");
      this.renderView();
    });

    // Messages container
    this.messagesContainer = this.containerEl_.createDiv({
      cls: "copilot-mcp-messages",
    });

    // Render existing messages
    this.renderMessages();

    // Input area
    const inputArea = this.containerEl_.createDiv({
      cls: "copilot-mcp-input-area",
    });

    this.inputEl = inputArea.createEl("textarea", {
      cls: "copilot-mcp-input",
      attr: {
        placeholder: "Ask Copilot anything... (Shift+Enter for new line)",
        rows: "3",
      },
    });

    const inputActions = inputArea.createDiv({
      cls: "copilot-mcp-input-actions",
    });

    this.sendButton = inputActions.createEl("button", {
      text: "Send",
      cls: "mod-cta copilot-mcp-send",
    });

    // Enter to send
    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendButton.addEventListener("click", () => {
      if (this.isProcessing) {
        this.abortController?.abort();
        this.finishProcessing();
      } else {
        this.handleSend();
      }
    });
  }

  private renderMessages() {
    if (!this.messagesContainer) return;
    this.messagesContainer.empty();
    this.liveToolCallEls.clear();

    if (this.conversationHistory.length === 0) {
      const empty = this.messagesContainer.createDiv({
        cls: "copilot-mcp-empty",
      });
      empty.createEl("h3", { text: "GitHub Copilot MCP" });
      empty.createEl("p", {
        text: "Ask me anything! I can read, write, edit, and search files in your vault.",
      });

      const examples = empty.createDiv({ cls: "copilot-mcp-examples" });
      const exampleQueries = [
        "List all files in my vault",
        "Summarize the content of my daily notes",
        "Create a new note with a project template",
        "Find all notes mentioning a specific topic",
        "Edit a specific section in a note",
      ];
      for (const q of exampleQueries) {
        const btn = examples.createEl("button", {
          text: q,
          cls: "copilot-mcp-example-btn",
        });
        btn.addEventListener("click", () => {
          this.inputEl.value = q;
          this.handleSend();
        });
      }
      return;
    }

    for (const msg of this.conversationHistory) {
      this.renderSingleMessage(msg);
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private renderSingleMessage(msg: ConversationMessage) {
    if (msg.role === "tool") return; // Tool messages are shown inline with tool calls

    const roleLabel = this.messagesContainer.createDiv({
      cls: "copilot-mcp-message-role",
    });

    const msgEl = this.messagesContainer.createDiv({
      cls: `copilot-mcp-message copilot-mcp-message-${msg.role}`,
    });

    if (msg.role === "user") {
      roleLabel.setText("You");
      msgEl.createDiv({
        cls: "copilot-mcp-message-content",
        text: msg.content,
      });
    } else if (msg.role === "assistant") {
      roleLabel.setText("Copilot");

      // Render tool calls if present
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const toolsEl = msgEl.createDiv({ cls: "copilot-mcp-tool-calls" });
        for (const tc of msg.toolCalls) {
          const tcEl = toolsEl.createDiv({ cls: "copilot-mcp-tool-call" });
          const tcHeader = tcEl.createDiv({
            cls: "copilot-mcp-tool-call-header",
          });
          tcHeader.createEl("span", {
            cls: "copilot-mcp-tool-name",
            text: tc.function.name,
          });

          // Show args
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            const argsEl = tcEl.createDiv({ cls: "copilot-mcp-tool-args" });
            const argsCode = argsEl.createEl("code");
            argsCode.setText(JSON.stringify(args, null, 2));
          } catch {
            // ignore parse errors
          }

          // Show result if available
          const toolResult = msg.toolResults?.find(
            (r) => r.toolCallId === tc.id
          );
          if (toolResult) {
            const resultEl = tcEl.createDiv({
              cls: `copilot-mcp-tool-result copilot-mcp-tool-result-${toolResult.status}`,
            });
            if (toolResult.status === "success" && toolResult.result) {
              const resultText = toolResult.result;
              if (resultText.length > 500) {
                resultEl.createEl("details", {}, (details) => {
                  details.createEl("summary", {
                    text: `Result (${resultText.length} chars)`,
                  });
                  details.createEl("pre", { text: resultText });
                });
              } else {
                resultEl.createEl("pre", { text: resultText });
              }
            } else if (toolResult.status === "error") {
              resultEl.createEl("pre", {
                text: `Error: ${toolResult.error}`,
                cls: "copilot-mcp-error",
              });
            } else if (toolResult.status === "running") {
              resultEl.createEl("span", {
                text: "Running...",
                cls: "copilot-mcp-running",
              });
            }
          }
        }
      }

      // Render content as markdown
      if (msg.content) {
        const contentEl = msgEl.createDiv({
          cls: "copilot-mcp-message-content",
        });
        MarkdownRenderer.render(this.app, msg.content, contentEl, "", this);
      }
    }
  }

  private scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  private startStreamingMessage() {
    // Add role label
    const roleLabel = this.messagesContainer.createDiv({
      cls: "copilot-mcp-message-role",
    });
    roleLabel.setText("Copilot");

    // Add message container
    const msgEl = this.messagesContainer.createDiv({
      cls: "copilot-mcp-message copilot-mcp-message-assistant",
    });

    this.streamingContentEl = msgEl.createDiv({
      cls: "copilot-mcp-message-content copilot-mcp-streaming",
    });
    this.streamingContent = "";
    return msgEl;
  }

  private appendStreamingContent(delta: string) {
    this.streamingContent += delta;
    if (this.streamingContentEl) {
      this.streamingContentEl.empty();
      // Simple text rendering during streaming for performance
      this.streamingContentEl.setText(this.streamingContent);
      this.scrollToBottom();
    }
  }

  private endStreamingMessage() {
    // Re-render with proper markdown after stream ends
    if (this.streamingContentEl && this.streamingContent) {
      this.streamingContentEl.empty();
      this.streamingContentEl.classList.remove("copilot-mcp-streaming");
      MarkdownRenderer.render(
        this.app,
        this.streamingContent,
        this.streamingContentEl,
        "",
        this
      );
    }
    this.streamingContentEl = null;
    this.streamingContent = "";
  }

  private liveToolCallEls = new Map<string, HTMLElement>();

  private renderToolCallInProgress(
    toolName: string,
    args: Record<string, unknown>,
    status: string
  ) {
    let toolsContainer = this.messagesContainer.querySelector(
      ".copilot-mcp-tool-calls-live"
    ) as HTMLElement | null;

    if (!toolsContainer) {
      toolsContainer = this.messagesContainer.createDiv({
        cls: "copilot-mcp-tool-calls-live copilot-mcp-tool-calls",
      });
    }

    // Use a simple hash of toolName + args as lookup key
    const key = toolName + ":" + JSON.stringify(args);
    const existingEl = this.liveToolCallEls.get(key);

    if (existingEl) {
      const statusEl = existingEl.querySelector(".copilot-mcp-tool-status");
      if (statusEl) statusEl.textContent = status;
      return;
    }

    const tcEl = toolsContainer.createDiv({
      cls: "copilot-mcp-tool-call",
    });
    this.liveToolCallEls.set(key, tcEl);

    const tcHeader = tcEl.createDiv({
      cls: "copilot-mcp-tool-call-header",
    });
    tcHeader.createEl("span", {
      cls: "copilot-mcp-tool-name",
      text: toolName,
    });
    tcHeader.createEl("span", {
      cls: "copilot-mcp-tool-status",
      text: status,
    });

    const argsEl = tcEl.createDiv({ cls: "copilot-mcp-tool-args" });
    argsEl.createEl("code", {
      text: JSON.stringify(args, null, 2),
    });

    this.scrollToBottom();
  }

  private async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text || this.isProcessing) return;

    this.isProcessing = true;
    this.inputEl.value = "";
    this.sendButton.textContent = "Stop";
    this.sendButton.classList.remove("mod-cta");
    this.sendButton.classList.add("mod-warning");

    // Create abort controller
    this.abortController = new AbortController();

    const toolResults = new Map<string, ToolCallResult>();
    let isFirstStream = true;

    try {
      const newMessages = await runChatEngine(
        this.conversationHistory,
        text,
        {
          app: this.app,
          authState: this.plugin.settings.authState,
          model: this.plugin.settings.selectedModel,
          systemPrompt: this.plugin.settings.systemPrompt,
          maxIterations: this.plugin.settings.maxAutoIterations,
          enableTools: this.plugin.settings.enableTools,
          onAuthUpdate: async (auth) => {
            Object.assign(this.plugin.settings.authState, auth);
            await this.plugin.saveSettings();
          },
          onContentDelta: (delta) => {
            if (isFirstStream) {
              // First content delta for this iteration - keep the existing display
            }
            this.appendStreamingContent(delta);
          },
          onMessage: (msgs) => {
            // Attach tool results to assistant messages
            for (const m of msgs) {
              if (m.role === "assistant" && m.toolCalls) {
                m.toolResults = m.toolCalls
                  .map((tc) => toolResults.get(tc.id))
                  .filter(Boolean) as ToolCallResult[];
              }
            }

            // Full re-render of history + new messages
            this.messagesContainer.empty();
            this.liveToolCallEls.clear();
            for (const msg of this.conversationHistory) {
              this.renderSingleMessage(msg);
            }
            for (const msg of msgs) {
              this.renderSingleMessage(msg);
            }
            this.scrollToBottom();

            // Reset streaming state for next iteration
            this.endStreamingMessage();
            isFirstStream = true;

            // If the last message is an assistant without tool calls or
            // the last messages are tool results, start a new streaming area
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg?.role === "tool") {
              // Tool results just came in - model will respond next
              // Start a new streaming area for the next response
              this.startStreamingMessage();
              isFirstStream = false;
            }
          },
          onToolCall: (result) => {
            toolResults.set(result.toolCallId, result);
            const statusText =
              result.status === "running"
                ? "Running..."
                : result.status === "success"
                  ? "Done"
                  : `Error: ${result.error}`;
            this.renderToolCallInProgress(
              result.toolName,
              result.args,
              statusText
            );
          },
          onError: (err) => {
            new Notice(`Copilot error: ${err}`);
          },
          onDebug: (msg) => {
            if (this.plugin.settings.debug) {
              console.log(`[CopilotMCP] ${msg}`);
            }
          },
          abortSignal: this.abortController.signal,
        }
      );

      this.endStreamingMessage();

      // Attach final tool results
      for (const m of newMessages) {
        if (m.role === "assistant" && m.toolCalls) {
          m.toolResults = m.toolCalls
            .map((tc) => toolResults.get(tc.id))
            .filter(Boolean) as ToolCallResult[];
        }
      }

      this.conversationHistory.push(...newMessages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("abort")) {
        new Notice(`Error: ${msg}`);
      }
    }

    this.finishProcessing();
    this.renderMessages();
  }

  private finishProcessing() {
    this.isProcessing = false;
    this.abortController = null;
    this.endStreamingMessage();
    if (this.sendButton) {
      this.sendButton.textContent = "Send";
      this.sendButton.classList.add("mod-cta");
      this.sendButton.classList.remove("mod-warning");
    }
  }

  async onClose() {
    this.abortController?.abort();
  }
}
