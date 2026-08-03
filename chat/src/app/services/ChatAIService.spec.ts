import { describe, it, expect } from 'vitest';
import { describeChatError, isSessionInvalidated } from './ChatAIService';

const withName = (name: string) => Object.assign(new Error('x'), { name });

describe('describeChatError', () => {
  it('explains the stable "no execution config" case (NotSupportedError)', () => {
    expect(describeChatError(withName('NotSupportedError'))).toMatch(/Canary|flag/i);
  });

  it('asks to retry on a destroyed session (InvalidStateError)', () => {
    expect(describeChatError(withName('InvalidStateError'))).toMatch(/again/i);
  });

  it('handles quota errors', () => {
    expect(describeChatError(withName('QuotaExceededError'))).toMatch(/too large|shorter/i);
  });

  it('falls back for unknown errors', () => {
    expect(describeChatError(new Error('weird'))).toMatch(/error/i);
    expect(describeChatError(undefined)).toMatch(/error/i);
  });
});

describe('isSessionInvalidated', () => {
  it('is true only for InvalidStateError', () => {
    expect(isSessionInvalidated(withName('InvalidStateError'))).toBe(true);
    expect(isSessionInvalidated(withName('NotSupportedError'))).toBe(false);
    expect(isSessionInvalidated(undefined)).toBe(false);
  });
});
