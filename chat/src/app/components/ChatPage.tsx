
import React, {useEffect, useState, useRef} from 'react';
import { Link } from 'react-router-dom';
import ChatBox from './ChatBox';
import ChatInput from './ChatInput';
import Tabs from './Tabs';
import {getModelCapabilities, zeroShot, resetSession, describeChatError, isSessionInvalidated} from '../services/ChatAIService';
import {DocsRenderer} from "../tools/DocsRenderer";
import {isChromeCanary} from "../tools/isCanary";
import { useSEOData, seoConfigs } from '../hooks/useSEOData';
import { useGoogleAnalytics } from '../hooks/useGoogleAnalytics';

interface Message {
  id: number;
  text: string;
  sender: string;
}

const isCanary = isChromeCanary()

const ChatPage: React.FC = () => {
  useSEOData(seoConfigs.chat, '/chat');
  const { trackChatEvent, trackError } = useGoogleAnalytics();
  
  const [systemMsg, setSystemMsg] = useState<string>('');
  const [destroy, setDestroy] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [useStream, setUseStream] = useState<boolean>(true);
  const [temperature, setTemperature] = useState<number>(1);
  const [modelCaps, setModelCaps] = useState<{
    defaultTopK?: number;
    maxTopK?: number;
    defaultTemperature?: number;
    maxTemperature?: number;
    available?: boolean;
  }>();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messageIdCounter = useRef<number>(0);

  useEffect(() => {
    getModelCapabilities().then((resp) => {
      setModelCaps(resp);
    });
  }, []);

  const addMessage = async (response: string | ReadableStream<string>, sender = 'User') => {
    if (typeof response === 'string') {
      messageIdCounter.current += 1;
      const newMessage: Message = {
        id: messageIdCounter.current,
        text: response,
        sender,
      };
      setMessages((prevMessages) => [...prevMessages, newMessage]);
    } else {
      messageIdCounter.current += 1;
      const newMessage: Message = {
        id: messageIdCounter.current,
        text: '',
        sender: 'Bot',
      };
      setMessages((prevMessages) => [...prevMessages, newMessage]);

      // Handle streaming response
      const reader = response.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          setMessages((prevMessages) => {
            // Immutable update: under React StrictMode the setState updater is
            // invoked twice with the same `prev` reference. The previous
            // implementation mutated `lastMessage.text` in place which caused
            // every chunk to be appended twice ("HiHi there there!!"). This
            // form mirrors the canonical pattern used by WriteRewritePage,
            // Summary, and TranslatePage (`setX(prev => prev + value)`).
            if (prevMessages.length === 0) return prevMessages;
            const lastIdx = prevMessages.length - 1;
            const lastMessage = prevMessages[lastIdx];
            const updatedLast: Message = {
              ...lastMessage,
              text: isCanary ? lastMessage.text + value : value,
            };
            return [...prevMessages.slice(0, lastIdx), updatedLast];
          });
        }
      } finally {
        reader.releaseLock();
      }
    }
  };

  // Show a Bot error message. If the current turn already appended a (streaming)
  // Bot bubble, merge the note into it; otherwise append a fresh Bot bubble.
  const showErrorMessage = (text: string) => {
    messageIdCounter.current += 1;
    const id = messageIdCounter.current;
    setMessages((prevMessages) => {
      const last = prevMessages[prevMessages.length - 1];
      if (last && last.sender === 'Bot') {
        const merged = last.text ? `${last.text}\n\n${text}` : text;
        return [...prevMessages.slice(0, prevMessages.length - 1), { ...last, text: merged }];
      }
      return [...prevMessages, { id, text, sender: 'Bot' }];
    });
  };

  const handleUserMessage = async (text: string) => {
    const startTime = Date.now();
    setIsLoading(true);
    addMessage(text, 'User');
    
    // Track chat event
    trackChatEvent('message_sent', {
      messageLength: text.length,
      useStream,
      temperature,
      hasSystemMessage: Boolean(systemMsg)
    });
    
    try {
      const response = await zeroShot(text, useStream, systemMsg, destroy);
      if (response) {
        // Await so a mid-stream failure (e.g. the on-device session being
        // destroyed) is caught here instead of becoming an uncaught rejection.
        await addMessage(response, 'Bot');
        const responseTime = Date.now() - startTime;
        trackChatEvent('response_received', {
          responseTime,
          useStream,
          temperature,
          hasSystemMessage: Boolean(systemMsg)
        });
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      // A destroyed/invalid on-device session would otherwise be reused on the
      // next turn and keep failing — drop it so the next message starts fresh.
      if (isSessionInvalidated(error)) {
        resetSession();
      }
      trackError('chat_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        useStream,
        temperature,
        hasSystemMessage: Boolean(systemMsg)
      });
      showErrorMessage(describeChatError(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 rounded-lg shadow-md transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-primary-500 to-purple-600 text-white p-3 rounded-xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Chat</h1>
              <p className="text-gray-600 dark:text-gray-400">Powered by Chrome's AI API</p>
            </div>
          </div>
        </header>

        <Tabs 
          defaultTab="docs"
          basePath="/chat"
          tabs={[
            {
              id: 'docs',
              label: 'API Documentation',
              path: '/chat-api-documentation',
              content: (
                <div className="max-w-none">
                  <DocsRenderer docFile="Chat-API.md" initOpen={true} />
                </div>
              )
            },
            {
              id: 'demo',
              label: 'Demo',
              path: '/chat-demo',
              content: (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Settings Panel */}
                  <div className="lg:col-span-1 space-y-6">
                    {/* Model Stats */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Model Stats
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Default TopK:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{modelCaps?.defaultTopK || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Max TopK:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{modelCaps?.maxTopK || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Default Temp:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{modelCaps?.defaultTemperature || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Max Temp:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{modelCaps?.maxTemperature || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Settings */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                        </svg>
                        Settings
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label htmlFor="stream" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Stream Response
                          </label>
                          <input
                            id="stream"
                            type="checkbox"
                            checked={useStream}
                            onChange={(e) => setUseStream(e.target.checked)}
                            className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                          />
                        </div>

                        <div>
                          <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Temperature: {temperature.toFixed(2)}
                          </label>
                          <input
                            type="range"
                            id="temperature"
                            min="0"
                            max="2"
                            step="0.1"
                            value={temperature}
                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <label htmlFor="destroy" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Reset Session
                          </label>
                          <input
                            id="destroy"
                            type="checkbox"
                            checked={destroy}
                            onChange={(e) => setDestroy(e.target.checked)}
                            className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                          />
                        </div>

                        <div>
                          <label htmlFor="systemMsg" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            System Message
                          </label>
                          <textarea
                            id="systemMsg"
                            value={systemMsg}
                            onChange={(e) => setSystemMsg(e.target.value)}
                            placeholder="Enter system instructions..."
                            rows={3}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chat Area */}
                  <div className="lg:col-span-3">
                    <div className="space-y-6">
                      <ChatBox messages={messages} />
                      <ChatInput onSend={handleUserMessage} disabled={isLoading} />
                    </div>
                  </div>
                </div>
              )
            }
          ]}
        />
      </div>
    </div>
  );
};

export default ChatPage;
