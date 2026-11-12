export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

export default Skeleton;

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-16" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
