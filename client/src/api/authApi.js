import api from './axios';

/** All payloads use the { success, message, data } envelope; we return data. */
export const authApi = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }).then((r) => r.data.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.data),
  /** PATCH /auth/password { currentPassword, newPassword } */
  changePassword: (currentPassword, newPassword) =>
    api.patch('/auth/password', { currentPassword, newPassword }).then((r) => r.data),
};
