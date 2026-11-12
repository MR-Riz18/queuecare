import api from './axios';

/**
 * Public waiting-room display data. NO credentials needed — the 32-hex displayKey
 * is the secret. withCredentials stays true globally (harmless; no cookie exists).
 * Rate-limited to 120/min server-side.
 */
export const displayApi = {
  snapshot: (displayKey) => api.get(`/display/${displayKey}`).then((r) => r.data.data),
};
