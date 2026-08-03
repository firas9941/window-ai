import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGoogleAnalytics } from '../../hooks/useGoogleAnalytics';
import { useShell } from './ShellContext';
import { RAIL_NAV, matchesRoute } from './navItems';

const HomeIcon: React.FC = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
  </svg>
);

const PulseIcon: React.FC = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12h4l3 8 4-16 3 8h4" />
  </svg>
);

const BoltIcon: React.FC = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

/**
 * Left navigation rail. Collapsible on desktop (236px ↔ 70px) and a
 * hamburger-toggled slide-over drawer on mobile.
 */
export const SidebarRail: React.FC = () => {
  const { railOpen, setRailOpen } = useShell();
  const { pathname } = useLocation();
  const { trackUserInteraction } = useGoogleAnalytics();

  const showLabels = railOpen;
  const homeActive = pathname === '/';
  const statusActive = matchesRoute(pathname, '/status');

  // On mobile the drawer either slides in (open) or off-screen (closed); on
  // desktop it is always visible, only its width changes.
  const widthCls = railOpen ? 'w-[236px]' : 'w-[236px] md:w-[70px]';
  const transformCls = railOpen
    ? 'translate-x-0'
    : '-translate-x-full md:translate-x-0';

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setRailOpen(false);
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {railOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setRailOpen(false)}
          aria-hidden="true"
        />
      )}

      <nav
        className={`om-scroll fixed inset-y-0 left-0 z-40 flex flex-col gap-[3px] overflow-y-auto overflow-x-hidden px-3 py-4 transition-[width,transform] duration-200 ease-in-out md:static md:z-auto ${widthCls} ${transformCls}`}
        style={{
          background: 'var(--rail)',
          borderRight: '1px solid var(--border)',
        }}
        aria-label="Primary"
      >
        {/* Logo tile + wordmark — links home */}
        <Link
          to="/"
          title="Window.AI"
          onClick={() => {
            trackUserInteraction('navigation_click', 'logo_home');
            closeOnMobile();
          }}
          className="flex items-center gap-2.5 px-1.5 pb-4 pt-1"
          style={{ textDecoration: 'none' }}
        >
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#9333ea)' }}
          >
            <BoltIcon />
          </div>
          {showLabels && (
            <span
              className="font-display whitespace-nowrap text-base font-bold"
              style={{ color: 'var(--fg)' }}
            >
              Window.AI
            </span>
          )}
        </Link>

        {/* Home */}
        <Link
          to="/"
          title="Home"
          onClick={() => {
            trackUserInteraction('navigation_click', 'home_link');
            closeOnMobile();
          }}
          className="flex items-center gap-3 rounded-[10px] p-2.5 transition-colors"
          style={
            homeActive
              ? { background: 'rgba(96,165,250,.14)', color: '#93c5fd' }
              : { color: 'var(--fg2)' }
          }
        >
          <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center">
            <HomeIcon />
          </span>
          {showLabels && (
            <span
              className="font-display whitespace-nowrap text-[14.5px] font-semibold"
              style={{ color: homeActive ? '#dbeafe' : 'var(--fg2)' }}
            >
              Home
            </span>
          )}
        </Link>

        {/* Check your browser (capabilities / status) */}
        <Link
          to="/status"
          title="Check your browser"
          onClick={() => {
            trackUserInteraction('navigation_click', 'status_link');
            closeOnMobile();
          }}
          className="flex items-center gap-3 rounded-[10px] p-2.5 transition-colors"
          style={
            statusActive
              ? { background: 'rgba(96,165,250,.14)', color: '#93c5fd' }
              : { color: 'var(--fg2)' }
          }
        >
          <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center">
            <PulseIcon />
          </span>
          {showLabels && (
            <span
              className="font-display whitespace-nowrap text-[14.5px] font-semibold"
              style={{ color: statusActive ? '#dbeafe' : 'var(--fg2)' }}
            >
              Check your browser
            </span>
          )}
        </Link>

        {/* Demo routes (with optional section headings, e.g. "Advanced") */}
        {RAIL_NAV.map((item, index) => {
          const active = matchesRoute(pathname, item.href);
          const showHeading =
            Boolean(item.section) && item.section !== RAIL_NAV[index - 1]?.section;
          return (
            <React.Fragment key={item.href}>
              {showHeading &&
                (showLabels ? (
                  <div
                    className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--fg2)' }}
                  >
                    {item.section}
                  </div>
                ) : (
                  <div
                    className="mx-2 my-2 border-t"
                    style={{ borderColor: 'var(--border)' }}
                    aria-hidden="true"
                  />
                ))}
              <Link
                to={item.href}
                title={item.label}
                onClick={() => {
                  trackUserInteraction(
                    'navigation_click',
                    `${item.href.replace(/\//g, '')}_link`
                  );
                  closeOnMobile();
                }}
                className="group flex items-center gap-3 rounded-[10px] p-2.5 transition-colors hover:bg-[color:var(--surface2)]"
                style={
                  active
                    ? { background: 'rgba(96,165,250,.14)' }
                    : undefined
                }
              >
                <span
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px]"
                  style={{ background: 'var(--surface2)' }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={active ? '#93c5fd' : '#94a3b8'}
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={item.icon} />
                  </svg>
                </span>
                {showLabels && (
                  <span
                    className="font-display whitespace-nowrap text-sm font-semibold"
                    style={{ color: active ? '#dbeafe' : 'var(--fg2)' }}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            </React.Fragment>
          );
        })}
      </nav>
    </>
  );
};

export default SidebarRail;
