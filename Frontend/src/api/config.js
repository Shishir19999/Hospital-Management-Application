export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

let authToken = null;

// Remember (or clear) the session token used for every API call.
export function setAuthToken(token) {
  authToken = token || null;
}
export const getAuthToken = () => authToken;
