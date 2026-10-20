import React, { useState } from 'react';
import { PayrollRecord } from '../types/hrm';
import { payrollNet, payrollTax } from '../utils/payroll';

interface PayrollPageProps {
  payrollRecords: PayrollRecord[];
  onExport1C: (month: string) => void;
  onShowToast: (msg: string) => void;
}

const STATUS_BADGE: Record<PayrollRecord['paymentStatus'], { label: string; cls: string }> = {
  draft: { label: 'Qoralama', cls: 'bg-slate-100 text-slate-600' },
  approved: { label: 'Tasdiqlangan', cls: 'bg-emerald-50 text-emerald-700' },
  paid: { label: 'To‘langan', cls: 'bg-indigo-50 text-indigo-700' },
};

export const PayrollPage: React.FC<PayrollPageProps> = ({ payrollRecords, onExport1C, onShowToast }) => {
  const [subTab, setSubTab] = useState<'reestr' | 'bonuses' | 'penalties'>('reestr');

  // Unique months in data order
  const months = payrollRecords.reduce<string[]>((acc, p) => (acc.includes(p.month) ? acc : [...acc, p.month]), []);
  const [selectedMonth, setSelectedMonth] = useState(months[0] ?? '');
  const month = months.includes(selectedMonth) ? selectedMonth : months[0] ?? '';

  const records = payrollRecords.filter((p) => p.month === month);
  const totalFund = records.reduce((acc, p) => acc + payrollNet(p), 0);
  const totalBase = records.reduce((acc, p) => acc + p.baseSalary, 0);
  const totalBonus = records.reduce((acc, p) => acc + p.kpiBonus + p.overtimePay, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner matching hrm_platform_update.html */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Ish haqi va Kompensatsiya (Payroll)</h3>
            <p className="text-xs text-slate-500">
              Asosiy okladlar, KPI bonuslari, ustamalar va daromad solig‘i hisob-kitoblari.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setSubTab('reestr')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'reestr'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Oylik hisob-kitob
              </button>
              <button
                onClick={() => setSubTab('bonuses')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'bonuses'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fa-solid fa-star text-amber-500 mr-1"></i>Bonuslar
              </button>
              <button
                onClick={() => setSubTab('penalties')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'penalties'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fa-solid fa-circle-exclamation text-red-500 mr-1"></i>Ushlanmalar
              </button>
            </div>

            <select
              value={month}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={months.length === 0}
              className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
            >
              {months.length === 0 && <option value="">Davr yo‘q</option>}
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 1C Integration Banner */}
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <p className="font-bold text-indigo-900 text-sm">
              {month ? `${month} oyi ish haqi hisob-kitobi tayyor` : 'Ish haqi hisob-kitoblari mavjud emas'}
            </p>
            <p className="text-xs text-indigo-700 mt-0.5">
              Jami to‘lov fondi: <span className="font-bold">{totalFund.toLocaleString()} UZS</span> • {records.length} nafar xodim hisobi
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onExport1C(month)}
              disabled={records.length === 0}
              className="disabled:opacity-50 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-all flex items-center space-x-2"
            >
              <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
              <span>Buxgalteriyaga yuborish (1C)</span>
            </button>
            <button
              onClick={() => onShowToast(`${month} uchun bank reestri (Payme/Click/Kapitalbank) eksport qilindi`)}
              disabled={records.length === 0}
              className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
            >
              Bank reestri
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 font-semibold uppercase">Bazaviy Oklad Jamg‘armasi</span>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{totalBase.toLocaleString()} UZS</p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 font-semibold uppercase">KPI & Rag‘batlantirish</span>
            <p className="text-xl font-bold text-emerald-600 mt-0.5">+{totalBonus.toLocaleString()} UZS</p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 font-semibold uppercase">To‘lanadigan Sof Summa</span>
            <p className="text-xl font-bold text-indigo-600 mt-0.5">{totalFund.toLocaleString()} UZS</p>
          </div>
        </div>

        {/* Payroll Table */}
        <div className="pt-2 border-t border-slate-100 overflow-x-auto">
          {subTab === 'reestr' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Xodim</th>
                  <th className="py-3 px-4">Departament</th>
                  <th className="py-3 px-4 text-right">Oklad</th>
                  <th className="py-3 px-4 text-right">KPI bonus</th>
                  <th className="py-3 px-4 text-right">Ustama</th>
                  <th className="py-3 px-4 text-right">Qo‘shimchalar</th>
                  <th className="py-3 px-4 text-right">Ushlanma</th>
                  <th className="py-3 px-4 text-right">Soliq</th>
                  <th className="py-3 px-4 text-right">Sof oylik</th>
                  <th className="py-3 px-4 text-center">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Tanlangan oy uchun ish haqi yozuvlari yo‘q
                    </td>
                  </tr>
                )}
                {records.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-bold text-slate-800">{item.employeeName}</td>
                    <td className="py-3.5 px-4 text-slate-500">{item.department}</td>
                    <td className="py-3.5 px-4 text-right font-mono">{item.baseSalary.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-600">+{item.kpiBonus.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600">+{item.overtimePay.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600">+{item.allowances.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-red-500">-{item.deductions.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-red-500 whitespace-nowrap">
                      -{payrollTax(item).toLocaleString()}{' '}
                      <span className="text-[10px] text-slate-400">({item.taxRate}%)</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-indigo-700 whitespace-nowrap">
                      {payrollNet(item).toLocaleString()} UZS
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`${STATUS_BADGE[item.paymentStatus].cls} px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap`}
                      >
                        {STATUS_BADGE[item.paymentStatus].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'bonuses' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Xodim</th>
                  <th className="py-3 px-4">Bo‘lim</th>
                  <th className="py-3 px-4 text-right">KPI Rag‘batlantirish</th>
                  <th className="py-3 px-4 text-right">Overtime Qo‘shimchasi</th>
                  <th className="py-3 px-4 text-right">Boshqa ustamalar</th>
                  <th className="py-3 px-4 text-right">Jami bonus</th>
                  <th className="py-3 px-4 text-center">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((item) => {
                  const itemBonus = item.kpiBonus + item.overtimePay + item.allowances;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-bold text-slate-800">{item.employeeName}</td>
                      <td className="py-3.5 px-4 text-slate-500">{item.department}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-600">
                        +{item.kpiBonus.toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                        +{item.overtimePay.toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                        +{item.allowances.toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                        +{itemBonus.toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                          Hisoblangan
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {subTab === 'penalties' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Xodim</th>
                  <th className="py-3 px-4">Bo‘lim</th>
                  <th className="py-3 px-4 text-right">Rejali ushlanma</th>
                  <th className="py-3 px-4 text-right">JShDS (Soliq)</th>
                  <th className="py-3 px-4 text-right">Jami ushlanma</th>
                  <th className="py-3 px-4 text-center">Turi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((item) => {
                  const tax = payrollTax(item);
                  const totalDeduction = item.deductions + tax;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-bold text-slate-800">{item.employeeName}</td>
                      <td className="py-3.5 px-4 text-slate-500">{item.department}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-red-500">
                        -{item.deductions.toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                        -{tax.toLocaleString()} UZS ({item.taxRate}%)
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-red-600">
                        -{totalDeduction.toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                          Qonuniy ushlanma
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
