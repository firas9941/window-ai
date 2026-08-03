let session: LanguageModel | null = null;

export const resetModel = async () => {
  const availability = await LanguageModel.availability();
  return availability;
};

/**
 * Drop the current on-device session. Chrome can invalidate a Gemini Nano
 * session mid-conversation ("The model execution session has been destroyed").
 * Because `zeroShot` reuses the module-level `session` when `destroy` is off, a
 * dead session would otherwise be reused on every subsequent turn and keep
 * failing. Calling this guarantees the next `zeroShot` creates a fresh session.
 */
export const resetSession = (): void => {
  try {
    session?.destroy();
  } catch {
    /* session may already be destroyed — nothing to do */
  }
  session = null;
};

/** True when an error means the on-device session/model became unusable. */
export const isSessionInvalidated = (error: unknown): boolean =>
  (error as { name?: string })?.name === 'InvalidStateError';

/** A user-facing, actionable message for a chat failure. */
export const describeChatError = (error: unknown): string => {
  const name = (error as { name?: string })?.name;
  switch (name) {
    case 'NotSupportedError':
      return "This browser can't run the Prompt API (Gemini Nano) yet. Use Chrome Canary, or enable chrome://flags/#prompt-api-for-gemini-nano and #optimization-guide-on-device-model, then reload.";
    case 'InvalidStateError':
      return 'The on-device model session was reset by the browser. Please send your message again.';
    case 'NotReadableError':
      return 'The on-device model stopped unexpectedly. Please try again.';
    case 'QuotaExceededError':
      return 'That message is too large for the on-device model. Try a shorter prompt.';
    default:
      return 'Sorry, I encountered an error. Please try again.';
  }
};

export const getModelCapabilities = async () => {
  // Chrome 146 Canary runtime no longer exposes `LanguageModel.params()` even
  // though the d.ts (chat/src/app/types/dom-chromium-ai.d.ts) declares it as
  // a static method. Feature-detect at runtime so the /chat page mounts
  // cleanly when the runtime API has drifted; surface availability so the
  // banner / Model Stats panel can render "N/A" gracefully.
  type LMParams = {
    readonly defaultTopK: number;
    readonly maxTopK: number;
    readonly defaultTemperature: number;
    readonly maxTemperature: number;
  };
  type LMAvailability = "unavailable" | "downloadable" | "downloading" | "available";
  const LM = LanguageModel as unknown as {
    params?: () => Promise<LMParams>;
    availability: () => Promise<LMAvailability>;
  };
  let availability: LMAvailability = "unavailable";
  try {
    availability = await LM.availability();
  } catch {
    // Older Canary builds without availability() — fall through.
  }
  if (typeof LM.params === "function") {
    try {
      const p = await LM.params();
      return { ...p, available: availability === "available" };
    } catch {
      // Param query failed — return availability only.
    }
  }
  return { available: availability === "available" };
};

export const zeroShot = async (
  prompt: string,
  streaming = false,
  systemPrompt?: string,
  destroy = true
): Promise<string | ReadableStream<string>> => {
  if (session && destroy) {
    session.destroy();
    session = null;
  }
  if (!session) {
    const createOptions = systemPrompt
      ? { outputLanguage: 'en', initialPrompts: [{ role: 'system' as const, content: systemPrompt }] }
      : { outputLanguage: 'en' };

    session = await LanguageModel.create(createOptions);
  }

  if (!streaming) {
    return await session.prompt(prompt);
  } else {
    return session.promptStreaming(prompt);
  }
};
