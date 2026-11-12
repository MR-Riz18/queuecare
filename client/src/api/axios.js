import axios from 'axios';

/**
 * Shared Axios instance.
 * - baseURL: '/api' in dev (Vite proxies it to localhost:5000);
 *   VITE_API_URL + '/api' in production (backend on its own host).
 * - withCredentials: true — auth is a httpOnly JWT cookie (`token`), per Stage 1 lock.
 * - On 401, redirect to /login unless already there (avoids login-page loops).
 * - Errors are normalized to { message } so UI code can toast err.message directly.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  withCredentials: true,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
    const message =
      err?.response?.data?.message ||
      err?.message ||
      'Something went wrong. Please try again.';
    return Promise.reject({ ...err, message });
  }
);

export default api;
