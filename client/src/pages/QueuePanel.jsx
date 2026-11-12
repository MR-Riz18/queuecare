import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Plus, RefreshCw } from 'lucide-react';
import { queueApi } from '../api/queueApi';
import { tokenApi } from '../api/tokenApi';
import { roomApi } from '../api/roomApi';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { useNow } from '../hooks/useNow';
import Navbar from '../components/Navbar';
import TokenTable from '../components/TokenTable';
import RegisterPatientModal from '../components/RegisterPatientModal';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchInput from '../components/SearchInput';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const STATUSES = ['all', 'waiting', 'called', 'serving', 'skipped', 'completed', 'cancelled'];

/**
 * Receptionist queue management.
 * Live: joins the selected queue's room; on queue:updated → refetch tokens;
 * on token:* → toast.
 */
export default function QueuePanel() {
  const { joinQueue, leaveQueue, subscribe, connected } = useSocket();
  const { success, error } = useToast();
  const nowTick = useNow(1000);

  const [queues, setQueues] = useState([]);
  const [queueId, setQueueId] = useState('');
  const [rooms, setRooms] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [actingId, setActingId] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [confirm, setConfirm] = useState(null); // { action, token, title, message, confirmLabel }
  const [callRoom, setCallRoom] = useState('');

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [search]);

  // Queues + rooms
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ queues: q }, r] = await Promise.all([queueApi.list(), roomApi.list()]);
        if (!alive) return;
        setQueues(q || []);
        if (q?.length && !queueId) setQueueId(q[0]._id);
        setRooms(r.rooms || []);
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTokens = useCallback(async () => {
    if (!queueId) return;
    setLoading(true);
    try {
      const data = await queueApi.tokens(queueId, {
        page,
        limit: 20,
        ...(status !== 'all' ? { status } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      setTokens(data.tokens || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [queueId, page, status, debouncedSearch]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Socket live updates for the selected queue
  const queueIdRef = useRef(queueId);
  queueIdRef.current = queueId;
  useEffect(() => {
    if (!queueId) return;
    joinQueue(queueId, 'receptionist');
    const unsubs = [
      subscribe('queue:updated', (p) => {
        if (!p.queueId || String(p.queueId) === String(queueIdRef.current)) fetchTokens();
      }),
    ];
    const tokenEvents = ['token:called', 'token:recalled', 'token:serving', 'token:skipped', 'token:completed', 'token:cancelled'];
    tokenEvents.forEach((ev) =>
      unsubs.push(
        subscribe(ev, (p) => {
          if (p.queueId && String(p.queueId) !== String(queueIdRef.current)) return;
          success(`${p.tokenNumber} ${ev.split(':')[1]}${p.roomName ? ` → ${p.roomName}` : ''}`);
        })
      )
    );
    return () => {
      unsubs.forEach((u) => u());
      leaveQueue(queueId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId]);

  const doAction = async (action, token, opts = {}) => {
    setActingId(token._id);
    try {
      switch (action) {
        case 'call':
          await tokenApi.call(token._id, opts.roomId || undefined);
          success(`Calling ${token.tokenNumber}`);
          break;
        case 'recall':
          await tokenApi.recall(token._id, opts.roomId || undefined);
          success(`Recalling ${token.tokenNumber}`);
          break;
        case 'start-serving':
          await tokenApi.startServing(token._id);
          success(`${token.tokenNumber} is being served`);
          break;
        case 'skip':
          await tokenApi.skip(token._id, opts.reason);
          success(`${token.tokenNumber} skipped`);
          break;
        case 'return':
          await tokenApi.returnToQueue(token._id);
          success(`${token.tokenNumber} returned to queue`);
          break;
        case 'complete':
          await tokenApi.complete(token._id);
          success(`${token.tokenNumber} completed`);
          break;
        case 'cancel':
          await tokenApi.cancel(token._id, opts.reason);
          success(`${token.tokenNumber} cancelled`);
          break;
        default:
          break;
      }
      fetchTokens();
    } catch (e) {
      error(e.message);
    } finally {
      setActingId(null);
    }
  };

  const handleAction = (action, token, opts) => {
    // Destructive transitions go through a confirmation dialog.
    if (action === 'cancel') {
      setConfirm({
        token,
        action,
        title: `Cancel token ${token.tokenNumber}?`,
        message: 'The patient will be removed from today\'s queue. This cannot be undone.',
        confirmLabel: 'Cancel token',
      });
    } else if (action === 'skip' && token.status === 'serving') {
      setConfirm({
        token,
        action,
        title: `Skip token ${token.tokenNumber}?`,
        message: 'The token is currently being served. Skipping will move it out of service.',
        confirmLabel: 'Skip token',
      });
    } else {
      doAction(action, token, opts);
    }
  };

  const handleCallNext = async () => {
    setActingId('call-next');
    try {
      const { token } = await queueApi.callNext(queueId, callRoom || undefined);
      success(`Calling ${token.tokenNumber}`);
      fetchTokens();
    } catch (e) {
      error(e.message); // 404 "No waiting patients" when the queue is empty
    } finally {
      setActingId(null);
    }
  };

  const handleRegister = async (payload) => {
    setRegistering(true);
    try {
      const { token } = await queueApi.register(queueId, payload);
      success(`Token ${token.tokenNumber} registered`);
      setRegisterOpen(false);
      fetchTokens();
    } catch (e) {
      error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Queue management</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <span className={`live-dot ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {connected ? 'Live updates connected' : 'Reconnecting…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={callRoom}
              onChange={(e) => setCallRoom(e.target.value)}
              className="input w-auto"
              aria-label="Room for call next"
            >
              <option value="">Auto room</option>
              {rooms.filter((r) => r.isActive !== false).map((r) => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
            <button
              onClick={handleCallNext}
              disabled={!queueId || actingId === 'call-next'}
              className="btn-blue"
            >
              <BellRing className="h-4 w-4" /> Call next
            </button>
            <button
              onClick={() => setRegisterOpen(true)}
              disabled={!queueId}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" /> Register
            </button>
          </div>
        </div>

        {/* Queue tabs */}
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Queues">
          {queues.map((q) => (
            <button
              key={q._id}
              role="tab"
              aria-selected={queueId === q._id}
              onClick={() => {
                setQueueId(q._id);
                setPage(1);
              }}
              className={`rounded-xl border px-4 py-2 text-sm font-medium ${
                queueId === q._id
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {q.name} <span className="text-xs text-slate-400">({q.prefix})</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <SearchInput value={search} onChange={setSearch} />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="input w-auto capitalize"
            aria-label="Filter by status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s === 'all' ? 'All statuses' : s}
              </option>
            ))}
          </select>
          <button
            onClick={fetchTokens}
            className="btn-secondary"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {err && !loading && tokens.length === 0 ? (
          <ErrorState message={err} onRetry={fetchTokens} />
        ) : loading ? (
          <TableSkeleton rows={8} />
        ) : tokens.length === 0 ? (
          <EmptyState
            title="No tokens found"
            message={debouncedSearch || status !== 'all' ? 'Try adjusting the search or status filter.' : 'No patients registered in this queue yet.'}
          />
        ) : (
          <>
            <TokenTable tokens={tokens} rooms={rooms} onAction={handleAction} actingId={actingId} nowTick={nowTick} />
            <div className="mt-4">
              <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </main>

      <RegisterPatientModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSubmit={handleRegister}
        submitting={registering}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          doAction(c.action, c.token);
        }}
      />
    </div>
  );
}
