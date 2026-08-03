import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useSEOData, seoConfigs } from '../../hooks/useSEOData';
import Tabs from '../Tabs';
import { DocsRenderer } from '../../tools/DocsRenderer';
import { MiniEval } from './MiniEval';

export const EvaluationPage: React.FC = () => {
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.evaluationDocs : seoConfigs.evaluation,
    isDocs ? '/evaluation/evaluation-api-documentation' : '/evaluation/evaluation-demo',
  );

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/evaluation-api-documentation',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="Evaluation-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'demo',
        label: 'Demo',
        path: '/evaluation-demo',
        content: <MiniEval />,
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Evaluation</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            On-device models are small and can be confidently wrong — so you test them. Run a live
            mini-eval below, then learn how to score answer quality and wire it into CI.
          </p>
        </header>
        <Tabs basePath="/evaluation" defaultTab="docs" tabs={tabs} />
        <p className="mt-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
          🔒 The demo runs entirely on-device — open DevTools → Network tab
        </p>
      </div>
    </div>
  );
};

export default EvaluationPage;
