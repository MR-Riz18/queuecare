import api from './axios';

export const adminApi = {
  // Users
  listUsers: () => api.get('/admin/users').then((r) => r.data.data),
  /** POST /admin/users → { user, tempPassword } — temp password shown ONCE */
  createUser: (payload) => api.post('/admin/users', payload).then((r) => r.data.data),
  /** PATCH /admin/users/:id { name?, role?, isActive? } — backend blocks self-changes */
  updateUser: (id, payload) => api.patch(`/admin/users/${id}`, payload).then((r) => r.data.data),

  // Settings
  getSettings: () => api.get('/admin/settings').then((r) => r.data.data),
  updateSettings: (payload) => api.patch('/admin/settings', payload).then((r) => r.data.data),
  /** POST /admin/settings/regenerate-display-key → { displayKey } */
  regenerateDisplayKey: () =>
    api.post('/admin/settings/regenerate-display-key').then((r) => r.data.data),

  // Queues (admin create only)
  createQueue: (payload) => api.post('/queues', payload).then((r) => r.data.data),
};
