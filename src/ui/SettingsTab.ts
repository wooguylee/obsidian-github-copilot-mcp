// ============================================================
// Settings Tab
// ============================================================

import { App, PluginSettingTab, Setting } from "obsidian";
import type CopilotMCPPlugin from "../main";
import { AVAILABLE_MODELS } from "../types";

export class CopilotMCPSettingTab extends PluginSettingTab {
  plugin: CopilotMCPPlugin;

  constructor(app: App, plugin: CopilotMCPPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("GitHub Copilot MCP settings")
      .setHeading();

    // --- Authentication Status ---
    new Setting(containerEl)
      .setName("Authentication")
      .setHeading();

    const isAuthed = !!this.plugin.settings.authState.pat;
    new Setting(containerEl)
      .setName("Status")
      .setDesc(
        isAuthed
          ? "Signed in to GitHub Copilot"
          : "Not signed in"
      )
      .addButton((btn) => {
        btn
          .setButtonText(isAuthed ? "Sign out" : "Sign in from chat panel")
          .onClick(() => {
            if (isAuthed) {
              this.plugin.settings.authState = {
                deviceCode: null,
                pat: null,
                accessToken: { token: null, expiresAt: null },
              };
              void this.plugin.saveSettings().then(() => this.display());
            }
          });
        if (!isAuthed) btn.setCta();
      });

    // --- Model Selection ---
    new Setting(containerEl)
      .setName("Model")
      .setHeading();

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("Select the GitHub Copilot model to use for chat.")
      .addDropdown((dropdown) => {
        for (const model of AVAILABLE_MODELS) {
          dropdown.addOption(model.value, model.label);
        }
        dropdown.setValue(this.plugin.settings.selectedModel.value);
        dropdown.onChange((value) => {
          const model = AVAILABLE_MODELS.find((m) => m.value === value);
          if (model) {
            this.plugin.settings.selectedModel = model;
            void this.plugin.saveSettings();
          }
        });
      });

    // --- System Prompt ---
    new Setting(containerEl)
      .setName("System prompt")
      .setHeading();

    new Setting(containerEl)
      .setName("Custom system prompt")
      .setDesc(
        "Optional system prompt prepended to every conversation. Leave empty for default behavior."
      )
      .addTextArea((text) => {
        text
          .setPlaceholder("You are a helpful assistant...")
          .setValue(this.plugin.settings.systemPrompt)
          .onChange((value) => {
            this.plugin.settings.systemPrompt = value;
            void this.plugin.saveSettings();
          });
        text.inputEl.rows = 5;
        text.inputEl.addClass("copilot-mcp-textarea-full-width");
      });

    // --- Tool Settings ---
    new Setting(containerEl)
      .setName("MCP vault tools")
      .setHeading();

    new Setting(containerEl)
      .setName("Enable vault tools")
      .setDesc(
        "Allow Copilot to use tools for reading, writing, editing, and searching files in your vault."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableTools)
          .onChange((value) => {
            this.plugin.settings.enableTools = value;
            void this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Max auto iterations")
      .setDesc(
        "Maximum number of tool-call iterations per message. Higher values allow more complex multi-step operations."
      )
      .addSlider((slider) => {
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.maxAutoIterations)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.maxAutoIterations = value;
            void this.plugin.saveSettings();
          });
      });

    // --- Advanced ---
    new Setting(containerEl)
      .setName("Advanced")
      .setHeading();

    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Show debug information in the console.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.debug)
          .onChange((value) => {
            this.plugin.settings.debug = value;
            void this.plugin.saveSettings();
          });
      });

    // --- Available Tools Info ---
    new Setting(containerEl)
      .setName("Available vault tools")
      .setHeading();

    const toolsList = containerEl.createDiv({ cls: "copilot-mcp-tools-list" });
    const tools = [
      { name: "vault_list_files", desc: "List files and folders" },
      { name: "vault_read_file", desc: "Read file content" },
      { name: "vault_write_file", desc: "Create or overwrite files" },
      { name: "vault_edit_file", desc: "Edit specific text in a file" },
      { name: "vault_search", desc: "Search file contents" },
      { name: "vault_delete_file", desc: "Delete files" },
      { name: "vault_rename_file", desc: "Rename or move files" },
      { name: "vault_create_folder", desc: "Create folders" },
      { name: "vault_get_active_file", desc: "Get currently open file" },
      { name: "vault_append_to_file", desc: "Append content to a file" },
      { name: "vault_insert_at_line", desc: "Insert content at a specific line" },
    ];

    for (const tool of tools) {
      const toolEl = toolsList.createDiv({ cls: "copilot-mcp-tool-info" });
      toolEl.createEl("code", { text: tool.name });
      toolEl.createEl("span", { text: ` - ${tool.desc}` });
    }
  }
}
