import type pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { createMemorySink, type MemorySink } from './memory-sink';
import { runWithRequestContext } from './request-context';

function firstRecord(sink: MemorySink): Record<string, unknown> {
  const record = sink.records[0];
  if (!record) {
    throw new Error('expected at least one log record');
  }
  return record;
}

describe('createLogger (F06, F09)', () => {
  it('includes the service field on every log line', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
    logger.info('started');
    expect(firstRecord(sink)).toMatchObject({ service: 'edge' });
  });

  it('includes request_id and trace_id when logging inside a request context', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
    runWithRequestContext({ requestId: 'req-1', traceId: 'trace-1' }, () => {
      logger.info('handled');
    });
    expect(firstRecord(sink)).toMatchObject({ request_id: 'req-1', trace_id: 'trace-1' });
  });

  it('omits trace_id when the context does not carry one', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
    runWithRequestContext({ requestId: 'req-2' }, () => {
      logger.info('handled');
    });
    expect(firstRecord(sink).request_id).toBe('req-2');
    expect(firstRecord(sink)).not.toHaveProperty('trace_id');
  });

  it('carries the request id through an async context across an await', async () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
    await runWithRequestContext({ requestId: 'req-3' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      logger.info('after await');
    });
    expect(firstRecord(sink)).toMatchObject({ request_id: 'req-3' });
  });

  it('does not attach a request id to a log call made outside any request context', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
    logger.info('no context here');
    expect(firstRecord(sink)).not.toHaveProperty('request_id');
  });

  it('redacts a sensitive key in a logged merge object', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'wallet', destination: sink.stream });
    logger.info({ pin: '1234', amount_minor: 50000 }, 'pin check');
    expect(firstRecord(sink).pin).toBe('[REDACTED]');
    expect(firstRecord(sink).amount_minor).toBe(50000);
  });

  it('redacts a sensitive pattern found in a plain log message', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'assistant', destination: sink.stream });
    logger.info('called 9876543210 about a transfer');
    expect(firstRecord(sink).msg).toContain('[PHONE]');
    expect(firstRecord(sink).msg).not.toContain('9876543210');
  });

  it('redacts a sensitive pattern found in a merge-object field, not just known key names', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'assistant', destination: sink.stream });
    logger.info({ note: 'contact aarav@example.com' }, 'note saved');
    expect(firstRecord(sink).note).toContain('[EMAIL]');
    expect(firstRecord(sink).note).not.toContain('aarav@example.com');
  });

  it('never throws when logging a circular object', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'assistant', destination: sink.stream });
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => logger.info(circular, 'circular')).not.toThrow();
  });
});

const PHONE = '9876543210';

interface CallStyleCase {
  name: string;
  run: (logger: pino.Logger) => void;
  extra?: (sink: MemorySink) => void;
}

function makePoisonedObject(): Record<string, unknown> {
  const poisoned: Record<string, unknown> = {};
  Object.defineProperty(poisoned, 'bad', {
    enumerable: true,
    get() {
      throw new Error('boom');
    },
  });
  return poisoned;
}

const callStyles: CallStyleCase[] = [
  {
    name: '1. message only',
    run: (logger) => logger.info(`to ${PHONE}`),
  },
  {
    name: '2. printf value',
    run: (logger) => logger.info('sent to %s', PHONE),
  },
  {
    name: '3. object + message',
    run: (logger) => logger.error({ route: 'x' }, `failed for ${PHONE}`),
  },
  {
    name: '4. object + printf',
    run: (logger) => logger.info({ a: 1 }, 'hi %s', PHONE),
  },
  {
    name: '5. child binding',
    run: (logger) => logger.child({ phone: PHONE }).info('hello'),
  },
  {
    name: '8. unredactable merge object (throwing getter) yields redaction_failed, no garbage keys',
    run: (logger) => logger.error(makePoisonedObject(), `note ${PHONE}`),
    extra: (sink) => {
      const record = firstRecord(sink);
      expect(record.redaction_failed).toBe(true);
      expect(record).not.toHaveProperty('0');
      expect(record).not.toHaveProperty('1');
      expect(record.msg).toContain('[PHONE]');
    },
  },
  {
    name: '9. array as first argument (wrapped under data, no spread index keys)',
    run: (logger) => logger.info([PHONE, 'note']),
    extra: (sink) => {
      const record = firstRecord(sink);
      expect(record).not.toHaveProperty('0');
      expect(record).not.toHaveProperty('1');
      expect(record.data).toEqual(['[PHONE]', 'note']);
    },
  },
];

describe.each(callStyles)('createLogger: redacts every call style — $name (AC-F06-15)', (style) => {
  it('removes the phone number from the whole logged line and keeps request/trace id', () => {
    const sink = createMemorySink();
    const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
    runWithRequestContext({ requestId: 'req-table', traceId: 'trace-table' }, () => {
      style.run(logger);
    });
    const record = firstRecord(sink);
    expect(JSON.stringify(record)).not.toContain(PHONE);
    expect(record.request_id).toBe('req-table');
    expect(record.trace_id).toBe('trace-table');
    style.extra?.(sink);
  });
});
