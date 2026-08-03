import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSEOData, seoConfigs } from '../../hooks/useSEOData';
import { MissingFlagBanner } from '../MissingFlagBanner';
import Tabs from '../Tabs';
import { DocsRenderer } from '../../tools/DocsRenderer';
import { getAvailability } from '../../services/EmbeddingsService';
import CrossLingualTab from './CrossLingualTab';
import ConstellationTab from './ConstellationTab';

export const EmbeddingsPage: React.FC = () => {
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.embeddingsDocs : seoConfigs.embeddings,
    isDocs ? '/embeddings/embeddings-api-documentation' : '/embeddings/embeddings-cross-lingual',
  );

  const [unavailable, setUnavailable] = useState(false);

  // Mount effect — StrictMode-safe availability check with cancelled flag.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const availability = await getAvailability();
      if (!cancelled) setUnavailable(availability === 'unavailable');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/embeddings-api-documentation',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="Embeddings-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'cross-lingual',
        label: 'Cross-Lingual Search',
        path: '/embeddings-cross-lingual',
        content: <CrossLingualTab />,
      },
      {
        id: 'constellation',
        label: 'Constellation',
        path: '/embeddings-constellation',
        content: <ConstellationTab />,
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        {unavailable && (
          <MissingFlagBanner
            title="Embeddings API isn't enabled in this browser."
            body="Enable the flags below in Chrome 152+ Canary (desktop only), then relaunch."
            flags={[
              {
                name: 'Optimization Guide On Device',
                url: 'chrome://flags/#optimization-guide-on-device-model',
                note: 'set to "Enabled BypassPerfRequirement"',
              },
              {
                name: 'Semantic Embedder API',
                url: 'chrome://flags/#semantic-embedder-api',
                note: 'set to "Enabled"',
              },
            ]}
            browserRequirement="Chrome 152+ Canary (desktop)"
          />
        )}
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Embeddings</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            On-device semantic vectors with SemanticEmbedder (embeddinggemma-300m) — cross-lingual
            search and clustering, no backend.
          </p>
        </header>
        <Tabs basePath="/embeddings" defaultTab="docs" tabs={tabs} />
        <p className="mt-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
          🔒 Zero network during demo — open DevTools → Network tab
        </p>
      </div>
    </div>
  );
};

export default EmbeddingsPage;
