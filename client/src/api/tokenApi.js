import api from './axios';

/**
 * Token lifecycle wrappers — one per Stage 1 transition endpoint.
 * Invalid transitions return 409 with a "Cannot move token from 'x' to 'y'" message.
 */
export const tokenApi = {
  get: (id) => api.get(`/tokens/${id}`).then((r) => r.data.data),
  call: (id, roomId) =>
    api.patch(`/tokens/${id}/call`, roomId ? { roomId } : {}).then((r) => r.data.data),
  recall: (id, roomId) =>
    api.patch(`/tokens/${id}/recall`, roomId ? { roomId } : {}).then((r) => r.data.data),
  startServing: (id) => api.patch(`/tokens/${id}/start-serving`).then((r) => r.data.data),
  skip: (id, reason) =>
    api.patch(`/tokens/${id}/skip`, { reason: reason || '' }).then((r) => r.data.data),
  returnToQueue: (id) => api.patch(`/tokens/${id}/return`).then((r) => r.data.data),
  complete: (id) => api.patch(`/tokens/${id}/complete`).then((r) => r.data.data),
  cancel: (id, reason) =>
    api.patch(`/tokens/${id}/cancel`, { reason: reason || '' }).then((r) => r.data.data),
};
