import React, { useEffect, useState } from 'react';
import { Employee } from '../types/hrm';
import { localDateISO, toDisplayDate } from '../utils/dates';

const NO_DATA = 'Ma’lumot yo‘q';

/** Clamp an optional 0–100 metric for progress bar width. */
const barWidth = (v: number | undefined) => `${v === undefined ? 0 : Math.max(0, Math.min(100, v))}%`;
const pctText = (v: number | undefined) => (v === undefined ? '—' : `${v}%`);

/** YYYY-MM-DD shifted by N months (local). */
const addMonthsISO = (iso: string, months: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return localDateISO(d);
};

interface TimelineEvent {
  date: string; // YYYY-MM-DD
  title: string;
  badge?: string;
  badgeCls?: string;
  dotCls: string;
  text: string;
}

interface EmployeeDetailPageProps {
  employee: Employee;
  onBack: () => void;
  onUpdateStatus: (empId: string, status: Employee['status']) => void;
  onShowToast: (msg: string) => void;
}

export const EmployeeDetailPage: React.FC<EmployeeDetailPageProps> = ({
  employee,
  onBack,
  onUpdateStatus,
  onShowToast,
}) => {
  const [detailTab, setDetailTab] = useState<'timeline' | 'details' | 'attendance' | 'documents'>('timeline');
  // Inline two-step confirm for termination
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  useEffect(() => {
    setConfirmTerminate(false);
  }, [employee.id, employee.status]);

  const contractNo = `TD-${employee.joinedDate.slice(0, 4)}/${employee.code.replace('#', '')}`;
  const today = localDateISO();

  // Career timeline: only events that fit this employee's actual history
  const probationEnd = addMonthsISO(employee.joinedDate, 3);
  const timeline: TimelineEvent[] = [
    ...(employee.kpiCompletion !== undefined
      ? [
          {
            date: '2026-09-28',
            title: 'Choraklik KPI baholash yakunlandi',
            badge: `${employee.kpiCompletion}% Score`,
            badgeCls: 'bg-emerald-50 text-emerald-700',
            dotCls: 'bg-emerald-500 ring-emerald-100',
            text: 'Choraklik vazifalar va OKR mezonlari bo‘yicha baholash natijasi qayd etildi.',
          },
        ]
      : []),
    {
      date: '2026-06-01',
      title: 'Lavozim oshirildi (Promotion)',
      badge: 'Senior Grade',
      badgeCls: 'bg-indigo-50 text-indigo-700',
      dotCls: 'bg-indigo-500 ring-indigo-100',
      text: 'Yuqori grade lavozimiga o‘tkazildi. Buyruq № 118-k.',
    },
    {
      date: '2025-01-15',
      title: 'Maosh qayta ko‘rib chiqildi',
      badge: '+15% Indeksatsiya',
      badgeCls: 'bg-purple-50 text-purple-700 font-mono',
      dotCls: 'bg-indigo-500 ring-indigo-100',
      text: 'Yillik indeksatsiya doirasida bazaviy oklad miqdori oshirildi.',
    },
    ...(employee.status !== 'probation' && probationEnd && probationEnd <= today
      ? [
          {
            date: probationEnd,
            title: 'Sinov muddati yakunlandi',
            badge: 'Muvaffaqiyatli',
            badgeCls: 'bg-amber-50 text-amber-700',
            dotCls: 'bg-amber-500 ring-amber-100',
            text: 'Sinov muddati muvaffaqiyatli yakunlanib, to‘liq shtatga o‘tkazildi.',
          },
        ]
      : []),
  ]
    .filter((ev) => ev.date > employee.joinedDate && ev.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  const getStatusBadge = (status: Employee['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
            Faol xodim
          </span>
        );
      case 'probation':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
            Sinov muddati
          </span>
        );
      case 'on_leave':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5"></span>
            Ta’tilda
          </span>
        );
      case 'terminated':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-1.5"></span>
            Ishdan ketgan
          </span>
        );
    }
  };

  // Calculate approximate tenure from joinedDate
  const getTenure = (joinedDateStr: string) => {
    const joined = new Date(`${joinedDateStr}T00:00:00`);
    if (Number.isNaN(joined.getTime())) return '—';
    const diffYears = (Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (diffYears < 0.1) return 'Yangi xodim';
    if (diffYears < 1) return `${Math.round(diffYears * 12)} oy`;
    return `${diffYears.toFixed(1)} yil`;
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200 max-w-7xl mx-auto">
      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all group"
            title="Orqaga qaytish (Sichqonchaning Back tugmasi ham ishlaydi)"
          >
            <i className="fa-solid fa-arrow-left text-[11px] group-hover:-translate-x-1 transition-transform"></i>
            <span>Orqaga</span>
          </button>
          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
          <div className="text-xs text-slate-500 flex items-center space-x-2">
            <span>HRM</span>
            <span>/</span>
            <span>Xodimlar</span>
            <span>/</span>
            <span className="font-bold text-slate-800">{employee.fullName}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => onShowToast(`"${employee.fullName}" ma’lumotlari PDF formatda yuklab olindi!`)}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-file-pdf text-red-500"></i>
            <span>T-2 Varaqasi (PDF)</span>
          </button>
          <button
            onClick={() => onShowToast('Tahrirlash rejimi ochildi')}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-pen text-[10px]"></i>
            <span>Tahrirlash</span>
          </button>
        </div>
      </div>

      {/* Hero Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          {/* Left Avatar & Identity */}
          <div className="flex items-center space-x-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-700 text-white font-extrabold text-2xl flex items-center justify-center shadow-md flex-shrink-0 ring-4 ring-indigo-50">
              {employee.initials}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 leading-snug">{employee.fullName}</h1>
                {getStatusBadge(employee.status)}
              </div>
              <p className="text-sm font-semibold text-indigo-600">
                {employee.position}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
                <span className="font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">
                  {employee.code}
                </span>
                <span>
                  <i className="fa-solid fa-building mr-1 text-slate-400"></i>
                  {employee.departmentName}
                </span>
                <span>
                  <i className="fa-solid fa-location-dot mr-1 text-slate-400"></i>
                  {employee.branch}
                </span>
                <span>
                  <i className="fa-solid fa-user-tie mr-1 text-slate-400"></i>
                  Rahbar: <strong className="text-slate-700">{employee.manager || '—'}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Right Statgrid (matching original platform statgrid) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center min-w-[110px]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Ishga kirgan</span>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{toDisplayDate(employee.joinedDate)}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center min-w-[110px]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Mehnat staji</span>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{getTenure(employee.joinedDate)}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center min-w-[110px]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">KPI natijasi</span>
              <p className="text-sm font-bold text-emerald-600 mt-0.5">{pctText(employee.kpiCompletion)}</p>
            </div>
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-center min-w-[110px]">
              <span className="text-[10px] uppercase font-bold text-indigo-700 block">Oylik maosh</span>
              <p className="text-sm font-bold text-indigo-900 mt-0.5">
                {(employee.salary / 1000000).toFixed(1)}M UZS
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3 width) - Tab Navigation & Detailed Sections */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tab Navigation Pill Bar */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-1 overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setDetailTab('timeline')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 whitespace-nowrap ${
                detailTab === 'timeline'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-clock-rotate-left"></i>
              <span>Karyera Timeline</span>
            </button>
            <button
              onClick={() => setDetailTab('details')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 whitespace-nowrap ${
                detailTab === 'details'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-regular fa-id-card"></i>
              <span>Shaxsiy & Soliq hisobi</span>
            </button>
            <button
              onClick={() => setDetailTab('attendance')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 whitespace-nowrap ${
                detailTab === 'attendance'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-fingerprint"></i>
              <span>Davomat va Vaqt</span>
            </button>
            <button
              onClick={() => setDetailTab('documents')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 whitespace-nowrap ${
                detailTab === 'documents'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <i className="fa-solid fa-folder-open"></i>
              <span>Hujjatlar (7)</span>
            </button>
          </div>

          {/* TAB 1: EMPLOYEE TIMELINE (Original Platform feature) */}
          {detailTab === 'timeline' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                  <i className="fa-solid fa-timeline text-indigo-600"></i>
                  <span>Employee Timeline (Karyera va voqealar tarixi)</span>
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Tizim auditi</span>
              </div>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {timeline.map((ev) => (
                  <div key={`${ev.date}-${ev.title}`} className="relative group">
                    <div className={`absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full ring-4 ${ev.dotCls}`}></div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-800 flex items-center space-x-2">
                        <span>
                          {toDisplayDate(ev.date)} — {ev.title}
                        </span>
                        {ev.badge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${ev.badgeCls ?? ''}`}>{ev.badge}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-600">{ev.text}</p>
                    </div>
                  </div>
                ))}

                {/* Event 5 */}
                <div className="relative group">
                  <div className="absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full bg-slate-400 ring-4 ring-slate-100"></div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">
                      {toDisplayDate(employee.joinedDate)} — Ishga qabul qilindi
                    </p>
                    <p className="text-xs text-slate-600">
                      Mehnat shartnomasi tuzildi va xodim ishga qabul qilindi.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONAL & LEGAL DETAILS */}
          {detailTab === 'details' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3">
                Shaxsiy ma’lumotlar va Pasport reestri
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">To‘liq F.I.Sh:</span>
                  <p className="font-bold text-slate-800 text-sm">{employee.fullName}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">Tug‘ilgan sana:</span>
                  <p className="font-bold text-slate-800 text-sm">{employee.birthDate ? toDisplayDate(employee.birthDate) : NO_DATA}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">Pasport seriya va raqami:</span>
                  <p className="font-bold text-slate-800 text-sm font-mono">{employee.passportNo || NO_DATA}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">STIR (INN):</span>
                  <p className="font-bold text-slate-800 text-sm font-mono">{employee.inn || NO_DATA}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">Mehnat daftarchasi:</span>
                  <p className="font-bold text-slate-800 text-sm font-mono">{NO_DATA}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-slate-400 font-medium">Doimiy yashash manzili:</span>
                  <p className="font-bold text-slate-800 text-sm">{employee.address || NO_DATA}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE */}
          {detailTab === 'attendance' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm">Haftalik biometrik davomat hisoboti</h3>
                <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full">
                  {pctText(employee.attendanceRate)} Intizom
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Sana</th>
                      <th className="py-2.5 px-4">Kirish</th>
                      <th className="py-2.5 px-4">Chiqish</th>
                      <th className="py-2.5 px-4">Qurilma / Terminal</th>
                      <th className="py-2.5 px-4">Holat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-800">28.09.2026</td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700">08:52:14</td>
                      <td className="py-3 px-4 font-mono text-slate-400">— (Hozir ishda)</td>
                      <td className="py-3 px-4 text-slate-600">Turniket #1 (Lobby)</td>
                      <td className="py-3 px-4"><span className="text-emerald-600 font-semibold">O‘z vaqtida</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-800">27.09.2026</td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700">08:58:30</td>
                      <td className="py-3 px-4 font-mono text-slate-700">18:05:10</td>
                      <td className="py-3 px-4 text-slate-600">Turniket #1 (Lobby)</td>
                      <td className="py-3 px-4"><span className="text-emerald-600 font-semibold">O‘z vaqtida</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-800">26.09.2026</td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700">08:45:00</td>
                      <td className="py-3 px-4 font-mono text-slate-700">18:15:40</td>
                      <td className="py-3 px-4 text-slate-600">FaceID #3 (2-qavat)</td>
                      <td className="py-3 px-4"><span className="text-emerald-600 font-semibold">O‘z vaqtida</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: DOCUMENTS */}
          {detailTab === 'documents' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Shaxsiy jilddagi hujjatlar ro‘yxati</h3>
                  <p className="text-xs text-slate-400">Jami 7 ta hujjat (5 valid • 2 ta yangilanish talab etiladi)</p>
                </div>
                <button
                  onClick={() => onShowToast('Yangi hujjat biriktirish oynasi')}
                  className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                >
                  + Hujjat qo‘shish
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="p-3.5 border border-slate-200 rounded-xl flex justify-between items-center text-xs hover:border-indigo-200 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <i className="fa-solid fa-file-contract"></i>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Mehnat shartnomasi (№ {contractNo})</p>
                      <p className="text-slate-400">Imzolangan: {toDisplayDate(employee.joinedDate)} • Elektron imzo (ERI)</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onShowToast('Hujjat PDF yuklab olinmoqda')}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    Yuklab olish
                  </button>
                </div>

                <div className="p-3.5 border border-slate-200 rounded-xl flex justify-between items-center text-xs hover:border-indigo-200 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <i className="fa-solid fa-file-lines"></i>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Ishga qabul qilish buyrug‘i (№ 142-k)</p>
                      <p className="text-slate-400">Kadrlar buyrug‘i • Tasdiqlangan</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onShowToast('Buyruq PDF yuklab olinmoqda')}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    Yuklab olish
                  </button>
                </div>

                <div className="p-3.5 border border-slate-200 rounded-xl flex justify-between items-center text-xs hover:border-indigo-200 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                      <i className="fa-solid fa-id-card"></i>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Pasport nusxasi (Amal qilish muddati tugamoqda)</p>
                      <p className="text-amber-600 font-semibold">Yangilash lozim • 14 kun qoldi</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onShowToast('Hujjat yangilash formasi')}
                    className="text-amber-600 font-bold hover:underline"
                  >
                    Yangilash
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1/3 width) - Contact, Skills & Action Panels (as in original platform) */}
        <div className="space-y-5">
          {/* Contact Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3.5">
            <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <i className="fa-solid fa-phone text-indigo-600"></i>
              <span>Aloqa ma’lumotlari</span>
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 font-medium block">Telefon raqam:</span>
                <p className="font-bold text-slate-800 mt-0.5">{employee.phone}</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 font-medium block">Email:</span>
                <p className="font-bold text-indigo-600 font-mono mt-0.5">{employee.email}</p>
              </div>
            </div>
          </div>

          {/* Performance metrics (undefined for new hires) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <i className="fa-solid fa-chart-line text-indigo-600"></i>
              <span>Samaradorlik ko‘rsatkichlari</span>
            </h3>
            <div className="space-y-3 text-xs">
              {[
                { label: 'Performance bahosi', value: employee.performanceScore },
                { label: 'KPI bajarilishi', value: employee.kpiCompletion },
                { label: 'Davomat intizomi', value: employee.attendanceRate },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-slate-700">{m.label}</span>
                    <span className="text-indigo-600 font-bold">{pctText(m.value)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="bg-indigo-600 h-2 rounded-full" style={{ width: barWidth(m.value) }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Professional Skills Card (Original Platform feature) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <i className="fa-solid fa-code text-indigo-600"></i>
              <span>Kasbiy Ko‘nikmalar (Skill Matrix)</span>
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span className="text-slate-700">Python / Backend Architecture</span>
                  <span className="text-indigo-600 font-bold">95%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '95%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span className="text-slate-700">SQL & Database Optimization</span>
                  <span className="text-indigo-600 font-bold">88%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '88%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span className="text-slate-700">Docker & Kubernetes CI/CD</span>
                  <span className="text-indigo-600 font-bold">90%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '90%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Leave & Status Management Panel */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
              <i className="fa-solid fa-umbrella-beach text-indigo-600"></i>
              <span>Ta’til balansi va Holat</span>
            </h3>

            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase">Qolgan ta’til</span>
                <p className="text-2xl font-extrabold text-emerald-900">{employee.remainingLeaveDays} kun</p>
              </div>
              <button
                onClick={() => onShowToast('Ta’til rasmiylashtirish oynasi ochildi')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs"
              >
                Ariza berish
              </button>
            </div>

            {/* Status Change Buttons */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 block">Kadrlar holatini o‘zgartirish:</span>
              {confirmTerminate ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-red-800">
                    {employee.fullName}ni ishdan bo‘shatish. Tasdiqlaysizmi?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        onUpdateStatus(employee.id, 'terminated');
                        onShowToast(`${employee.fullName} ishdan bo‘shatildi`);
                        setConfirmTerminate(false);
                      }}
                      className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl text-center shadow-xs"
                    >
                      Ha
                    </button>
                    <button
                      onClick={() => setConfirmTerminate(false)}
                      className="w-full py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl text-center border border-slate-200"
                    >
                      Yo‘q
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {employee.status === 'probation' && (
                    <button
                      onClick={() => {
                        onUpdateStatus(employee.id, 'active');
                        onShowToast(`${employee.fullName} to‘liq shtatga o‘tkazildi!`);
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl text-center shadow-xs"
                    >
                      ✓ Sinovdan o‘tdi
                    </button>
                  )}

                  {employee.status === 'active' && (
                    <button
                      onClick={() => {
                        onUpdateStatus(employee.id, 'on_leave');
                        onShowToast(`${employee.fullName} ta’tilga chiqarildi`);
                      }}
                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl text-center border border-indigo-200"
                    >
                      Ta’tilga chiqarish
                    </button>
                  )}

                  {employee.status === 'on_leave' && (
                    <button
                      onClick={() => {
                        onUpdateStatus(employee.id, 'active');
                        onShowToast(`${employee.fullName} ishga qaytarildi!`);
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl text-center shadow-xs"
                    >
                      Ishga qaytarish
                    </button>
                  )}

                  {employee.status === 'terminated' && (
                    <button
                      onClick={() => {
                        onUpdateStatus(employee.id, 'active');
                        onShowToast(`${employee.fullName} qayta ishga olindi`);
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl text-center shadow-xs"
                    >
                      Qayta ishga olish
                    </button>
                  )}

                  {(employee.status === 'active' || employee.status === 'probation') && (
                    <button
                      onClick={() => setConfirmTerminate(true)}
                      className="w-full py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 text-xs font-semibold rounded-xl text-center transition-colors"
                    >
                      Ishdan bo‘shatish
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
