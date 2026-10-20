import React, { useState } from 'react';
import { Employee, LeaveRequest } from '../../types/hrm';
import { ModalShell, Field, inputCls } from '../common/ModalShell';
import { inclusiveDays, localDateISO } from '../../utils/dates';

interface AddLeaveModalProps {
  onClose: () => void;
  employees: Employee[];
  onAddLeave: (leave: Omit<LeaveRequest, 'id' | 'requestedAt' | 'status'>) => void;
}

type Errors = Partial<Record<'employee' | 'dates' | 'reason', string>>;

/** Local YYYY-MM-DD, `offset` days from today. */
const daysFromToday = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDateISO(d);
};

export const AddLeaveModal: React.FC<AddLeaveModalProps> = ({ onClose, employees, onAddLeave }) => {
  // Terminated employees cannot request leave
  const eligible = employees.filter((e) => e.status !== 'terminated');

  const [employeeId, setEmployeeId] = useState(eligible[0]?.id ?? '');
  const [type, setType] = useState<LeaveRequest['type']>('yillik');
  const [startDate, setStartDate] = useState(daysFromToday(1));
  const [endDate, setEndDate] = useState(daysFromToday(5));
  const [reason, setReason] = useState('Rejali mehnat ta’tili');
  const [errors, setErrors] = useState<Errors>({});

  const daysCount = inclusiveDays(startDate, endDate);
  const selected = eligible.find((x) => x.id === employeeId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const text = reason.trim();

    if (!selected) next.employee = 'Xodimni tanlang.';
    if (!startDate || !endDate || endDate < startDate || daysCount < 1) {
      next.dates = 'Tugash sanasi boshlanish sanasidan oldin bo‘lishi mumkin emas.';
    } else if (type === 'yillik' && selected && daysCount > selected.remainingLeaveDays) {
      next.dates = `Yillik ta’til qoldig‘i yetarli emas: ${selected.remainingLeaveDays} kun qolgan, so‘ralgan ${daysCount} kun.`;
    }
    if (!text) next.reason = 'Ariza sababini kiriting.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !selected) return;

    onAddLeave({
      employeeId: selected.id,
      employeeName: selected.fullName,
      department: selected.departmentName,
      position: selected.position,
      type,
      startDate,
      endDate,
      daysCount,
      reason: text,
    });
    onClose();
  };

  return (
    <ModalShell title="Ta’til yoki ruxsatnoma arizasi" icon="fa-calendar-plus" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Xodim" required error={errors.employee}>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
            {eligible.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName} ({e.position} • {e.departmentName})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Ta’til turi">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LeaveRequest['type'])}
              className={inputCls}
            >
              <option value="yillik">Yillik mehnat ta’tili</option>
              <option value="kasallik">Kasallik varaqasi (Byulleten)</option>
              <option value="ruxsatnoma">Qisqa muddatli ruxsat</option>
              <option value="oqish">O‘qish ta’tili</option>
              <option value="ishhaqisiz">O‘z hisobidan (Ish haqisiz)</option>
            </select>
          </Field>
          <Field label="Kunlar soni">
            {/* Derived from the date range; not editable */}
            <div className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700">
              {daysCount} kun
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Boshlanish sanasi">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tugash sanasi">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        {errors.dates && <p className="text-xs text-red-600 -mt-2">{errors.dates}</p>}
        {type === 'yillik' && selected && !errors.dates && (
          <p className="text-xs text-slate-500 -mt-2">
            Yillik ta’til qoldig‘i: <span className="font-semibold">{selected.remainingLeaveDays} kun</span>
          </p>
        )}

        <Field label="Ariza sababi / Izoh" required error={errors.reason}>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </Field>

        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={eligible.length === 0}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-xs"
          >
            Arizani yuborish
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
