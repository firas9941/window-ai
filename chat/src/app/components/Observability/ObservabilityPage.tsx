import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useSEOData, seoConfigs } from '../../hooks/useSEOData';
import Tabs from '../Tabs';
import { DocsRenderer } from '../../tools/DocsRenderer';
import { TraceDemo } from './TraceDemo';

export const ObservabilityPage: React.FC = () => {
  const location = useLocation();
  // Use startsWith (NOT includes) — exact-prefix match, mirroring the other pages.
  const isDocs = location.pathname.startsWith('/observability/docs');
  useSEOData(
    isDocs ? seoConfigs.observabilityDocs : seoConfigs.observability,
    isDocs ? '/observability/docs' : '/observability',
  );

  // Tabs ordering: Docs FIRST. Tabs.tsx matches currentPath.includes(tab.path);
  // the demo tab has path '' (falsy → skipped by the matcher), so the docs tab
  // (path '/docs') must precede it so /observability/docs resolves to Docs and
  // /observability falls back to the default demo tab.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/docs',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="Observability-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'demo',
        label: 'Demo',
        path: '',
        content: <TraceDemo />,
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Observability</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Trace, log, and monitor Chrome&apos;s built-in on-device AI — entirely client-side, no
            backend. See what you can capture, then learn how to add logging and tracing to your own
            app.
          </p>
        </header>
        <Tabs basePath="/observability" defaultTab="docs" tabs={tabs} />
        <p className="mt-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
          🔒 Everything here stays in your browser — open DevTools → Network tab
        </p>
      </div>
    </div>
  );
};

export default ObservabilityPage;
