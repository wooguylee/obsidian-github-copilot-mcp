// ============================================================
// Chat View - Obsidian ItemView with React + Styled Components
// ============================================================

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { createRoot, Root } from "react-dom/client";
import styled, { createGlobalStyle, keyframes } from "styled-components";
import {
    App,
    Component,
    ItemView,
    MarkdownRenderer,
    Notice,
    WorkspaceLeaf,
} from "obsidian";
import type CopilotMCPPlugin from "../main";
import type { ConversationMessage, ToolCallResult } from "../types";
import { AVAILABLE_MODELS } from "../types";
import { fetchDeviceCode, fetchPAT, fetchToken } from "../copilot/api";
import { runChatEngine } from "../copilot/engine";

export const CHAT_VIEW_TYPE = "github-copilot-mcp-chat";

// ============================================================
// Obsidian ItemView Wrapper
// ============================================================

export class ChatView extends ItemView {
    plugin: CopilotMCPPlugin;
    private _root: Root | null = null;
    private _abortController: AbortController | null = null;
    /** Registered by the React component — call to reset the conversation */
    public newChatCallback: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: CopilotMCPPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return CHAT_VIEW_TYPE;
    }
    getDisplayText() {
        return "Copilot MCP Chat";
    }
    getIcon() {
        return "message-square";
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("copilot-mcp-container");

        this._root = createRoot(container);
        this._root.render(
            <CopilotProvider
                app={this.app}
                plugin={this.plugin}
                component={this}
            >
                <ChatApp />
            </CopilotProvider>,
        );
    }

    async onClose() {
        this._abortController?.abort();
        this._root?.unmount();
        this._root = null;
    }
}

// ============================================================
// Context
// ============================================================

interface CopilotContextValue {
    app: App;
    plugin: CopilotMCPPlugin;
    component: Component;
}

const CopilotCtx = createContext<CopilotContextValue>(null!);
const useCopilot = () => useContext(CopilotCtx);

function CopilotProvider({
    app,
    plugin,
    component,
    children,
}: CopilotContextValue & { children: React.ReactNode }) {
    return (
        <CopilotCtx.Provider value={{ app, plugin, component }}>
            {children}
        </CopilotCtx.Provider>
    );
}

// ============================================================
// Root App
// ============================================================

function ChatApp() {
    const { plugin } = useCopilot();
    const [isAuthed, setIsAuthed] = useState(!!plugin.settings.authState.pat);

    const handleSignIn = useCallback(() => setIsAuthed(true), []);
    const handleSignOut = useCallback(() => setIsAuthed(false), []);

    return isAuthed ? (
        <ChatMainView onSignOut={handleSignOut} />
    ) : (
        <AuthView onSignIn={handleSignIn} />
    );
}

// ============================================================
// Auth View
// ============================================================

function AuthView({ onSignIn }: { onSignIn: () => void }) {
    const { plugin } = useCopilot();
    const [btnText, setBtnText] = useState("Sign in with GitHub");
    const [btnDisabled, setBtnDisabled] = useState(false);
    const [step, setStep] = useState<"idle" | "code" | "confirming">("idle");
    const [deviceInfo, setDeviceInfo] = useState<{
        user_code: string;
        verification_uri: string;
        device_code: string;
    } | null>(null);
    const [confirmText, setConfirmText] = useState("I've entered the code");
    const [confirmDisabled, setConfirmDisabled] = useState(false);

    const handleSignIn = async () => {
        try {
            setBtnDisabled(true);
            setBtnText("Getting device code...");
            const dc = await fetchDeviceCode();
            setDeviceInfo(dc);
            setStep("code");
        } catch (err) {
            new Notice(
                `Error: ${err instanceof Error ? err.message : String(err)}`,
            );
            setBtnDisabled(false);
            setBtnText("Sign in with GitHub");
        }
    };

    const handleCopy = () => {
        if (!deviceInfo) return;
        navigator.clipboard.writeText(deviceInfo.user_code);
        window.open(deviceInfo.verification_uri, "_blank");
        new Notice("Code copied! Paste it on GitHub.");
    };

    const handleConfirm = async () => {
        if (!deviceInfo) return;
        try {
            setConfirmDisabled(true);
            setConfirmText("Authenticating...");

            const pat = await fetchPAT(deviceInfo.device_code);
            if (!pat.access_token) {
                new Notice(
                    "Authentication not yet complete. Please enter the code on GitHub first.",
                );
                setConfirmDisabled(false);
                setConfirmText("I've entered the code");
                return;
            }

            const tokenResp = await fetchToken(pat.access_token);
            plugin.settings.authState = {
                deviceCode: deviceInfo.device_code,
                pat: pat.access_token,
                accessToken: {
                    token: tokenResp.token,
                    expiresAt: tokenResp.expires_at,
                },
            };
            await plugin.saveSettings();
            new Notice("Successfully signed in to GitHub Copilot!");
            onSignIn();
        } catch (err) {
            new Notice(
                `Auth error: ${err instanceof Error ? err.message : String(err)}`,
            );
            setConfirmDisabled(false);
            setConfirmText("I've entered the code");
        }
    };

    return (
        <AuthContainer>
            <GlobalStyles />
            <h3>GitHub Copilot MCP</h3>
            <p>Sign in with your GitHub account to use Copilot models.</p>

            <PrimaryButton onClick={handleSignIn} disabled={btnDisabled}>
                {btnText}
            </PrimaryButton>

            {step === "code" && deviceInfo && (
                <AuthStatus>
                    <p>Enter this code on GitHub:</p>
                    <DeviceCodeBox>
                        <code>{deviceInfo.user_code}</code>
                    </DeviceCodeBox>
                    <PrimaryButton onClick={handleCopy}>
                        Copy code &amp; open GitHub
                    </PrimaryButton>
                    <AuthHint>
                        After entering the code on GitHub, click below:
                    </AuthHint>
                    <button onClick={handleConfirm} disabled={confirmDisabled}>
                        {confirmText}
                    </button>
                </AuthStatus>
            )}
        </AuthContainer>
    );
}

// ============================================================
// Chat Main View
// ============================================================

interface LiveToolCall {
    toolName: string;
    args: Record<string, unknown>;
    status: string;
}

function ChatMainView({ onSignOut }: { onSignOut: () => void }) {
    const { app, plugin, component } = useCopilot();
    const [conversationHistory, setConversationHistory] = useState<
        ConversationMessage[]
    >([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [streamingContent, setStreamingContent] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const streamingAccumRef = useRef("");

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [conversationHistory, streamingContent, liveToolCalls, scrollToBottom]);

    const handleNewChat = () => {
        setConversationHistory([]);
        setStreamingContent("");
        setIsStreaming(false);
        setLiveToolCalls([]);
    };

    // Expose handleNewChat to the ItemView class (used by main.ts "New Chat" command)
    useEffect(() => {
        (component as ChatView).newChatCallback = handleNewChat;
        return () => {
            (component as ChatView).newChatCallback = null;
        };
    });

    const handleSignOut = async () => {
        plugin.settings.authState = {
            deviceCode: null,
            pat: null,
            accessToken: { token: null, expiresAt: null },
        };
        await plugin.saveSettings();
        setConversationHistory([]);
        new Notice("Signed out from GitHub Copilot");
        onSignOut();
    };

    const handleModelChange = async (
        e: React.ChangeEvent<HTMLSelectElement>,
    ) => {
        const selected = AVAILABLE_MODELS.find(
            (m) => m.value === e.target.value,
        );
        if (selected) {
            plugin.settings.selectedModel = selected;
            await plugin.saveSettings();
        }
    };

    const handleSend = useCallback(
        async (text?: string) => {
            const msg = (text ?? inputValue).trim();
            if (!msg || isProcessing) return;

            setIsProcessing(true);
            setInputValue("");
            streamingAccumRef.current = "";

            abortRef.current = new AbortController();

            const toolResultsMap = new Map<string, ToolCallResult>();
            let expectNextStream = false;

            try {
                const newMessages = await runChatEngine(
                    conversationHistory,
                    msg,
                    {
                        app,
                        authState: plugin.settings.authState,
                        model: plugin.settings.selectedModel,
                        systemPrompt: plugin.settings.systemPrompt,
                        maxIterations: plugin.settings.maxAutoIterations,
                        enableTools: plugin.settings.enableTools,
                        onAuthUpdate: async (auth) => {
                            Object.assign(plugin.settings.authState, auth);
                            await plugin.saveSettings();
                        },
                        onContentDelta: (delta) => {
                            streamingAccumRef.current += delta;
                            setStreamingContent(streamingAccumRef.current);
                            setIsStreaming(true);
                        },
                        onMessage: (msgs) => {
                            for (const m of msgs) {
                                if (m.role === "assistant" && m.toolCalls) {
                                    m.toolResults = m.toolCalls
                                        .map((tc) => toolResultsMap.get(tc.id))
                                        .filter(Boolean) as ToolCallResult[];
                                }
                            }

                            setConversationHistory((prev) => {
                                const combined = [...prev];
                                for (const m of msgs) {
                                    if (!combined.find((x) => x === m))
                                        combined.push(m);
                                }
                                return combined;
                            });

                            // Reset streaming for next iteration
                            streamingAccumRef.current = "";
                            setStreamingContent("");
                            setIsStreaming(false);
                            setLiveToolCalls([]);

                            // If last msg is a tool result, a new stream is coming
                            const lastMsg = msgs[msgs.length - 1];
                            if (lastMsg?.role === "tool") {
                                expectNextStream = true;
                                setIsStreaming(true);
                            }
                        },
                        onToolCall: (result) => {
                            toolResultsMap.set(result.toolCallId, result);
                            const statusText =
                                result.status === "running"
                                    ? "Running..."
                                    : result.status === "success"
                                      ? "Done"
                                      : `Error: ${result.error}`;
                            const key =
                                result.toolName +
                                ":" +
                                JSON.stringify(result.args);
                            setLiveToolCalls((prev) => {
                                const existing = prev.findIndex(
                                    (tc) =>
                                        tc.toolName +
                                            ":" +
                                            JSON.stringify(tc.args) ===
                                        key,
                                );
                                if (existing >= 0) {
                                    const updated = [...prev];
                                    updated[existing] = {
                                        ...updated[existing],
                                        status: statusText,
                                    };
                                    return updated;
                                }
                                return [
                                    ...prev,
                                    {
                                        toolName: result.toolName,
                                        args: result.args,
                                        status: statusText,
                                    },
                                ];
                            });
                        },
                        onError: (err) => new Notice(`Copilot error: ${err}`),
                        onDebug: (debugMsg) => {
                            if (plugin.settings.debug)
                                console.log(`[CopilotMCP] ${debugMsg}`);
                        },
                        abortSignal: abortRef.current.signal,
                    },
                );

                // Attach final tool results
                for (const m of newMessages) {
                    if (m.role === "assistant" && m.toolCalls) {
                        m.toolResults = m.toolCalls
                            .map((tc) => toolResultsMap.get(tc.id))
                            .filter(Boolean) as ToolCallResult[];
                    }
                }

                setConversationHistory((prev) => {
                    const ids = new Set(prev.map((_, i) => i));
                    return [
                        ...prev,
                        ...newMessages.filter((m) => !prev.includes(m)),
                    ];
                });
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                if (!errMsg.includes("abort")) new Notice(`Error: ${errMsg}`);
            }

            streamingAccumRef.current = "";
            setStreamingContent("");
            setIsStreaming(false);
            setLiveToolCalls([]);
            setIsProcessing(false);
            abortRef.current = null;
        },
        [app, plugin, conversationHistory, inputValue, isProcessing],
    );

    const handleStop = () => {
        abortRef.current?.abort();
        streamingAccumRef.current = "";
        setStreamingContent("");
        setIsStreaming(false);
        setLiveToolCalls([]);
        setIsProcessing(false);
        abortRef.current = null;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            <GlobalStyles />
            <Header>
                <ModelSelect
                    className="dropdown"
                    value={plugin.settings.selectedModel.value}
                    onChange={handleModelChange}
                >
                    {AVAILABLE_MODELS.map((m) => (
                        <option key={m.value} value={m.value}>
                            {m.label}
                        </option>
                    ))}
                </ModelSelect>

                <IconButton
                    aria-label="New chat"
                    onClick={handleNewChat}
                    dangerouslySetInnerHTML={{ __html: SVG_NEW_CHAT }}
                />
                <IconButton
                    aria-label="Sign out"
                    onClick={handleSignOut}
                    dangerouslySetInnerHTML={{ __html: SVG_SIGN_OUT }}
                />
            </Header>

            <MessagesArea>
                {conversationHistory.length === 0 &&
                !isStreaming &&
                liveToolCalls.length === 0 ? (
                    <EmptyState onSelectExample={(q) => handleSend(q)} />
                ) : (
                    <>
                        {conversationHistory.map((msg, i) => (
                            <MessageItem
                                key={i}
                                msg={msg}
                                app={app}
                                component={component}
                            />
                        ))}

                        {liveToolCalls.length > 0 && (
                            <LiveToolCallsBlock toolCalls={liveToolCalls} />
                        )}

                        {isStreaming && (
                            <StreamingMessageBlock content={streamingContent} />
                        )}
                    </>
                )}
                <div ref={messagesEndRef} />
            </MessagesArea>

            <InputArea>
                <InputTextarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Copilot anything... (Shift+Enter for new line)"
                    rows={3}
                    disabled={false}
                />
                <InputActions>
                    {isProcessing ? (
                        <StopButton onClick={handleStop}>Stop</StopButton>
                    ) : (
                        <SendButton
                            className="mod-cta"
                            onClick={() => handleSend()}
                        >
                            Send
                        </SendButton>
                    )}
                </InputActions>
            </InputArea>
        </>
    );
}

// ============================================================
// Empty State
// ============================================================

const EXAMPLE_QUERIES = [
    "List all files in my vault",
    "Summarize the content of my daily notes",
    "Create a new note with a project template",
    "Find all notes mentioning a specific topic",
    "Edit a specific section in a note",
];

function EmptyState({
    onSelectExample,
}: {
    onSelectExample: (q: string) => void;
}) {
    return (
        <EmptyContainer>
            <h3>GitHub Copilot MCP</h3>
            <p>
                Ask me anything! I can read, write, edit, and search files in
                your vault.
            </p>
            <ExamplesGrid>
                {EXAMPLE_QUERIES.map((q) => (
                    <ExampleButton key={q} onClick={() => onSelectExample(q)}>
                        {q}
                    </ExampleButton>
                ))}
            </ExamplesGrid>
        </EmptyContainer>
    );
}

// ============================================================
// Message Item
// ============================================================

function MessageItem({
    msg,
    app,
    component,
}: {
    msg: ConversationMessage;
    app: App;
    component: Component;
}) {
    if (msg.role === "tool") return null;

    return (
        <>
            <MessageRole>{msg.role === "user" ? "You" : "Copilot"}</MessageRole>
            <MessageBubble $role={msg.role}>
                {msg.role === "user" && (
                    <MessageContent>{msg.content}</MessageContent>
                )}
                {msg.role === "assistant" && (
                    <>
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                            <ToolCallsBlock>
                                {msg.toolCalls.map((tc, i) => {
                                    const toolResult = msg.toolResults?.find(
                                        (r) => r.toolCallId === tc.id,
                                    );
                                    return (
                                        <ToolCallItem key={i}>
                                            <ToolCallHeader>
                                                <ToolName>
                                                    {tc.function.name}
                                                </ToolName>
                                            </ToolCallHeader>
                                            <ToolArgs>
                                                <code>
                                                    {JSON.stringify(
                                                        tryParseArgs(
                                                            tc.function
                                                                .arguments,
                                                        ),
                                                        null,
                                                        2,
                                                    )}
                                                </code>
                                            </ToolArgs>
                                            {toolResult && (
                                                <ToolResultBlock
                                                    result={toolResult}
                                                />
                                            )}
                                        </ToolCallItem>
                                    );
                                })}
                            </ToolCallsBlock>
                        )}
                        {msg.content && (
                            <MarkdownContent
                                content={msg.content}
                                app={app}
                                component={component}
                            />
                        )}
                    </>
                )}
            </MessageBubble>
        </>
    );
}

// ============================================================
// Markdown Content (uses Obsidian MarkdownRenderer)
// ============================================================

function MarkdownContent({
    content,
    app,
    component,
}: {
    content: string;
    app: App;
    component: Component;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;
        ref.current.innerHTML = "";
        MarkdownRenderer.render(app, content, ref.current, "", component);
    }, [content, app, component]);

    return <MessageContent ref={ref} />;
}

// ============================================================
// Streaming Message
// ============================================================

function StreamingMessageBlock({ content }: { content: string }) {
    return (
        <>
            <MessageRole>Copilot</MessageRole>
            <MessageBubble $role="assistant">
                <StreamingContent>{content || " "}</StreamingContent>
            </MessageBubble>
        </>
    );
}

// ============================================================
// Tool Call Blocks
// ============================================================

function ToolResultBlock({ result }: { result: ToolCallResult }) {
    if (result.status === "success" && result.result) {
        const text = result.result;
        return (
            <ToolResult $status="success">
                {text.length > 500 ? (
                    <details>
                        <summary>Result ({text.length} chars)</summary>
                        <pre>{text}</pre>
                    </details>
                ) : (
                    <pre>{text}</pre>
                )}
            </ToolResult>
        );
    }
    if (result.status === "error") {
        return (
            <ToolResult $status="error">
                <pre>Error: {result.error}</pre>
            </ToolResult>
        );
    }
    if (result.status === "running") {
        return (
            <ToolResult $status="running">
                <RunningSpan>Running...</RunningSpan>
            </ToolResult>
        );
    }
    return null;
}

function LiveToolCallsBlock({ toolCalls }: { toolCalls: LiveToolCall[] }) {
    return (
        <ToolCallsBlock>
            {toolCalls.map((tc, i) => (
                <ToolCallItem key={i}>
                    <ToolCallHeader>
                        <ToolName>{tc.toolName}</ToolName>
                        <ToolStatus>{tc.status}</ToolStatus>
                    </ToolCallHeader>
                    <ToolArgs>
                        <code>{JSON.stringify(tc.args, null, 2)}</code>
                    </ToolArgs>
                </ToolCallItem>
            ))}
        </ToolCallsBlock>
    );
}

// ============================================================
// Helpers
// ============================================================

function tryParseArgs(args?: string): unknown {
    try {
        return JSON.parse(args || "{}");
    } catch {
        return {};
    }
}

const SVG_NEW_CHAT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
const SVG_SIGN_OUT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;

// ============================================================
// Styled Components
// ============================================================

const blinkAnimation = keyframes`
  50% { opacity: 0; }
`;

const GlobalStyles = createGlobalStyle`
  .copilot-mcp-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  /* Markdown rendered content styles */
  .copilot-mcp-md p { margin: 4px 0; }
  .copilot-mcp-md pre {
    background: var(--background-primary-alt);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 12px;
  }
  .copilot-mcp-md code { font-size: 12px; }
`;

/* Auth */
const AuthContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 20px;
    text-align: center;
    gap: 12px;

    h3 {
        margin-bottom: 8px;
    }
`;

const AuthStatus = styled.div`
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
`;

const DeviceCodeBox = styled.div`
    background: var(--background-modifier-border);
    padding: 12px 24px;
    border-radius: 8px;
    margin: 8px 0;

    code {
        font-size: 24px;
        font-weight: bold;
        letter-spacing: 4px;
        color: var(--text-accent);
    }
`;

const AuthHint = styled.p`
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 8px;
`;

const PrimaryButton = styled.button`
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 14px;
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    &:hover:not(:disabled) {
        opacity: 0.9;
    }
`;

/* Header */
const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
`;

const ModelSelect = styled.select`
    flex: 1;
    font-size: 13px;
`;

const IconButton = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--text-muted);
    display: flex;
    align-items: center;

    &:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }
`;

/* Messages */
const MessagesArea = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const EmptyContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--text-muted);
    padding: 20px;

    h3 {
        color: var(--text-normal);
        margin-bottom: 8px;
    }
`;

const ExamplesGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 16px;
    width: 100%;
    max-width: 300px;
`;

const ExampleButton = styled.button`
    background: var(--background-modifier-border);
    border: 1px solid var(--background-modifier-border-hover);
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
    color: var(--text-normal);
    transition: background 0.15s;

    &:hover {
        background: var(--background-modifier-hover);
    }
`;

const MessageRole = styled.div`
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 12px;
    margin-bottom: 2px;
`;

const MessageBubble = styled.div<{ $role: string }>`
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.5;
    background: ${({ $role }) =>
        $role === "user" ? "var(--background-modifier-border)" : "transparent"};
`;

const MessageContent = styled.div`
    word-wrap: break-word;
    overflow-wrap: break-word;
`;

/* Tool calls */
const ToolCallsBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
`;

const ToolCallItem = styled.div`
    background: var(--background-primary-alt);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 8px;
    font-size: 12px;
`;

const ToolCallHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
`;

const ToolName = styled.span`
    font-weight: 600;
    color: var(--text-accent);
    font-family: var(--font-monospace);
    font-size: 12px;
`;

const ToolStatus = styled.span`
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
    margin-left: auto;
`;

const ToolArgs = styled.div`
    code {
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
`;

const ToolResult = styled.div<{ $status: string }>`
    margin-top: 4px;
    border-top: 1px solid var(--background-modifier-border);
    padding-top: 4px;

    pre {
        font-size: 11px;
        margin: 0;
        padding: 4px 6px;
        background: var(--background-primary);
        border-radius: 3px;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 200px;
        overflow-y: auto;
        color: ${({ $status }) =>
            $status === "error" ? "var(--text-error)" : "var(--text-normal)"};
    }
`;

const RunningSpan = styled.span`
    color: var(--text-accent);
    font-style: italic;
`;

/* Streaming */
const StreamingContent = styled.div`
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
    color: var(--text-normal);

    &::after {
        content: "\\25AE";
        animation: ${blinkAnimation} 1s step-end infinite;
        color: var(--text-accent);
        margin-left: 2px;
    }
`;

/* Input */
const InputArea = styled.div`
    border-top: 1px solid var(--background-modifier-border);
    padding: 8px 12px;
    flex-shrink: 0;
`;

const InputTextarea = styled.textarea`
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
    box-sizing: border-box;

    &:focus {
        border-color: var(--interactive-accent);
    }
`;

const InputActions = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
`;

const SendButton = styled.button`
    font-size: 13px;
    padding: 4px 16px;
`;

const StopButton = styled.button`
    font-size: 13px;
    padding: 4px 16px;
    background: var(--background-modifier-error);
    color: var(--text-error);
    border: 1px solid
        var(--background-modifier-error-hover, var(--background-modifier-error));
    border-radius: 4px;
    cursor: pointer;
`;
