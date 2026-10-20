import { PayrollRecord } from '../types/hrm';

/** Gross accrual before deductions and tax. */
export const payrollGross = (p: PayrollRecord): number =>
  p.baseSalary + p.kpiBonus + p.overtimePay + p.allowances;

/** Income tax withheld: taxRate% of (gross − deductions). */
export const payrollTax = (p: PayrollRecord): number =>
  Math.round(((payrollGross(p) - p.deductions) * p.taxRate) / 100);

/** Net pay = gross − deductions − tax. */
export const payrollNet = (p: PayrollRecord): number => payrollGross(p) - p.deductions - payrollTax(p);
