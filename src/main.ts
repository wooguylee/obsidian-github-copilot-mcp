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
    this.addRibbonIcon("message-square", "Open Copilot MCP chat", () => {
      void this.activateView();
    });

    // Register command to open chat
    this.addCommand({
      id: "open-copilot-mcp-chat",
      name: "Open Copilot MCP chat",
      callback: () => {
        void this.activateView();
      },
    });

    // Register command to start new chat
    this.addCommand({
      id: "new-copilot-mcp-chat",
      name: "New Copilot MCP chat",
      callback: () => {
        void this.activateView(true);
      },
    });

    // Register settings tab
    this.addSettingTab(new CopilotMCPSettingTab(this.app, this));
  }

  onunload() {
    // Plugin cleanup handled by Obsidian
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
}
