import { useCallback, useEffect, useState } from 'react';
import { ScrollText, ChevronDown } from 'lucide-react';
import { auditApi } from '../../api/auditApi';
import Navbar from '../../components/Navbar';
import Pagination from '../../components/Pagination';
import { TableSkeleton } from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import { fmtTime, fmtDate } from '../../utils/format';

const ACTION_HINTS = [
  'user.create',
  'user.update',
  'settings.update',
  'settings.regenerate-display-key',
  'queue.create',
  'room.create',
  'room.update',
  'room.delete',
];

/**
 * Admin → Audit logs: filterable, paginated view of the append-only
 * admin audit trail. Metadata is expandable per row.
 */
export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const d = await auditApi.list({
        page,
        limit: 25,
        ...(action ? { action } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      setLogs(d.logs || []);
      setTotalPages(d.totalPages || 1);
      setTotal(d.total || 0);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, action, from, to]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const applyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <ScrollText className="h-6 w-6 text-teal-600" /> Audit logs
          </h1>
          <p className="text-sm text-slate-500">{total} entries</p>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 card p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="input w-auto"
            >
              <option value="">All actions</option>
              {ACTION_HINTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              From
            </label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="input w-auto"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
            </label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="input w-auto"
            />
          </div>
          <button
            onClick={applyFilters}
            className="btn-primary"
          >
            Apply
          </button>
          {(action || from || to) && (
            <button
              onClick={() => {
                setAction('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
              className="btn-secondary"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-4 overflow-hidden card">
          {loading ? (
            <TableSkeleton rows={8} />
          ) : err ? (
            <ErrorState message={err} onRetry={fetchLogs} />
          ) : logs.length === 0 ? (
            <EmptyState
              title="No audit entries"
              message="Administrative actions (user changes, settings updates, display-key regenerations) are recorded here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id} className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {fmtDate(log.createdAt)} {fmtTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {log.action}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{log.user?.name || '—'}</p>
                        <p className="text-xs text-slate-500">{log.user?.email || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {log.entityType ? (
                          <>
                            <span className="capitalize">{log.entityType}</span>
                            <p className="font-mono text-xs text-slate-400">
                              {String(log.entityId || '').slice(-8)}
                            </p>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                        >
                          Metadata
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${expanded === log._id ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.map(
                (log) =>
                  expanded === log._id && (
                    <pre
                      key={`${log._id}-meta`}
                      className="mx-4 mb-3 overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-100"
                    >
                      {JSON.stringify(log.metadata || {}, null, 2)}
                    </pre>
                  )
              )}
            </div>
          )}
        </div>

        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </main>
    </div>
  );
}
