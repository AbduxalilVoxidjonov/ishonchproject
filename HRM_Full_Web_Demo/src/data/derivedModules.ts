import { HRMModuleData, ModuleKPI } from './allModulesData';
import { Employee, LeaveRequest, PayrollRecord } from '../types/hrm';
import { inclusiveDays, toDisplayDate } from '../utils/dates';
import { payrollNet, payrollTax } from '../utils/payroll';

// Builds the rows/KPIs of table modules whose data lives in app state (leaves, payroll),
// so the tables always show the same records as the interactive pages above them.

export interface DerivedModuleState {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  payrollRecords: PayrollRecord[];
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const badge = (text: string, tone: 'success' | 'warning' | 'info' | 'danger') =>
  `<span class="badge ${tone}">${escapeHtml(text)}</span>`;

const button = (label: string, toast: string) => `<button class="btn" data-toast="${escapeHtml(toast)}">${label}</button>`;
const openProfileButton = button('Ochish', 'Xodim profili ochildi');

const person = (e: Employee) =>
  `<div class="people"><div class="pavatar">${escapeHtml(e.initials)}</div><div class="person"><b>${escapeHtml(e.fullName)}</b><div>${escapeHtml(e.code.replace('#', ''))}</div></div></div>`;

const leaveTypeLabel: Record<LeaveRequest['type'], string> = {
  yillik: 'Yillik',
  kasallik: 'Kasallik',
  ruxsatnoma: 'Ruxsatnoma',
  oqish: 'O‘quv',
  ishhaqisiz: 'Ish haqisiz',
};

const leaveStatusBadge: Record<LeaveRequest['status'], string> = {
  pending: badge('Kutilmoqda', 'warning'),
  approved: badge('Tasdiqlangan', 'success'),
  rejected: badge('Rad etilgan', 'danger'),
};

const payrollStatusBadge: Record<PayrollRecord['paymentStatus'], string> = {
  draft: badge('Qoralama', 'warning'),
  approved: badge('Tasdiqlangan', 'success'),
  paid: badge('To‘langan', 'info'),
};

const displayDate = (iso?: string) => (iso ? toDisplayDate(iso) : '—');
const millions = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
const billionsOrMillions = (n: number) => (n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(2)}B` : millions(n));
const kpi = (lbl: string, num: string | number, trend = ''): ModuleKPI => ({ lbl, num: String(num), trend });

export const buildDerivedModules = (
  base: Record<string, HRMModuleData>,
  { employees, leaveRequests, payrollRecords }: DerivedModuleState
): Record<string, HRMModuleData> => {
  // Payroll table shows the most recent month present in the data
  const payrollMonth = payrollRecords[0]?.month;
  const monthRecords = payrollRecords.filter((p) => p.month === payrollMonth);
  const totalNet = monthRecords.reduce((acc, p) => acc + payrollNet(p), 0);
  const totalBonus = monthRecords.reduce((acc, p) => acc + p.kpiBonus + p.overtimePay, 0);
  const totalWithheld = monthRecords.reduce((acc, p) => acc + p.deductions + payrollTax(p), 0);

  const withData = (id: string, kpis: ModuleKPI[], rows: string[][], headers?: string[]): HRMModuleData => ({
    ...base[id],
    kpis,
    rows,
    ...(headers ? { headers } : {}),
  });

  return {
    ...base,

    leaves: withData(
      'leaves',
      [
        kpi('Kutilmoqda', leaveRequests.filter((l) => l.status === 'pending').length, 'Tasdiqlash kerak'),
        kpi('Tasdiqlangan', leaveRequests.filter((l) => l.status === 'approved').length, 'Jami'),
        kpi('Rad etilgan', leaveRequests.filter((l) => l.status === 'rejected').length, 'Jami'),
        kpi('Kasallik', leaveRequests.filter((l) => l.type === 'kasallik').length, 'Holatlar'),
        kpi(
          'Tasdiqlangan kunlar',
          leaveRequests.filter((l) => l.status === 'approved').reduce((a, l) => a + inclusiveDays(l.startDate, l.endDate), 0)
        ),
      ],
      leaveRequests.map((l) => {
        const e = employees.find((x) => x.id === l.employeeId);
        return [
          e ? person(e) : `<b>${escapeHtml(l.employeeName)}</b>`,
          leaveTypeLabel[l.type],
          displayDate(l.startDate),
          displayDate(l.endDate),
          String(inclusiveDays(l.startDate, l.endDate)),
          escapeHtml(l.approvedBy ?? e?.manager ?? '—'),
          leaveStatusBadge[l.status],
          openProfileButton,
        ];
      })
    ),

    payroll: withData(
      'payroll',
      [
        kpi('Payroll', billionsOrMillions(totalNet), `UZS / ${payrollMonth ?? '—'}`),
        kpi('Xodim', monthRecords.length, 'Hisoblangan'),
        kpi('Bonus', millions(totalBonus), 'KPI + ustama'),
        kpi('Ushlanmalar', millions(totalWithheld), 'Soliq + ushlanma'),
        kpi('Qoralama', monthRecords.filter((p) => p.paymentStatus === 'draft').length),
      ],
      monthRecords.map((p) => {
        const e = employees.find((x) => x.id === p.employeeId);
        return [
          e ? person(e) : `<b>${escapeHtml(p.employeeName)}</b>`,
          millions(p.baseSalary),
          millions(p.kpiBonus + p.overtimePay),
          millions(p.deductions + payrollTax(p)),
          millions(payrollNet(p)),
          p.month,
          payrollStatusBadge[p.paymentStatus],
          openProfileButton,
        ];
      }),
      ['Xodim', 'Oklad', 'Bonus', 'Ushlanma + soliq', 'Sof oylik', 'Oy', 'Status', '']
    ),
  };
};
