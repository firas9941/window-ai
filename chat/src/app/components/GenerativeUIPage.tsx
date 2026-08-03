import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useSEOData, seoConfigs } from '../hooks/useSEOData';
import { seedIfMissing } from '../services/RecipePersistence';
import { SEED_RECIPES } from '../services/recipeSeed';
import { MissingFlagBanner } from './MissingFlagBanner';
import { GenerativeUIHeader } from './GenerativeUI/GenerativeUIHeader';
import { GenUIChatPanel } from './GenerativeUI/GenUIChatPanel';
import { MealPlanColumn } from './GenerativeUI/MealPlanColumn';
import { registerGenUITools } from '../services/genUITools';
import { isModelContextAvailable } from '../services/modelContext';
import Tabs from './Tabs';
import { DocsRenderer } from '../tools/DocsRenderer';

export const GenerativeUIPage: React.FC = () => {
  // Path-aware SEO: when the user is on /generative-ui/docs, the rendered <head> swaps
  // to seoConfigs.generativeUIDocs; everything else under /generative-ui gets seoConfigs.generativeUI.
  // useLocation() is order-stable; useSEOData remains the first SEO write so
  // the Rules of Hooks invariant is preserved.
  // Use startsWith (NOT includes) per RESEARCH Pitfall 6 — exact-prefix match.
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.generativeUIDocs : seoConfigs.generativeUI,
    isDocs ? '/generative-ui/generative-ui-api-documentation' : '/generative-ui/generative-ui-demo',
  );

  // Mount-time seed: inserts any recipe not already in IndexedDB.
  // The `cancelled` flag is StrictMode-safe — avoids state updates after unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inserted = await seedIfMissing(SEED_RECIPES);
        if (inserted > 0 && !cancelled) {
          console.log(`[GenerativeUI] seedIfMissing: inserted ${inserted} new recipes`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[GenerativeUI] Failed to seed recipe library:', message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount-time tool registration: registers commitRecipeToPlan with navigator.modelContext.
  // registerGenUITools() is a no-op (returns null) when navigator.modelContext is undefined.
  useEffect(() => {
    const ctrl = registerGenUITools();
    return () => {
      ctrl?.abort();
    };
  }, []);

  // Workbench tab content: the two-column layout (chat panel + meal plan column).
  const workbenchContent = (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <GenUIChatPanel />
      </div>
      <div className="lg:w-80 flex-shrink-0">
        <MealPlanColumn />
      </div>
    </div>
  );

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/generative-ui-api-documentation',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="Generative-UI-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'workbench',
        label: 'Workbench',
        path: '/generative-ui-demo',
        content: workbenchContent,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        {!isModelContextAvailable() && <MissingFlagBanner />}
        <GenerativeUIHeader />
        <Tabs basePath="/generative-ui" defaultTab="docs" tabs={tabs} />
        <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          🔒 Zero network during demo — open DevTools → Network tab
        </p>
      </div>
    </div>
  );
};
