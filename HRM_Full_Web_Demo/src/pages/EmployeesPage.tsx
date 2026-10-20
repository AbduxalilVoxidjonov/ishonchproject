import React, { useState, useMemo } from 'react';
import { Department, Employee, LeaveRequest } from '../types/hrm';
import { inclusiveDays, localDateISO, toDisplayDate } from '../utils/dates';

export type EmployeesTab = 'all' | 'active' | 'probation' | 'on_leave' | 'terminated';

const leaveTypeLabel: Record<LeaveRequest['type'], string> = {
  yillik: 'Yillik ta’til',
  kasallik: 'Kasallik varaqasi',
  ruxsatnoma: 'Ruxsatnoma',
  oqish: 'O‘quv ta’tili',
  ishhaqisiz: 'Ish haqisiz ta’til',
};

/** CSV cell with quotes escaped. */
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

// Normalise Uzbek apostrophe variants so "Qo'shimcha" matches "Qo‘shimcha"
const normalize = (s: string) => s.toLowerCase().replace(/[‘’ʻʼ`']/g, "'");

interface EmployeesPageProps {
  employees: Employee[];
  departments: Department[];
  leaveRequests: LeaveRequest[];
  /** Status tab, controlled by App so other pages can link straight to e.g. the probation list. */
  tab: EmployeesTab;
  onTabChange: (tab: EmployeesTab) => void;
  searchQuery: string;
  onOpenAddModal: () => void;
  onSelectEmployee: (emp: Employee) => void;
}

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  employees,
  departments,
  leaveRequests,
  tab: subTab,
  onTabChange: setSubTab,
  searchQuery,
  onOpenAddModal,
  onSelectEmployee,
}) => {
  const [selectedDept, setSelectedDept] = useState<string>('all');

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Subtab filter
      if (subTab !== 'all' && emp.status !== subTab) return false;

      // Department filter
      if (selectedDept !== 'all' && emp.departmentId !== selectedDept) return false;

      // Search query
      const q = normalize(searchQuery.trim());
      if (q) {
        const haystack = [emp.fullName, emp.position, emp.code, emp.departmentName, emp.branch, emp.email, emp.phone];
        if (!haystack.some((field) => normalize(field ?? '').includes(q))) return false;
      }

      return true;
    });
  }, [employees, subTab, selectedDept, searchQuery]);

  const counts = {
    all: employees.length,
    active: employees.filter((e) => e.status === 'active').length,
    probation: employees.filter((e) => e.status === 'probation').length,
    on_leave: employees.filter((e) => e.status === 'on_leave').length,
    terminated: employees.filter((e) => e.status === 'terminated').length,
  };

  // Status-specific details (these used to be separate probation / on-leave / former-employee pages)
  const detailHeader: Partial<Record<EmployeesTab, string>> = {
    probation: 'Mentor / Sinov tugashi',
    on_leave: 'Ta’til',
    terminated: 'Ishdan chiqish',
  };
  const latestApprovedLeave = (employeeId: string) =>
    leaveRequests
      .filter((l) => l.employeeId === employeeId && l.status === 'approved')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

  const renderDetail = (emp: Employee) => {
    if (subTab === 'probation') {
      return (
        <>
          <p className="font-semibold text-slate-700 text-xs">{emp.mentor ?? '—'}</p>
          <p className="text-[11px] text-slate-500">
            {emp.probationEndDate ? `${toDisplayDate(emp.probationEndDate)} gacha` : 'Muddat belgilanmagan'}
            {emp.probationRating && ` • ${emp.probationRating}`}
          </p>
        </>
      );
    }
    if (subTab === 'on_leave') {
      const l = latestApprovedLeave(emp.id);
      return l ? (
        <>
          <p className="font-semibold text-slate-700 text-xs">{leaveTypeLabel[l.type]}</p>
          <p className="text-[11px] text-slate-500">
            {toDisplayDate(l.startDate)} – {toDisplayDate(l.endDate)} • {inclusiveDays(l.startDate, l.endDate)} kun
          </p>
        </>
      ) : (
        <span className="text-xs text-slate-400">Tasdiqlangan ariza yo‘q</span>
      );
    }
    if (subTab === 'terminated') {
      return (
        <>
          <p className="font-semibold text-slate-700 text-xs">{emp.exitDate ? toDisplayDate(emp.exitDate) : '—'}</p>
          <p className="text-[11px] text-slate-500">
            {emp.exitReason ?? 'Sabab ko‘rsatilmagan'}
            {emp.exitInterview !== undefined && ` • Exit interview: ${emp.exitInterview ? 'ha' : 'yo‘q'}`}
          </p>
        </>
      );
    }
    return null;
  };

  const exportToExcel = () => {
    // Blob instead of an encodeURI'd data: URL — '#' in employee codes truncated the old URL
    const rows = [
      ['ID', 'Ism', 'Lavozim', 'Departament', 'Filial', 'Holat', 'Ishga kirgan sana', 'Maosh'].map(csvCell).join(','),
      ...filteredEmployees.map((e) =>
        [e.code, e.fullName, e.position, e.departmentName, e.branch, e.status, e.joinedDate, e.salary]
          .map(csvCell)
          .join(',')
      ),
    ];
    // BOM so Excel opens UTF-8 (‘ ’ characters) correctly
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `xodimlar_royxati_${localDateISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Controls & Navigation Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* Status Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setSubTab('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'all'
                ? 'bg-white text-slate-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Barchasi ({counts.all})
          </button>
          <button
            onClick={() => setSubTab('active')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'active'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Faol ({counts.active})
          </button>
          <button
            onClick={() => setSubTab('probation')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'probation'
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sinov muddati ({counts.probation})
          </button>
          <button
            onClick={() => setSubTab('on_leave')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'on_leave'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ta’tildagilar ({counts.on_leave})
          </button>
          <button
            onClick={() => setSubTab('terminated')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'terminated'
                ? 'bg-slate-700 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ishdan ketgan ({counts.terminated})
          </button>
        </div>

        {/* Department Filter & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Barcha departamentlar</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            onClick={exportToExcel}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3.5 py-2 rounded-xl text-xs border border-slate-200 transition-all flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-file-excel text-emerald-600"></i>
            <span>Excel eksport</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-xs transition-all flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-user-plus"></i>
            <span>Qo‘shish</span>
          </button>
        </div>
      </div>

      {/* Employees Table matching hrm_platform_update.html styling */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6">Xodim</th>
                <th className="py-4 px-6">Lavozim / Departament</th>
                <th className="py-4 px-6">Filial</th>
                <th className="py-4 px-6">Holati</th>
                <th className="py-4 px-6">Ishga kirgan sana</th>
                {detailHeader[subTab] && <th className="py-4 px-6">{detailHeader[subTab]}</th>}
                <th className="py-4 px-6 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={detailHeader[subTab] ? 7 : 6} className="text-center py-12 text-slate-400">
                    <i className="fa-solid fa-user-slash text-3xl mb-2 block"></i>
                    Belgilangan parametrlar bo‘yicha xodimlar topilmadi.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold flex items-center justify-center text-sm shadow-xs flex-shrink-0">
                        {emp.initials}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 leading-snug">{emp.fullName}</p>
                        <p className="text-xs text-slate-500 font-mono">ID: {emp.code}</p>
                      </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <p className="font-semibold text-slate-700 leading-snug">{emp.position}</p>
                      <p className="text-xs text-slate-500">{emp.departmentName}</p>
                    </td>
                    <td className="py-4 px-6 text-slate-600 text-xs font-medium">{emp.branch}</td>
                    <td className="py-4 px-6">
                      {emp.status === 'active' && (
                        <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold border border-emerald-200">
                          Faol
                        </span>
                      )}
                      {emp.status === 'probation' && (
                        <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold border border-amber-200">
                          Sinov muddati
                        </span>
                      )}
                      {emp.status === 'on_leave' && (
                        <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold border border-indigo-200">
                          Ta’tilda
                        </span>
                      )}
                      {emp.status === 'terminated' && (
                        <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-semibold border border-slate-200">
                          Bo‘shatilgan
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-slate-600 text-xs">{toDisplayDate(emp.joinedDate)}</td>
                    {detailHeader[subTab] && <td className="py-4 px-6">{renderDetail(emp)}</td>}
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => onSelectEmployee(emp)}
                        title="360° profilni ko‘rish"
                        className="text-indigo-600 hover:text-indigo-800 font-semibold p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        <i className="fa-solid fa-eye"></i>
                      </button>
                      <button
                        onClick={() => onSelectEmployee(emp)}
                        title="Tahrirlash"
                        className="text-slate-500 hover:text-slate-700 font-semibold p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
