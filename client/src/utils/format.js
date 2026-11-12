/** Format an ISO date/time for tables, e.g. "2:45 PM". */
export function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}

/** Format an ISO date, e.g. "15 Oct 2026". */
export function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

/** Human duration between two dates, e.g. "12m 30s". */
export function durationBetween(from, to) {
  if (!from) return '—';
  const ms = Math.max(0, new Date(to || Date.now()).getTime() - new Date(from).getTime());
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${s}s`;
}

export function timeAgo(from, to) {
  return durationBetween(from, to);
}

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
