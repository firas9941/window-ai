import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSEOData, seoConfigs } from '../../hooks/useSEOData';
import { MissingFlagBanner } from '../MissingFlagBanner';
import Tabs from '../Tabs';
import { DocsRenderer } from '../../tools/DocsRenderer';
import { ProofreaderHeader } from './ProofreaderHeader';
import { ProofreaderForm } from './ProofreaderForm';
import { ProofreaderOutputModeToggle, type OutputMode } from './ProofreaderOutputModeToggle';
import { ProofreaderResultPanel } from './ProofreaderResultPanel';
import {
  getAvailability,
  proofread,
  createWithProgress,
  destroyAllSessions,
  LANGUAGE_OPTIONS,
  LOCAL_STORAGE_KEY,
  type ProofreaderLanguageCode,
} from '../../services/ProofreaderService';

type PageState = 'idle' | 'unavailable' | 'downloading' | 'ready' | 'proofreading' | 'error';

const DEFAULT_DEMO_TEXT =
  'i think there going to a meetting tommorow at the office. there progress have been great on the project!';

export const ProofreaderPage: React.FC = () => {
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.proofreaderDocs : seoConfigs.proofreader,
    isDocs ? '/proofreader/proofreader-api-documentation' : '/proofreader/proofreader-demo',
  );

  const [pageState, setPageState] = useState<PageState>('idle');
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState('');
  const [downloadPct, setDownloadPct] = useState(0);
  const [language, setLanguage] = useState<ProofreaderLanguageCode>('en');
  const OUTPUT_MODE_KEY = 'window-ai.proofreader.outputMode';
  const VALID_MODES: OutputMode[] = ['plain', 'side-by-side', 'inline-strikethrough'];

  const [mode, setMode] = useState<OutputMode>(() => {
    try {
      const stored = localStorage.getItem(OUTPUT_MODE_KEY);
      if (stored && (VALID_MODES as string[]).includes(stored)) {
        return stored as OutputMode;
      }
    } catch {
      // private mode / SSR no-op
    }
    return 'plain';
  });

  const onModeChange = useCallback(
    (m: OutputMode) => {
      setMode(m);
      try {
        localStorage.setItem(OUTPUT_MODE_KEY, m);
      } catch {
        // private mode / SSR no-op
      }
    },
    [],
  );

  // Mount effect 1: read language preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored && LANGUAGE_OPTIONS.some((o) => o.code === stored)) {
        setLanguage(stored as ProofreaderLanguageCode);
      }
    } catch {
      // private mode / SSR no-op
    }
  }, []);

  // Mount effect 2: availability check — StrictMode-safe with cancelled flag
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const availability = await getAvailability(language);
        if (cancelled) return;
        if (availability === 'unavailable') {
          setPageState('unavailable');
        } else if (availability === 'available') {
          setPageState('ready');
        } else {
          // 'downloadable' | 'downloading'
          setPageState('downloading');
          try {
            await createWithProgress(language, (pct) => {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLanguageChange = useCallback((lang: ProofreaderLanguageCode) => {
    setLanguage(lang);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, lang);
    } catch {
      // private mode / SSR no-op
    }
  }, []);

  const onProofread = useCallback(
    async (text: string, lang: ProofreaderLanguageCode) => {
      setPageState('proofreading');
      setError(null);
      setOriginalText(text);
      try {
        const r = await proofread(text, { language: lang });
        setResult(r);
        setPageState('ready');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setPageState('error');
      }
    },
    [],
  );

  const onRetry = useCallback(() => {
    if (originalText) {
      void onProofread(originalText, language);
    }
  }, [originalText, language, onProofread]);

  const docsContent = (
    <div className="max-w-none">
      <DocsRenderer docFile="Proofreader-API.md" initOpen={true} />
    </div>
  );

  const workbenchContent = (
    <>
      <ProofreaderForm
        defaultText={DEFAULT_DEMO_TEXT}
        defaultLanguage={language}
        disabled={pageState === 'unavailable'}
        isSubmitting={pageState === 'proofreading'}
        onProofread={onProofread}
        onLanguageChange={onLanguageChange}
      />
      {pageState === 'downloading' && (
        <div className="mt-4">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-primary-500"
              style={{ width: `${downloadPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Downloading Proofreader model — {downloadPct.toFixed(0)}%
          </p>
        </div>
      )}
      <div className="mt-6">
        <ProofreaderOutputModeToggle mode={mode} onChange={onModeChange} />
      </div>
      <ProofreaderResultPanel
        result={result}
        mode={mode}
        originalText={originalText}
        error={error}
        onRetry={onRetry}
      />
    </>
  );

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/proofreader-api-documentation',
        content: docsContent,
      },
      {
        id: 'workbench',
        label: 'Workbench',
        path: '/proofreader-demo',
        content: workbenchContent,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workbenchContent, docsContent],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        {pageState === 'unavailable' && (
          <MissingFlagBanner
            title="Proofreader API isn't enabled in this browser."
            body="Enable the flags below in Chrome 146+ Canary, then reload."
            flags={[
              {
                name: 'Optimization Guide On Device',
                url: 'chrome://flags/#optimization-guide-on-device-model',
                note: 'set to "Enabled BypassPerfRequirement"',
              },
              {
                name: 'Proofreader API',
                url: 'chrome://flags/#proofreader-api-for-gemini-nano',
                note: 'set to "Enabled"',
              },
            ]}
            browserRequirement="Chrome 146+ Canary"
          />
        )}
        <ProofreaderHeader />
        <Tabs basePath="/proofreader" defaultTab="docs" tabs={tabs} />
        <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          🔒 Zero network during demo — open DevTools → Network tab
        </p>
      </div>
    </div>
  );
};
