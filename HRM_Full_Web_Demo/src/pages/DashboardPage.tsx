import React from 'react';
import { isCandidateInProgress } from '../utils/pipeline';
import {
  Department,
  Employee,
  LeaveRequest,
  Vacancy,
  Candidate,
  AuditLogItem,
  AttendanceRecord,
} from '../types/hrm';
import { localDateISO, toDisplayDate } from '../utils/dates';

interface DashboardPageProps {
  employees: Employee[];
  departments: Department[];
  vacancies: Vacancy[];
  candidates: Candidate[];
  leaveRequests: LeaveRequest[];
  auditLogs: AuditLogItem[];
  attendanceLogs: AttendanceRecord[];
  onNavigate: (moduleId: string) => void;
  onOpenAddEmployee: () => void;
  onOpenEmployee: (employeeId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  employees,
  departments,
  vacancies,
  candidates,
  leaveRequests,
  auditLogs,
  attendanceLogs,
  onNavigate,
  onOpenAddEmployee,
  onOpenEmployee,
}) => {
  const today = localDateISO();
  const activeEmployeesCount = employees.filter((e) => e.status === 'active').length;
  const probationCount = employees.filter((e) => e.status === 'probation').length;
  const currentStaff = employees.filter((e) => e.status !== 'terminated');
  const openVacanciesCount = vacancies.filter((v) => v.status === 'open').length;
  const pendingLeavesCount = leaveRequests.filter((l) => l.status === 'pending').length;
  const candidatesInProgress = candidates.filter((c) => isCandidateInProgress(c, vacancies)).length;
  const joinedThisMonth = employees.filter((e) => e.joinedDate.startsWith(today.slice(0, 7))).length;

  // Probation employee who joined earliest (closest to the end of probation)
  const probationDue = employees
    .filter((e) => e.status === 'probation')
    .reduce<Employee | undefined>((acc, e) => (!acc || e.joinedDate < acc.joinedDate ? e : acc), undefined);

  // Attendance for the most recent day present in the logs
  const latestLogDate = attendanceLogs.reduce((max, l) => {
    const d = l.timestamp.slice(0, 10);
    return d > max ? d : max;
  }, '');
  const logsOfDay = attendanceLogs.filter((l) => l.timestamp.slice(0, 10) === latestLogDate);
  const checkedIn = new Set(logsOfDay.filter((l) => l.type === 'in').map((l) => l.employeeId)).size;
  const expectedCount = employees.filter((e) => e.status === 'active' || e.status === 'probation').length;
  const attendancePct = expectedCount > 0 ? `${((checkedIn / expectedCount) * 100).toFixed(1)}%` : '—';
  const delayedCount = logsOfDay.filter((l) => l.status === 'delayed').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Welcome Banner matching hrm_platform_update.html */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="space-y-2 z-10">
          <span className="bg-indigo-500/40 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider border border-indigo-400/30">
            HRM Enterprise Core
          </span>
          <h2 className="text-2xl font-bold">Xush kelibsiz, Anvarbek!</h2>
          <p className="text-indigo-100 text-sm max-w-xl">
            Bugungi kadrlar ko‘rsatkichlari, ochiq vakansiyalar va tezkor bajarilishi lozim bo‘lgan jarayonlar nazorati.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex flex-wrap gap-3 z-10">
          <button
            onClick={onOpenAddEmployee}
            className="bg-white text-indigo-700 font-semibold px-4 py-2.5 rounded-xl shadow-xs hover:bg-indigo-50 transition-all text-sm flex items-center space-x-2"
          >
            <i className="fa-solid fa-user-plus"></i>
            <span>Yangi xodim qo‘shish</span>
          </button>
          <button
            onClick={() => onNavigate('vacancies')}
            className="bg-indigo-500/40 border border-indigo-400/40 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-500/60 transition-all text-sm flex items-center space-x-2"
          >
            <i className="fa-solid fa-briefcase"></i>
            <span>Vakansiyalar ({openVacanciesCount})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div
          onClick={() => onNavigate('employees')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Faol xodimlar</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-1">{activeEmployeesCount}</h3>
            {joinedThisMonth > 0 && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center mt-2">
                <i className="fa-solid fa-arrow-up mr-1 text-[10px]"></i> +{joinedThisMonth} ta bu oy
              </span>
            )}
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform">
            <i className="fa-solid fa-users"></i>
          </div>
        </div>

        <div
          onClick={() => onNavigate('vacancies')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ochiq vakansiyalar</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-1">{openVacanciesCount}</h3>
            <span className="text-xs text-indigo-600 font-semibold flex items-center mt-2">
              <i className="fa-solid fa-user-clock mr-1 text-[10px]"></i> {candidatesInProgress} nomzod jarayonda
            </span>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform">
            <i className="fa-solid fa-briefcase"></i>
          </div>
        </div>

        <div
          onClick={() => onNavigate('attendance')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bugungi davomat</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-1">{attendancePct}</h3>
            <span
              className={`text-xs font-semibold flex items-center mt-2 ${
                delayedCount > 0 ? 'text-red-500' : 'text-slate-500'
              }`}
            >
              <i
                className={`fa-solid ${delayedCount > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'} mr-1 text-[10px]`}
              ></i>{' '}
              {delayedCount} ta kechikish
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform">
            <i className="fa-solid fa-fingerprint"></i>
          </div>
        </div>

        <div
          onClick={() => onNavigate('probation')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sinov muddatidagilar</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-1">{probationCount}</h3>
            <span className="text-xs text-amber-600 font-semibold flex items-center mt-2">
              <i className="fa-solid fa-clock mr-1 text-[10px]"></i> {probationDue?.fullName ?? '—'}
            </span>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform">
            <i className="fa-solid fa-user-graduate"></i>
          </div>
        </div>
      </div>

      {/* Recent Activities & Action Required Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Stream */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">So‘nggi HR Hodisalar (Audit & Workflow)</h3>
              <p className="text-xs text-slate-500">Tizimda amalga oshirilgan so‘nggi operatsiyalar oqimi</p>
            </div>
            <button
              onClick={() => onNavigate('audit-log')}
              className="text-xs text-indigo-600 font-semibold hover:underline flex items-center space-x-1"
            >
              <span>Barchasini ko‘rish</span>
              <i className="fa-solid fa-arrow-right text-[10px]"></i>
            </button>
          </div>

          <div className="space-y-3">
            {auditLogs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100 hover:bg-indigo-50/30 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
                    <i className="fa-solid fa-bell text-xs"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{log.action}</p>
                    <p className="text-xs text-slate-500">
                      {log.userName} • <span className="text-indigo-600 font-medium">{log.module}</span>
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap ml-2">
                  {log.timestamp.slice(0, 10) === today
                    ? log.timestamp.slice(11, 16)
                    : `${toDisplayDate(log.timestamp.slice(0, 10))} ${log.timestamp.slice(11, 16)}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Required Widget */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-lg">E’tibor talab qiladiganlar</h3>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
          </div>

          <div className="space-y-3">
            {probationDue && (
              <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-red-800">Sinov muddati tugayapti</p>
                  <p className="text-xs text-red-600">{probationDue.fullName} yakuniy baholash</p>
                </div>
                <button
                  onClick={() => onOpenEmployee(probationDue.id)}
                  className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs hover:bg-red-700 transition-all"
                >
                  Ko‘rish
                </button>
              </div>
            )}

            <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-amber-800">Ta’til so‘rovlari</p>
                <p className="text-xs text-amber-600">{pendingLeavesCount} ta tasdiqlanmagan ariza</p>
              </div>
              <button
                onClick={() => onNavigate('leaves')}
                className="bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs hover:bg-amber-700 transition-all"
              >
                Boshqarish
              </button>
            </div>

            <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-indigo-800">Hujjat muddati tugayapti</p>
                <p className="text-xs text-indigo-600">2 ta xodim pasport nusxasi yangilanishi lozim</p>
              </div>
              <button
                onClick={() => onNavigate('documents')}
                className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs hover:bg-indigo-700 transition-all"
              >
                Yangilash
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Department Breakdown Mini Grid */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-lg">Bo‘limlar bo‘yicha xodimlar taqsimoti</h3>
          <button
            onClick={() => onNavigate('organization')}
            className="text-xs text-indigo-600 font-semibold hover:underline"
          >
            Tuzilmani ko‘rish →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {departments.map((dept) => {
            // Share of the company's current (non-terminated) staff working in this department
            const count = currentStaff.filter((e) => e.departmentId === dept.id).length;
            const pct = currentStaff.length > 0 ? Math.round((count / currentStaff.length) * 100) : 0;
            const openVac = vacancies.filter((v) => v.departmentId === dept.id && v.status !== 'closed').length;
            return (
              <div key={dept.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs gap-2">
                  <span className="font-bold text-slate-700 truncate">{dept.name}</span>
                  <span className="text-indigo-600 font-bold">{pct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5">
                  <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                  <span>Xodim: {count} ta</span>
                  <span>Vakansiya: {openVac} ta</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
