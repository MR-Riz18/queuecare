import { useCallback, useEffect, useState } from 'react';
import { queueApi } from '../api/queueApi';
import Navbar from '../components/Navbar';
import StatusChip from '../components/StatusChip';
import SearchInput from '../components/SearchInput';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { fmtTime, durationBetween } from '../utils/format';

const STATUSES = ['all', 'waiting', 'called', 'serving', 'completed', 'skipped', 'cancelled'];
const QUEUE_TYPES = ['all', 'walk-in', 'appointment', 'follow-up'];

/**
 * History: today's token records with full lifecycle timestamps and
 * waiting/service durations. Scope = today's queues (GET /queues is
 * service-date scoped on the backend). Filters: queue, status, queue type,
 * search; practitioner filter applied client-side.
 */
export default function History() {
  const [queues, setQueues] = useState([]);
  const [queueId, setQueueId] = useState('all');
  const [tokens, setTokens] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [queueType, setQueueType] = useState('all');
  const [practitioner, setPractitioner] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    queueApi
      .list()
      .then(({ queues: q }) => setQueues(q || []))
      .catch((e) => setErr(e.message));
  }, []);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const targets = queueId === 'all' ? queues : queues.filter((q) => q._id === queueId);
      if (!targets.length) {
        setTokens([]);
        setTotalPages(1);
        setTotal(0);
        setLoading(false);
        return;
      }
      // Existing endpoints are per-queue; fan out and merge for "all queues".
      const results = await Promise.all(
        targets.map((q) =>
          queueApi
            .tokens(q._id, {
              page: 1,
              limit: 100,
              ...(status !== 'all' ? { status } : {}),
              ...(debouncedSearch ? { search: debouncedSearch } : {}),
            })
            .then((d) => ({ queue: q, data: d }))
        )
      );
      let merged = results.flatMap(({ queue, data }) =>
        (data.tokens || []).map((t) => ({ ...t, _queue: queue }))
      );
      if (queueType !== 'all') merged = merged.filter((t) => t.queueType === queueType);
      if (practitioner.trim()) {
        const rx = practitioner.trim().toLowerCase();
        merged = merged.filter((t) => t.practitioner?.name?.toLowerCase().includes(rx));
      }
      merged.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
      // Client-side pagination over the merged set.
      const perPage = 20;
      const totalCount = merged.length;
      const totalPg = Math.max(1, Math.ceil(totalCount / perPage));
      const safePage = Math.min(page, totalPg);
      setTokens(merged.slice((safePage - 1) * perPage, safePage * perPage));
      setTotalPages(totalPg);
      setTotal(totalCount);
      if (safePage !== page) setPage(safePage);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [queues, queueId, status, debouncedSearch, queueType, practitioner, page]);

  useEffect(() => {
    if (queues.length) fetchTokens();
  }, [fetchTokens, queues.length]);

  const resetFilters = () => {
    setStatus('all');
    setQueueType('all');
    setSearch('');
    setPractitioner('');
    setQueueId('all');
    setPage(1);
  };

  const sel = 'input capitalize';

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="page-title">Token history</h1>
        <p className="mt-1 text-sm text-slate-500">
          Today's service records — lifecycle timestamps, waiting and service durations.
        </p>

        <div className="mb-4 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <select value={queueId} onChange={(e) => { setQueueId(e.target.value); setPage(1); }} className={sel} aria-label="Queue">
            <option value="all">All queues</option>
            {queues.map((q) => (
              <option key={q._id} value={q._id}>{q.name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={sel} aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
            ))}
          </select>
          <select value={queueType} onChange={(e) => { setQueueType(e.target.value); setPage(1); }} className={sel} aria-label="Queue type">
            {QUEUE_TYPES.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All types' : s}</option>
            ))}
          </select>
          <input
            value={practitioner}
            onChange={(e) => { setPractitioner(e.target.value); setPage(1); }}
            placeholder="Practitioner name…"
            className="input"
          />
          <div className="lg:col-span-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search token number or name…" />
          </div>
        </div>

        {(status !== 'all' || queueType !== 'all' || practitioner || debouncedSearch || queueId !== 'all') && (
          <button onClick={resetFilters} className="mb-4 text-sm font-medium text-teal-700 hover:underline">
            Clear all filters
          </button>
        )}

        {err && !loading ? (
          <ErrorState message={err} onRetry={fetchTokens} />
        ) : loading ? (
          <TableSkeleton rows={8} />
        ) : tokens.length === 0 ? (
          <EmptyState title="No records found" message="Try adjusting the filters." />
        ) : (
          <>
            <div className="overflow-x-auto card">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Token', 'Queue', 'Patient', 'Practitioner', 'Registered', 'Called', 'Serving', 'Completed', 'Wait', 'Service', 'Status'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tokens.map((t) => (
                    <tr key={t._id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-slate-900">{t.tokenNumber}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{t._queue?.name || t.queue?.name}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{t.subject?.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{t.practitioner?.name || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtTime(t.registeredAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtTime(t.calledAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtTime(t.servingStartedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtTime(t.completedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {t.calledAt ? durationBetween(t.registeredAt, t.calledAt) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {t.servingStartedAt && t.completedAt ? durationBetween(t.servingStartedAt, t.completedAt) : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusChip status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
