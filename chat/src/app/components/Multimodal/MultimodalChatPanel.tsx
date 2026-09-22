import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type Message, type PageState } from './MultimodalPage';
import { MultimodalTranscript } from './MultimodalTranscript';
import { MultimodalInput } from './MultimodalInput';
import { MultimodalWebcam } from './MultimodalWebcam';
import { validateImageFile } from './imageFileValidation';
import { promptWithImage, promptWithAudio, getAudioAvailability } from '../../services/MultimodalService';

interface MultimodalChatPanelProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  pageState: PageState;
  setPageState: (s: PageState) => void;
  downloadPct: number;
  objectUrlSetRef: React.MutableRefObject<Set<string>>;
}

export const MultimodalChatPanel: React.FC<MultimodalChatPanelProps> = ({
  messages,
  setMessages,
  pageState,
  setPageState,
  downloadPct,
  objectUrlSetRef,
}) => {
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [mimeError, setMimeError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Phase 11: live mode state
  const [isLiveActive, setIsLiveActive] = useState(false);
  // Audio input (separate, GPU-gated capability; the image path is unaffected)
  const [pendingAudio, setPendingAudio] = useState<Blob | null>(null);
  const [audioAvailable, setAudioAvailable] = useState(false);

  // dragCounterRef prevents flicker when cursor crosses child elements (Pattern 4 / Pitfall 4)
  const dragCounterRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Map of userMessageId → { blob, kind } for retry re-prompt (kind picks image vs audio path)
  const pendingResendBlobsRef = useRef<Map<string, { blob: Blob; kind: 'image' | 'audio' }>>(
    new Map(),
  );

  // Attach helpers — image and audio are mutually exclusive (one attachment per message).
  const attachImage = useCallback((blob: Blob | null) => {
    setPendingImage(blob);
    if (blob) setPendingAudio(null);
  }, []);
  const attachAudio = useCallback((blob: Blob | null) => {
    setPendingAudio(blob);
    if (blob) setPendingImage(null);
  }, []);

  // Probe audio availability once — separate from the page's image availability so a
  // no-GPU device (audio 'unavailable') still gets the full image demo.
  useEffect(() => {
    let cancelled = false;
    getAudioAvailability()
      .then((a) => {
        if (!cancelled) setAudioAvailable(a !== 'unavailable');
      })
      .catch(() => {
        /* leave audioAvailable = false */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 11: live mode appends each frame to the transcript as a new user+assistant pair.
  // handleLiveFrame creates both messages and returns the assistant streamingId so subsequent
  // chunks land in the right bubble (transcript persists; old frames remain visible).
  const handleLiveFrame = useCallback(
    (blob: Blob, prompt: string): string => {
      const userMsgId = crypto.randomUUID();
      const streamingId = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlSetRef.current.add(objectUrl);
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text: prompt, attachedImageUrl: objectUrl },
        { id: streamingId, role: 'assistant', text: '' },
      ]);
      return streamingId;
    },
    [setMessages, objectUrlSetRef],
  );

  const handleLiveChunk = useCallback(
    (streamingId: string, chunk: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === streamingId ? { ...m, text: m.text + chunk } : m)),
      );
    },
    [setMessages],
  );

  // ---------------------------------------------------------------------------
  // runPrompt: shared streaming loop invoked by both handleSend and handleRetry
  // ---------------------------------------------------------------------------
  const runPrompt = useCallback(
    async (
      promptText: string,
      blob: Blob,
      streamingId: string,
      kind: 'image' | 'audio' = 'image',
    ) => {
      setPageState('prompting');
      abortControllerRef.current = new AbortController();
      try {
        const stream =
          kind === 'audio'
            ? await promptWithAudio(promptText, blob, {
                signal: abortControllerRef.current.signal,
              })
            : await promptWithImage(promptText, blob, {
                signal: abortControllerRef.current.signal,
              });
        const reader = stream.getReader();
        // Pitfall 1: use reader.read() loop, NOT for-await; releaseLock in finally
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            setMessages((prev) =>
              prev.map((m) => (m.id === streamingId ? { ...m, text: m.text + value } : m)),
            );
          }
          setPageState('ready');
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        // WR-01: AbortError means the stream was intentionally cancelled (e.g., on unmount).
        // Do not show an error bubble — just reset state and return silently.
        if (err instanceof DOMException && err.name === 'AbortError') {
          setPageState('ready');
          return;
        }
        const message = err instanceof Error ? err.message : 'Unknown error';
        const noun = kind === 'audio' ? 'audio' : 'image';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? { ...m, text: '', error: `Couldn't process ${noun} — ${message}` }
              : m,
          ),
        );
        setPageState('ready'); // return to ready so user can retry or send a new message
      }
    },
    [setMessages, setPageState],
  );

  // WR-01: Abort in-flight stream on unmount to signal the Chrome API to stop processing
  // and prevent React setState warnings from async updates firing after unmount.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // handleSend: commits user message + empty assistant bubble, then streams
  // ---------------------------------------------------------------------------
  const handleSend = useCallback(async () => {
    // Audio takes precedence when both somehow set; normally they're mutually exclusive.
    const attachment = pendingAudio
      ? { blob: pendingAudio, kind: 'audio' as const }
      : pendingImage
        ? { blob: pendingImage, kind: 'image' as const }
        : null;
    if (!attachment || !text.trim() || pageState !== 'ready') return;

    // 1. Create object URL at COMMIT TIME (not for the pending preview — Pitfall 2)
    const objectUrl = URL.createObjectURL(attachment.blob);
    objectUrlSetRef.current.add(objectUrl);

    // 2. Capture current values before resetting state
    const userText = text.trim();
    const userMsgId = crypto.randomUUID();
    const streamingId = crypto.randomUUID();

    // 3. Append user + empty assistant messages (image or audio attachment URL)
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        text: userText,
        ...(attachment.kind === 'audio'
          ? { attachedAudioUrl: objectUrl }
          : { attachedImageUrl: objectUrl }),
      },
      { id: streamingId, role: 'assistant', text: '' },
    ]);

    // 4. Store blob + kind for potential retry
    pendingResendBlobsRef.current.set(userMsgId, {
      blob: attachment.blob,
      kind: attachment.kind,
    });

    // 5. Reset input
    setText('');
    setPendingImage(null);
    setPendingAudio(null);

    // 6. Stream response
    await runPrompt(userText, attachment.blob, streamingId, attachment.kind);
  }, [pendingImage, pendingAudio, text, pageState, objectUrlSetRef, setMessages, runPrompt]);

  // ---------------------------------------------------------------------------
  // handleRetry: removes the failed assistant bubble and re-prompts with stored blob
  // ---------------------------------------------------------------------------
  const handleRetry = useCallback(
    async (assistantMessageId: string) => {
      // CR-03: guard concurrent sends — same pattern as handleSend
      if (pageState !== 'ready') return;

      // WR-02: Read the latest messages state via functional setMessages to avoid
      // stale-closure bugs (the closed-over `messages` prop may be stale if a
      // concurrent streaming update arrived between render and click).
      let userMsg: Message | undefined;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantMessageId);
        if (idx < 1 || prev[idx - 1].role !== 'user') return prev; // no-op
        userMsg = prev[idx - 1];
        return prev; // state unchanged — read only
      });

      if (!userMsg) return;

      // Retrieve the original blob + kind from the store
      const stored = pendingResendBlobsRef.current.get(userMsg.id);
      if (!stored) {
        // Blob no longer available — remove the error bubble so user can re-attach
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        return;
      }

      // Replace the failed assistant message with a fresh streaming placeholder
      const newStreamingId = crypto.randomUUID();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { id: newStreamingId, role: 'assistant', text: '' }
            : m,
        ),
      );

      // Re-prompt with the same text, blob, and media kind
      await runPrompt(userMsg.text, stored.blob, newStreamingId, stored.kind);
    },
    [setMessages, runPrompt, pageState],
  );

  // ---------------------------------------------------------------------------
  // Drag handlers — ref counter prevents flicker on child element crossings (Pitfall 4)
  // ---------------------------------------------------------------------------
  const handleDragEnter = (e: React.DragEvent) => {
    if (isLiveActive) return;
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // required — without this, drop navigates away
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isLiveActive) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const result = validateImageFile(file);
    if (!result.valid) {
      setMimeError(result.error ?? 'Invalid file');
      return;
    }
    setMimeError(null);
    attachImage(file);
  };

  // ---------------------------------------------------------------------------
  // Upload: click-to-choose file picker. Reuses the same validate → setPendingImage
  // path as drop/paste. Resetting value='' lets the user re-pick the same file.
  // ---------------------------------------------------------------------------
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = validateImageFile(file);
    if (!result.valid) {
      setMimeError(result.error ?? 'Invalid file');
      return;
    }
    setMimeError(null);
    attachImage(file);
  };

  // ---------------------------------------------------------------------------
  // Audio upload — a Blob sent via the Prompt API's audio input (requires a GPU).
  // ---------------------------------------------------------------------------
  const handleAudioUploadClick = () => audioInputRef.current?.click();

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setMimeError('Please choose an audio file (mp3, wav, ogg, m4a, …)');
      return;
    }
    setMimeError(null);
    attachAudio(file);
  };

  return (
    <div
      className={[
        'bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-200',
        'h-full min-h-[60vh] lg:min-h-[600px] flex flex-col relative',
        isDragOver
          ? 'border-2 border-dashed border-primary-500'
          : 'border border-gray-200 dark:border-gray-700',
      ].join(' ')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay — pointer-events-none so the drop event reaches the container handler */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary-50/80 dark:bg-primary-900/40 rounded-xl flex items-center justify-center z-10 pointer-events-none">
          <p className="text-primary-700 dark:text-primary-300 text-lg font-medium">
            Drop image here
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 h-full min-h-0">
        {/* Transcript — flex-1 so it fills available height and scrolls internally.
            Phase 11: stays visible during live mode so each frame's user + assistant
            bubble (appended by handleLiveFrame) renders into the same history. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MultimodalTranscript messages={messages} onRetry={handleRetry} />
        </div>

        {/* Download progress bar — shown only while model is downloading */}
        {pageState === 'downloading' && (
          <div className="mt-4">
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-[width] duration-300"
                style={{ width: `${downloadPct}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
              Downloading multimodal model — {downloadPct.toFixed(0)}%
            </p>
          </div>
        )}

        {/* Input area — text + pendingImage state live here; mimeError lifted for drop + paste */}
        <MultimodalInput
          text={text}
          setText={setText}
          pendingImage={pendingImage}
          setPendingImage={attachImage}
          pendingAudio={pendingAudio}
          setPendingAudio={setPendingAudio}
          onSend={handleSend}
          pageState={pageState}
          mimeError={mimeError}
          setMimeError={setMimeError}
          isLiveActive={isLiveActive}
          webcamSlot={
            <MultimodalWebcam
              pageState={pageState}
              livePrompt={text}
              onFrameAttach={(blob) => attachImage(blob)}
              setIsLiveActive={setIsLiveActive}
              onLiveFrame={handleLiveFrame}
              onLiveChunk={handleLiveChunk}
              leadingTools={
                <>
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={isLiveActive || pageState === 'unavailable' || pageState === 'prompting'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                  >
                    {/* Upload (tray + up-arrow) SVG icon */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={handleAudioUploadClick}
                    disabled={!audioAvailable || isLiveActive || pageState === 'prompting'}
                    title={audioAvailable ? undefined : 'Audio input needs a GPU (Chrome 148+)'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                  >
                    {/* Audio (musical note) SVG icon */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                    Upload audio
                  </button>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleAudioFileChange}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </>
              }
            />
          }
        />
      </div>
    </div>
  );
};
