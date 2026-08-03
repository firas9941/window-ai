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

            {/* Chat routes */}
            <Route path="/chat" element={<Navigate to="/chat/chat-api-documentation" replace/>}/>
            <Route path="/chat/chat-api-documentation" element={<ChatPage/>}/>
            <Route path="/chat/chat-demo" element={<ChatPage/>}/>

            {/* Tool Calling routes */}
            <Route path="/tool-calling" element={<Navigate to="/tool-calling/tool-calling-api-documentation" replace/>}/>
            <Route path="/tool-calling/tool-calling-api-documentation" element={<ToolCallingPage/>}/>
            <Route path="/tool-calling/tool-calling-demo" element={<ToolCallingPage/>}/>

            {/* Summary routes */}
            <Route path="/summary" element={<Navigate to="/summary/summary-api-documentation" replace/>}/>
            <Route path="/summary/summary-api-documentation" element={<Summary/>}/>
            <Route path="/summary/summary-demo" element={<Summary/>}/>

            {/* Translate routes */}
            <Route path="/translate" element={<Navigate to="/translate/translate-api-documentation" replace/>}/>
            <Route path="/translate/translate-api-documentation" element={<TranslatePage/>}/>
            <Route path="/translate/translate-demo" element={<TranslatePage/>}/>

            {/* Live Translate routes */}
            <Route path="/live-translate" element={<LiveTranslatePage/>}/>
            <Route path="/live-translate/docs" element={<LiveTranslatePage/>}/>

            {/* WebMCP routes */}
            <Route path="/webmcp" element={<RecipeWorkbenchPage/>}/>
            <Route path="/webmcp/docs" element={<RecipeWorkbenchPage/>}/>

            {/* Generative UI routes */}
            <Route path="/generative-ui" element={<GenerativeUIPage/>}/>
            <Route path="/generative-ui/docs" element={<GenerativeUIPage/>}/>

            {/* Proofreader routes */}
            <Route path="/proofreader" element={<ProofreaderPage/>}/>
            <Route path="/proofreader/docs" element={<ProofreaderPage/>}/>

            {/* Multimodal routes */}
            <Route path="/multimodal" element={<MultimodalPage/>}/>
            <Route path="/multimodal/docs" element={<MultimodalPage/>}/>

            {/* MCP Client routes */}
            <Route path="/mcp-client" element={<McpClientPage/>}/>
            <Route path="/mcp-client/docs" element={<McpClientPage/>}/>

            {/* Embeddings routes */}
            <Route path="/embeddings" element={<EmbeddingsPage/>}/>
            <Route path="/embeddings/docs" element={<EmbeddingsPage/>}/>

            {/* Observability routes (Advanced) */}
            <Route path="/observability" element={<ObservabilityPage/>}/>
            <Route path="/observability/docs" element={<ObservabilityPage/>}/>

            {/* Writer/Rewriter routes */}
            <Route path="/writer" element={<Navigate to="/writer/writer-api-documentation" replace/>}/>
            <Route path="/writer/writer-api-documentation" element={<WriteRewritePage/>}/>
            <Route path="/writer/writer-demo" element={<WriteRewritePage/>}/>

            <Route path="*" element={<Navigate to="/" replace/>}/>
          </Route>
        </Routes>
      </AppContext.Provider>
    </ThemeProvider>
  );
};

export default AppRouter;
