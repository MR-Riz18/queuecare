const map = {
  waiting: 'bg-amber-50 text-amber-700 ring-amber-200',
  called: 'bg-blue-50 text-blue-700 ring-blue-200',
  serving: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  skipped: 'bg-orange-50 text-orange-700 ring-orange-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default function StatusChip({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${
        map[status] || map.cancelled
      }`}
    >
      {status}
    </span>
  );
}
