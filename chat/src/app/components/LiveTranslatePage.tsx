import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  isSupported as isLiveTranscriptionSupported,
  start as startLiveTranscription,
  LiveTranscriptionHandle,
} from '../services/LiveTranscriptionService';
import { useSEOData, seoConfigs } from '../hooks/useSEOData';
import ThemeToggle from './ThemeToggle';
import Tabs from './Tabs';
import { DocsRenderer } from '../tools/DocsRenderer';
import AutoScrollFeed from './LiveTranslate/AutoScrollFeed';
import TranslationPane from './LiveTranslate/TranslationPane';

// All target languages we offer for translation. Short ISO codes match what
// the Chrome Translator API expects.
const TARGET_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'he', name: 'Hebrew' },
  { code: 'ar', name: 'Arabic' },
];

// BCP-47 tags for the Web Speech API. The short prefix (before the '-')
// doubles as the Translator source language, so picking en-US here both sets
// recognition to American English AND tells panes to translate from `en`.
const SPEECH_LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'uk-UA', name: 'Ukrainian' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'he-IL', name: 'Hebrew' },
  { code: 'ar-SA', name: 'Arabic' },
];

const DEFAULT_SPEECH_LANG = 'en-US';

type Mode = 'final' | 'interim';

interface TargetPane {
  id: string;
  lang: string;
}

const langName = (code: string) =>
  TARGET_LANGUAGES.find((l) => l.code === code)?.name ?? code;

const newPaneId = () =>
  `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * LiveTranslatePage — orchestrates the speech recognizer and N translation
 * panes.
 *
 * State ownership:
 *  - `transcript` and `interimText` are the source of truth for what the user
 *    said. Append-only — once a sentence finalizes it's never mutated.
 *  - `targetPanes` is the list of translation pane configs (id + target lang).
 *    Each TranslationPane child owns its own translation state internally and
 *    subscribes to `transcript` / `interimText` via props.
 *
 * No translation logic lives at this level. The page is purely the recognizer
 * driver + the pane configurator.
 */
const LiveTranslatePage: React.FC = () => {
  const location = useLocation();
  const isDocs = location.pathname.endsWith('-api-documentation');
  useSEOData(
    isDocs ? seoConfigs.liveTranslateDocs : seoConfigs.liveTranslate,
    isDocs ? '/live-translate/live-translate-api-documentation' : '/live-translate/live-translate-demo',
  );

  const supported = isLiveTranscriptionSupported();

  // ── Recognizer state ──
  const [isListening, setIsListening] = useState<boolean>(false);
  const [mode, setMode] = useState<Mode>('final');
  const [speechLang, setSpeechLang] = useState<string>(DEFAULT_SPEECH_LANG);

  // ── Source transcript (append-only) ──
  const [transcript, setTranscript] = useState<string[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── User-configurable translation panes ──
  const [targetPanes, setTargetPanes] = useState<TargetPane[]>([
    { id: newPaneId(), lang: 'es' },
    { id: newPaneId(), lang: 'fr' },
  ]);
  const [addLang, setAddLang] = useState<string>('de');

  // Translator wants the short language code; speech API wants BCP-47.
  const sourceLang = speechLang.split('-')[0];

  // ── Refs ──
  // Web Speech recognition handle.
  const handleRef = useRef<LiveTranscriptionHandle | null>(null);
  // Track whether `mode` changes mid-session so we know to leave the
  // recognizer alone on certain re-renders.
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── Recognizer callbacks. handleFinal appends to transcript; handleInterim
  //    updates interimText. Translation panes pick up changes via props. ──

  const handleFinal = useCallback((text: string) => {
    if (!text.trim()) return;
    setTranscript((prev) => [...prev, text]);
    setInterimText('');
  }, []);

  const handleInterim = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  // ── Start / Stop ──
  const handleStart = useCallback(() => {
    setGlobalError(null);
    try {
      handleRef.current = startLiveTranscription(handleInterim, handleFinal, {
        lang: speechLang,
        onError: (err) => {
          setGlobalError(err.message);
          setIsListening(false);
        },
        onEnd: () => setIsListening(false),
      });
      setIsListening(true);
    } catch (e) {
      setGlobalError((e as Error).message);
    }
  }, [handleFinal, handleInterim, speechLang]);

  const handleStop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setIsListening(false);
  }, []);

  // When speech language changes mid-session, restart the recognizer with the
  // new language. Don't clear transcript or panes — panes drive themselves
  // from sourceLang, so they'll start translating from the new language
  // automatically. (Old translations remain in each pane's list — they were
  // valid translations of valid source, just from a different language now.)
  const didMountSpeechLangRef = useRef<boolean>(false);
  useEffect(() => {
    if (!didMountSpeechLangRef.current) {
      didMountSpeechLangRef.current = true;
      return;
    }
    if (handleRef.current) {
      handleRef.current.stop();
      handleRef.current = null;
      setInterimText('');
      const id = window.setTimeout(() => {
        handleStart();
      }, 50);
      return () => window.clearTimeout(id);
    }
  }, [speechLang, handleStart]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      handleRef.current?.stop();
    };
  }, []);

  // ── Pane management ──
  const addPane = () => {
    setTargetPanes((prev) => [...prev, { id: newPaneId(), lang: addLang }]);
  };
  const removePane = (id: string) => {
    setTargetPanes((prev) => prev.filter((p) => p.id !== id));
  };

  // ── Clear: wipes source transcript + interim. Translation panes detect
  //    sourceLines.length dropping to 0 and reset themselves. ──
  const handleClear = () => {
    setTranscript([]);
    setInterimText('');
    setGlobalError(null);
  };

  const demoContent = !supported ? (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700 text-amber-900 dark:text-amber-100 p-4">
      <strong>Live transcription unavailable.</strong> This demo requires Chrome desktop with
      microphone access. Try a Chromium-based browser on desktop.
    </div>
  ) : (
    <>
      {/* Section 1 — Source transcript (live captions) */}
      <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 mb-6 transition-colors duration-200">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Source ({SPEECH_LANGUAGES.find((l) => l.code === speechLang)?.name ?? speechLang})
          </h2>
          <div className="flex items-center gap-2">
            <label htmlFor="speechLang" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              I&apos;ll speak in
            </label>
            <select
              id="speechLang"
              value={speechLang}
              onChange={(e) => setSpeechLang(e.target.value)}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {SPEECH_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <AutoScrollFeed
          lines={transcript}
          inProgress={interimText}
          placeholder='Click "Start Listening" and speak — your words will appear here.'
          error={globalError}
        />
      </section>

      {/* Section 2 — Translation panes (one per target language) */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {targetPanes.length === 0
              ? 'No translation panes yet — add one to start translating.'
              : `${targetPanes.length} translation pane${targetPanes.length === 1 ? '' : 's'}`}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="addLang" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Add translation in
            </label>
            <select
              id="addLang"
              value={addLang}
              onChange={(e) => setAddLang(e.target.value)}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {TARGET_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addPane}
              className="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg transition-colors duration-200 text-sm font-medium"
            >
              + Add
            </button>
          </div>
        </div>

        {targetPanes.length > 0 && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
          >
            {targetPanes.map((pane) => (
              <TranslationPane
                key={pane.id}
                id={pane.id}
                sourceLang={sourceLang}
                targetLang={pane.lang}
                targetLabel={langName(pane.lang)}
                sourceLines={transcript}
                liveInterim={interimText}
                previewInterim={mode === 'interim'}
                onRemove={() => removePane(pane.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 3 — Controls */}
      <section className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
        <div className="flex flex-wrap items-center gap-4">
          {!isListening ? (
            <button
              onClick={handleStart}
              className="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19v3" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 22h8" />
              </svg>
              Start Listening
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="inline-flex items-center bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 font-medium"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-red-300 animate-pulse mr-2" />
              Stop
            </button>
          )}

          <fieldset className="flex items-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            <legend className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 px-1">
              Mode
            </legend>
            <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="final"
                checked={mode === 'final'}
                onChange={() => setMode('final')}
                className="mr-2"
              />
              Per finalized sentence
            </label>
            <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="interim"
                checked={mode === 'interim'}
                onChange={() => setMode('interim')}
                className="mr-2"
              />
              Rolling interim (live preview)
            </label>
          </fieldset>

          <button
            onClick={handleClear}
            className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
          >
            Clear
          </button>
        </div>
      </section>
    </>
  );

  // Docs tab first; every tab has a real path and Tabs derives the active tab from the URL.
  const tabs = useMemo(
    () => [
      {
        id: 'docs',
        label: 'API Documentation',
        path: '/live-translate-api-documentation',
        content: (
          <div className="max-w-none">
            <DocsRenderer docFile="Live-Translate-API.md" initOpen={true} />
          </div>
        ),
      },
      {
        id: 'demo',
        label: 'Demo',
        path: '/live-translate-demo',
        content: demoContent,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demoContent],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 rounded-lg shadow-md transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-primary-500 to-purple-600 text-white p-3 rounded-xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19v3" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 22h8" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Live Voice Translation</h1>
              <p className="text-gray-600 dark:text-gray-400">Web Speech API + Chrome Translator API</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <ThemeToggle />
          </div>
        </header>

        <Tabs basePath="/live-translate" defaultTab="docs" tabs={tabs} />
      </div>
    </div>
  );
};

export default LiveTranslatePage;
