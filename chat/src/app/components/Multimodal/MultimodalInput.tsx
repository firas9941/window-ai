import React, { useEffect, useState } from 'react';
import { type PageState } from './MultimodalPage';
import { validateImageFile } from './imageFileValidation';

interface MultimodalInputProps {
  text: string;
  setText: (text: string) => void;
  pendingImage: Blob | null;
  setPendingImage: (blob: Blob | null) => void;
  onSend: () => void;
  pageState: PageState;
  /** Lifted from ChatPanel so both drop (ChatPanel) and paste (Input) share the same error state */
  mimeError: string | null;
  setMimeError: (error: string | null) => void;
  /** Phase 11: when true, textarea + send row are replaced with a prompt-lock badge; paste handler is inert. */
  isLiveActive: boolean; // required — optional typing allowed silent omission (IN-02)
  /** Phase 11: <MultimodalWebcam> rendered at the top of the input frame (tools row + video/error slot). */
  webcamSlot?: React.ReactNode;
}

export const MultimodalInput: React.FC<MultimodalInputProps> = ({
  text,
  setText,
  pendingImage,
  setPendingImage,
  onSend,
  pageState,
  mimeError,
  setMimeError,
  isLiveActive,
  webcamSlot,
}) => {
  // Auto-clear MIME error after 4 seconds
  useEffect(() => {
    if (!mimeError) return;
    const timer = setTimeout(() => setMimeError(null), 4000);
    return () => clearTimeout(timer);
  }, [mimeError, setMimeError]);

  // CR-01 fix: createObjectURL is a side-effect — must live in useEffect, not useMemo.
  // React 18+ StrictMode double-invokes useMemo factories in development, creating a
  // leaked URL (the discarded first invocation's URL is never revoked). useEffect runs
  // once per pendingImage change and its cleanup always revokes the URL it created.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPreviewUrl(url);
    // Revoke this specific URL on cleanup (pendingImage change or unmount).
    // This is the PREVIEW URL only — the committed Message URL is created at send-time
    // in MultimodalChatPanel.handleSend and tracked in objectUrlSetRef.
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pendingImage]);

  const handleImageFile = (file: File) => {
    const result = validateImageFile(file);
    if (!result.valid) {
      setMimeError(result.error ?? 'Invalid file');
      return;
    }
    setMimeError(null);
    setPendingImage(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isLiveActive) return;
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return; // no image — let default paste handle text
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) handleImageFile(file);
  };

  const canSend = !isLiveActive && text.trim().length > 0 && pendingImage !== null && pageState === 'ready';

  const sendButtonTooltip =
    pageState === 'unavailable'
      ? 'Enable multimodal image input to use this demo'
      : pageState === 'downloading'
        ? 'Download model first'
        : pageState === 'idle'
          ? 'Checking availability…'
          : pageState === 'error'
            ? 'An error occurred — please reload the page'
            : pendingImage === null
              ? 'Attach an image first'
              : text.trim().length === 0
                ? 'Type a question about the image'
                : undefined;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
      {/* Phase 11: webcam tools row + video preview (rendered by parent as <MultimodalWebcam>) */}
      {webcamSlot && (
        <div className="mb-2">{webcamSlot}</div>
      )}
      {pendingImage && previewUrl && (
        <div className="relative inline-block mb-2">
          <img
            src={previewUrl}
            alt="Pending attachment"
            className="w-20 h-20 object-cover rounded"
          />
          <button
            onClick={() => setPendingImage(null)}
            aria-label="Remove attached image"
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 text-xs flex items-center justify-center hover:bg-red-600 dark:hover:bg-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            ×
          </button>
        </div>
      )}
      <textarea
        className={`w-full resize-none bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm font-medium min-h-[48px] max-h-[120px] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800${isLiveActive ? ' opacity-60 cursor-not-allowed' : ''}`}
        placeholder="Upload, drop, or paste (⌘V) an image — then ask me about it"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={handlePaste}
        disabled={isLiveActive || pageState === 'unavailable' || pageState === 'prompting'}
      />
      {mimeError && (
        <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{mimeError}</p>
      )}
      {isLiveActive ? (
        // Prompt-lock badge replaces send button during live mode (UI-SPEC § Prompt Lock Badge)
        <div className="flex items-center justify-center mt-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400">
            Live mode active — prompt locked
          </span>
        </div>
      ) : (
        <div className="flex justify-end mt-2">
          <button
            onClick={onSend}
            disabled={!canSend}
            title={sendButtonTooltip}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium text-sm disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            {pageState === 'prompting' ? (
              <>
                {/* Spinner SVG — w-4 h-4 animate-spin */}
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Sending…
              </>
            ) : (
              <>
                {/* Paper-plane SVG — w-4 h-4 */}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Send
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
