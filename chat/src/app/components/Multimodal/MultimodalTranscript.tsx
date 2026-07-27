import React, { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { type Message } from './MultimodalPage';

interface MultimodalTranscriptProps {
  messages: Message[];
  onRetry: (assistantMessageId: string) => void;
}

export const MultimodalTranscript: React.FC<MultimodalTranscriptProps> = ({
  messages,
  onRetry,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          {/* Camera icon — outline, aria-hidden, matches MultimodalHeader camera style */}
          <svg
            className="w-12 h-12 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="font-medium">Upload, drop, or paste (⌘V) an image to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="flex justify-end animate-slide-up">
              <div className="max-w-[80%] p-4 rounded-2xl shadow-sm bg-primary-500 text-white break-words">
                {msg.attachedImageUrl && (
                  <img
                    src={msg.attachedImageUrl}
                    alt="Attached"
                    className="max-w-full rounded-lg mb-2 max-h-48 object-cover"
                  />
                )}
                <div className="prose prose-sm prose-invert max-w-none">
                  <Markdown>{msg.text}</Markdown>
                </div>
              </div>
            </div>
          );
        }

        // assistant bubble
        return (
          <div key={msg.id} className="flex justify-start animate-slide-up">
            <div className="max-w-[80%] p-4 rounded-2xl shadow-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 break-words">
              {msg.error ? (
                <>
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                    {msg.error}
                  </p>
                  <button
                    onClick={() => onRetry(msg.id)}
                    className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 underline focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 rounded"
                  >
                    Retry
                  </button>
                </>
              ) : msg.text === '' ? (
                <span className="animate-pulse text-gray-500 dark:text-gray-400 font-medium">
                  Thinking…
                </span>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown>{msg.text}</Markdown>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};
