# Obsidian Review Bot - Fix Report

## Overview

ObsidianReviewBot이 플러그인 코드를 자동 스캔한 결과 **Required** 이슈와 **Optional** 이슈가 보고되었습니다.
모든 Required 이슈와 Optional 이슈를 수정 완료하였으며, `eslint-plugin-obsidianmd` 로컬 린트 결과 **에러 0개**를 확인하였습니다.

---

## Required Issues (필수)

### 1. ✅ `fetch` 대신 `requestUrl` 사용 (2건)

| 파일 | 수정 전 | 수정 후 |
|------|---------|---------|
| `src/copilot/api.ts` - `fetchAvailableModels` | `fetch()` 사용 | `requestUrl()` 사용 |
| `src/copilot/api.ts` - `sendChatCompletionStream` | `fetch()` + SSE 스트리밍 | `requestUrl()` + `stream: true` + SSE 파싱 |

> ⚠️ **참고**: `requestUrl`은 응답이 완전히 수신된 후 반환하므로 토큰 단위 실시간 표시는 불가하지만, `stream: true` + SSE 파싱 방식으로 tool call 루프가 정상 동작합니다.

### 2. ✅ UI 텍스트 Sentence case 적용 (12건)

| 파일 | 수정 전 | 수정 후 |
|------|---------|---------|
| `src/main.ts` | `"Open Copilot MCP Chat"` | `"Open chat"` |
| `src/main.ts` | `"New Copilot MCP Chat"` | `"New chat"` |
| `src/ui/ChatView.tsx` | `"Copilot MCP Chat"` (getDisplayText) | `"Chat"` |
| `src/ui/ChatView.tsx` | `"Successfully signed in to GitHub Copilot!"` | `"Successfully signed in!"` |
| `src/ui/ChatView.tsx` | `"Signed out from GitHub Copilot"` | `"Signed out"` |
| `src/ui/SettingsTab.ts` | `"GitHub Copilot MCP Settings"` (h2) | 제거 (중복 헤딩) |
| `src/ui/SettingsTab.ts` | `"System Prompt"` | `"System prompt"` |
| `src/ui/SettingsTab.ts` | `"MCP Vault Tools"` | `"Vault tools"` |
| `src/ui/SettingsTab.ts` | `"Available Vault Tools"` | `"Available vault tools"` |
| `src/ui/SettingsTab.ts` | `"Sign in from Chat panel"` | `"Sign in from chat panel"` |
| `src/ui/SettingsTab.ts` | Description 내 브랜드명 | 일반 텍스트로 변경 |

### 3. ✅ Promise 미처리 (floating promises) 수정 (7건)

모든 미처리 Promise에 `void` 연산자를 적용하거나, async 콜백을 동기 래퍼로 변환:

- `main.ts`: `activateView()` → `void this.activateView()`
- `main.ts`: `revealLeaf()` → `await workspace.revealLeaf(leaf)`
- `ChatView.tsx`: `navigator.clipboard.writeText()` → `void navigator.clipboard.writeText()`
- `ChatView.tsx`: `handleSend()` → `void handleSend()`
- `ChatView.tsx`: `MarkdownRenderer.render()` → `void MarkdownRenderer.render()`

### 4. ✅ void 반환 위치에 Promise 반환 함수 사용 수정 (8건)

- `SettingsTab.ts`: 모든 `onChange`/`onClick` 핸들러를 동기 함수로 변경, `void plugin.saveSettings()` 패턴 적용
- `ChatView.tsx`: `onSelectExample`, `onClick` 등 이벤트 핸들러에서 `void` 래핑

### 5. ✅ `onunload`에서 leaf detach 제거 (1건)

| 파일 | 수정 전 | 수정 후 |
|------|---------|---------|
| `src/main.ts` | `this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE)` | 제거 (Obsidian이 자체 관리) |

### 6. ✅ 불필요한 `async` 제거 (4건)

| 파일 | 메서드 | 수정 |
|------|--------|------|
| `src/main.ts` | `onunload()` | `async` 제거 |
| `src/ui/ChatView.tsx` | `onOpen()` | `async` 제거, `return Promise.resolve()` 반환 |
| `src/ui/ChatView.tsx` | `onClose()` | `async` 제거, `return Promise.resolve()` 반환 |
| `src/mcp/tools.ts` | `listFiles()` | `async` 제거, 반환 타입 `string`으로 변경 |

### 7. ✅ `<style>` 엘리먼트 생성 제거 (1건)

| 수정 전 | 수정 후 |
|---------|---------|
| `main.ts`의 `loadStyles()`에서 `document.createElement("style")` 사용 | `styles.css` 파일 생성 (Obsidian이 자동 로드) |

### 8. ✅ `console.log` → 허용된 메서드로 변경 (7건)

| 파일 | 수정 전 | 수정 후 |
|------|---------|---------|
| `src/ui/ChatView.tsx` | `console.log()` | `console.debug()` |

### 9. ✅ HTML heading → `Setting.setHeading()` 변환 (1건)

| 수정 전 | 수정 후 |
|---------|---------|
| `containerEl.createEl("h2", ...)` / `createEl("h3", ...)` | `new Setting(containerEl).setName("...").setHeading()` |

### 10. ✅ 직접 스타일 설정 제거 (1건)

| 수정 전 | 수정 후 |
|---------|---------|
| `text.inputEl.style.width = "100%"` | `text.inputEl.addClass("copilot-mcp-textarea-full-width")` (CSS 클래스) |

### 11. ✅ Template literal에 `unknown` 타입 사용 (1건)

| 파일 | 수정 전 | 수정 후 |
|------|---------|---------|
| `src/mcp/tools.ts` | `${args.query}` (unknown 타입) | `${String(args.query)}` |

---

## Optional Issues (선택)

### 1. ✅ 미사용 import/변수 제거

| 파일 | 항목 |
|------|------|
| `src/copilot/api.ts` | `ToolCall` import 제거 |
| `src/copilot/engine.ts` | `ToolCall` import 제거, `parseErr` catch 변수 제거 |
| `src/ui/ChatView.tsx` | `expectNextStream` 변수 제거, `ids` 변수 제거 |

### 2. ✅ `Vault.trash()` → `FileManager.trashFile()` 변경

| 파일 | 수정 전 | 수정 후 |
|------|---------|---------|
| `src/mcp/tools.ts` | `app.vault.trash(file, false)` | `app.fileManager.trashFile(file)` |

---

## 추가 작업

### ESLint 설정 추가

`eslint-plugin-obsidianmd`를 프로젝트에 설치하고 `eslint.config.mjs`를 구성하여 로컬에서 동일한 검증이 가능하도록 하였습니다.

**설치된 패키지:**
- `eslint` (devDependency)
- `eslint-plugin-obsidianmd` (devDependency)
- `typescript-eslint` (devDependency)

**설정 파일:** `eslint.config.mjs` (ESLint v9+ flat config)

---

## 변경된 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `styles.css` | 새로 생성 |
| `eslint.config.mjs` | 새로 생성 |
| `src/main.ts` | 수정 |
| `src/copilot/api.ts` | 수정 |
| `src/copilot/engine.ts` | 수정 |
| `src/mcp/tools.ts` | 수정 |
| `src/ui/ChatView.tsx` | 수정 |
| `src/ui/SettingsTab.ts` | 수정 |
| `package.json` / `package-lock.json` | devDependency 추가 |

---

## 검증 결과

- ✅ `npm run build` — 성공 (에러 0개)
- ✅ `npx eslint src/` — 통과 (에러 0개, 경고 0개)
- ✅ VS Code TypeScript 진단 — 에러 0개

---

## 다음 단계

1. 변경사항을 Git에 커밋 & 푸시
2. 봇이 6시간 내에 자동으로 재스캔합니다
3. 새 PR을 열지 마세요 — 기존 PR에서 자동 재검증됩니다
4. 리베이스하지 마세요 — 리뷰어가 승인 후 처리합니다
