import React, { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSEOData, seoConfigs } from '../../hooks/useSEOData';
import Tabs from '../Tabs';
import { DocsRenderer } from '../../tools/DocsRenderer';
import ConnectionPanel from './ConnectionPanel';
import ToolsPanel from './ToolsPanel';
import ChatPanel from './ChatPanel';
import type { McpStatus } from './types';
import * as McpClientService from '../../services/McpClientService';
import type { McpConnection } from '../../services/McpClientService';

/**
 * /mcp-client — connect to a REMOTE MCP server over Streamable HTTP, browse its
 * tools, and chat with it through the built-in LLM (Gemini Nano) agent loop.
 *
 * This page OWNS the shared state (connection, status, error, selectedTools)
 * and threads it into three panels: ConnectionPanel, ToolsPanel, ChatPanel.
 *
 * Nano is NOT required to connect or browse tools — only ChatPanel needs the
 * Prompt API, so availability is guarded inside ChatPanel, not here.
 */
export const McpClientPage: React.FC = () => {
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.mcpClientDocs : seoConfigs.mcpClient,
    isDocs ? '/mcp-client/mcp-client-api-documentation' : '/mcp-client/mcp-client-demo',
  );

  const [connection, setConnection] = useState<McpConnection | null>(null);
  const [status, setStatus] = useState<McpStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [authUrls, setAuthUrls] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  // Connect: 'connecting' → 'connected' (seed selectedTools with ALL tool
  // names) or 'error'. Browser → remote MCP is CORS-gated; connect() rejects
  // with a network/TypeError when the origin is blocked — surface it verbatim.
  const handleConnect = useCallback(async (url: string, token: string) => {
    setStatus('connecting');
    setError(null);
    setAuthUrls([]);
    try {
      const conn = await McpClientService.connect(url, token || undefined);
      setConnection(conn);
      setSelectedTools(new Set(conn.tools.map((t) => t.name)));
      setStatus('connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      setAuthUrls(
        err instanceof McpClientService.McpAuthRequiredError ? err.authorizationUrls : [],
      );
      setConnection(null);
      setSelectedTools(new Set());
      setStatus('error');
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    await McpClientService.disconnect();
    setConnection(null);
    setSelectedTools(new Set());
    setError(null);
    setAuthUrls([]);
    setStatus('disconnected');
  }, []);

  const handleToggleTool = useCallback((name: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  // callTool proxies straight to the service — the transport tracks the session.
  const callTool = useCallback(
    (name: string, args: Record<string, unknown>) => McpClientService.callTool(name, args),
    [],
  );

  const connected = status === 'connected' && connection !== null;

  // The agent may only call the tools the user left ENABLED in ToolsPanel.
  const selectedToolInfos = useMemo(
    () => (connection ? connection.tools.filter((t) => selectedTools.has(t.name)) : []),
    [connection, selectedTools],
  );

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/mcp-client-api-documentation',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="MCP-Client-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'client',
        label: 'Client',
        path: '/mcp-client-demo',
        content: (
          <div className="space-y-6">
            <ConnectionPanel
              status={status}
              connection={connection}
              error={error}
              authUrls={authUrls}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
            {connected && connection && (
              <>
                <ToolsPanel
                  tools={connection.tools}
                  selected={selectedTools}
                  onToggle={handleToggleTool}
                  onCallManually={callTool}
                />
                <ChatPanel tools={selectedToolInfos} callTool={callTool} connected={connected} />
              </>
            )}
          </div>
        ),
      },
    ],
    [
      status,
      connection,
      error,
      authUrls,
      connected,
      selectedTools,
      selectedToolInfos,
      handleConnect,
      handleDisconnect,
      handleToggleTool,
      callTool,
    ],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MCP Client</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Connect to a remote MCP server and chat with it via the browser&apos;s built-in LLM.
          </p>
        </header>
        <Tabs basePath="/mcp-client" defaultTab="docs" tabs={tabs} />
      </div>
    </div>
  );
};

export default McpClientPage;
