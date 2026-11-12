import { useCallback, useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { analyticsApi } from '../api/analyticsApi';
import { queueApi } from '../api/queueApi';
import Navbar from '../components/Navbar';
import StatCard from '../components/StatCard';
import { BarChart, HBarChart, Donut } from '../components/Charts';
import { TableSkeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { useToast } from '../context/ToastContext';

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Analytics: queue performance computed from Token records.
 * Date-range + queue filters; KPI cards; served-per-day, peak-hours,
 * and volume-by-queue charts (dependency-free SVG).
 */
export default function Analytics() {
  const { error } = useToast();
  const [queues, setQueues] = useState([]);
  const [queueId, setQueueId] = useState('all');
  const [to, setTo] = useState(() => toISO(new Date()));
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toISO(d);
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    queueApi
      .list()
      .then(({ queues: q }) => setQueues(q || []))
      .catch((e) => error(e.message));
    // `error` is a new function identity on every ToastProvider render;
    // depending on it would refetch (and re-toast) in a loop on failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await analyticsApi.getQueue({
        from,
        to,
        ...(queueId !== 'all' ? { queueId } : {}),
      });
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, queueId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const totals = data?.totals || {};
  const peakData = (data?.peakHours || [])
    .filter((h) => h.count > 0)
    .map((h) => ({
      label: `${String(h.hour).padStart(2, '0')}:00`,
      value: h.count,
    }));
  const servedData = (data?.servedPerDay || []).map((d) => ({
    label: d.date.slice(5), // MM-DD
    value: d.count,
  }));
  const volumeData = (data?.volumeByQueue || []).map((v) => ({
    label: v.label,
    value: v.count,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <BarChart3 className="h-6 w-6 text-teal-600" /> Analytics
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={queueId}
              onChange={(e) => setQueueId(e.target.value)}
              className="input w-auto"
              aria-label="Queue filter"
            >
              <option value="all">All queues</option>
              {queues.map((q) => (
                <option key={q._id} value={q._id}>
                  {q.prefix} — {q.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="input w-auto"
              aria-label="From date"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="input w-auto"
              aria-label="To date"
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : err ? (
          <ErrorState message={err} onRetry={fetchAnalytics} />
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Served" value={totals.served ?? 0} />
              <StatCard label="Avg wait" value={`${data?.avgWaitingMinutes ?? 0} min`} />
              <StatCard label="Avg service" value={`${data?.avgServiceMinutes ?? 0} min`} />
              <StatCard label="Skipped" value={totals.skipped ?? 0} />
              <StatCard label="Cancelled" value={totals.cancelled ?? 0} />
              <StatCard label="Total tokens" value={totals.tokens ?? 0} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <section className="card p-5">
                <h2 className="text-sm font-semibold text-slate-900">Patients served per day</h2>
                <div className="mt-3">
                  <BarChart data={servedData} />
                </div>
              </section>
              <section className="card p-5">
                <h2 className="text-sm font-semibold text-slate-900">Peak hours (registrations)</h2>
                <div className="mt-3">
                  <HBarChart data={peakData} color="#0ea5e9" />
                </div>
              </section>
              <section className="card p-5 lg:col-span-2">
                <h2 className="text-sm font-semibold text-slate-900">Queue volume by department</h2>
                <div className="mt-3">
                  <Donut data={volumeData} />
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
