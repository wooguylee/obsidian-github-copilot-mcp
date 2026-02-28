import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
    ...obsidianmd.configs.recommended,
    {
        files: ["src/**/*.ts", "src/**/*.tsx"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // TypeScript compiler handles undefined globals better than eslint
            "no-undef": "off",
        },
    },
    {
        ignores: ["main.js", "node_modules/**", "esbuild.config.mjs"],
    },
);
