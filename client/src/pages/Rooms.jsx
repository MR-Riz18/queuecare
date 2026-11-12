import { useCallback, useEffect, useState } from 'react';
import { DoorOpen, Plus, Pencil, Trash2, X } from 'lucide-react';
import { roomApi } from '../api/roomApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Navbar from '../components/Navbar';
import ConfirmDialog from '../components/ConfirmDialog';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const inputCls =
  'input';
const labelCls = 'label';

/**
 * Staff view of consultation rooms. Admins get inline CRUD
 * (create/edit/deactivate); delete is blocked server-side (409) when today's
 * live tokens reference the room.
 */
export default function Rooms() {
  const { isAdmin } = useAuth();
  const { success, error } = useToast();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // room object or 'new'
  const [form, setForm] = useState({ name: '', assignedStaff: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomApi.list();
      setRooms(data.rooms || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const openEditor = (room) => {
    setEditing(room || 'new');
    setForm(
      room
        ? { name: room.name, assignedStaff: room.assignedStaff?._id || room.assignedStaff || '', isActive: room.isActive !== false }
        : { name: '', assignedStaff: '', isActive: true }
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), isActive: form.isActive };
      if (form.assignedStaff.trim()) payload.assignedStaff = form.assignedStaff.trim();
      if (editing === 'new') {
        await roomApi.create(payload);
        success('Room created');
      } else {
        await roomApi.update(editing._id, payload);
        success('Room updated');
      }
      setEditing(null);
      fetchRooms();
    } catch (e) {
      error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await roomApi.remove(deleting._id);
      success('Room deleted');
      setDeleting(null);
      fetchRooms();
    } catch (e) {
      error(e.message);
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Rooms</h1>
            <p className="mt-1 text-sm text-slate-500">Consultation rooms patients are called to.</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => openEditor(null)}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" /> Add room
            </button>
          )}
        </div>

        {err && !loading ? (
          <ErrorState message={err} onRetry={fetchRooms} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <EmptyState title="No rooms yet" message="Rooms are created by an admin." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rooms.map((r) => (
              <div key={r._id} className="card card-hover p-5">
                <div className="flex items-start justify-between">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${r.isActive === false ? 'bg-slate-100 text-slate-400' : 'bg-teal-50 text-teal-600'}`}>
                    <DoorOpen className="h-5 w-5" />
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.isActive === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {r.isActive === false ? 'Inactive' : 'Active'}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-900">{r.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {r.assignedStaff?.name ? `Assigned: ${r.assignedStaff.name}` : 'No staff assigned'}
                </p>
                {isAdmin && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => openEditor(r)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => setDeleting(r)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create / edit modal (admin) */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade-slide-in">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editing === 'new' ? 'Add room' : 'Edit room'}</h2>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className={labelCls}>Room name *</label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Room 2" />
              </div>
              <div>
                <label className={labelCls}>Assigned staff (optional)</label>
                <input value={form.assignedStaff} onChange={(e) => setForm((f) => ({ ...f, assignedStaff: e.target.value }))} className={inputCls} placeholder="User ID (optional)" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded accent-teal-600"
                />
                Active
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary px-5">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Delete room "${deleting?.name}"?`}
        message="Deletion is blocked if today's live tokens reference this room. Consider deactivating instead."
        confirmLabel="Delete room"
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
