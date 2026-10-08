import axios from 'axios';
import { API_URL, getAuthToken } from './config';
import { ApiError, notifyUnauthorized } from './errors';

export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

// Loaded on demand so the full-stack build never ships the in-browser server.
let demoPromise = null;
const demo = () => (demoPromise ||= import('./demoClient').then((m) => m.createDemoClient()));

const tzParams = () => ({ tz: new Date().getTimezoneOffset() });

async function send(method, path, { params, data, auth = false } = {}) {
  const query = { ...tzParams(), ...(params || {}) };
  for (const k of Object.keys(query)) if (query[k] === undefined || query[k] === null || query[k] === '') delete query[k];
  let status;
  let body;
  if (IS_DEMO) {
    ({ status, body } = await (await demo()).request(method, path, { query, body: data, token: getAuthToken() }));
  } else {
    try {
      const res = await axios({
        baseURL: API_URL, url: path, method, params: query, data,
        headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : undefined,
        validateStatus: () => true,
      });
      ({ status, data: body } = res);
    } catch {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }
  }
  if (status >= 400) {
    if (status === 401 && !auth) notifyUnauthorized();
    const message = (typeof body === 'string' ? body : body?.error) || 'Request failed';
    throw new ApiError(message, status);
  }
  return body;
}

// Walk every page of a paginated list (the server caps pages at 100 rows).
async function all(path, params = {}) {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await send('GET', path, { params: { ...params, page, limit: 100 } });
    out.push(...res.data);
    if (page >= res.pages) return out;
  }
}

export const api = {
  isDemo: IS_DEMO,
  get: (path, params) => send('GET', path, { params }),
  post: (path, data, params) => send('POST', path, { data: data ?? {}, params }),
  put: (path, data) => send('PUT', path, { data }),
  patch: (path, data) => send('PATCH', path, { data }),
  del: (path) => send('DELETE', path),
  all,
  auth: {
    status: () => send('GET', '/auth/status', { auth: true }),
    login: (email, password) => send('POST', '/auth/login', { data: { email, password }, auth: true }),
    register: (name, email, password) => send('POST', '/auth/register', { data: { name, email, password }, auth: true }),
    logout: () => send('POST', '/auth/logout', { data: {}, auth: true }),
    me: () => send('GET', '/auth/me', { auth: true }),
  },
  // restore the sample data (live preview only)
  reset: async () => {
    if (IS_DEMO) (await demo()).reset();
  },
};
