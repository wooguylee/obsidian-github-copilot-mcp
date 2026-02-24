# Obsidian GitHub Copilot MCP Plugin

![GitHub release (latest by date including pre-releases)](https://img.shields.io/github/v/release/WooguyLee/obsidian-github-copilot-mcp)

Use **GitHub Copilot** models in Obsidian with built-in **MCP (Model Context Protocol) vault tools** — read, write, edit, search, and manage your vault files directly from the chat interface.

- 💬 Chat with GitHub Copilot models using your Obsidian vault as context
- 🗂️ Let Copilot read, write, edit, and search your vault files autonomously via MCP tools
- 🔐 Authenticate with GitHub via device code flow (no API key needed)
- ⚡ Real-time streaming responses

## 🗒️ Requirements

- A GitHub Copilot subscription (https://copilot.github.com/)
- Network connection to communicate with the GitHub Copilot service
- Obsidian v1.5.0 or later

## ⚙️ Installation

1. Install the plugin via the Obsidian community plugins browser (search for **GitHub Copilot MCP**).
2. Activate the plugin in **Settings → Community plugins**.
3. Open the plugin settings and configure your preferences.

> [!NOTE]
> If you install the plugin by cloning or downloading the release files from GitHub, name the plugin folder `github-copilot-mcp` for the plugin to work correctly.

## 🔐 Authentication

1. Open the **GitHub Copilot MCP Chat** panel from the right sidebar (click the chat icon in the ribbon).
2. A device code will be displayed. Visit [https://github.com/login/device](https://github.com/login/device) and enter the code.
3. Once authorized, the chat is ready to use.

If you have already signed in to GitHub Copilot in another tool, the plugin may authenticate automatically.

## 💬 Chat Usage

1. Open the **GitHub Copilot MCP Chat** from the right sidebar or via the command palette (`Open Copilot MCP Chat`).
2. Select a model from the dropdown (e.g. `gpt-4o`, `claude-3.7-sonnet`).
3. Type a message and press **Send** (or `Enter` by default).
4. Copilot will respond and may automatically use vault tools to read or edit your notes.

### Commands

| Command | Description |
|---|---|
| `Open Copilot MCP Chat` | Opens the chat panel in the right sidebar |
| `New Copilot MCP Chat` | Clears the current conversation and starts fresh |

## 🗂️ MCP Vault Tools

The plugin exposes the following vault operations as tools that GitHub Copilot can call autonomously during a conversation:

| Tool | Description |
|---|---|
| `vault_list_files` | List files and folders (optionally recursive) |
| `vault_read_file` | Read the full content of a file |
| `vault_write_file` | Create or overwrite a file |
| `vault_edit_file` | Replace a specific text section in a file |
| `vault_search` | Search for files containing specific text |
| `vault_delete_file` | Move a file to Obsidian trash |
| `vault_rename_file` | Rename or move a file (links are updated automatically) |
| `vault_create_folder` | Create a new folder |
| `vault_get_active_file` | Get the currently open file's path and content |
| `vault_append_to_file` | Append content to the end of a file |
| `vault_insert_at_line` | Insert content at a specific line in a file |

### Example prompts

```
Summarize the note "Projects/Q1-Plan.md" for me.

Find all notes that mention "machine learning" and list them.

Create a new daily note for today at "Daily/2026-02-23.md" with a template structure.

Refactor the outline in "Research/Draft.md" into bullet points.
```

## ⚙️ Settings

| Setting | Description |
|---|---|
| **System Prompt** | Custom instructions prepended to every conversation |
| **Default Model** | The Copilot model selected by default |
| **Enter key behavior** | Choose whether Enter sends the message or adds a new line |

## 🏗️ Development

```bash
# Install dependencies
npm install

# Build in watch mode (development)
npm run dev

# Production build
npm run build
```

Copy the built files (`main.js`, `manifest.json`) into your vault's `.obsidian/plugins/github-copilot-mcp/` folder.

## 📄 License

This project is licensed under the Apache License 2.0. See [LICENSE.md](LICENSE.md) for details.
