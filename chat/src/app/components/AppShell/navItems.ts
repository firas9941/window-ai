export interface NavItem {
  /** Human label shown in the rail. */
  label: string;
  /** Route prefix this item points at. */
  href: string;
  /** SVG path (`d`) for the 24×24 stroked rail icon, from the Status design. */
  icon: string;
  /**
   * Optional section heading this item belongs under (e.g. "Advanced").
   * Items without a section render at the top level; the rail renders a small
   * heading the first time a new section appears.
   */
  section?: string;
}

/** The rail navigation, in order, matching the Status design (icons included). */
export const RAIL_NAV: NavItem[] = [
  { label: 'Chat', href: '/chat', icon: 'M6 5h12a1 1 0 011 1v8a1 1 0 01-1 1h-7l-4 3v-3H6a1 1 0 01-1-1V6a1 1 0 011-1z' },
  { label: 'Tool Calling', href: '/tool-calling', icon: 'M4 8h9M17 8h3M4 16h3M11 16h9M13 6v4M8 14v4' },
  { label: 'Multimodal', href: '/multimodal', icon: 'M4 6h16v12H4zM8 11a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6M5 17l4.5-4 3 2.5 3.5-3L20 16' },
  { label: 'Summary', href: '/summary', icon: 'M5 7h14M5 12h14M5 17h9' },
  { label: 'Translate', href: '/translate', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18M3.5 9.5h17M3.5 14.5h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18' },
  { label: 'Live Translate', href: '/live-translate', icon: 'M12 3.5a2.5 2.5 0 00-2.5 2.5v5a2.5 2.5 0 005 0V6A2.5 2.5 0 0012 3.5M6 11a6 6 0 0012 0M12 17v3.5M8.5 20.5h7' },
  { label: 'Writer/Rewriter', href: '/writer', icon: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3' },
  { label: 'Proofreader', href: '/proofreader', icon: 'M4 14l2.5 2.5L11 11M4 8h8M4 11h5M14 8h6M14 12h6M14 16h6' },
  { label: 'Embeddings', href: '/embeddings', icon: 'M6.5 8.5a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8M17.5 7.5a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8M10 14.5a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8M18 16.5a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8M8 20a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8' },
  { label: 'WebMCP', href: '/webmcp', icon: 'M9 3v4M15 3v4M7 7h10v3a5 5 0 01-10 0zM12 15v5' },
  { label: 'MCP Client', href: '/mcp-client', icon: 'M4 5h16v5H4zM4 14h16v5H4M7.5 7.5h.01M7.5 16.5h.01' },
  { label: 'Generative UI', href: '/generative-ui', icon: 'M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 16l-1.7-4.9L6 9.3l4.3-1.7zM17.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' },

  // Advanced — operational tooling for on-device AI.
  { label: 'Observability', href: '/observability', icon: 'M4 18a8 8 0 0116 0M12 18l4-4.5M12 18h.01', section: 'Advanced' },
  { label: 'Evaluation', href: '/evaluation', icon: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18', section: 'Advanced' },
];

/**
 * True when `pathname` belongs to `href` (exact, or a nested route such as
 * `/chat/chat-api-documentation`).
 */
export const matchesRoute = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Top-bar title derived from the active route. Home → "Overview". */
export const titleForPath = (pathname: string): string => {
  if (pathname === '/') return 'Overview';
  if (pathname.startsWith('/status')) return 'Check your browser';
  const hit = RAIL_NAV.find((n) => matchesRoute(pathname, n.href));
  return hit ? hit.label : 'Overview';
};
