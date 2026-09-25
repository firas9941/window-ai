import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerToolSafely } from './modelContext';

// Lets any attached .catch (a microtask) run before we assert.
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Minimal fake ModelContext whose registerTool returns a chosen value/promise. */
function fakeContext(registerTool: (...args: unknown[]) => unknown): ModelContext {
  return { registerTool } as unknown as ModelContext;
}
const tool = {} as unknown as ModelContextTool;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerToolSafely', () => {
  it('swallows the AbortError the signal-abort teardown rejects with', async () => {
    // Chrome rejects registerTool's lifetime promise with this exact error on abort.
    const err = new DOMException('signal is aborted without reason', 'AbortError');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // If the helper failed to attach a .catch, this rejection would surface as an
    // unhandled rejection and fail the test.
    registerToolSafely(
      fakeContext(() => Promise.reject(err)),
      tool,
    );
    await flush();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a non-AbortError rejection instead of swallowing it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerToolSafely(
      fakeContext(() => Promise.reject(new Error('boom'))),
      tool,
    );
    await flush();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0] ?? '')).toMatch(/registerTool rejected/i);
  });

  it('lets a synchronous throw (e.g. duplicate tool name) propagate to the caller', () => {
    const ctx = fakeContext(() => {
      throw new Error('Duplicate tool name: scaleRecipe');
    });
    expect(() => registerToolSafely(ctx, tool)).toThrow(/duplicate tool name/i);
  });

  it('is a no-op when registerTool returns void (older builds)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => registerToolSafely(fakeContext(() => undefined), tool)).not.toThrow();
    await flush();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
