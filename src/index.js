import { Plugin } from "obsidian";

export default class ObsidianGitHubCopilotMCP extends Plugin {
    async onload() {
        console.log('Plugin loaded');
    }

    onunload() {
        console.log('Plugin unloaded');
    }
}