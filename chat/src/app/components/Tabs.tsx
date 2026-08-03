import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
  /** URL suffix under `basePath`, e.g. `/chat-demo`. Every tab has one. */
  path?: string;
}

interface TabsProps {
  tabs: Tab[];
  /** Fallback tab id when the URL doesn't match any tab (e.g. the base path). */
  defaultTab?: string;
  /** Route prefix shared by all tabs, e.g. `/chat`. */
  basePath?: string;
}

/**
 * The single tab-navigation logic for every demo page.
 *
 * It is entirely URL-driven: the active tab is derived from the current
 * pathname (exact match on `basePath + tab.path`), and each tab is a real
 * `<Link>`, so clicking it updates the URL bar, every tab is deep-linkable, and
 * a reload keeps you on the same tab. There is no internal tab state to drift.
 *
 * Convention (see AppRouter `demoRoutes`): each feature at `/x` exposes tabs at
 * `/x/x-api-documentation`, `/x/x-demo`, … and `/x` redirects to the first tab.
 */
const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab, basePath = '' }) => {
  const { pathname } = useLocation();

  const activeId = useMemo(() => {
    if (basePath) {
      const matched = tabs.find((t) => t.path && pathname === `${basePath}${t.path}`);
      if (matched) return matched.id;
    }
    return defaultTab ?? tabs[0]?.id;
  }, [pathname, basePath, tabs, defaultTab]);

  const activeContent = tabs.find((t) => t.id === activeId)?.content;

  return (
    <div className="w-full">
      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const to = basePath && tab.path ? `${basePath}${tab.path}` : undefined;
            const isActive = tab.id === activeId;
            const className = `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
              isActive
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`;
            return to ? (
              <Link
                key={tab.id}
                to={to}
                className={className}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ) : (
              <span key={tab.id} className={className} aria-current={isActive ? 'page' : undefined}>
                {tab.label}
              </span>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">{activeContent}</div>
    </div>
  );
};

export default Tabs;
