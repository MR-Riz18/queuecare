import { useState } from 'react';
import { User, LogOut, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authApi } from '../api/authApi';
import Navbar from '../components/Navbar';

/**
 * Profile: read-only identity card + self-service password change
 * (PATCH /api/auth/password).
 */
export default function Profile() {
  const { user, logout } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      error(e.message);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirm) {
      error('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    ['Name', user?.name],
    ['Email', user?.email],
    ['Role', user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'],
    ['Clinic', user?.clinic?.name || '—'],
    ['Account status', user?.isActive === false ? 'Deactivated' : 'Active'],
  ];

  const inputCls =
    'input';

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="page-title">Profile</h1>

        <div className="mt-5 card p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
              <User className="h-8 w-8" />
            </span>
            <div>
              <p className="text-lg font-bold text-slate-900">{user?.name}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-slate-100">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between py-2.5 text-sm">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          <button
            onClick={handleLogout}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>

        <div className="mt-4 card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <KeyRound className="h-5 w-5 text-teal-600" /> Change password
          </h2>
          <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls}
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                New password (min 8 characters)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputCls}
                required
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
