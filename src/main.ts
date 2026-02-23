// ============================================================
// Main Plugin Entry Point
// ============================================================

import { Plugin } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./ui/ChatView";
import { CopilotMCPSettingTab } from "./ui/SettingsTab";
import type { PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export default class CopilotMCPPlugin extends Plugin {
  settings!: PluginSettings;

  async onload() {
    await this.loadSettings();

    // Register the chat view
    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

    // Add ribbon icon to open chat
    this.addRibbonIcon("message-square", "Open Copilot MCP Chat", () => {
      this.activateView();
    });

    // Register command to open chat
    this.addCommand({
      id: "open-copilot-mcp-chat",
      name: "Open Copilot MCP Chat",
      callback: () => {
        this.activateView();
      },
    });

    // Register command to start new chat
    this.addCommand({
      id: "new-copilot-mcp-chat",
      name: "New Copilot MCP Chat",
      callback: () => {
        this.activateView(true);
      },
    });

    // Register settings tab
    this.addSettingTab(new CopilotMCPSettingTab(this.app, this));

    // Load styles
    this.loadStyles();
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView(newChat = false) {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: CHAT_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);

      if (newChat) {
        const view = leaf.view as ChatView;
        if (view && "conversationHistory" in view) {
          (view as any).conversationHistory = [];
          (view as any).renderMessages();
        }
      }
    }
  }

  private loadStyles() {
    const styleEl = document.createElement("style");
    styleEl.id = "copilot-mcp-styles";
    styleEl.textContent = CSS_STYLES;
    document.head.appendChild(styleEl);

    this.register(() => {
      styleEl.remove();
    });
  }
}

// ============================================================
// Embedded CSS Styles
// ============================================================

const CSS_STYLES = `
/* Container */
.copilot-mcp-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Auth */
.copilot-mcp-auth {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
  text-align: center;
  gap: 12px;
}

.copilot-mcp-auth h3 {
  margin-bottom: 8px;
}

.copilot-mcp-auth-status {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.copilot-mcp-device-code {
  background: var(--background-modifier-border);
  padding: 12px 24px;
  border-radius: 8px;
  margin: 8px 0;
}

.copilot-mcp-device-code code {
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 4px;
  color: var(--text-accent);
}

.copilot-mcp-auth-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
}

/* Header */
.copilot-mcp-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
}

.copilot-mcp-model-select {
  flex: 1;
  font-size: 13px;
}

.copilot-mcp-new-chat,
.copilot-mcp-signout {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
}

.copilot-mcp-new-chat:hover,
.copilot-mcp-signout:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

/* Messages */
.copilot-mcp-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.copilot-mcp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
}

.copilot-mcp-empty h3 {
  color: var(--text-normal);
  margin-bottom: 8px;
}

.copilot-mcp-examples {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 16px;
  width: 100%;
  max-width: 300px;
}

.copilot-mcp-example-btn {
  background: var(--background-modifier-border);
  border: 1px solid var(--background-modifier-border-hover);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  color: var(--text-normal);
  transition: background 0.15s;
}

.copilot-mcp-example-btn:hover {
  background: var(--background-modifier-hover);
}

/* Message bubbles */
.copilot-mcp-message-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 12px;
  margin-bottom: 2px;
}

.copilot-mcp-message {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.copilot-mcp-message-user {
  background: var(--background-modifier-border);
}

.copilot-mcp-message-assistant {
  background: transparent;
}

.copilot-mcp-message-content {
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.copilot-mcp-message-content p {
  margin: 4px 0;
}

.copilot-mcp-message-content pre {
  background: var(--background-primary-alt);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
}

.copilot-mcp-message-content code {
  font-size: 12px;
}

/* Tool Calls */
.copilot-mcp-tool-calls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.copilot-mcp-tool-call {
  background: var(--background-primary-alt);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
}

.copilot-mcp-tool-call-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.copilot-mcp-tool-name {
  font-weight: 600;
  color: var(--text-accent);
  font-family: var(--font-monospace);
  font-size: 12px;
}

.copilot-mcp-tool-args code {
  display: block;
  font-size: 11px;
  background: var(--background-primary);
  padding: 4px 6px;
  border-radius: 3px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-muted);
  max-height: 100px;
  overflow-y: auto;
}

.copilot-mcp-tool-result {
  margin-top: 4px;
  border-top: 1px solid var(--background-modifier-border);
  padding-top: 4px;
}

.copilot-mcp-tool-result pre {
  font-size: 11px;
  margin: 0;
  padding: 4px 6px;
  background: var(--background-primary);
  border-radius: 3px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.copilot-mcp-tool-result-success pre {
  color: var(--text-normal);
}

.copilot-mcp-tool-result-error pre {
  color: var(--text-error);
}

.copilot-mcp-error {
  color: var(--text-error);
}

.copilot-mcp-running {
  color: var(--text-accent);
  font-style: italic;
}

/* Input area */
.copilot-mcp-input-area {
  border-top: 1px solid var(--background-modifier-border);
  padding: 8px 12px;
  flex-shrink: 0;
}

.copilot-mcp-input {
  width: 100%;
  resize: none;
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  background: var(--background-primary);
  color: var(--text-normal);
  outline: none;
  min-height: 60px;
  max-height: 200px;
}

.copilot-mcp-input:focus {
  border-color: var(--interactive-accent);
}

.copilot-mcp-input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.copilot-mcp-send {
  font-size: 13px;
  padding: 4px 16px;
}

/* Tools list in settings */
.copilot-mcp-tools-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}

.copilot-mcp-tool-info {
  font-size: 13px;
  padding: 4px 0;
}

.copilot-mcp-tool-info code {
  background: var(--background-modifier-border);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

/* Streaming */
.copilot-mcp-streaming {
  white-space: pre-wrap;
  color: var(--text-normal);
}

.copilot-mcp-streaming::after {
  content: "\\25AE";
  animation: copilot-mcp-blink 1s step-end infinite;
  color: var(--text-accent);
  margin-left: 2px;
}

@keyframes copilot-mcp-blink {
  50% { opacity: 0; }
}

/* Tool status */
.copilot-mcp-tool-status {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
  margin-left: auto;
}

/* Live tool calls container */
.copilot-mcp-tool-calls-live {
  margin: 8px 0;
}
`;
