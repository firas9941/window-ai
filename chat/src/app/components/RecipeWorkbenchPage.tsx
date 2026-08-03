import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import Tabs from './Tabs';
import { DocsRenderer } from '../tools/DocsRenderer';
import { useSEOData, seoConfigs } from '../hooks/useSEOData';
import {
  getRecipes,
  seedIfEmpty,
  type Recipe,
} from '../services/RecipePersistence';
import { SEED_RECIPES } from '../services/recipeSeed';
import { RecipePicker } from './RecipeWorkbench/RecipePicker';
import { RecipeHeader } from './RecipeWorkbench/RecipeHeader';
import { IngredientsList } from './RecipeWorkbench/IngredientsList';
import { StepsList } from './RecipeWorkbench/StepsList';
import { MissingFlagBanner } from './MissingFlagBanner';
import { RECIPE_TOOLS } from '../services/recipeTools';
import { wrapToolsWithEvents, type ToolCallEvent } from '../services/toolAdapter';
import { getModelContext, isModelContextAvailable } from '../services/modelContext';
import { subscribeRecipeStore, setActiveRecipeId } from '../services/recipeStore';
import { ToolRegistrationPill, type ToolRegistrationStatus } from './RecipeWorkbench/ToolRegistrationPill';
import { AgentDrawer } from './RecipeWorkbench/AgentDrawer';

interface WorkbenchPanelProps {
  recipes: Recipe[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  registrationStatus: ToolRegistrationStatus;
  registeredCount: number;
  liveToolName: string | null;
  onLiveToolNameChange: (name: string | null) => void;
}

const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({
  recipes,
  activeId,
  loading,
  onSelect,
  registrationStatus,
  registeredCount,
  liveToolName,
  onLiveToolNameChange,
}) => {
  const active = recipes.find((r) => r.id === activeId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:min-h-[calc(100vh-14rem)]">
      {/* LEFT column: recipe content stacked top-to-bottom */}
      <aside className="lg:col-span-4 space-y-6">
        {!loading && recipes.length > 0 && (
          <RecipePicker recipes={recipes} activeId={activeId} onSelect={onSelect} />
        )}
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading your recipes&hellip;</p>
        ) : !active ? (
          <p className="text-gray-500 dark:text-gray-400">No recipes yet. Reload the page to seed the demo recipes.</p>
        ) : (
          <>
            <IngredientsList ingredients={active.ingredients} />
            <StepsList steps={active.steps} />
          </>
        )}
      </aside>

      {/* RIGHT column: compact recipe header + dominant chat panel */}
      <section className="lg:col-span-8 flex flex-col gap-6 min-h-[60vh] lg:min-h-0">
        {!loading && active && (
          <RecipeHeader title={active.title} servings={active.servings} />
        )}
        <div className="flex-1 min-h-[60vh] lg:min-h-0">
          <AgentDrawer
            registrationStatus={registrationStatus}
            registeredCount={registeredCount}
            liveToolName={liveToolName}
            onLiveToolNameChange={onLiveToolNameChange}
          />
        </div>
      </section>
    </div>
  );
};

interface RegistrationState {
  status: ToolRegistrationStatus;
  count: number;
}

// Module-scope reference to the most recent registration controller. React
// <StrictMode> (and Vite HMR) re-mount the page synchronously: cleanup fires
// `controller.abort()` but Chrome 149/150's `document.modelContext` does
// NOT synchronously remove the entries from its name-map, so the second mount
// would throw `Duplicate tool name` on the first `registerTool` call. Eagerly
// aborting any prior controller here — BEFORE the new mount registers — gives
// the implementation an extra opportunity to reconcile, and the per-tool
// try/catch below tolerates any residual desync. See debug session
// `webmcp-duplicate-tool-name`.
let previousRegistrationController: AbortController | null = null;

// DOMException name thrown by Chrome 149/150's document.modelContext when
// a tool with the same name is already registered. We treat this as success
// (the tool IS registered, just from our previous-mount handler — same code,
// same shape, same behavior, since RECIPE_TOOLS is module-static).
const DUPLICATE_NAME_PATTERN = /duplicate tool name|already registered/i;

export const RecipeWorkbenchPage: React.FC = () => {
  // Path-aware SEO: when the user is on /webmcp/docs, the rendered <head> swaps
  // to seoConfigs.webmcpDocs; everything else under /webmcp gets seoConfigs.webmcp.
  // useLocation() is order-stable; useSEOData remains the first SEO write so
  // the Rules of Hooks invariant is preserved. The two seoConfigs.* references
  // are stable module-scope objects → useSEOData's [config, path, updateSEO]
  // deps only re-fire when the branch flips, not on every render.
  // Use startsWith (NOT includes) per RESEARCH Pitfall 6 — exact-prefix match.
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.webmcpDocs : seoConfigs.webmcp,
    isDocs ? '/webmcp/webmcp-api-documentation' : '/webmcp/webmcp-demo',
  );
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [registration, setRegistration] = useState<RegistrationState>({ status: 'idle', count: 0 });
  const [liveToolName, setLiveToolName] = useState<string | null>(null);

  // Mount-time: idempotent seed (count-gated in seedIfEmpty), then load.
  // The `cancelled` flag handles React 19 StrictMode double-invoke per
  // RESEARCH §Pitfall 1.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedIfEmpty(SEED_RECIPES);
        const all = await getRecipes();
        if (cancelled) return;
        setRecipes(all);
        setActiveId(all[0]?.id ?? null);
        setActiveRecipeId(all[0]?.id ?? null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        // eslint-disable-next-line no-console
        console.error('[RecipeWorkbench] Failed to load recipes:', message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tool registration mount-effect. Single AbortController per mount;
  // controller.abort() in cleanup unregisters every tool atomically. (Chrome
  // 150+ also adds an explicit `unregisterTool(name)`, but the AbortSignal path
  // works across 146–150 and deregisters the whole set in one shot.)
  // See 02-RESEARCH.md §Pattern 1 + §Pitfall 1 (empty deps) + §Pitfall 2 (controller inside effect).
  //
  // Hardening (debug `webmcp-duplicate-tool-name`):
  //  (1) Abort any prior controller from a previous synchronous mount cycle
  //      (StrictMode / HMR) BEFORE registering, since Canary may not have
  //      synchronously processed the cleanup yet.
  //  (2) Per-tool try/catch: swallow "Duplicate tool name" since it means the
  //      same name is already mapped to our previous-mount handler. All other
  //      errors fall through to the existing partial/error branch.
  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) {
      setRegistration({ status: 'unavailable', count: 0 });
      return;
    }
    // (1) Defensive: abort any controller still hanging around from a prior
    // mount cycle that the cleanup hasn't fully reconciled yet.
    if (previousRegistrationController && !previousRegistrationController.signal.aborted) {
      previousRegistrationController.abort();
    }
    const controller = new AbortController();
    previousRegistrationController = controller;
    // Wrap every tool with the SAME event dispatcher used by AgentDrawer's session,
    // so external-agent calls (Tool Inspector) also fire the indicator UI.
    // setLiveToolName is a stable React setter — satisfies AgentDrawer's
    // `onLiveToolNameChange` "Pass a stable callback" contract (I1 fix).
    const onToolEvent = (e: ToolCallEvent): void => {
      if (e.kind === 'pending') {
        setLiveToolName(e.toolName);
      } else {
        setLiveToolName(null);
      }
    };
    const wrapped = wrapToolsWithEvents(RECIPE_TOOLS, onToolEvent);
    const registered: string[] = [];
    let fatalError: unknown = null;
    for (const tool of wrapped) {
      try {
        modelContext.registerTool(tool, { signal: controller.signal });
        registered.push(tool.name);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (DUPLICATE_NAME_PATTERN.test(message)) {
          // (2) Already registered from a prior synchronous mount that hasn't
          // reconciled yet. Same name → same handler shape (RECIPE_TOOLS is
          // module-static), so treat as success. The new controller still
          // governs the lifetime of THIS mount's registration intent; if the
          // prior abort eventually lands the implementation will re-add via
          // our same call, and the cleanup will catch it.
          registered.push(tool.name);
          continue;
        }
        fatalError = err;
        break;
      }
    }
    if (fatalError) {
      const message = fatalError instanceof Error ? fatalError.message : 'Unknown error';
      // eslint-disable-next-line no-console
      console.error('[RecipeWorkbench] Tool registration failed:', message);
      setRegistration({
        status: registered.length > 0 ? 'partial' : 'error',
        count: registered.length,
      });
    } else {
      setRegistration({ status: 'success', count: registered.length });
    }
    return () => {
      controller.abort();
      if (previousRegistrationController === controller) {
        previousRegistrationController = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to recipeStore. Mutating tool handlers call notifyRecipeStore()
  // after saveRecipe(); the listener re-fetches and updates React state.
  // See 02-RESEARCH.md §Pattern 3 + §Pitfall #5.
  useEffect(() => {
    const unsub = subscribeRecipeStore(() => {
      getRecipes()
        .then((all) => setRecipes(all))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown error';
          // eslint-disable-next-line no-console
          console.error('[RecipeWorkbench] Failed to refresh recipes after store notify:', message);
        });
    });
    return unsub;
  }, []);

  // Mirror activeId into recipeStore (handlers default to getActiveRecipeId()
  // when no recipeId arg is passed by the agent). Stable callback (empty deps)
  // — `setActiveId` and `setActiveRecipeId` are both stable references.
  const handleSelect = useCallback((id: string): void => {
    setActiveId(id);
    setActiveRecipeId(id);
  }, []);

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/webmcp-api-documentation',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="WebMCP-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'workbench',
        label: 'Workbench',
        path: '/webmcp-demo',
        content: (
          <WorkbenchPanel
            recipes={recipes}
            activeId={activeId}
            loading={loading}
            onSelect={handleSelect}
            registrationStatus={registration.status}
            registeredCount={registration.count}
            liveToolName={liveToolName}
            onLiveToolNameChange={setLiveToolName}
          />
        ),
      },
    ],
    [recipes, activeId, loading, handleSelect, registration.status, registration.count, liveToolName],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 rounded-lg shadow-md transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-primary-500 to-purple-600 text-white p-3 rounded-xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Recipe Workbench</h1>
              <p className="text-gray-600 dark:text-gray-400">A WebMCP demo: tools live on the page, not on a server.</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <ToolRegistrationPill
              status={registration.status}
              registeredCount={registration.count}
              totalCount={RECIPE_TOOLS.length}
            />
            <ThemeToggle />
          </div>
        </header>

        {!isModelContextAvailable() && <MissingFlagBanner />}

        <Tabs basePath="/webmcp" defaultTab="docs" tabs={tabs} />
      </div>
    </div>
  );
};

export default RecipeWorkbenchPage;
