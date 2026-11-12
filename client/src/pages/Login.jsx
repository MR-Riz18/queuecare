import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Activity, Mail, Lock, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { user, loading, login } = useAuth();
  const { error } = useToast();
  const { reconnect } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // After a logout the shared socket is still connected as staff; drop it so
  // it stops receiving staff events on the login screen. The re-handshake
  // runs without a cookie (and retries in the background once logged in).
  useEffect(() => {
    reconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loading && user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // The cookie is fresh now — re-handshake immediately instead of
      // waiting for the socket's reconnect backoff.
      reconnect();
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      error(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-sky-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/30">
            <Activity className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">QueueCare</h1>
          <p className="mt-1 text-sm text-slate-500">Real-time queue management for your clinic</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5">
          <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
          <p className="mb-5 mt-1 text-sm text-slate-500">Staff access only</p>

          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
          <div className="relative mb-4">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@clinic.local" />
          </div>

          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
          <div className="relative mb-6">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-2.5"
          >
            <LogIn className="h-4 w-4" /> {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">Demo credentials (seeded):</p>
            <p className="mt-1 font-mono">admin@queuecare.local / Admin123!</p>
          </div>
        </form>
      </div>
    </div>
  );
}
