import api from './axios';

export const auditApi = {
  /**
   * GET /api/admin/audit-logs?action=&userId=&from=&to=&page=&limit=
   * → { logs, page, limit, total, totalPages } (admin only)
   */
  list: (params = {}) => api.get('/admin/audit-logs', { params }).then((r) => r.data.data),
};
