import api from './axios';

/** GET /dashboard/stats — today's operational snapshot for the clinic. */
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats').then((r) => r.data.data),
};
