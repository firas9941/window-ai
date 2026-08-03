import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Tabs from './Tabs';

const tabs = [
  { id: 'docs', label: 'API Documentation', path: '/chat-api-documentation', content: <div>DOCS CONTENT</div> },
  { id: 'demo', label: 'Demo', path: '/chat-demo', content: <div>DEMO CONTENT</div> },
];

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Tabs basePath="/chat" defaultTab="docs" tabs={tabs} />
    </MemoryRouter>,
  );

describe('Tabs — single URL-driven navigation logic', () => {
  it('shows the docs tab at the docs URL', () => {
    renderAt('/chat/chat-api-documentation');
    expect(screen.getByText('DOCS CONTENT')).toBeTruthy();
    expect(screen.queryByText('DEMO CONTENT')).toBeNull();
  });

  it('shows the demo tab at the demo URL', () => {
    renderAt('/chat/chat-demo');
    expect(screen.getByText('DEMO CONTENT')).toBeTruthy();
    expect(screen.queryByText('DOCS CONTENT')).toBeNull();
  });

  it('renders every tab as a real link to its own URL (so clicking changes the URL bar)', () => {
    renderAt('/chat/chat-api-documentation');
    expect(screen.getByRole('link', { name: 'API Documentation' }).getAttribute('href')).toBe(
      '/chat/chat-api-documentation',
    );
    expect(screen.getByRole('link', { name: 'Demo' }).getAttribute('href')).toBe('/chat/chat-demo');
  });

  it('marks the active tab (derived from the URL) with aria-current', () => {
    renderAt('/chat/chat-demo');
    expect(screen.getByRole('link', { name: 'Demo' }).getAttribute('aria-current')).toBe('page');
    expect(
      screen.getByRole('link', { name: 'API Documentation' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('falls back to the default tab at the bare base path', () => {
    renderAt('/chat');
    expect(screen.getByText('DOCS CONTENT')).toBeTruthy();
  });
});
