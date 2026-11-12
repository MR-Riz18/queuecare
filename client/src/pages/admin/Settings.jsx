import { useCallback, useEffect, useState } from 'react';
import { Save, Copy, Check, RefreshCw, MonitorPlay, ExternalLink } from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { useToast } from '../../context/ToastContext';
import Navbar from '../../components/Navbar';
import Skeleton from '../../components/Skeleton';
import ErrorState from '../../components/ErrorState';

const inputCls =
  'input';
const labelCls = 'label';

export default function Settings() {
  const { success, error } = useToast();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSettings();
      const s = data.settings || data;
      setSettings(s);
      setForm({
        name: s.name || '',
        facilityType: s.facilityType || 'clinic',
        timezone: s.timezone || 'Asia/Karachi',
        logoUrl: s.logoUrl || '',
        announcement: s.settings?.announcement || s.announcement || '',
        resetPolicy: s.settings?.resetPolicy || s.resetPolicy || 'daily',
      });
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const displayKey = settings?.settings?.displayKey || settings?.displayKey;
  const displayUrl = displayKey ? `${window.location.origin}/display/${displayKey}` : '';

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await adminApi.updateSettings(form);
      // The server only returns the fields it echoes back ({ name, timezone });
      // merge into the existing settings so the displayKey (and the rest)
      // doesn't vanish from the page after saving.
      const s = data.settings || data;
      setSettings((prev) => ({ ...prev, ...s }));
      success('Settings saved');
    } catch (e2) {
      error(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Regenerate the display key? Existing display screens will stop working until they get the new URL.')) return;
    setRegenerating(true);
    try {
      const data = await adminApi.regenerateDisplayKey();
      const dk = data.displayKey;
      setSettings((s) => ({ ...s, settings: { ...s.settings, displayKey: dk }, displayKey: dk }));
      success('Display key regenerated — share the new URL');
    } catch (e2) {
      error(e2.message);
    } finally {
      setRegenerating(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error('Copy failed — select the URL manually');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="page-title">Clinic settings</h1>
        <p className="mt-1 text-sm text-slate-500">Identity, display screen, and operational preferences.</p>

        {err && !loading ? (
          <div className="mt-5"><ErrorState message={err} onRetry={fetchSettings} /></div>
        ) : loading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <form onSubmit={handleSave} className="mt-5 space-y-5 card p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Clinic name</label>
                  <input value={form.name} onChange={set('name')} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Facility type</label>
                  <select value={form.facilityType} onChange={set('facilityType')} className={inputCls}>
                    <option value="clinic">Clinic</option>
                    <option value="hospital">Hospital</option>
                    <option value="dental">Dental</option>
                    <option value="veterinary">Veterinary</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Timezone</label>
                  <input value={form.timezone} onChange={set('timezone')} className={inputCls} placeholder="Asia/Karachi" />
                </div>
                <div>
                  <label className={labelCls}>Logo URL</label>
                  <input value={form.logoUrl} onChange={set('logoUrl')} className={inputCls} placeholder="https://…" inputMode="url" />
                </div>
                <div>
                  <label className={labelCls}>Queue reset policy</label>
                  <select value={form.resetPolicy} onChange={set('resetPolicy')} className={inputCls}>
                    <option value="daily">Daily</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Announcement (shown on the display screen)</label>
                <textarea value={form.announcement} onChange={set('announcement')} className={inputCls} rows={3} maxLength={500} placeholder="e.g. Please keep your token number handy." />
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={saving} className="btn-primary px-5">
                  <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </form>

            {/* Display screen */}
            <section className="mt-6 card p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <MonitorPlay className="h-5 w-5 text-teal-600" /> Waiting-room display
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                This public screen shows only token numbers and room names — never patient names
                or contact details. The URL's 32-character key is the access secret.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input readOnly value={displayUrl} className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
                <div className="flex gap-2">
                  <button onClick={copyUrl} className="btn-secondary px-3">
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => window.open(displayUrl, '_blank', 'noopener')}
                    className="btn-secondary px-3"
                  >
                    <ExternalLink className="h-4 w-4" /> Open
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" /> {regenerating ? '…' : 'Regenerate key'}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Display preferences (theme, layout) are stored server-side as an opaque
                <code className="mx-1 rounded bg-slate-100 px-1">displayPreferences</code>
                object and are reserved for Stage 4 customization.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
