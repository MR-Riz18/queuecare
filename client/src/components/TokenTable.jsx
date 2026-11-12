import { useEffect, useState } from 'react';
import { Bell, BellRing, Play, SkipForward, Undo2, Check, XCircle, Clock } from 'lucide-react';
import StatusChip from './StatusChip';
import { timeAgo, fmtTime } from '../utils/format';

/**
 * Action buttons follow the exact backend state machine:
 * waiting   → called | cancelled
 * called    → serving | skipped | cancelled   (call again = recall)
 * serving   → completed | skipped
 * skipped   → waiting (return) | cancelled
 */
export default function TokenTable({ tokens, rooms, onAction, actingId, nowTick }) {
  return (
    <div className="overflow-x-auto card">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {['Token', 'Patient', 'Type', 'Priority', 'Registered', 'Waiting', 'Status', 'Room', 'Actions'].map(
              (h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tokens.map((t) => (
            <TokenRow key={t._id} token={t} rooms={rooms} onAction={onAction} actingId={actingId} nowTick={nowTick} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriorityBadge({ priority }) {
  const map = {
    emergency: 'bg-rose-100 text-rose-700',
    high: 'bg-orange-100 text-orange-700',
    normal: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${map[priority] || map.normal}`}>
      {priority}
    </span>
  );
}

function TokenRow({ token, rooms, onAction, actingId, nowTick }) {
  const busy = actingId === token._id;
  const s = token.subject || {};
  const displayName = s.kind === 'pet' && s.ownerName ? `${s.name} (${s.ownerName})` : s.name;

  const waitingMs = (() => {
    const end = token.calledAt || nowTick;
    return Math.max(0, new Date(end).getTime() - new Date(token.registeredAt).getTime());
  })();
  const waitingText = ['completed', 'cancelled'].includes(token.status)
    ? timeAgo(token.registeredAt, token.completedAt || token.updatedAt)
    : `${Math.floor(waitingMs / 60000)}m ${Math.floor((waitingMs % 60000) / 1000)}s`;

  return (
    <tr className="hover:bg-slate-50">
      <td className="whitespace-nowrap px-4 py-3 font-mono text-base font-bold text-slate-900">
        {token.tokenNumber}
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{displayName}</p>
        {s.kind === 'pet' && s.animalType && (
          <p className="text-xs capitalize text-slate-500">{s.animalType}</p>
        )}
        {s.phone && <p className="text-xs text-slate-500">{s.phone}</p>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-600">
        {token.queueType?.replace('-', ' ')}
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={token.priority} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtTime(token.registeredAt)}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="inline-flex items-center gap-1 text-slate-600">
          <Clock className="h-3.5 w-3.5" /> {waitingText}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusChip status={token.status} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{token.room?.name || '—'}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <ActionButtons token={token} rooms={rooms} onAction={onAction} busy={busy} />
      </td>
    </tr>
  );
}

function ActionButtons({ token, rooms, onAction, busy }) {
  const [roomId, setRoomId] = useState(token.room?._id || '');
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const st = token.status;

  const btn =
    'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40';
  const roomSelect = (
    <select
      value={roomId}
      onChange={(e) => setRoomId(e.target.value)}
      className="mr-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600"
      aria-label="Room"
      disabled={busy}
    >
      <option value="">Room…</option>
      {(rooms || [])
        .filter((r) => r.isActive !== false)
        .map((r) => (
          <option key={r._id} value={r._id}>
            {r.name}
          </option>
        ))}
    </select>
  );

  const confirmSkip = () => {
    onAction('skip', token, { reason: skipReason });
    setSkipOpen(false);
    setSkipReason('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {st === 'waiting' && (
        <>
          {roomSelect}
          <button className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => onAction('call', token, { roomId })}>
            <Bell className="h-3.5 w-3.5" /> Call
          </button>
          <button className={`${btn} bg-slate-100 text-slate-600 hover:bg-slate-200`} disabled={busy} onClick={() => onAction('cancel', token)}>
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </button>
        </>
      )}
      {st === 'called' && (
        <>
          {roomSelect}
          <button className={`${btn} bg-blue-50 text-blue-700 hover:bg-blue-100`} disabled={busy} onClick={() => onAction('recall', token, { roomId })}>
            <BellRing className="h-3.5 w-3.5" /> Recall
          </button>
          <button className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={busy} onClick={() => onAction('start-serving', token)}>
            <Play className="h-3.5 w-3.5" /> Start serving
          </button>
          <button className={`${btn} bg-orange-50 text-orange-700 hover:bg-orange-100`} disabled={busy} onClick={() => setSkipOpen(true)}>
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </button>
          <button className={`${btn} bg-slate-100 text-slate-600 hover:bg-slate-200`} disabled={busy} onClick={() => onAction('cancel', token)}>
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </button>
        </>
      )}
      {st === 'serving' && (
        <>
          <button className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} disabled={busy} onClick={() => onAction('complete', token)}>
            <Check className="h-3.5 w-3.5" /> Complete
          </button>
          <button className={`${btn} bg-orange-50 text-orange-700 hover:bg-orange-100`} disabled={busy} onClick={() => setSkipOpen(true)}>
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </button>
        </>
      )}
      {st === 'skipped' && (
        <>
          <button className={`${btn} bg-amber-100 text-amber-800 hover:bg-amber-200`} disabled={busy} onClick={() => onAction('return', token)}>
            <Undo2 className="h-3.5 w-3.5" /> Return to queue
          </button>
          <button className={`${btn} bg-slate-100 text-slate-600 hover:bg-slate-200`} disabled={busy} onClick={() => onAction('cancel', token)}>
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </button>
        </>
      )}
      {skipOpen && (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs"
          />
          <button className={`${btn} bg-orange-600 text-white`} onClick={confirmSkip}>OK</button>
          <button className={`${btn} bg-slate-100`} onClick={() => setSkipOpen(false)}>✕</button>
        </span>
      )}
    </div>
  );
}
