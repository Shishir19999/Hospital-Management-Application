import { createDemoServer } from '../../../shared/demoServer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The browser-only API: the shared server code with sample data in localStorage plus a little latency.
export function createDemoClient({ latency = [60, 180] } = {}) {
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null; // blocked storage: the preview still works until the page is closed
  }
  const server = createDemoServer({ storage, tz: () => new Date().getTimezoneOffset() });
  window.addEventListener('pagehide', () => server.flush());
  return {
    async request(method, path, opts) {
      const [min, max] = latency;
      await sleep(min + Math.random() * (max - min));
      return server.request(method, path, opts);
    },
    reset: () => server.reset(),
  };
}
