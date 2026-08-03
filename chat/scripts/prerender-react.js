#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Mock DOM environment for server-side rendering
const { JSDOM } = require('jsdom');

// Create JSDOM instance
const dom = new JSDOM(
  '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>',
  {
    url: 'https://windowai.danduh.me',
    pretendToBeVisual: false,
    resources: 'usable',
  },
);

// Set up global variables for React
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// Routes to prerender
const routes = [
  { path: '/', filename: 'index.html' },

  // Browser capabilities / status dashboard (the old home)
  { path: '/status', filename: 'status.html' },

  // Chat routes
  { path: '/chat', filename: 'chat.html' },
  { path: '/chat/chat-api-documentation', filename: 'chat-api-documentation.html' },
  { path: '/chat/chat-demo', filename: 'chat-demo.html' },
  
  // Tool Calling routes
  { path: '/tool-calling', filename: 'tool-calling.html' },
  { path: '/tool-calling/tool-calling-api-documentation', filename: 'tool-calling-api-documentation.html' },
  { path: '/tool-calling/tool-calling-demo', filename: 'tool-calling-demo.html' },
  
  // Summary routes
  { path: '/summary', filename: 'summary.html' },
  { path: '/summary/summary-api-documentation', filename: 'summary-api-documentation.html' },
  { path: '/summary/summary-demo', filename: 'summary-demo.html' },
  
  // Translate routes
  { path: '/translate', filename: 'translate.html' },
  { path: '/translate/translate-api-documentation', filename: 'translate-api-documentation.html' },
  { path: '/translate/translate-demo', filename: 'translate-demo.html' },

  // Live Translate route (single-page, no docs/demo split)
  { path: '/live-translate', filename: 'live-translate.html' },
  { path: '/live-translate/live-translate-api-documentation', filename: 'live-translate-api-documentation.html' },

  // Writer routes
  { path: '/writer', filename: 'writer.html' },
  { path: '/writer/writer-api-documentation', filename: 'writer-api-documentation.html' },
  { path: '/writer/writer-demo', filename: 'writer-demo.html' },

  // WebMCP routes
  { path: '/webmcp', filename: 'webmcp.html' },
  { path: '/webmcp/webmcp-api-documentation', filename: 'webmcp-api-documentation.html' },

  // Generative UI routes
  { path: '/generative-ui', filename: 'generative-ui.html' },
  { path: '/generative-ui/generative-ui-api-documentation', filename: 'generative-ui-api-documentation.html' },

  // Proofreader routes
  { path: '/proofreader', filename: 'proofreader.html' },
  { path: '/proofreader/proofreader-api-documentation', filename: 'proofreader-api-documentation.html' },

  // Multimodal routes
  { path: '/multimodal', filename: 'multimodal.html' },
  { path: '/multimodal/multimodal-api-documentation', filename: 'multimodal-api-documentation.html' },

  // MCP Client routes
  { path: '/mcp-client', filename: 'mcp-client.html' },
  { path: '/mcp-client/mcp-client-api-documentation', filename: 'mcp-client-api-documentation.html' },
  // Embeddings routes
  { path: '/embeddings', filename: 'embeddings.html' },
  { path: '/embeddings/embeddings-api-documentation', filename: 'embeddings-api-documentation.html' },

  // Observability (Advanced)
  { path: '/observability', filename: 'observability.html' },
  { path: '/observability/observability-api-documentation', filename: 'observability-api-documentation.html' },

  // Evaluation (Advanced)
  { path: '/evaluation', filename: 'evaluation.html' },
  { path: '/evaluation/evaluation-api-documentation', filename: 'evaluation-api-documentation.html' },
];

// Build configuration
const distPath = path.join(__dirname, '../../dist/chat');
const templatePath = path.join(distPath, 'index.html');

async function prerenderRoutes() {
  console.log('Starting React pre-rendering process...');

  // Ensure dist directory exists
  if (!fs.existsSync(distPath)) {
    console.error('Dist directory not found. Please run the build first.');
    process.exit(1);
  }

  // Read the template HTML file
  if (!fs.existsSync(templatePath)) {
    console.error('Template index.html not found in dist directory.');
    process.exit(1);
  }

  const templateHtml = fs.readFileSync(templatePath, 'utf-8');

  // Generate HTML for each route
  for (const route of routes) {
    try {
      console.log(`Pre-rendering ${route.path}...`);

      // Get SEO data for this route
      const seoData = getSEODataForRoute(route.path);

      // Create enhanced HTML with proper meta tags and structured data
      const enhancedHtml = createEnhancedHTML(
        templateHtml,
        seoData,
        route.path,
      );

      // Write the enhanced HTML file
      const outputPath = path.join(distPath, route.filename);
      fs.writeFileSync(outputPath, enhancedHtml);

      console.log(`✓ Generated ${route.filename}`);
    } catch (error) {
      console.error(`Error pre-rendering ${route.path}:`, error);
    }
  }

  // Create sitemap.xml
  createSitemap();

  // Create robots.txt
  createRobotsTxt();

  console.log('Pre-rendering completed!');
}

function getSEODataForRoute(routePath) {
  const seoConfigs = {
    '/': {
      title:
        'Chrome Built-in AI — on-device AI APIs in your browser | window.ai',
      description:
        "The window.ai showcase: run Gemini Nano and Chrome's built-in AI APIs entirely on-device — prompt, summarize, translate, write, embed, and Model Context Protocol tools. Live interactive demos and developer docs, no server, no API key.",
      keywords:
        'window.ai, Chrome built-in AI, Gemini Nano, on-device AI, browser AI APIs, LanguageModel, Prompt API, Summarizer, Translator, Writer, Rewriter, embeddings, Model Context Protocol, MCP',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'window.ai — Chrome Built-in AI Showcase',
        description:
          "Live demos and documentation for Chrome's on-device built-in AI APIs (window.ai / Gemini Nano)",
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Chrome Browser',
      },
    },
    '/status': {
      title:
        'Chrome AI APIs - Built-in AI capabilities for modern web applications',
      description:
        "Explore Chrome's experimental AI APIs including Chat (Gemini Nano), Summarization, Translation, and Writer/Rewriter. Interactive demos and comprehensive documentation for developers.",
      keywords:
        'Chrome AI, Gemini Nano, AI APIs, web development, machine learning, browser AI, chat API, translation API, summarization API, writer API',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Check your browser — Chrome AI capabilities status',
        description:
          "Live availability checks for Chrome's built-in AI APIs in your browser",
      },
    },
    '/chat': {
      title:
        'AI Chat - Interactive conversations with Gemini Nano | Chrome AI APIs',
      description:
        'Chat with Gemini Nano directly in your browser. Experience on-device AI conversations with streaming responses, system message configuration, and advanced settings.',
      keywords:
        'AI chat, Gemini Nano, conversational AI, browser AI, on-device AI, streaming chat, prompt API',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'AI Chat Demo',
        description: 'Interactive chat interface powered by Gemini Nano',
        about: {
          '@type': 'Thing',
          name: 'Gemini Nano AI Chat',
        },
      },
    },
    '/chat/chat-api-documentation': {
      title:
        'Chat API Documentation - Prompt API Guide | Chrome AI APIs',
      description:
        "Comprehensive documentation for Chrome's Prompt API (Gemini Nano). Learn about session management, streaming responses, system messages, and advanced configuration options.",
      keywords:
        'Prompt API documentation, Gemini Nano API, Chrome AI API docs, chat API guide, AI integration',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Chat API Documentation',
        description: 'Technical documentation for the Prompt API',
      },
    },
    '/chat/chat-demo': {
      title:
        'Chat Demo - Try Gemini Nano in Your Browser | Chrome AI APIs',
      description:
        'Interactive demo of Gemini Nano chat functionality. Test on-device AI conversations with streaming responses, system message configuration, and advanced settings.',
      keywords:
        'AI chat demo, Gemini Nano demo, interactive AI, browser AI demo, prompt API demo',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'AI Chat Demo',
        description: 'Interactive chat interface powered by Gemini Nano',
      },
    },
    '/tool-calling': {
      title:
        'Tool Calling API - Function calling with Chrome AI | Chrome AI APIs',
      description:
        "Explore Chrome's Tool Calling API for function calling and structured interactions with AI. Learn how to integrate external tools and services with browser-based AI.",
      keywords:
        'tool calling, function calling, Chrome AI, API integration, structured AI, browser tools',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Tool Calling API Demo',
        description: 'Function calling and structured AI interactions',
      },
    },
    '/tool-calling/tool-calling-api-documentation': {
      title:
        'Tool Calling API Documentation - Function Calling Guide | Chrome AI APIs',
      description:
        "Complete guide to Chrome's Tool Calling API. Learn how to define tools, handle function calls, and integrate external services with AI-powered interactions.",
      keywords:
        'tool calling API documentation, function calling guide, Chrome AI tools, API integration docs',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Tool Calling API Documentation',
        description: 'Technical documentation for the Tool Calling API',
      },
    },
    '/tool-calling/tool-calling-demo': {
      title:
        'Tool Calling Demo - Interactive Function Calling | Chrome AI APIs',
      description:
        'Interactive demo of Chrome AI Tool Calling API. Test function calling with calculators, time tools, and custom functions in real-time.',
      keywords:
        'tool calling demo, function calling demo, interactive AI tools, Chrome AI demo',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Tool Calling Demo',
        description: 'Interactive function calling demonstration',
      },
    },
    '/summary': {
      title:
        'Text Summarization API - AI-powered content summarization | Chrome AI APIs',
      description:
        "Generate intelligent summaries with Chrome's Summarization API. Multiple formats including key-points, TL;DR, headlines, and teasers with customizable length options.",
      keywords:
        'text summarization, AI summarization, content summarization, key points, TL;DR, headlines, browser AI',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Text Summarization Demo',
        description: 'AI-powered text summarization with multiple formats',
      },
    },
    '/summary/summary-api-documentation': {
      title:
        'Summarization API Documentation - Text Summary Guide | Chrome AI APIs',
      description:
        "Complete documentation for Chrome's Summarization API. Learn about different summary types, format options, length settings, and implementation best practices.",
      keywords:
        'summarization API documentation, text summary guide, Chrome AI docs, summary API reference',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Summarization API Documentation',
        description: 'Technical documentation for the Summarization API',
      },
    },
    '/summary/summary-demo': {
      title:
        'Summarization Demo - AI Text Summary Generator | Chrome AI APIs',
      description:
        'Interactive demo of Chrome AI Summarization API. Test different summary formats like key-points, TL;DR, headlines, and teasers with customizable length.',
      keywords:
        'text summarization demo, AI summary generator, interactive summarizer, Chrome AI demo',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Text Summarization Demo',
        description: 'Interactive text summarization tool',
      },
    },
    '/translate': {
      title:
        'Translation & Language Detection APIs - Multi-language AI translation | Chrome AI APIs',
      description:
        'On-device language detection and translation between multiple language pairs. Features automatic language detection, streaming translation, and downloadable language packs.',
      keywords:
        'language translation, language detection, multi-language, on-device translation, browser translation, AI translation',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Translation API Demo',
        description: 'Multi-language translation and detection',
      },
    },
    '/translate/translate-api-documentation': {
      title:
        'Translation API Documentation - Language Translation Guide | Chrome AI APIs',
      description:
        "Comprehensive guide to Chrome's Translation and Language Detection APIs. Learn about language pairs, detection capabilities, and translation implementation.",
      keywords:
        'translation API documentation, language detection guide, Chrome AI translation docs, multilingual API',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Translation API Documentation',
        description: 'Technical documentation for Translation APIs',
      },
    },
    '/translate/translate-demo': {
      title:
        'Translation Demo - Multi-language AI Translator | Chrome AI APIs',
      description:
        'Interactive demo of Chrome AI Translation APIs. Test language detection and translation between multiple language pairs with on-device processing.',
      keywords:
        'translation demo, language translator demo, multilingual AI demo, Chrome translation demo',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Translation Demo',
        description: 'Interactive multi-language translation tool',
      },
    },
    '/live-translate': {
      title:
        'Live Voice Translation - Chrome Speech + Translator demo | Chrome AI APIs',
      description:
        'Speak live in your browser and watch your words translated simultaneously into two languages. Combines the Web Speech API with Chrome\'s on-device Translator API — no server, no upload.',
      keywords:
        'live translation, voice translation, Web Speech API, speech recognition, real-time translation, Chrome AI, on-device translation, dual translation, simultaneous translation',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Live Voice Translation Demo',
        description:
          'Live speech-to-text fanned into dual simultaneous translations',
      },
    },
    '/live-translate/live-translate-api-documentation': {
      title:
        'Live Voice Translation Docs — Web Speech + Translator API guide | Chrome AI APIs',
      description:
        'Compose the Web Speech API with Chrome\'s on-device Translator API to build live, dual-language voice translation in the browser — no server, no upload.',
      keywords:
        'Live Voice Translation docs, Web Speech API, SpeechRecognition, Translator API, dual translation, on-device translation, BCP 47, interim results, fan-out translation',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Live Voice Translation Documentation',
        description:
          'Technical documentation for composing the Web Speech API with the Chrome Translator API',
      },
    },
    '/writer': {
      title:
        'Writer & Rewriter APIs - AI-powered content creation | Chrome AI APIs',
      description:
        'AI-powered content creation and enhancement. Writer creates new content from prompts, while Rewriter transforms existing text with tone, format, and length adjustments.',
      keywords:
        'AI writing, content creation, text rewriting, writing assistant, content enhancement, AI writer, text generation',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Writer & Rewriter Demo',
        description: 'AI-powered content creation and enhancement',
      },
    },
    '/writer/writer-api-documentation': {
      title:
        'Writer & Rewriter API Documentation - Content Creation Guide | Chrome AI APIs',
      description:
        "Complete guide to Chrome's Writer and Rewriter APIs. Learn about content generation, text transformation, tone adjustment, and writing assistant capabilities.",
      keywords:
        'writer API documentation, rewriter API guide, Chrome AI writing docs, content creation API',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Writer & Rewriter API Documentation',
        description: 'Technical documentation for Writer and Rewriter APIs',
      },
    },
    '/writer/writer-demo': {
      title:
        'Writer & Rewriter Demo - AI Content Creation Tool | Chrome AI APIs',
      description:
        'Interactive demo of Chrome AI Writer and Rewriter APIs. Create new content from prompts and transform existing text with tone, format, and length options.',
      keywords:
        'AI writer demo, text rewriter demo, content creation demo, writing assistant demo',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Writer & Rewriter Demo',
        description: 'Interactive AI-powered writing and rewriting tool',
      },
    },
    '/webmcp': {
      title: 'WebMCP Recipe Workbench - navigator.modelContext demo | Chrome AI APIs',
      description: 'A page-side WebMCP demo using navigator.modelContext in Chrome 146+ Canary. Browse seeded recipes from IndexedDB.',
      keywords: 'WebMCP, navigator.modelContext, Model Context Protocol, page-side tools, Chrome 146, recipe workbench, browser AI tools',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'WebMCP Recipe Workbench',
        description: 'Page-side tools demo built on navigator.modelContext',
      },
    },
    '/webmcp/webmcp-api-documentation': {
      title: 'WebMCP API Documentation - Recipe Workbench guide | Chrome AI APIs',
      description: 'Documentation for the WebMCP Recipe Workbench demo. Walks through navigator.modelContext, registerTool, and the page-side tool descriptor.',
      keywords: 'WebMCP documentation, navigator.modelContext API, registerTool, page-side tools docs, JSON Schema tools',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'WebMCP API Documentation',
        description: 'Technical documentation for the WebMCP Recipe Workbench',
      },
    },
    '/generative-ui': {
      title: 'Generative UI — MCP Apps demo with on-device recipe cards | Chrome AI APIs',
      description: 'A Chrome 146 Canary demo of the MCP Apps pattern: the in-page chat calls searchRecipes, an interactive recipe-card carousel renders in the chat bubble via a sandboxed iframe, and clicking Pick updates the meal-plan column live — all on-device, no network.',
      keywords: 'MCP Apps, generative UI, navigator.modelContext, Chrome AI, on-device AI, recipe cards, sandboxed iframe, WebMCP, SEP-1865, meal plan',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Generative UI — MCP Apps Demo',
        description: 'On-device recipe-card carousel via sandboxed iframe and WebMCP tool results',
      },
    },
    '/generative-ui/generative-ui-api-documentation': {
      title: 'Generative UI Docs — MCP Apps wire format + bidirectional pattern | Chrome AI APIs',
      description: 'How to register UI-returning tools and hidden helpers with navigator.modelContext, sandboxed iframes, and JSON-RPC postMessage bridge — SEP-1865 reference.',
      keywords: 'MCP Apps documentation, SEP-1865, navigator.modelContext, registerTool, _meta.ui.resourceUri, sandboxed iframe, JSON-RPC postMessage, visibility annotation, hidden helpers, recipe carousel',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Generative UI API Documentation',
        description: 'Technical documentation for the MCP Apps Generative UI pattern on navigator.modelContext.',
      },
    },
    '/proofreader': {
      title: 'Proofreader — Chrome on-device grammar + spelling correction | Chrome AI APIs',
      description: 'Gemini Nano proofreads your text on-device with grammar, spelling, capitalization, and punctuation corrections. Three output styles, five languages, zero network.',
      keywords: 'Proofreader API, Gemini Nano, on-device grammar, spelling correction, Chrome AI, ProofreaderCorrection, correctionExplanationLanguage, LoRA adapter',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Proofreader Demo',
        description: 'On-device grammar and spelling correction with Gemini Nano',
      },
    },
    '/proofreader/proofreader-api-documentation': {
      title: 'Proofreader API Docs — surface, corrections shape, language support | Chrome AI APIs',
      description: 'Gemini Nano proofreads your text on-device with grammar, spelling, capitalization, and punctuation corrections. Three output styles, five languages, zero network.',
      keywords: 'Proofreader API docs, ProofreaderCorrection, ProofreadResult, correctionExplanationLanguage, expectedInputLanguages, Chrome 146 Canary, on-device AI',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Proofreader API Documentation',
        description: 'Technical documentation for the Proofreader API surface, corrections shape, and language support',
      },
    },
    '/multimodal': {
      title: 'Multimodal — Ask Gemini Nano about images on-device | Chrome AI APIs',
      description: 'Drag, paste, or capture an image — Gemini Nano answers your questions about it on-device with zero network. Chrome 148+ stable or flag-gated Canary.',
      keywords: 'Multimodal AI, Gemini Nano, image input, LanguageModel, expectedInputs, on-device AI, Chrome 148, drag and drop image, clipboard paste, WebGPU',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Multimodal Demo',
        description: 'On-device image understanding with Gemini Nano',
      },
    },
    '/multimodal/multimodal-api-documentation': {
      title: 'Multimodal API Docs — expectedInputs, image types, webcam-live pattern | Chrome AI APIs',
      description: 'Drag, paste, or capture an image — Gemini Nano answers your questions about it on-device with zero network. Chrome 148+ stable or flag-gated Canary.',
      keywords: 'Multimodal API docs, expectedInputs, image types, webcam-live, LanguageModel, promptStreaming, content parts, ImageBitmap, Chrome 148',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Multimodal API Documentation',
        description: 'Technical documentation for the LanguageModel multimodal API surface, expectedInputs, and image types',
      },
    },
    '/mcp-client': {
      title: 'MCP Client — Chat with a remote MCP server via the built-in LLM | Chrome AI APIs',
      description: 'Connect to a remote Model Context Protocol server over Streamable HTTP, browse its tools, and drive them from Chrome\'s built-in LLM (Gemini Nano) — a manual responseFormat agent loop, no server-side model.',
      keywords: 'MCP client, Model Context Protocol, Streamable HTTP, remote MCP server, Gemini Nano, built-in LLM, agent loop, bearer token, browser MCP, tool calling',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'MCP Client Demo',
        description: 'Browser MCP client that chats with a remote MCP server via the built-in LLM',
      },
    },
    '/mcp-client/mcp-client-api-documentation': {
      title: 'MCP Client API Docs — Streamable HTTP transport + agent loop | Chrome AI APIs',
      description: 'How the browser MCP client connects over Streamable HTTP with a bearer token, lists tools, and dispatches them from a built-in-LLM responseFormat agent loop.',
      keywords: 'MCP client docs, Model Context Protocol, StreamableHTTPClientTransport, listTools, callTool, CORS, bearer token, responseFormat agent loop, Gemini Nano',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'MCP Client API Documentation',
        description: 'Technical documentation for the browser MCP client transport and built-in-LLM agent loop',
      },
    },
    '/embeddings': {
      title: 'Embeddings — On-device semantic vectors with SemanticEmbedder | Chrome AI APIs',
      description: 'Turn text into on-device semantic vectors (embeddinggemma-300m) with Chrome\'s SemanticEmbedder — cross-lingual search and clustering, no backend. Chrome 152+ Canary, desktop only.',
      keywords: 'Embeddings API, SemanticEmbedder, embeddinggemma-300m, semantic vectors, cross-lingual search, clustering, cosine similarity, Matryoshka, on-device AI, Chrome 152',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Embeddings Demo',
        description: 'On-device semantic vectors with SemanticEmbedder for cross-lingual search and clustering',
      },
    },
    '/embeddings/embeddings-api-documentation': {
      title: 'Embeddings API Docs — SemanticEmbedder surface, taskType, Matryoshka dims | Chrome AI APIs',
      description: 'How to use Chrome\'s SemanticEmbedder: availability, create, embed with taskType, and Matryoshka dimension truncation for on-device similarity and clustering. Chrome 152+ Canary, desktop only.',
      keywords: 'Embeddings API docs, SemanticEmbedder, embeddinggemma-300m, taskType, retrieval-query, retrieval-document, Matryoshka, cosine similarity, Float32Array, Chrome 152',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Embeddings API Documentation',
        description: 'Technical documentation for the SemanticEmbedder API surface, taskType, and Matryoshka dimension truncation',
      },
    },
    '/observability': {
      title: 'Observability — Trace & monitor Chrome built-in on-device AI | Chrome AI APIs',
      description: 'Trace, log, and monitor Chrome\'s built-in on-device AI (Gemini Nano) entirely client-side — latency, TTFT, context usage, and errors. See a live trace, then learn how to add logging and tracing to your own app. No backend.',
      keywords: 'AI observability, tracing, logging, OpenTelemetry gen_ai, Sentry, Langfuse, on-device AI, Gemini Nano, LanguageModel, TTFT, token usage, Chrome built-in AI',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Observability Demo',
        description: 'Trace, log, and monitor Chrome built-in on-device AI entirely client-side',
      },
    },
    '/observability/observability-api-documentation': {
      title: 'Observability API Docs — logging & tracing for on-device AI | Chrome AI APIs',
      description: 'How to add logging and tracing to Chrome\'s built-in AI: capture latency, TTFT, contextUsage, availability, and errors, then ship to OpenTelemetry, Sentry, or Langfuse. Framework-agnostic, no backend required.',
      keywords: 'observability docs, tracing, logging, OpenTelemetry gen_ai, Sentry, Langfuse, contextUsage, TTFT, downloadprogress, availability, Gemini Nano, Chrome built-in AI',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Observability API Documentation',
        description: 'How to add logging and tracing to Chrome built-in on-device AI',
      },
    },
    '/evaluation': {
      title: 'Evaluation — Test on-device AI answer quality with a stability rate | Chrome AI APIs',
      description: 'Evaluate Chrome\'s built-in on-device AI (Gemini Nano): golden datasets, rule-based checks, LLM-as-judge, and a 5–10-run stability rate. Run a live mini-eval in the browser, then wire it into CI with Playwright. No backend.',
      keywords: 'AI evaluation, evals, golden dataset, rule-based eval, LLM-as-judge, stability rate, Playwright, Vitest, CI, on-device AI, Gemini Nano, Chrome built-in AI',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Evaluation Demo',
        description: 'Test on-device AI answer quality with golden sets and a stability rate',
      },
    },
    '/evaluation/evaluation-api-documentation': {
      title: 'Evaluation API Docs — golden sets, judges, stability rate & CI | Chrome AI APIs',
      description: 'How to evaluate Chrome built-in AI answer quality: build a golden set, score with rule-based checks and an LLM judge, report a stability rate, and run it against window.ai in CI with Playwright. Framework-agnostic.',
      keywords: 'evaluation docs, evals, golden dataset, rule-based scorer, LLM-as-judge, stability rate, Playwright, Vitest, promptfoo, evalite, CI, Gemini Nano, Chrome built-in AI',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: 'Evaluation API Documentation',
        description: 'How to evaluate Chrome built-in on-device AI answer quality and run it in CI',
      },
    },
  };

  return seoConfigs[routePath] || seoConfigs['/'];
}

function createEnhancedHTML(htmlTemplate, seoData, routePath) {
  const baseUrl = 'https://windowai.danduh.me';
  const fullUrl = `${baseUrl}${routePath}`;

  // Update title
  let html = htmlTemplate.replace(
    /<title>.*?<\/title>/,
    `<title>${seoData.title}</title>`,
  );

  // Strip the template's baked-in / any previously-injected head tags that we
  // re-emit below, so every route ends up with exactly one correct set instead
  // of the template's stale generic copy duplicated alongside the route's own.
  [
    /<meta\s+name="(?:description|keywords|title)"[^>]*>/gi,
    /<meta\s+(?:name|property)="og:[^"]*"[^>]*>/gi,
    /<meta\s+(?:name|property)="twitter:[^"]*"[^>]*>/gi,
    /<link\s+rel="canonical"[^>]*>/gi,
  ].forEach((re) => {
    html = html.replace(re, '');
  });

  // Create comprehensive meta tags
  const metaTags = `
    <!-- Primary Meta Tags -->
    <meta name="title" content="${seoData.title}">
    <meta name="description" content="${seoData.description}">
    <meta name="keywords" content="${seoData.keywords}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${fullUrl}">
    <meta property="og:title" content="${seoData.title}">
    <meta property="og:description" content="${seoData.description}">
    <meta property="og:site_name" content="window.ai">
    <meta property="og:image" content="${baseUrl}/assets/Social_Card-selection.png">
    <meta property="og:image:secure_url" content="${baseUrl}/assets/Social_Card-selection.png">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1928">
    <meta property="og:image:height" content="1260">
    <meta property="og:image:alt" content="${seoData.title}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${fullUrl}">
    <meta property="twitter:title" content="${seoData.title}">
    <meta property="twitter:description" content="${seoData.description}">
    <meta property="twitter:image" content="${baseUrl}/assets/Social_Card-selection.png">
    
    <!-- Additional SEO -->
    <link rel="canonical" href="${fullUrl}">
    <meta name="robots" content="index, follow">
    <meta name="language" content="English">
    <meta name="author" content="Chrome AI APIs Demo">
    
    <!-- Structured Data -->
    <script type="application/ld+json">
    ${JSON.stringify(seoData.structuredData, null, 2)}
    </script>
  `;

  // Inject meta tags before closing head tag
  html = html.replace('</head>', `${metaTags}</head>`);

  // Add preload hints for critical resources
  const preloadHints = `
    <link rel="preconnect" href="${baseUrl}">
    <link rel="dns-prefetch" href="${baseUrl}">
  `;

  html = html.replace('<head>', `<head>${preloadHints}`);

  return html;
}

function createSitemap() {
  const baseUrl = 'https://windowai.danduh.me';

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${routes
    .map(
      (route) => `
  <url>
    <loc>${baseUrl}${route.path}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route.path === '/' ? '1.0' : '0.8'}</priority>
  </url>`,
    )
    .join('')}
</urlset>`;

  fs.writeFileSync(path.join(distPath, 'sitemap.xml'), sitemap);
  console.log('✓ Generated sitemap.xml');
}

function createRobotsTxt() {
  // Always the production origin — matches createSitemap()'s baseUrl so the
  // Sitemap directive is discoverable by crawlers.
  const baseUrl = 'https://windowai.danduh.me';

  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml`;

  fs.writeFileSync(path.join(distPath, 'robots.txt'), robotsTxt);
  console.log('✓ Generated robots.txt');
}

// Install JSDOM if not available
try {
  require('jsdom');
} catch (e) {
  console.log('Installing jsdom...');
  require('child_process').execSync('npm install jsdom', { stdio: 'inherit' });
}

// Run the prerender process
prerenderRoutes().catch((error) => {
  console.error('Pre-rendering failed:', error);
  process.exit(1);
});
