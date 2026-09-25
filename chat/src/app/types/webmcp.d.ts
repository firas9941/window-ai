// Ambient declarations for the WebMCP API (Chrome 146 Canary, W3C draft Feb 2026).
// Picked up automatically by chat/tsconfig.app.json `include: ["src/**/*.ts"]`.
// DO NOT import this file from a .ts/.tsx — that would convert it to a module
// and break the ambient global augmentations.

declare global {
  interface Document {
    /**
     * The WebMCP entry point (Chrome 150+). Undefined when the user agent does
     * not implement WebMCP or when the page is not a Secure Context.
     *
     * As of Chrome 150 this replaces `navigator.modelContext` (now deprecated):
     * WebMCP tools are per-Document, so the API moved to `document`. Prefer this;
     * feature-detect both via `getModelContext()` in services/modelContext.ts.
     * See https://developer.chrome.com/docs/ai/webmcp/imperative-api
     */
    readonly modelContext?: ModelContext;
  }

  interface Navigator {
    /**
     * @deprecated Deprecated in Chrome 150; will be removed in a future release.
     * Use `document.modelContext` instead (WebMCP tools are per-Document). Kept
     * here only for backward compatibility on Chrome 146–149. Access via
     * `getModelContext()` (services/modelContext.ts), which prefers `document`.
     */
    readonly modelContext?: ModelContext;
  }

  interface ModelContext {
    /**
     * Registers a single tool with the user agent without removing others.
     * Pass an `AbortSignal` via `options` to deregister the tool.
     *
     * NOTE: the spec return type is `void`, but Chrome's implementation returns a
     * Promise bound to the registration lifetime that REJECTS with `AbortError`
     * when the signal aborts. Prefer `registerToolSafely()` in
     * services/modelContext.ts, which swallows that intentional teardown rejection
     * instead of letting it surface as an uncaught promise rejection.
     */
    registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): void;
    /**
     * Removes a previously registered tool by name (Chrome 150+). On older
     * builds without this method, deregister via the `AbortSignal` passed to
     * `registerTool` instead — hence the optional signature.
     */
    unregisterTool?(name: string): void;
    /** Replaces the full registered toolset. */
    provideContext(context: object): void;
    /** Removes all registered tools/context (Chrome 150+). */
    clearContext?(): void;
  }

  interface ModelContextRegisterToolOptions {
    signal?: AbortSignal;
    /**
     * Restricts which audiences the tool is exposed to (Chrome 150+ spec).
     * The app-level `visibility` annotation predates this and is still honored
     * by the chat panel's system-prompt filter.
     */
    exposedTo?: string[];
  }

  interface ModelContextTool {
    name: string;
    description: string;
    /** JSON Schema describing the input shape passed to `execute`. */
    inputSchema?: object;
    /**
     * Tool handler. Input is dynamic per-tool (driven by `inputSchema`), so `any`
     * is the spec-correct shape per W3C IDL §4.2.1 — narrow per-tool at the call
     * site in Phase 2.
     */
    execute: (input: any, client?: ModelContextClient) => Promise<unknown> | unknown;
    title?: string;
    annotations?: ModelContextToolAnnotations;
  }

  interface ModelContextToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    /**
     * Controls which audiences can see this tool. Follows the W3C WebMCP draft
     * visibility convention. Tools with `visibility: ['app']` are excluded from
     * the model-visible catalog by the chat panel's system-prompt filter but are
     * still proxied by the iframe→host bridge.
     *
     * Phase 6 GENUI-05: commitRecipeToPlan uses `visibility: ['app']` so the LLM
     * cannot call it directly — only the iframe Pick button can.
     */
    visibility?: string[];
  }

  interface ModelContextClient {
    requestUserInteraction(callback: (...args: any[]) => any): Promise<any>;
  }
}

export {};
