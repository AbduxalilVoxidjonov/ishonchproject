import React, { useState } from 'react';
import { Branch, Department, Employee } from '../../types/hrm';
import { ModalShell, Field, inputCls } from '../common/ModalShell';

interface AddDepartmentModalProps {
  onClose: () => void;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  /** Pre-selected branch, e.g. when adding from inside a branch. */
  initialBranchId?: string;
  onAddDepartment: (dept: Omit<Department, 'id'>) => void;
}

type Errors = Partial<Record<'name' | 'headName' | 'branchId', string>>;

const COLORS = ['indigo', 'purple', 'amber', 'emerald', 'rose'];

const normalize = (s: string) => s.trim().toLowerCase().replace(/[‘’ʻʼ`']/g, "'");

export const AddDepartmentModal: React.FC<AddDepartmentModalProps> = ({
  onClose,
  branches,
  departments,
  employees,
  initialBranchId,
  onAddDepartment,
}) => {
  const [branchId, setBranchId] = useState(
    branches.some((b) => b.id === initialBranchId) ? initialBranchId ?? '' : branches[0]?.id ?? ''
  );
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [headName, setHeadName] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  // Suggest heads from the branch's current staff; any name can still be typed
  const branchStaff = employees.filter((e) => e.status !== 'terminated' && departments.some((d) => d.id === e.departmentId && d.branchId === branchId));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const next: Errors = {};
    if (!branchId) next.branchId = 'Filialni tanlang.';
    if (!n) next.name = 'Bo‘lim nomini kiriting.';
    else if (departments.some((d) => d.branchId === branchId && normalize(d.name) === normalize(n))) {
      next.name = 'Bu filialda shunday nomli bo‘lim allaqachon bor.';
    }
    if (!headName.trim()) next.headName = 'Bo‘lim rahbarini kiriting.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const autoCode = `DEP-${n.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'NEW'}`;
    onAddDepartment({
      branchId,
      name: n,
      code: code.trim().toUpperCase() || autoCode,
      headName: headName.trim(),
      color: COLORS[departments.length % COLORS.length],
    });
    onClose();
  };

  return (
    <ModalShell title="Yangi bo‘lim qo‘shish" icon="fa-sitemap" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {branches.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
            Avval kamida bitta filial yarating.
          </p>
        )}

        <Field label="Filial" required error={errors.branchId}>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.city})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Bo‘lim nomi" required error={errors.name}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Customer Support" className={inputCls} />
          </Field>
          <Field label="Kod">
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Avtomatik: DEP-CUST" className={inputCls} />
          </Field>
        </div>

        <Field label="Bo‘lim rahbari" required error={errors.headName}>
          <input
            type="text"
            list="department-head-options"
            value={headName}
            onChange={(e) => setHeadName(e.target.value)}
            placeholder="Ism Familiya (ro‘yxatdan tanlash yoki yozish)"
            className={inputCls}
          />
          <datalist id="department-head-options">
            {branchStaff.map((e) => (
              <option key={e.id} value={e.fullName}>
                {e.position}
              </option>
            ))}
          </datalist>
        </Field>

        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={branches.length === 0}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-xs"
          >
            Bo‘limni saqlash
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
