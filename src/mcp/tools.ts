// ============================================================
// MCP Vault Tools - Obsidian File Operations as Tool Definitions
// ============================================================

import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { ToolDefinition } from "../types";

// --- Tool Definitions (OpenAI function-calling format) ---

export function getVaultToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "vault_list_files",
        description:
          "List files and folders in the Obsidian vault. Can list from root or a specific folder path. Returns file paths with sizes.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                'Folder path to list. Use "/" or empty string for vault root.',
            },
            recursive: {
              type: "boolean",
              description:
                "If true, list all files recursively. Default false.",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_read_file",
        description:
          "Read the full content of a file in the vault. Returns the text content of the file.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                'File path relative to vault root, e.g. "folder/note.md"',
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_write_file",
        description:
          "Create a new file or overwrite an existing file in the vault. Use this to create new notes or completely replace file content.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                'File path relative to vault root, e.g. "folder/new-note.md"',
            },
            content: {
              type: "string",
              description: "The full content to write to the file.",
            },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_edit_file",
        description:
          "Edit a file by replacing a specific text section with new text. Use this for targeted edits instead of rewriting the entire file. The oldText must be an exact match of existing content in the file.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path relative to vault root.",
            },
            oldText: {
              type: "string",
              description:
                "The exact text to find and replace. Must match exactly.",
            },
            newText: {
              type: "string",
              description: "The replacement text.",
            },
          },
          required: ["path", "oldText", "newText"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_search",
        description:
          "Search for files containing specific text in the vault. Returns file paths and matching line excerpts.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Text to search for (case-insensitive).",
            },
            path: {
              type: "string",
              description:
                "Optional folder path to limit search scope. Defaults to vault root.",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of matching files to return. Default 20.",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_delete_file",
        description:
          "Delete a file from the vault. Moves the file to Obsidian trash.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path relative to vault root to delete.",
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_rename_file",
        description:
          "Rename or move a file within the vault. Obsidian will automatically update all internal links.",
        parameters: {
          type: "object",
          properties: {
            oldPath: {
              type: "string",
              description: "Current file path.",
            },
            newPath: {
              type: "string",
              description: "New file path.",
            },
          },
          required: ["oldPath", "newPath"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_create_folder",
        description: "Create a new folder in the vault.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                'Folder path to create, e.g. "Projects/NewProject"',
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_get_active_file",
        description:
          "Get the path and content of the currently active (open) file in Obsidian.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_append_to_file",
        description:
          "Append content to the end of an existing file. Useful for adding entries to logs, journals, or lists.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path relative to vault root.",
            },
            content: {
              type: "string",
              description: "Content to append to the end of the file.",
            },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "vault_insert_at_line",
        description:
          "Insert content at a specific line number in a file. Line numbers start at 1. Content is inserted before the specified line.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path relative to vault root.",
            },
            line: {
              type: "number",
              description: "Line number to insert at (1-indexed). Content is inserted before this line.",
            },
            content: {
              type: "string",
              description: "Content to insert.",
            },
          },
          required: ["path", "line", "content"],
        },
      },
    },
  ];
}

// --- Tool Execution ---

export async function executeVaultTool(
  app: App,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "vault_list_files":
      return listFiles(app, args);
    case "vault_read_file":
      return await readFile(app, args);
    case "vault_write_file":
      return await writeFile(app, args);
    case "vault_edit_file":
      return await editFile(app, args);
    case "vault_search":
      return await searchFiles(app, args);
    case "vault_delete_file":
      return await deleteFile(app, args);
    case "vault_rename_file":
      return await renameFile(app, args);
    case "vault_create_folder":
      return await createFolder(app, args);
    case "vault_get_active_file":
      return await getActiveFile(app);
    case "vault_append_to_file":
      return await appendToFile(app, args);
    case "vault_insert_at_line":
      return await insertAtLine(app, args);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// --- Tool Implementations ---

function listFiles(
  app: App,
  args: Record<string, unknown>
): string {
  const folderPath = (args.path as string) || "/";
  const recursive = (args.recursive as boolean) || false;

  const entries: string[] = [];

  function collectFiles(folder: TFolder, depth: number) {
    for (const child of folder.children) {
      if (child instanceof TFile) {
        const sizeKB = (child.stat.size / 1024).toFixed(1);
        entries.push(`${child.path} (${sizeKB} KB)`);
      } else if (child instanceof TFolder) {
        entries.push(`${child.path}/`);
        if (recursive) {
          collectFiles(child, depth + 1);
        }
      }
    }
  }

  let targetFolder: TFolder;
  if (folderPath === "/" || folderPath === "" || folderPath === ".") {
    targetFolder = app.vault.getRoot();
  } else {
    const abstract = app.vault.getAbstractFileByPath(
      normalizePath(folderPath)
    );
    if (!abstract || !(abstract instanceof TFolder)) {
      return `Error: Folder not found: ${folderPath}`;
    }
    targetFolder = abstract;
  }

  collectFiles(targetFolder, 0);
  entries.sort();

  if (entries.length === 0) {
    return "No files found.";
  }
  return entries.join("\n");
}

async function readFile(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string;
  if (!path) return "Error: path is required";

  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!file || !(file instanceof TFile)) {
    return `Error: File not found: ${path}`;
  }

  const content = await app.vault.cachedRead(file);
  return content;
}

async function writeFile(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string;
  const content = args.content as string;
  if (!path) return "Error: path is required";
  if (content === undefined) return "Error: content is required";

  const normalized = normalizePath(path);

  // Ensure parent directories exist
  const parts = normalized.split("/");
  if (parts.length > 1) {
    const parentPath = parts.slice(0, -1).join("/");
    const parentAbstract = app.vault.getAbstractFileByPath(parentPath);
    if (!parentAbstract) {
      await app.vault.createFolder(parentPath);
    }
  }

  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing && existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return `File updated: ${normalized}`;
  } else {
    await app.vault.create(normalized, content);
    return `File created: ${normalized}`;
  }
}

async function editFile(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string;
  const oldText = args.oldText as string;
  const newText = args.newText as string;

  if (!path) return "Error: path is required";
  if (!oldText) return "Error: oldText is required";
  if (newText === undefined) return "Error: newText is required";

  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!file || !(file instanceof TFile)) {
    return `Error: File not found: ${path}`;
  }

  const content = await app.vault.read(file);
  if (!content.includes(oldText)) {
    return `Error: Could not find the specified text in ${path}. The oldText must match exactly.`;
  }

  const occurrences = content.split(oldText).length - 1;
  const newContent = content.replace(oldText, newText);
  await app.vault.modify(file, newContent);

  return `File edited: ${path} (${occurrences} occurrence(s) found, first one replaced)`;
}

async function searchFiles(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const query = (args.query as string)?.toLowerCase();
  const folderPath = (args.path as string) || "";
  const maxResults = (args.maxResults as number) || 20;

  if (!query) return "Error: query is required";

  const files = app.vault.getMarkdownFiles();
  const results: string[] = [];

  for (const file of files) {
    if (results.length >= maxResults) break;
    if (folderPath && !file.path.startsWith(normalizePath(folderPath))) {
      continue;
    }

    const content = await app.vault.cachedRead(file);
    const lowerContent = content.toLowerCase();
    const idx = lowerContent.indexOf(query);

    if (idx !== -1) {
      // Get surrounding context
      const start = Math.max(0, idx - 50);
      const end = Math.min(content.length, idx + query.length + 50);
      const excerpt = content.slice(start, end).replace(/\n/g, " ");
      const lineNum =
        content.slice(0, idx).split("\n").length;
      results.push(
        `${file.path} (line ${lineNum}): ...${excerpt}...`
      );
    }
  }

  if (results.length === 0) {
    return `No files found containing "${String(args.query)}".`;
  }
  return results.join("\n");
}

async function deleteFile(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string;
  if (!path) return "Error: path is required";

  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!file) {
    return `Error: File not found: ${path}`;
  }

  await app.fileManager.trashFile(file);
  return `File deleted (moved to trash): ${path}`;
}

async function renameFile(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const oldPath = args.oldPath as string;
  const newPath = args.newPath as string;

  if (!oldPath) return "Error: oldPath is required";
  if (!newPath) return "Error: newPath is required";

  const file = app.vault.getAbstractFileByPath(normalizePath(oldPath));
  if (!file) {
    return `Error: File not found: ${oldPath}`;
  }

  await app.fileManager.renameFile(file, normalizePath(newPath));
  return `File renamed: ${oldPath} -> ${newPath}`;
}

async function createFolder(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string;
  if (!path) return "Error: path is required";

  const normalized = normalizePath(path);
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing) {
    return `Folder already exists: ${normalized}`;
  }

  await app.vault.createFolder(normalized);
  return `Folder created: ${normalized}`;
}

async function getActiveFile(app: App): Promise<string> {
  const file = app.workspace.getActiveFile();
  if (!file) {
    return "No file is currently active.";
  }

  const content = await app.vault.cachedRead(file);
  return `Active file: ${file.path}\n\n${content}`;
}

async function appendToFile(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string;
  const content = args.content as string;

  if (!path) return "Error: path is required";
  if (!content) return "Error: content is required";

  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!file || !(file instanceof TFile)) {
    return `Error: File not found: ${path}`;
  }

  const existing = await app.vault.read(file);
  const newContent = existing + "\n" + content;
  await app.vault.modify(file, newContent);
  return `Content appended to: ${path}`;
}

async function insertAtLine(
  app: App,
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string;
  const line = args.line as number;
  const content = args.content as string;

  if (!path) return "Error: path is required";
  if (!line) return "Error: line is required";
  if (!content) return "Error: content is required";

  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!file || !(file instanceof TFile)) {
    return `Error: File not found: ${path}`;
  }

  const existing = await app.vault.read(file);
  const lines = existing.split("\n");
  const insertIdx = Math.max(0, Math.min(line - 1, lines.length));
  lines.splice(insertIdx, 0, content);
  await app.vault.modify(file, lines.join("\n"));

  return `Content inserted at line ${line} in: ${path}`;
}
