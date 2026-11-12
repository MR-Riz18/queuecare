import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const styles = {
  success: { ring: 'border-emerald-200', icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" /> },
  error: { ring: 'border-rose-200', icon: <AlertCircle className="h-5 w-5 text-rose-600" /> },
  info: { ring: 'border-sky-200', icon: <Info className="h-5 w-5 text-sky-600" /> },
};

export default function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => {
        const s = styles[t.type] || styles.info;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${s.ring} bg-white px-4 py-3 shadow-lg animate-fade-slide-in`}
            role="status"
          >
            <span className="mt-0.5 shrink-0">{s.icon}</span>
            <p className="flex-1 text-sm text-slate-700">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
