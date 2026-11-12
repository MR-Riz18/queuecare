import api from './axios';

export const queueApi = {
  /** GET /queues → { queues, serviceDate } (today's queues for this clinic) */
  list: () => api.get('/queues').then((r) => r.data.data),
  get: (id) => api.get(`/queues/${id}`).then((r) => r.data.data),
  /** GET /queues/:id/tokens?status=&search=&page=&limit= */
  tokens: (id, params = {}) =>
    api.get(`/queues/${id}/tokens`, { params }).then((r) => r.data.data),
  /** POST /queues/:id/tokens { subject, priority, queueType } — number generated server-side */
  register: (id, payload) =>
    api.post(`/queues/${id}/tokens`, payload).then((r) => r.data.data),
  /** POST /queues/:id/call-next { roomId? } — atomic claim; 404 "No waiting patients" when empty */
  callNext: (id, roomId) =>
    api.post(`/queues/${id}/call-next`, roomId ? { roomId } : {}).then((r) => r.data.data),
};
