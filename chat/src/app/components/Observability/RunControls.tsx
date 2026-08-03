import React from 'react';

/** The built-in APIs the demo can trace. */
export type DemoApi = 'summarizer' | 'translator' | 'prompt';

const API_LABELS: Record<DemoApi, string> = {
  summarizer: 'Summarizer',
  translator: 'Translator',
  prompt: 'Prompt (Gemini Nano)',
};

interface RunControlsProps {
  api: DemoApi;
  onApiChange: (api: DemoApi) => void;
  input: string;
  onInputChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
}

export const RunControls: React.FC<RunControlsProps> = ({
  api,
  onApiChange,
  input,
  onInputChange,
  onRun,
  running,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {(Object.keys(API_LABELS) as DemoApi[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onApiChange(key)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            api === key
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          {API_LABELS[key]}
        </button>
      ))}
    </div>
    <textarea
      value={input}
      onChange={(e) => onInputChange(e.target.value)}
      rows={3}
      className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      placeholder="Text to send to the on-device model…"
    />
    <button
      type="button"
      onClick={onRun}
      disabled={running || !input.trim()}
      className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
    >
      {running ? 'Running…' : 'Run & trace'}
    </button>
  </div>
);

export default RunControls;
