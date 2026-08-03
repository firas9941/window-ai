import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSEOData, seoConfigs } from '../../hooks/useSEOData';
import { MissingFlagBanner } from '../MissingFlagBanner';
import Tabs from '../Tabs';
import { DocsRenderer } from '../../tools/DocsRenderer';
import { MultimodalHeader } from './MultimodalHeader';
import { MultimodalChatPanel } from './MultimodalChatPanel';
import {
  getAvailability,
  createWithProgress,
  destroyAllSessions,
} from '../../services/MultimodalService';

export type PageState = 'idle' | 'unavailable' | 'downloading' | 'ready' | 'prompting' | 'error';

export type Message = {
  id: string;                  // crypto.randomUUID()
  role: 'user' | 'assistant';
  text: string;                // assistant streams in; user text is final
  attachedImageUrl?: string;   // user-only; object URL from URL.createObjectURL(blob)
  error?: string;              // assistant-only; set when promptWithImage throws (Plan 02 wires this)
};

export const MultimodalPage: React.FC = () => {
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.multimodalDocs : seoConfigs.multimodal,
    isDocs ? '/multimodal/multimodal-api-documentation' : '/multimodal/multimodal-demo',
  );

  const [pageState, setPageState] = useState<PageState>('idle');
  const [downloadPct, setDownloadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // messages + objectUrlSetRef declared here so Plan 02 is purely additive
  const [messages, setMessages] = useState<Message[]>([]);
  const objectUrlSetRef = useRef<Set<string>>(new Set());

  // Suppress unused variable warning for error (error state not yet rendered in the UI)
  void error;

  // Mount effect — StrictMode-safe availability check with cancelled flag
  // Mirrors ProofreaderPage.tsx lines 80–120 exactly; swaps Proofreader service for Multimodal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const availability = await getAvailability();
        if (cancelled) return;
        if (availability === 'unavailable') {
          setPageState('unavailable');
        } else if (availability === 'available') {
          setPageState('ready');
        } else {
          // 'downloadable' | 'downloading'
          setPageState('downloading');
          try {
            await createWithProgress((pct) => {
              if (!cancelled) setDownloadPct(pct);
            });
            if (!cancelled) setPageState('ready');
          } catch (downloadErr) {
            if (!cancelled) {
              const message =
                downloadErr instanceof Error ? downloadErr.message : 'Model download failed';
              setError(message);
              setPageState('error');
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setError(message);
          setPageState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      destroyAllSessions();
      objectUrlSetRef.current.forEach(url => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/multimodal-api-documentation',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="Multimodal-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'chat',
        label: 'Chat',
        path: '/multimodal-demo',
        content: (
          <MultimodalChatPanel
            messages={messages}
            setMessages={setMessages}
            pageState={pageState}
            setPageState={setPageState}
            downloadPct={downloadPct}
            objectUrlSetRef={objectUrlSetRef}
          />
        ),
      },
    ],
    [messages, pageState, downloadPct, setMessages, setPageState, objectUrlSetRef],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        {pageState === 'unavailable' && (
          <MissingFlagBanner
            title="Multimodal image input isn't available."
            body="Update to Chrome 148+ stable, or enable the flags below in Chrome 146+ Canary, then reload."
            flags={[
              {
                name: 'Optimization Guide On Device',
                url: 'chrome://flags/#optimization-guide-on-device-model',
                note: 'set to "Enabled BypassPerfRequirement"',
              },
              {
                name: 'Prompt API multimodal input',
                url: 'chrome://flags/#prompt-api-for-gemini-nano-multimodal-input',
                note: 'set to "Enabled"',
              },
            ]}
            browserRequirement="Chrome 148+ stable (no flags) or Chrome 146+ Canary"
          />
        )}
        <MultimodalHeader />
        <Tabs basePath="/multimodal" defaultTab="docs" tabs={tabs} />
        <p className="mt-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
          🔒 Zero network during demo — open DevTools → Network tab
        </p>
      </div>
    </div>
  );
};
