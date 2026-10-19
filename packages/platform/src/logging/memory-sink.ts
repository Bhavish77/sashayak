/**
 * F09's logging test seam: "logs captured in memory." A pino destination
 * that parses each written line as JSON and keeps it in an array, so a
 * test can assert on structured log fields without touching a file or a
 * real stream.
 */
export interface MemorySink {
  records: Record<string, unknown>[];
  stream: { write(chunk: string): boolean };
}

export function createMemorySink(): MemorySink {
  const records: Record<string, unknown>[] = [];
  let buffered = '';

  return {
    records,
    stream: {
      write(chunk: string): boolean {
        buffered += chunk;
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          if (line.length > 0) {
            records.push(JSON.parse(line) as Record<string, unknown>);
          }
        }
        return true;
      },
    },
  };
}
