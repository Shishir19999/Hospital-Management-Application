export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};
export const notifyUnauthorized = () => unauthorizedHandler && unauthorizedHandler();

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') =>
  (err && err.message) || fallback;
