import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, BellRing, CheckCircle2, SkipForward, Hourglass, Plus, Megaphone, MonitorPlay,
} from 'lucide-react';
import { dashboardApi } from '../api/dashboardApi';
import { adminApi } from '../api/adminApi';
import { queueApi } from '../api/queueApi';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import StatCard from '../components/StatCard';
import StatusChip from '../components/StatusChip';
import RegisterPatientModal from '../components/RegisterPatientModal';
import { StatCardSkeleton, TableSkeleton } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { fmtTime } from '../utils/format';

/**
 * Staff home: today's operational snapshot.
 * Live: joins every queue's room; on queue:stats → refetch stats; on token:* → toast + refetch.
 */
export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { joinQueue, leaveQueue, subscribe, connected } = useSocket();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [facilityType, setFacilityType] = useState('clinic');
  const [displayKey, setDisplayKey] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await dashboardApi.stats();
      setStats(data);
      // Display key: prefer a future Stage 2 `display` field; fall back to admin settings.
      const dk = data.displayKey || data.display?.displayKey;
      if (dk) setDisplayKey(dk);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data + queue/room lists (for socket joins + register modal)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ queues: q }, dkFetch] = await Promise.all([
          queueApi.list(),
          isAdmin ? adminApi.getSettings().catch(() => null) : Promise.resolve(null),
        ]);
        if (!alive) return;
        setQueues(q || []);
        const st = dkFetch?.settings || dkFetch;
        if (st?.facilityType) setFacilityType(st.facilityType);
        if (st?.displayKey) setDisplayKey((k) => k || st.displayKey);
        await fetchStats();
      } catch (e) {
        if (alive) {
          setErr(e.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchStats, isAdmin]);

  // Socket: join every queue room; live updates.
  useEffect(() => {
    if (!queues.length) return;
    queues.forEach((q) => joinQueue(q._id, 'receptionist'));
    const unsubs = [];
    unsubs.push(subscribe('queue:stats', () => fetchStats()));
    unsubs.push(
      subscribe('queue:updated', () => fetchStats())
    );
    const tokenEvents = ['token:called', 'token:recalled', 'token:serving', 'token:skipped', 'token:completed', 'token:cancelled'];
    tokenEvents.forEach((ev) =>
      unsubs.push(
        subscribe(ev, (p) => {
          success(`${p.tokenNumber} ${ev.split(':')[1]}${p.roomName ? ` → ${p.roomName}` : ''}`);
          fetchStats();
        })
      )
    );
    return () => {
      unsubs.forEach((u) => u());
      queues.forEach((q) => leaveQueue(q._id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queues]);

  const handleRegister = async (payload) => {
    if (!queues.length) {
      error('No active queue available today');
      return;
    }
    setRegistering(true);
    try {
      const { token } = await queueApi.register(queues[0]._id, payload);
      success(`Token ${token.tokenNumber} registered`);
      setRegisterOpen(false);
      fetchStats();
    } catch (e) {
      error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const currentCalled = stats?.currentlyCalled;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Today's overview</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              {stats?.serviceDate || '—'}
              <span className="inline-flex items-center gap-1.5">
                <span className={`live-dot ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-xs">{connected ? 'Live' : 'Reconnecting…'}</span>
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {displayKey && (
              <button
                onClick={() => window.open(`/display/${displayKey}`, '_blank', 'noopener')}
                className="btn-secondary"
              >
                <MonitorPlay className="h-4 w-4" /> Open display screen
              </button>
            )}
            <button
              onClick={() => navigate('/queue')}
              className="btn-secondary"
            >
              <Megaphone className="h-4 w-4" /> Manage queue
            </button>
            <button
              onClick={() => setRegisterOpen(true)}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" /> Add patient
            </button>
          </div>
        </div>

        {err && !stats && <ErrorState message={err} onRetry={fetchStats} />}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          stats && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Waiting" value={stats.waiting} icon={<Clock className="h-5 w-5" />} tone="amber" />
                <StatCard label="Served today" value={stats.servedToday} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
                <StatCard
                  label="Currently called"
                  value={currentCalled ? currentCalled.tokenNumber : '—'}
                  icon={<BellRing className="h-5 w-5" />}
                  tone="sky"
                  sub={currentCalled?.roomName ? `→ ${currentCalled.roomName}` : undefined}
                />
                <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 className="h-5 w-5" />} tone="teal" />
                <StatCard label="Skipped" value={stats.skipped} icon={<SkipForward className="h-5 w-5" />} tone="orange" />
                <StatCard
                  label="Avg wait"
                  value={stats.avgWaitingMinutes ? `${stats.avgWaitingMinutes}m` : '—'}
                  icon={<Hourglass className="h-5 w-5" />}
                  tone="indigo"
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Per-queue status */}
                <section className="card p-5">
                  <h2 className="mb-3 text-base font-semibold text-slate-900">Queues</h2>
                  {stats.queueStatus?.length ? (
                    <ul className="divide-y divide-slate-100">
                      {stats.queueStatus.map((q) => (
                        <li key={q.queueId} className="flex items-center justify-between py-2.5">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{q.name}</p>
                            <p className="text-xs text-slate-500">prefix {q.prefix} · {q.total} tokens</p>
                          </div>
                          <div className="flex gap-3 text-xs">
                            <span className="text-amber-600 font-semibold">{q.waiting} waiting</span>
                            <span className="text-blue-600 font-semibold">{q.called} called</span>
                            <span className="text-indigo-600 font-semibold">{q.serving} serving</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No queues today" message="Queues for today haven't been set up yet." />
                  )}
                </section>

                {/* Waiting tokens + recent activity */}
                <section className="card p-5">
                  <h2 className="mb-3 text-base font-semibold text-slate-900">Up next</h2>
                  {stats.waitingTokens?.length ? (
                    <ul className="space-y-1.5">
                      {stats.waitingTokens.slice(0, 8).map((t) => (
                        <li key={t._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span className="font-mono font-bold text-slate-900">{t.tokenNumber}</span>
                          <span className="text-xs text-slate-500">
                            {t.queue?.name} · {t.priority}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No one waiting" message="The waiting list is clear." />
                  )}
                </section>
              </div>

              <section className="mt-6 card p-5">
                <h2 className="mb-3 text-base font-semibold text-slate-900">Recent activity</h2>
                {stats.recentActivity?.length ? (
                  <ul className="divide-y divide-slate-100">
                    {stats.recentActivity.map((a) => (
                      <li key={a._id} className="flex items-center justify-between py-2">
                        <span className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-900">{a.tokenNumber}</span>
                          <StatusChip status={a.status} />
                          <span className="hidden text-xs text-slate-500 sm:inline">{a.queue?.name}</span>
                        </span>
                        <span className="text-xs text-slate-500">{fmtTime(a.updatedAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No activity yet" message="Token events will appear here." />
                )}
              </section>
            </>
          )
        )}
      </main>

      <RegisterPatientModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSubmit={handleRegister}
        facilityType={facilityType}
        submitting={registering}
      />
    </div>
  );
}
