import { useState } from 'react';
import { X, Stethoscope, PawPrint } from 'lucide-react';

const inputCls =
  'input';
const labelCls = 'label';

/**
 * Patient registration modal.
 * Field set adapts to facilityType (clinic/hospital/dental → person fields,
 * veterinary → owner + pet fields) with a manual person/pet toggle as fallback —
 * receptionists can't read /admin/settings, so the toggle keeps it usable for them.
 */
export default function RegisterPatientModal({ open, onClose, onSubmit, facilityType = 'clinic', submitting }) {
  const isVet = facilityType === 'veterinary';
  const [kind, setKind] = useState(isVet ? 'pet' : 'human');
  const [form, setForm] = useState({
    name: '',
    ownerName: '',
    animalType: '',
    refNumber: '',
    phone: '',
    visitType: 'walk-in',
    queueType: 'walk-in',
    priority: 'normal',
    note: '',
  });

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = {
      kind,
      name: form.name.trim(),
      ownerName: form.ownerName.trim() || undefined,
      animalType: form.animalType.trim() || undefined,
      refNumber: form.refNumber.trim() || undefined,
      phone: form.phone.trim() || undefined,
      visitType: form.visitType,
      note: form.note.trim() || undefined,
    };
    onSubmit({ subject, priority: form.priority, queueType: form.queueType });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-fade-slide-in">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Register patient</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex gap-2" role="tablist" aria-label="Patient type">
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'human'}
            onClick={() => setKind('human')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
              kind === 'human' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Stethoscope className="h-4 w-4" /> Person
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'pet'}
            onClick={() => setKind('pet')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
              kind === 'pet' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <PawPrint className="h-4 w-4" /> Pet
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {kind === 'pet' && (
            <div className="sm:col-span-2">
              <label className={labelCls}>Owner name *</label>
              <input required value={form.ownerName} onChange={set('ownerName')} className={inputCls} placeholder="e.g. Ali Raza" />
            </div>
          )}
          <div>
            <label className={labelCls}>{kind === 'pet' ? 'Pet name *' : 'Patient name *'}</label>
            <input required value={form.name} onChange={set('name')} className={inputCls} placeholder={kind === 'pet' ? 'e.g. Bruno' : 'e.g. Fatima Noor'} />
          </div>
          {kind === 'pet' ? (
            <div>
              <label className={labelCls}>Animal type</label>
              <input value={form.animalType} onChange={set('animalType')} className={inputCls} placeholder="Dog, cat, bird…" />
            </div>
          ) : (
            <div>
              <label className={labelCls}>Reference / MRN</label>
              <input value={form.refNumber} onChange={set('refNumber')} className={inputCls} placeholder="Optional" />
            </div>
          )}
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="03xx-xxxxxxx" inputMode="tel" />
          </div>
          <div>
            <label className={labelCls}>Visit type</label>
            <select value={form.visitType} onChange={set('visitType')} className={inputCls}>
              <option value="walk-in">Walk-in</option>
              <option value="appointment">Appointment</option>
              <option value="follow-up">Follow-up</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Queue type</label>
            <select value={form.queueType} onChange={set('queueType')} className={inputCls}>
              <option value="walk-in">Walk-in</option>
              <option value="appointment">Appointment</option>
              <option value="follow-up">Follow-up</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select value={form.priority} onChange={set('priority')} className={inputCls}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Note</label>
            <textarea value={form.note} onChange={set('note')} className={inputCls} rows={2} placeholder="Optional note for staff (never shown on the display screen)" />
          </div>
          <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary px-5">
              {submitting ? 'Registering…' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
