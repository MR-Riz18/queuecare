import api from './axios';

export const analyticsApi = {
  /**
   * GET /api/analytics/queue?from=YYYY-MM-DD&to=YYYY-MM-DD&queueId=
   * → { from, to, totals, avgWaitingMinutes, avgServiceMinutes,
   *     servedPerDay[], peakHours[], volumeByQueue[] }
   */
  getQueue: (params = {}) =>
    api.get('/analytics/queue', { params }).then((r) => r.data.data),
};
