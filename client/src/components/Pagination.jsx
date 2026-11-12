import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, totalPages, onChange, total }) {
  if (!totalPages || totalPages < 2) return null;
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium';
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-slate-500">
        Page {page} of {totalPages}
        {typeof total === 'number' ? ` · ${total} tokens` : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40`}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`${btn} ${p === page ? 'bg-teal-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {p}
          </button>
        ))}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40`}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
