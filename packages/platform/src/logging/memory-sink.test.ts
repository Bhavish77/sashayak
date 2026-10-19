import { describe, expect, it } from 'vitest';
import { createMemorySink } from './memory-sink';

describe('createMemorySink', () => {
  it('starts empty', () => {
    const sink = createMemorySink();
    expect(sink.records).toEqual([]);
  });

  it('parses each written line as JSON and collects it in order', () => {
    const sink = createMemorySink();
    sink.stream.write(`${JSON.stringify({ a: 1 })}\n`);
    sink.stream.write(`${JSON.stringify({ a: 2 })}\n`);
    expect(sink.records).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
