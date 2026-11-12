import api from './axios';

export const roomApi = {
  list: () => api.get('/rooms').then((r) => r.data.data),
  create: (payload) => api.post('/rooms', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/rooms/${id}`, payload).then((r) => r.data.data),
  remove: (id) => api.delete(`/rooms/${id}`).then((r) => r.data),
};
