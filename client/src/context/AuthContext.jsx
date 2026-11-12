import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/authApi';

const AuthContext = createContext(null);

/**
 * Boot flow: on mount, GET /auth/me validates the httpOnly cookie.
 * `loading` stays true until the check finishes so ProtectedRoute
 * never flashes a redirect for an already-logged-in user.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    authApi
      .me()
      .then(({ user: u }) => {
        if (alive) setUser(u);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: u } = await authApi.login(email, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthed: !!user,
      role: user?.role ?? null,
      isAdmin: user?.role === 'admin',
      // Receptionists, practitioners and admins are all "staff" here.
      isReceptionist: user?.role === 'receptionist',
      isStaff: !!user && ['admin', 'receptionist', 'practitioner'].includes(user.role),
      login,
      logout,
      refreshMe: () => authApi.me().then(({ user: u }) => setUser(u)),
    }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
