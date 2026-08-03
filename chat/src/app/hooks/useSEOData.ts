import { useEffect } from 'react';
import { useSEO } from '../context/SEOContext';

interface SEOConfig {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
}

export const useSEOData = (config: SEOConfig, path?: string) => {
  const { updateSEO } = useSEO();

  useEffect(() => {
    const baseUrl = window.location.origin;
    const currentPath = path || window.location.pathname;
    
    updateSEO({
      title: config.title,
      description: config.description,
      keywords: config.keywords,
      ogTitle: config.title,
      ogDescription: config.description,
      ogImage: config.ogImage ? `${baseUrl}${config.ogImage}` : undefined,
      canonicalUrl: `${baseUrl}${currentPath}`
    });
  }, [config, path, updateSEO]);
};

// SEO configurations for each page
export const seoConfigs = {
  home: {
    title: 'Chrome Built-in AI — on-device AI APIs in your browser | window.ai',
    description: 'The window.ai showcase: run Gemini Nano and Chrome\'s built-in AI APIs entirely on-device — prompt, summarize, translate, write, embed, and Model Context Protocol tools. Live interactive demos and developer docs, no server, no API key.',
    keywords: 'window.ai, Chrome built-in AI, Gemini Nano, on-device AI, browser AI APIs, LanguageModel, Prompt API, Summarizer, Translator, Writer, Rewriter, embeddings, Model Context Protocol, MCP'
  },
  // /status — the capabilities / browser-status page (live availability checks).
  // Carries the keyword-rich Chrome built-in AI / Gemini Nano status copy that
  // previously lived on '/'. Keep in sync with any prerender entry for /status.
  checkBrowser: {
    title: 'Chrome AI APIs - Built-in AI capabilities for modern web applications',
    description: 'Explore Chrome\'s experimental AI APIs including Chat (Gemini Nano), Summarization, Translation, and Writer/Rewriter. Interactive demos and comprehensive documentation for developers.',
    keywords: 'Chrome AI, Gemini Nano, AI APIs, web development, machine learning, browser AI, chat API, translation API, summarization API, writer API'
  },
  chat: {
    title: 'AI Chat - Interactive conversations with Gemini Nano | Chrome AI APIs',
    description: 'Chat with Gemini Nano directly in your browser. Experience on-device AI conversations with streaming responses, system message configuration, and advanced settings.',
    keywords: 'AI chat, Gemini Nano, conversational AI, browser AI, on-device AI, streaming chat, prompt API'
  },
  toolCalling: {
    title: 'Tool Calling API - Function calling with Chrome AI | Chrome AI APIs',
    description: 'Explore Chrome\'s Tool Calling API for function calling and structured interactions with AI. Learn how to integrate external tools and services with browser-based AI.',
    keywords: 'tool calling, function calling, Chrome AI, API integration, structured AI, browser tools'
  },
  summary: {
    title: 'Text Summarization API - AI-powered content summarization | Chrome AI APIs',
    description: 'Generate intelligent summaries with Chrome\'s Summarization API. Multiple formats including key-points, TL;DR, headlines, and teasers with customizable length options.',
    keywords: 'text summarization, AI summarization, content summarization, key points, TL;DR, headlines, browser AI'
  },
  translate: {
    title: 'Translation & Language Detection APIs - Multi-language AI translation | Chrome AI APIs',
    description: 'On-device language detection and translation between multiple language pairs. Features automatic language detection, streaming translation, and downloadable language packs.',
    keywords: 'language translation, language detection, multi-language, on-device translation, browser translation, AI translation'
  },
  // Must match prerender-react.js seoConfigs['/live-translate'] verbatim — single source of truth.
  liveTranslate: {
    title: 'Live Voice Translation - Chrome Speech + Translator demo | Chrome AI APIs',
    description: 'Speak live in your browser and watch your words translated simultaneously into two languages. Combines the Web Speech API with Chrome\'s on-device Translator API — no server, no upload.',
    keywords: 'live translation, voice translation, Web Speech API, speech recognition, real-time translation, Chrome AI, on-device translation, dual translation, simultaneous translation'
  },
  // Must match prerender-react.js seoConfigs['/live-translate/docs'] verbatim.
  liveTranslateDocs: {
    title: 'Live Voice Translation Docs — Web Speech + Translator API guide | Chrome AI APIs',
    description: 'Compose the Web Speech API with Chrome\'s on-device Translator API to build live, dual-language voice translation in the browser — no server, no upload.',
    keywords: 'Live Voice Translation docs, Web Speech API, SpeechRecognition, Translator API, dual translation, on-device translation, BCP 47, interim results, fan-out translation'
  },
  writer: {
    title: 'Writer & Rewriter APIs - AI-powered content creation | Chrome AI APIs',
    description: 'AI-powered content creation and enhancement. Writer creates new content from prompts, while Rewriter transforms existing text with tone, format, and length adjustments.',
    keywords: 'AI writing, content creation, text rewriting, writing assistant, content enhancement, AI writer, text generation'
  },
  webmcp: {
    title: 'WebMCP Recipe Workbench - navigator.modelContext demo | Chrome AI APIs',
    description: 'A page-side WebMCP demo using navigator.modelContext in Chrome 146+ Canary. Browse seeded recipes from IndexedDB and (in later phases) drive them with native browser tools — no MCP server required.',
    keywords: 'WebMCP, navigator.modelContext, Model Context Protocol, page-side tools, Chrome 146, recipe workbench, browser AI tools, IndexedDB demo'
  },
  // Must match prerender-react.js:357-367 verbatim — single source of truth
  // is the prerender file (crawler parity). See Phase 3 D-08 + D-12.
  webmcpDocs: {
    title: 'WebMCP API Documentation - Recipe Workbench guide | Chrome AI APIs',
    description: 'Documentation for the WebMCP Recipe Workbench demo. Walks through navigator.modelContext, registerTool, and the page-side tool descriptor.',
    keywords: 'WebMCP documentation, navigator.modelContext API, registerTool, page-side tools docs, JSON Schema tools'
  },
  // Must match prerender-react.js seoConfigs['/generative-ui'] verbatim.
  // See Phase 3 D-08 + D-12 — prerender drift caused a Phase 3 hotfix.
  generativeUI: {
    title: 'Generative UI — MCP Apps demo with on-device recipe cards | Chrome AI APIs',
    description: 'A Chrome 146 Canary demo of the MCP Apps pattern: the in-page chat calls searchRecipes, an interactive recipe-card carousel renders in the chat bubble via a sandboxed iframe, and clicking Pick updates the meal-plan column live — all on-device, no network.',
    keywords: 'MCP Apps, generative UI, navigator.modelContext, Chrome AI, on-device AI, recipe cards, sandboxed iframe, WebMCP, SEP-1865, meal plan'
  },
  // Must match prerender-react.js seoConfigs['/generative-ui/docs'] verbatim.
  // See Phase 3 D-08 + D-12 — prerender drift caused a Phase 3 hotfix.
  generativeUIDocs: {
    title: 'Generative UI Docs — MCP Apps wire format + bidirectional pattern | Chrome AI APIs',
    description: 'How to register UI-returning tools and hidden helpers with navigator.modelContext, sandboxed iframes, and JSON-RPC postMessage bridge — SEP-1865 reference.',
    keywords: 'MCP Apps documentation, SEP-1865, navigator.modelContext, registerTool, _meta.ui.resourceUri, sandboxed iframe, JSON-RPC postMessage, visibility annotation, hidden helpers, recipe carousel'
  },
  // Must match prerender-react.js seoConfigs['/proofreader'] verbatim — Phase 12 grep -F audits.
  proofreader: {
    title: 'Proofreader — Chrome on-device grammar + spelling correction | Chrome AI APIs',
    description: 'Gemini Nano proofreads your text on-device with grammar, spelling, capitalization, and punctuation corrections. Three output styles, five languages, zero network.',
    keywords: 'Proofreader API, Gemini Nano, on-device grammar, spelling correction, Chrome AI, ProofreaderCorrection, correctionExplanationLanguage, LoRA adapter'
  },
  // Must match prerender-react.js seoConfigs['/proofreader/docs'] verbatim — Phase 12 grep -F audits.
  proofreaderDocs: {
    title: 'Proofreader API Docs — surface, corrections shape, language support | Chrome AI APIs',
    description: 'Gemini Nano proofreads your text on-device with grammar, spelling, capitalization, and punctuation corrections. Three output styles, five languages, zero network.',
    keywords: 'Proofreader API docs, ProofreaderCorrection, ProofreadResult, correctionExplanationLanguage, expectedInputLanguages, Chrome 146 Canary, on-device AI'
  },
  // Must match prerender-react.js seoConfigs['/multimodal'] verbatim — Phase 12 grep -F audits.
  multimodal: {
    title: 'Multimodal — Ask Gemini Nano about images on-device | Chrome AI APIs',
    description: 'Drag, paste, or capture an image — Gemini Nano answers your questions about it on-device with zero network. Chrome 148+ stable or flag-gated Canary.',
    keywords: 'Multimodal AI, Gemini Nano, image input, LanguageModel, expectedInputs, on-device AI, Chrome 148, drag and drop image, clipboard paste, WebGPU'
  },
  // Must match prerender-react.js seoConfigs['/multimodal/docs'] verbatim — Phase 12 grep -F audits.
  multimodalDocs: {
    title: 'Multimodal API Docs — expectedInputs, image types, webcam-live pattern | Chrome AI APIs',
    description: 'Drag, paste, or capture an image — Gemini Nano answers your questions about it on-device with zero network. Chrome 148+ stable or flag-gated Canary.',
    keywords: 'Multimodal API docs, expectedInputs, image types, webcam-live, LanguageModel, promptStreaming, content parts, ImageBitmap, Chrome 148'
  },
  // Must match prerender-react.js seoConfigs['/mcp-client'] verbatim — single source of truth.
  mcpClient: {
    title: 'MCP Client — Chat with a remote MCP server via the built-in LLM | Chrome AI APIs',
    description: 'Connect to a remote Model Context Protocol server over Streamable HTTP, browse its tools, and drive them from Chrome\'s built-in LLM (Gemini Nano) — a manual responseFormat agent loop, no server-side model.',
    keywords: 'MCP client, Model Context Protocol, Streamable HTTP, remote MCP server, Gemini Nano, built-in LLM, agent loop, bearer token, browser MCP, tool calling'
  },
  // Must match prerender-react.js seoConfigs['/mcp-client/docs'] verbatim.
  mcpClientDocs: {
    title: 'MCP Client API Docs — Streamable HTTP transport + agent loop | Chrome AI APIs',
    description: 'How the browser MCP client connects over Streamable HTTP with a bearer token, lists tools, and dispatches them from a built-in-LLM responseFormat agent loop.',
    keywords: 'MCP client docs, Model Context Protocol, StreamableHTTPClientTransport, listTools, callTool, CORS, bearer token, responseFormat agent loop, Gemini Nano'
  },
  // Must match prerender-react.js seoConfigs['/embeddings'] verbatim — single source of truth.
  embeddings: {
    title: 'Embeddings — On-device semantic vectors with SemanticEmbedder | Chrome AI APIs',
    description: 'Turn text into on-device semantic vectors (embeddinggemma-300m) with Chrome\'s SemanticEmbedder — cross-lingual search and clustering, no backend. Chrome 152+ Canary, desktop only.',
    keywords: 'Embeddings API, SemanticEmbedder, embeddinggemma-300m, semantic vectors, cross-lingual search, clustering, cosine similarity, Matryoshka, on-device AI, Chrome 152'
  },
  // Must match prerender-react.js seoConfigs['/embeddings/docs'] verbatim — single source of truth.
  embeddingsDocs: {
    title: 'Embeddings API Docs — SemanticEmbedder surface, taskType, Matryoshka dims | Chrome AI APIs',
    description: 'How to use Chrome\'s SemanticEmbedder: availability, create, embed with taskType, and Matryoshka dimension truncation for on-device similarity and clustering. Chrome 152+ Canary, desktop only.',
    keywords: 'Embeddings API docs, SemanticEmbedder, embeddinggemma-300m, taskType, retrieval-query, retrieval-document, Matryoshka, cosine similarity, Float32Array, Chrome 152'
  },
  // Must match prerender-react.js seoConfigs['/observability'] verbatim — single source of truth.
  observability: {
    title: 'Observability — Trace & monitor Chrome built-in on-device AI | Chrome AI APIs',
    description: 'Trace, log, and monitor Chrome\'s built-in on-device AI (Gemini Nano) entirely client-side — latency, TTFT, context usage, and errors. See a live trace, then learn how to add logging and tracing to your own app. No backend.',
    keywords: 'AI observability, tracing, logging, OpenTelemetry gen_ai, Sentry, Langfuse, on-device AI, Gemini Nano, LanguageModel, TTFT, token usage, Chrome built-in AI'
  },
  // Must match prerender-react.js seoConfigs['/observability/docs'] verbatim — single source of truth.
  observabilityDocs: {
    title: 'Observability API Docs — logging & tracing for on-device AI | Chrome AI APIs',
    description: 'How to add logging and tracing to Chrome\'s built-in AI: capture latency, TTFT, contextUsage, availability, and errors, then ship to OpenTelemetry, Sentry, or Langfuse. Framework-agnostic, no backend required.',
    keywords: 'observability docs, tracing, logging, OpenTelemetry gen_ai, Sentry, Langfuse, contextUsage, TTFT, downloadprogress, availability, Gemini Nano, Chrome built-in AI'
  },
  // Must match prerender-react.js seoConfigs['/evaluation'] verbatim — single source of truth.
  evaluation: {
    title: 'Evaluation — Test on-device AI answer quality with a stability rate | Chrome AI APIs',
    description: 'Evaluate Chrome\'s built-in on-device AI (Gemini Nano): golden datasets, rule-based checks, LLM-as-judge, and a 5–10-run stability rate. Run a live mini-eval in the browser, then wire it into CI with Playwright. No backend.',
    keywords: 'AI evaluation, evals, golden dataset, rule-based eval, LLM-as-judge, stability rate, Playwright, Vitest, CI, on-device AI, Gemini Nano, Chrome built-in AI'
  },
  // Must match prerender-react.js seoConfigs['/evaluation/docs'] verbatim — single source of truth.
  evaluationDocs: {
    title: 'Evaluation API Docs — golden sets, judges, stability rate & CI | Chrome AI APIs',
    description: 'How to evaluate Chrome built-in AI answer quality: build a golden set, score with rule-based checks and an LLM judge, report a stability rate, and run it against window.ai in CI with Playwright. Framework-agnostic.',
    keywords: 'evaluation docs, evals, golden dataset, rule-based scorer, LLM-as-judge, stability rate, Playwright, Vitest, promptfoo, evalite, CI, Gemini Nano, Chrome built-in AI'
  }
} as const;