import React, { useState } from 'react';
import { Branch, Department, Employee } from '../../types/hrm';
import { ModalShell, Field, inputCls } from '../common/ModalShell';
import { localDateISO } from '../../utils/dates';

interface AddEmployeeModalProps {
  onClose: () => void;
  departments: Department[];
  branches: Branch[];
  /** Pre-selected department, e.g. when adding from the organization structure. */
  initialDepartmentId?: string;
  onAddEmployee: (emp: Omit<Employee, 'id' | 'code'>) => void;
}

type Errors = Partial<Record<'fullName' | 'position' | 'salary' | 'email', string>>;

const MIN_SALARY = 1_000_000;
const MAX_SALARY = 500_000_000;

/** Lowercase and keep only a-z (drops apostrophes, diacritics, cyrillic). */
const asciiSlug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  onClose,
  departments,
  branches,
  initialDepartmentId,
  onAddEmployee,
}) => {
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [departmentId, setDepartmentId] = useState(
    departments.some((d) => d.id === initialDepartmentId) ? initialDepartmentId ?? '' : departments[0]?.id ?? ''
  );
  const [phone, setPhone] = useState('+998 (90) ');
  const [email, setEmail] = useState('');
  const [salary, setSalary] = useState('15000000');
  const [joinedDate, setJoinedDate] = useState(localDateISO());
  const [status, setStatus] = useState<'active' | 'probation'>('probation');
  const [errors, setErrors] = useState<Errors>({});

  const noDepartments = departments.length === 0;
  // The branch always follows the chosen department
  const selectedDept = departments.find((d) => d.id === departmentId);
  const branchName = branches.find((b) => b.id === selectedDept?.branchId)?.name ?? '—';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dept = departments.find((d) => d.id === departmentId) ?? departments[0];
    if (!dept) return;

    const name = fullName.trim().replace(/\s+/g, ' ');
    const words = name.split(' ').filter(Boolean);
    const pos = position.trim();
    const mail = email.trim();
    const salaryNum = Number(salary);

    const next: Errors = {};
    if (words.length < 2) next.fullName = 'Ism va familiyani kiriting (kamida 2 so‘z).';
    if (!pos) next.position = 'Lavozimni kiriting.';
    if (!salary.trim() || !Number.isInteger(salaryNum) || salaryNum < MIN_SALARY || salaryNum > MAX_SALARY) {
      next.salary = 'Oklad 1 000 000 dan 500 000 000 UZS gacha butun son bo‘lishi kerak.';
    }
    if (mail && !mail.includes('@')) next.email = 'Email manzili noto‘g‘ri.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const first = words[0] ?? '';
    const last = words[words.length - 1] ?? '';
    const initials = words
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase();
    const localPart = [asciiSlug(first), asciiSlug(last)].filter(Boolean).join('.') || 'xodim';

    onAddEmployee({
      fullName: name,
      initials,
      email: mail || `${localPart}@hrm-enterprise.uz`,
      phone: phone.trim(),
      position: pos,
      departmentId: dept.id,
      departmentName: dept.name,
      branch: branchName,
      status,
      joinedDate,
      salary: salaryNum,
      currency: 'UZS',
      manager: dept.headName,
      // New hire has no performance/attendance history yet
      performanceScore: undefined,
      kpiCompletion: undefined,
      attendanceRate: undefined,
      remainingLeaveDays: status === 'probation' ? 0 : 21,
      address: '',
    });

    onClose();
  };

  return (
    <ModalShell title="Yangi xodim qo‘shish" icon="fa-user-plus" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {noDepartments && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
            Avval kamida bitta bo‘lim yarating — xodim qo‘shib bo‘lmaydi.
          </p>
        )}

        <Field label="F.I.Sh (Ism Familiya)" required error={errors.fullName}>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Masalan: Azizbek Aliyev"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Lavozim" required error={errors.position}>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Frontend Developer"
              className={inputCls}
            />
          </Field>
          <Field label="Bo‘lim">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputCls}>
              {branches.map((b) => {
                const branchDepts = departments.filter((d) => d.branchId === b.id);
                return branchDepts.length > 0 ? (
                  <optgroup key={b.id} label={b.name}>
                    {branchDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Filial">
            <input type="text" value={branchName} readOnly aria-readonly="true" className={`${inputCls} text-slate-500`} />
          </Field>
          <Field label="Boshlang‘ich holati">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'probation')}
              className={inputCls}
            >
              <option value="probation">Sinov muddati (Probation)</option>
              <option value="active">To‘liq shtat (Faol)</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Oylik oklad (UZS)" required error={errors.salary}>
            <input
              type="number"
              min={MIN_SALARY}
              max={MAX_SALARY}
              step={1}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="15000000"
              className={inputCls}
            />
          </Field>
          <Field label="Ishga qabul sanasi">
            <input
              type="date"
              value={joinedDate}
              onChange={(e) => setJoinedDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Telefon raqam">
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 (90) 123-45-67"
              className={inputCls}
            />
          </Field>
          <Field label="Korporativ Email" error={errors.email}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="azizbek.aliyev@hrm-enterprise.uz"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={noDepartments}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center space-x-2"
          >
            <i className="fa-solid fa-check"></i>
            <span>Xodimni saqlash</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
