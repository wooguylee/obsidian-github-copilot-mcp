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
        view.newChatCallback?.();
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

`;
