import { pathToFileURL } from 'node:url';

export const serviceName = 'assistant';

// Prints only when this file is executed directly, not when imported by a
// test. The real server bootstrap replaces this body service by service,
// starting with the service skeleton task.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(serviceName);
}
