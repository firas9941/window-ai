## Enabling AI Capabilities in Chrome: Configuration and Flags Guide

### Prompt API (Chat)

1. **Chrome Flags**:
    - Enable Gemini Nano:
        - Navigate to `chrome://flags/#optimization-guide-on-device-model` and enable `BypassPerfRequirement`.
    - Enable Prompt API:
        - Navigate to `chrome://flags/#prompt-api-for-gemini-nano` and enable it.

2. **Model Verification**:
    - Verify availability in Chrome DevTools with `await LanguageModel.availability();` (returns `"available"` when ready).

### AISummarizer

1. **Chrome Flags**:
    - Enable Gemini Nano:
        - Navigate to `chrome://flags/#optimization-guide-on-device-model` and enable `BypassPerfRequirement`.
    - Enable Summarization API:
        - Navigate to `chrome://flags/#summarization-api-for-gemini-nano` and enable it.

2. **Model Setup**:
    - Use Chrome DevTools to confirm model setup with `await Summarizer.availability();`.

### Language Translation API

1. **Chrome Flags**:
    - Enable Language Detection API:
        - Navigate to `chrome://flags/#language-detection-api` and enable it.
    - Enable Translation API:
        - Navigate to `chrome://flags/#translation-api` and choose the appropriate option.

2. **Language Pack Management**:
    - Use `chrome://on-device-translation-internals/` to manage language packs.

### Writer and Rewriter API

1. **Chrome Flags**:
    - Enable Gemini Nano:
        - Navigate to `chrome://flags/#optimization-guide-on-device-model` and set to `Enabled BypassPerfRequirement`.
    - Enable Writer API:
        - Go to `chrome://flags/#writer-api-for-gemini-nano` and enable it.
    - Enable Rewriter API:
        - Go to `chrome://flags/#rewriter-api-for-gemini-nano` and enable it.

2. **Model Verification**:
    - Confirm setup with `await LanguageModel.availability();` in Chrome DevTools.
