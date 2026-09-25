// GEN_UI_TOOLS stub array + registerGenUITools() lifecycle helper.
//
// Source: 05-CONTEXT.md (Tool registration for round-trip section),
// 05-RESEARCH.md (Pattern 1 navigator.modelContext.registerTool, Pattern 7 wrapToolsWithEvents,
// Pattern 10 commitRecipeToPlan tool definition, Pitfall 1 StrictMode double-mount).
//
// Mirrors RecipeWorkbenchPage.tsx:164-228 registration pattern but as an exported helper
// function (not embedded in a component) so GenerativeUIPage.tsx can call it from a useEffect.
//
// IMPORTANT: module-scope guard uses `previousGenUIRegistrationController` — a DIFFERENT name
// from RecipeWorkbenchPage.tsx's `previousRegistrationController`. This prevents cross-page
// contamination when /webmcp and /generative-ui are open simultaneously.

import * as MealPlanStore from './MealPlanStore';
import { wrapToolsWithEvents, type ToolCallEvent } from './toolAdapter';
import { getModelContext, registerToolSafely } from './modelContext';
import { getRecipes } from './RecipePersistence';
import * as recipeCarouselRegistry from './recipeCarouselRegistry';

// ── Module-scope state (persists across React StrictMode remounts) ─────────────
// Pitfall 1: use module-scope ref so StrictMode double-mount abort reaches the same variable.
// Different name from RecipeWorkbenchPage.tsx's guard to prevent cross-page collision.

let previousGenUIRegistrationController: AbortController | null = null;

// 05-RESEARCH.md Pattern 1: swallow duplicate-tool-name errors on StrictMode second mount.
const DUPLICATE_NAME_PATTERN = /duplicate tool name|already registered/i;

// ── Commit-listener slot ──────────────────────────────────────────────────────
// Single-slot pub-sub pattern: only one chat panel is mounted at a time on
// /generative-ui, so a single callback slot is sufficient.
// Source: 06-RESEARCH.md Finding 6, 06-CONTEXT.md §commitRecipeToPlan visibility annotation.

let onCommitCallback: ((recipeId: string) => void) | null = null;

/**
 * Register a callback invoked after commitRecipeToPlan resolves MealPlanStore.addToPlan.
 * Pass `null` to clear (called on unmount by the chat panel).
 * The callback is fire-and-forget — the tool handler does NOT await it.
 */
export function setCommitListener(cb: ((recipeId: string) => void) | null): void {
  onCommitCallback = cb;
}

// ── GEN_UI_TOOLS ──────────────────────────────────────────────────────────────

/**
 * Tool array for the /generative-ui page. Two tools:
 *  - `commitRecipeToPlan` — carries `annotations.visibility: ['app']` so it is
 *    hidden from the LLM catalog and only the iframe Pick button calls it (GENUI-05).
 *  - `searchRecipes` — returns a recipe-card carousel UI resource (GENUI-04).
 *
 * Source: 05-RESEARCH.md Pattern 10 (commitRecipeToPlan) + Pattern (searchRecipes).
 */
export const GEN_UI_TOOLS: ModelContextTool[] = [
  {
    name: 'commitRecipeToPlan',
    description: 'Add a recipe to the current meal plan',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: { type: 'string', description: 'The ID of the recipe to add' },
        servings: {
          type: 'number',
          description: 'Number of servings (optional, defaults to recipe default)',
        },
      },
      required: ['recipeId'],
    },
    // GENUI-05: hidden from LLM; only the iframe Pick button calls this via the bridge.
    annotations: { visibility: ['app'] },
    // execute receives input as unknown and narrows internally (no any at public API surface).
    execute: async (input: unknown): Promise<unknown> => {
      const typedInput = input as { recipeId: string; servings?: number };
      const { recipeId, servings } = typedInput;
      await MealPlanStore.addToPlan({
        id: crypto.randomUUID(),
        recipeId,
        addedAt: Date.now(),
        servings,
      });
      // Fire-and-forget: notify the chat panel a recipe was committed. Do NOT await.
      onCommitCallback?.(recipeId);
      return { content: [{ type: 'text', text: 'Added to plan' }] };
    },
  },
  {
    name: 'searchRecipes',
    description:
      'Search the recipe library by optional ingredient and optional max cooking time. Returns a recipe-card carousel UI resource for the user to pick from.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredient: {
          type: 'string',
          description: 'Filter by ingredient name (case-insensitive partial match)',
        },
        maxMinutes: {
          type: 'number',
          description: 'Filter by maximum total cooking time in minutes',
        },
      },
      required: [],
    },
    // No annotations.visibility — this tool is visible to the LLM (GENUI-04).
    execute: async (input: unknown): Promise<unknown> => {
      const args = (input as Record<string, unknown>) ?? {};

      // Fetch full library from IndexedDB
      let filtered = await getRecipes();

      // Apply ingredient filter (case-insensitive contains against searchableIngredients)
      if (args['ingredient']) {
        const needle = (args['ingredient'] as string).toLowerCase();
        filtered = filtered.filter((r) =>
          r.searchableIngredients?.some((i) => i.toLowerCase().includes(needle)),
        );
      }

      // Apply maxMinutes filter (recipes without totalMinutes are treated as Infinity → excluded)
      if (args['maxMinutes'] != null) {
        const max = args['maxMinutes'] as number;
        filtered = filtered.filter((r) => (r.totalMinutes ?? Infinity) <= max);
      }

      // Store results in registry so ChatBox can look them up by token
      const token = crypto.randomUUID();
      recipeCarouselRegistry.setRecipes(token, filtered);

      // Return MCP-Apps shape: content for model + _meta for the host UI layer
      return {
        content: [{ type: 'text', text: `Found ${filtered.length} recipes` }],
        _meta: {
          'ui.resourceUri': `ui://gen-ui/carousel/${token}`,
          'genUI.recipeCount': filtered.length,
        },
      };
    },
  },
];

// ── registerGenUITools ────────────────────────────────────────────────────────

/**
 * Register GEN_UI_TOOLS with navigator.modelContext.
 *
 * Mirrors RecipeWorkbenchPage.tsx:164-228 exactly, with its OWN module-scope
 * guard (`previousGenUIRegistrationController`) to prevent cross-page collision.
 *
 * Returns:
 * - The new AbortController on success. Caller aborts on unmount:
 *   `const ctrl = registerGenUITools(); return () => ctrl?.abort();`
 * - null if navigator.modelContext is unavailable (browser without WebMCP flag).
 *
 * Source: 05-RESEARCH.md Pattern 1 navigator.modelContext.registerTool invocation.
 */
export function registerGenUITools(): AbortController | null {
  // Guard: WebMCP may not exist (no flag / older browser). Prefer the Chrome
  // 150+ document.modelContext, fall back to the deprecated navigator one.
  const modelContext = getModelContext();
  if (!modelContext) {
    console.warn('[GenUI] modelContext unavailable; tool registration skipped');
    return null;
  }

  // (1) Defensive abort of any prior controller from a previous mount cycle
  // (StrictMode / HMR) that the cleanup hasn't fully reconciled yet.
  if (previousGenUIRegistrationController && !previousGenUIRegistrationController.signal.aborted) {
    previousGenUIRegistrationController.abort();
  }

  // (2) Create new controller and assign to module-scope guard
  const controller = new AbortController();
  previousGenUIRegistrationController = controller;

  // (3) Wrap tools with event dispatcher for console debug logging
  const onToolEvent = (e: ToolCallEvent): void => {
    console.debug('[mcp-apps:genUI-tool]', e.kind, e.toolName);
  };
  const wrapped = wrapToolsWithEvents(GEN_UI_TOOLS, onToolEvent);

  // (4) Register each tool; swallow DUPLICATE_NAME_PATTERN per Pitfall 1
  for (const tool of wrapped) {
    try {
      registerToolSafely(modelContext, tool, { signal: controller.signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (DUPLICATE_NAME_PATTERN.test(message)) {
        // StrictMode residual — treat as success (same handler shape is already registered)
        continue;
      }
      console.error('[GenUI] Tool registration failed:', message);
      break;
    }
  }

  return controller;
}
