import axios from 'axios';
import { API_URL } from './config';
import { ApiError, notifyUnauthorized } from './errors';

// Turn axios failures into ApiError; a 401 outside /auth means the session expired.
async function request(config, { auth = false } = {}) {
  try {
    const { data } = await axios({ baseURL: API_URL, ...config });
    return data;
  } catch (err) {
    const status = err.response?.status || 0;
    if (status === 401 && !auth) notifyUnauthorized();
    const message =
      (typeof err.response?.data === 'string' ? err.response.data : err.response?.data?.error) ||
      (err.response ? 'Request failed' : 'Cannot reach the server. Check your connection and try again.');
    throw new ApiError(message, status);
  }
}

// The list endpoints are paginated (max 100); walk every page.
async function fetchAll(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await request({ url: path, params: { page, limit: 100 } });
    out.push(...res.data);
    if (page >= res.pages) return out;
  }
}

const strip = (v, keys) => Object.fromEntries(keys.filter((k) => v[k] !== undefined && v[k] !== '').map((k) => [k, v[k]]));

export const realApi = {
  isDemo: false,
  capabilities: { status: false, notes: false, extras: false },
  auth: {
    status: () => request({ url: '/auth/status' }, { auth: true }),
    login: (email, password) => request({ method: 'post', url: '/auth/login', data: { email, password } }, { auth: true }),
    register: (name, email, password) =>
      request({ method: 'post', url: '/auth/register', data: { name, email, password } }, { auth: true }),
    logout: () => request({ method: 'post', url: '/auth/logout' }, { auth: true }),
  },
  patients: {
    list: () => fetchAll('/patients'),
    create: (v) => request({ method: 'post', url: '/patients/add', data: strip(v, ['name', 'age', 'gender']) }),
    update: (id, v) => request({ method: 'put', url: `/patients/${id}`, data: strip(v, ['name', 'age', 'gender']) }),
    remove: (id) => request({ method: 'delete', url: `/patients/delete/${id}` }),
  },
  doctors: {
    list: () => fetchAll('/doctors'),
    create: (v) => request({ method: 'post', url: '/doctors/add', data: strip(v, ['name', 'specialty']) }),
    update: (id, v) => request({ method: 'put', url: `/doctors/${id}`, data: strip(v, ['name', 'specialty']) }),
    remove: (id) => request({ method: 'delete', url: `/doctors/delete/${id}` }),
  },
  appointments: {
    list: () => fetchAll('/appointments'),
    create: (v) => request({ method: 'post', url: '/appointments/add', data: strip(v, ['patient', 'doctor', 'date', 'duration']) }),
    update: (id, v) => request({ method: 'put', url: `/appointments/${id}`, data: strip(v, ['patient', 'doctor', 'date', 'duration']) }),
    remove: (id) => request({ method: 'delete', url: `/appointments/delete/${id}` }),
  },
};
