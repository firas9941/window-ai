import React, {useState} from 'react';
import {Routes, Route, Navigate, Outlet, useSearchParams} from 'react-router-dom';
import ChatPage from './components/ChatPage';
import ToolCallingPage from './components/ToolCallingPage';
import Summary from "./components/Summary";
import TranslatePage from "./components/TranslatePage";
import LiveTranslatePage from "./components/LiveTranslatePage";
import WriteRewritePage from "./components/WriteRewritePage";
import {HomePage} from "./components/HomePage";
import CheckBrowserPage from "./components/CheckBrowserPage";
import {RecipeWorkbenchPage} from "./components/RecipeWorkbenchPage";
import {GenerativeUIPage} from "./components/GenerativeUIPage";
import {ProofreaderPage} from './components/Proofreader/ProofreaderPage';
import {MultimodalPage} from './components/Multimodal/MultimodalPage';
import {McpClientPage} from './components/McpClient/McpClientPage';
import {EmbeddingsPage} from './components/Embeddings/EmbeddingsPage';
import {ObservabilityPage} from './components/Observability/ObservabilityPage';
import {EvaluationPage} from './components/Evaluation/EvaluationPage';
import {AppContext} from "./context";
import {ThemeProvider} from "./context/ThemeContext";
import {ShellProvider} from "./components/AppShell/ShellContext";
import {AppShell} from "./components/AppShell/AppShell";

// Full shell chrome (rail + top bar) around the routed page.
const ShellLayout: React.FC = () => (
  <ShellProvider>
    <AppShell>
      <Outlet/>
    </AppShell>
  </ShellProvider>
);

// Bare layout for embedded iframes (generative-ui / webmcp previews): the shell
// context still wraps them so shell-aware pages don't throw, but the visual
// chrome (rail + top bar) is dropped.
const BareLayout: React.FC = () => (
  <ShellProvider>
    <Outlet/>
  </ShellProvider>
);

/**
 * The single routing convention for every demo page. For a feature at `/x` with
 * tab paths like `/x-api-documentation` and `/x-demo`, this emits:
 *   - `/x`            → redirect to the first tab (the canonical docs URL)
 *   - `/x/x-*`        → the page (one route per tab; `Tabs` derives the active
 *                        tab from the URL)
 *   - `/x/docs`       → redirect to the canonical docs URL (back-compat for the
 *                        older `/x/docs` links)
 * Every feature goes through this, so navigation + routing has ONE shape.
 */
const demoRoutes = (
  base: string,
  Component: React.ComponentType,
  tabPaths: string[],
): React.ReactElement[] => {
  const canonical = `${base}${tabPaths[0]}`;
  return [
    <Route key={base} path={base} element={<Navigate to={canonical} replace/>}/>,
    ...tabPaths.map((p) => (
      <Route key={`${base}${p}`} path={`${base}${p}`} element={<Component/>}/>
    )),
    <Route key={`${base}/docs`} path={`${base}/docs`} element={<Navigate to={canonical} replace/>}/>,
  ];
};

const AppRouter: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [inIframe] = useState<boolean>(() => {
    try {
      return searchParams.get('inIframe') ? JSON.parse(searchParams.get('inIframe') as string) : false;
    } catch {
      return false;
    }
  });

  const mainContext = {
    inIframe
  };

  return (
    <ThemeProvider>
      <AppContext.Provider value={mainContext}>
        <Routes>
          {/* Landing page — standalone, no shell chrome. */}
          <Route path="/" element={<HomePage/>}/>

          {/* Everything else renders inside the shell (or bare, when embedded). */}
          <Route element={inIframe ? <BareLayout/> : <ShellLayout/>}>
            {/* Capabilities / browser-status page (formerly at "/"). */}
            <Route path="/status" element={<CheckBrowserPage/>}/>

            {/* Every demo page uses the one routing convention (see demoRoutes). */}
            {demoRoutes('/chat', ChatPage, ['/chat-api-documentation', '/chat-demo'])}
            {demoRoutes('/tool-calling', ToolCallingPage, ['/tool-calling-api-documentation', '/tool-calling-demo'])}
            {demoRoutes('/summary', Summary, ['/summary-api-documentation', '/summary-demo'])}
            {demoRoutes('/translate', TranslatePage, ['/translate-api-documentation', '/translate-demo'])}
            {demoRoutes('/writer', WriteRewritePage, ['/writer-api-documentation', '/writer-demo'])}
            {demoRoutes('/live-translate', LiveTranslatePage, ['/live-translate-api-documentation', '/live-translate-demo'])}
            {demoRoutes('/webmcp', RecipeWorkbenchPage, ['/webmcp-api-documentation', '/webmcp-demo'])}
            {demoRoutes('/generative-ui', GenerativeUIPage, ['/generative-ui-api-documentation', '/generative-ui-demo'])}
            {demoRoutes('/proofreader', ProofreaderPage, ['/proofreader-api-documentation', '/proofreader-demo'])}
            {demoRoutes('/multimodal', MultimodalPage, ['/multimodal-api-documentation', '/multimodal-demo'])}
            {demoRoutes('/mcp-client', McpClientPage, ['/mcp-client-api-documentation', '/mcp-client-demo'])}
            {demoRoutes('/embeddings', EmbeddingsPage, ['/embeddings-api-documentation', '/embeddings-cross-lingual', '/embeddings-constellation'])}
            {demoRoutes('/observability', ObservabilityPage, ['/observability-api-documentation', '/observability-demo'])}
            {demoRoutes('/evaluation', EvaluationPage, ['/evaluation-api-documentation', '/evaluation-demo'])}

            <Route path="*" element={<Navigate to="/" replace/>}/>
          </Route>
        </Routes>
      </AppContext.Provider>
    </ThemeProvider>
  );
};

export default AppRouter;
