import { useCallback, useEffect, useState } from 'react';
import { Plus, X, KeyRound, UserCheck, UserX } from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Navbar from '../../components/Navbar';
import { Skeleton } from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';

const inputCls =
  'input';
const labelCls = 'label';
const ROLES = ['admin', 'receptionist', 'practitioner'];

export default function Users() {
  const { user: me } = useAuth();
  const { success, error } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'receptionist' });
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null); // { name, password } — shown ONCE

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listUsers();
      setUsers(data.users || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await adminApi.createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      });
      setTempPassword({ name: data.user.name, password: data.tempPassword });
      setCreating(false);
      setForm({ name: '', email: '', role: 'receptionist' });
      success('User created');
      fetchUsers();
    } catch (e2) {
      error(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRole = async (u, role) => {
    try {
      await adminApi.updateUser(u._id, { role });
      success(`${u.name} is now ${role}`);
      fetchUsers();
    } catch (e2) {
      error(e2.message);
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await adminApi.updateUser(u._id, { isActive: !u.isActive });
      success(`${u.name} ${u.isActive ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } catch (e2) {
      error(e2.message);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Staff users</h1>
            <p className="mt-1 text-sm text-slate-500">Create accounts, change roles, activate or deactivate.</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Add user
          </button>
        </div>

        {err && !loading ? (
          <ErrorState message={err} onRetry={fetchUsers} />
        ) : loading ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="No users" message="No staff accounts yet." />
        ) : (
          <div className="overflow-x-auto card">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = String(u._id) === String(me?._id);
                  return (
                    <tr key={u._id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {u.name} {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRole(u, e.target.value)}
                          disabled={isSelf}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs capitalize disabled:opacity-40"
                          aria-label={`Role for ${u.name}`}
                          title={isSelf ? 'You cannot change your own role' : undefined}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r} className="capitalize">{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.isActive === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
                          {u.isActive === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={isSelf}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          title={isSelf ? 'You cannot deactivate your own account' : undefined}
                        >
                          {u.isActive === false ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                          {u.isActive === false ? 'Activate' : 'Deactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Create user modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade-slide-in">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Add staff user</h2>
              <button onClick={() => setCreating(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className={labelCls}>Full name *</label>
                <input required value={form.name} onChange={set('name')} className={inputCls} placeholder="e.g. Ayesha Khan" />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input required type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="reception@clinic.local" />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select value={form.role} onChange={set('role')} className={inputCls}>
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="capitalize">{r}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                No password is set — the server generates a temporary password, shown to you once below.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary px-5">
                  {saving ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temp password — shown ONCE */}
      {tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade-slide-in">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <KeyRound className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">Temporary password</h2>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Share this with <strong>{tempPassword.name}</strong> now — it will not be shown again.
            </p>
            <div className="mt-4 rounded-xl bg-slate-900 p-4 text-center font-mono text-lg font-bold tracking-widest text-emerald-300">
              {tempPassword.password}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setTempPassword(null)}
                className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                I've saved it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
