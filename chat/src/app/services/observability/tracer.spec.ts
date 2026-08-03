import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { addSink, isTracingEnabled, traceCall, traceStream } from './tracer';
import type { AiSpan } from './types';

function streamOf(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
}

async function drain(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

describe('observability tracer', () => {
  let spans: AiSpan[];
  let off: (() => void) | undefined;

  beforeEach(() => {
    spans = [];
    off?.();
    off = addSink((s) => spans.push(s));
  });

  it('passes stream chunks through unchanged and emits one ok span', async () => {
    const session = { contextUsage: 12, contextWindow: 4096 };
    const out = await drain(
      traceStream('prompt', 'prompt', session, () => streamOf(['Hel', 'lo'])),
    );

    expect(out).toBe('Hello');
    expect(spans).toHaveLength(1);
    const s = spans[0];
    expect(s.api).toBe('prompt');
    expect(s.stream).toBe(true);
    expect(s.finish).toBe('ok');
    expect(s.outChars).toBe(5);
    expect(s.ttftMs).toBeGreaterThanOrEqual(0);
    expect(s.latencyMs).toBeGreaterThanOrEqual(0);
    expect(s.contextUsage).toBe(12);
    expect(s.contextWindow).toBe(4096);
  });

  it('reads the legacy input* usage names defensively', async () => {
    const session = { inputUsage: 7, inputQuota: 1024 };
    await drain(traceStream('summarizer', 'summarize', session, () => streamOf(['x'])));
    expect(spans[0].contextUsage).toBe(7);
    expect(spans[0].contextWindow).toBe(1024);
  });

  it('records a stream error and propagates it', async () => {
    const failing = () =>
      new ReadableStream<string>({
        pull() {
          throw Object.assign(new Error('boom'), { name: 'NotReadableError' });
        },
      });
    await expect(drain(traceStream('prompt', 'prompt', undefined, failing))).rejects.toThrow();
    expect(spans[0].finish).toBe('error');
    expect(spans[0].errorName).toBe('NotReadableError');
  });

  it('traceCall returns the value and records outChars', async () => {
    const res = await traceCall('translator', 'translate', undefined, async () => 'hola');
    expect(res).toBe('hola');
    const s = spans[0];
    expect(s.stream).toBe(false);
    expect(s.finish).toBe('ok');
    expect(s.outChars).toBe(4);
  });

  it('traceCall records an error finish and re-throws', async () => {
    const err = Object.assign(new Error('too big'), { name: 'QuotaExceededError' });
    await expect(
      traceCall('prompt', 'prompt', undefined, async () => {
        throw err;
      }),
    ).rejects.toThrow('too big');
    expect(spans[0].finish).toBe('error');
    expect(spans[0].errorName).toBe('QuotaExceededError');
  });

  it('addSink returns a working unsubscribe', async () => {
    off?.();
    off = undefined;
    const local: AiSpan[] = [];
    const unsub = addSink((s) => local.push(s));
    unsub();
    await traceCall('prompt', 'prompt', undefined, async () => 'x');
    expect(local).toHaveLength(0);
  });

  it('does not throw when a session getter throws (destroyed session)', async () => {
    const destroyed = {
      get contextUsage(): number {
        throw new DOMException('destroyed', 'InvalidStateError');
      },
    };
    const res = await traceCall('prompt', 'prompt', destroyed, async () => 'ok');
    expect(res).toBe('ok');
    expect(spans[0].finish).toBe('ok');
    expect(spans[0].contextUsage).toBeUndefined();
  });
});

describe('isTracingEnabled (opt-in)', () => {
  afterEach(() => {
    delete (globalThis as { __AI_TRACE__?: boolean }).__AI_TRACE__;
    try {
      localStorage.removeItem('ai:trace');
    } catch {
      /* no-op */
    }
  });

  it('is off by default', () => {
    expect(isTracingEnabled()).toBe(false);
  });

  it('honors globalThis.__AI_TRACE__', () => {
    (globalThis as { __AI_TRACE__?: boolean }).__AI_TRACE__ = true;
    expect(isTracingEnabled()).toBe(true);
  });

  it('honors the localStorage flag', () => {
    localStorage.setItem('ai:trace', '1');
    expect(isTracingEnabled()).toBe(true);
  });
});
