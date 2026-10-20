import React, { useState } from 'react';
import { AttendanceRecord } from '../types/hrm';

interface AttendancePageProps {
  attendanceLogs: AttendanceRecord[];
  onTriggerSync: () => void;
  isSyncing: boolean;
  lastSyncTime: string;
  onShowToast: (msg: string) => void;
}

/** Status cell: every status is shown with the correct direction (in/out). */
const StatusCell: React.FC<{ log: AttendanceRecord }> = ({ log }) => {
  const dirLabel = log.type === 'in' ? 'Kirish' : 'Chiqish';
  const dirIcon = log.type === 'in' ? 'fa-arrow-right-to-bracket' : 'fa-arrow-right-from-bracket';
  switch (log.status) {
    case 'on_time':
      return (
        <span className="text-emerald-600 font-medium flex items-center">
          <i className={`fa-solid ${dirIcon} mr-1`}></i>
          {dirLabel} (O‘z vaqtida)
        </span>
      );
    case 'delayed':
      return (
        <span className="text-amber-600 font-medium flex items-center">
          <i className="fa-solid fa-triangle-exclamation mr-1"></i>Kechikish
          {log.delayMinutes !== undefined ? ` (${log.delayMinutes} daq)` : ''}
        </span>
      );
    case 'early_leave':
      return (
        <span className="text-red-600 font-medium flex items-center">
          <i className="fa-solid fa-person-walking-arrow-right mr-1"></i>Erta ketish
        </span>
      );
    case 'normal':
    default:
      return (
        <span className="text-slate-600 font-medium flex items-center">
          <i className={`fa-solid ${dirIcon} mr-1`}></i>
          {dirLabel}
        </span>
      );
  }
};

export const AttendancePage: React.FC<AttendancePageProps> = ({
  attendanceLogs,
  onTriggerSync,
  isSyncing,
  lastSyncTime,
  onShowToast,
}) => {
  const [subTab, setSubTab] = useState<'live' | 'shifts' | 'delays'>('live');
  const delayedLogs = attendanceLogs.filter((l) => l.status === 'delayed');

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Card matching hrm_platform_update.html */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Davomat va Time & Attendance nazorati</h3>
            <p className="text-xs text-slate-500">
              Turniket va Face ID qurilmalaridan kelib tushgan ma’lumotlar asosida kundalik ish vaqti hisobi.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSubTab('live')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'live'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-fingerprint mr-1"></i>Jonli oqim
            </button>
            <button
              onClick={() => setSubTab('shifts')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'shifts'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ish jadvali & Shiftlar
            </button>
            <button
              onClick={() => setSubTab('delays')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'delays'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kechikishlar ({delayedLogs.length})
            </button>
          </div>
        </div>

        {/* Biometrics Status Banner matching hrm_platform_update.html */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
              <i className="fa-solid fa-fingerprint"></i>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <p className="font-bold text-slate-800 text-sm">Biometrik ma’lumotlar ko‘rsatilmoqda</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 animate-pulse">
                  Live
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Oxirgi sinxronizatsiya vaqti:{' '}
                <span className="font-semibold text-slate-700">{lastSyncTime}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <i className={`fa-solid fa-rotate ${isSyncing ? 'fa-spin' : ''}`}></i>
              <span>{isSyncing ? "Ko'rsatilmoqda..." : "Ma’lumotlarni yangilash"}</span>
            </button>
            <button
              onClick={() => onShowToast('Davomat hisoboti yuklab olindi (Excel)')}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
            >
              Hisobotni yuklash
            </button>
          </div>
        </div>

        {/* Live Attendance Table */}
        {subTab === 'live' && (
          <div className="pt-2 border-t border-slate-100">
            <h4 className="font-semibold text-slate-700 mb-3 text-sm flex items-center justify-between">
              <span>So‘nggi kelish va ketish qaydlari (Real-time stream)</span>
              <span className="text-xs text-slate-400 font-normal">ZKTeco & Hikvision terminallari</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="p-3">Xodim</th>
                    <th className="p-3">Qurilma / Terminal</th>
                    <th className="p-3">Holat</th>
                    <th className="p-3">Vaqt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400">
                        Hozircha davomat qaydlari yo‘q
                      </td>
                    </tr>
                  )}
                  {attendanceLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-semibold text-slate-800 flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                          {log.initials}
                        </div>
                        <span>{log.employeeName}</span>
                      </td>
                      <td className="p-3 text-slate-600">{log.device}</td>
                      <td className="p-3">
                        <StatusCell log={log} />
                      </td>
                      <td className="p-3 text-slate-500 font-mono">{log.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 2: SHIFTS & SCHEDULE */}
        {subTab === 'shifts' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-indigo-600 uppercase">Standart rejim</span>
              <h5 className="font-bold text-slate-800 text-sm">Ofis ish grafigi (HQ)</h5>
              <p className="text-xs text-slate-600">Dushanba - Juma: 09:00 - 18:00 (1 soat tushlik)</p>
              <p className="text-[11px] text-slate-400">Qamrov: Barcha ma’muriy xodimlar</p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-purple-600 uppercase">Moslashuvchan</span>
              <h5 className="font-bold text-slate-800 text-sm">IT / Development Shift</h5>
              <p className="text-xs text-slate-600">10:00 - 19:00 (Yoki 8 soat erkin koridor)</p>
              <p className="text-[11px] text-slate-400">Qamrov: Muhandislar va dizaynerlar</p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-amber-600 uppercase">24/7 Navbatchilik</span>
              <h5 className="font-bold text-slate-800 text-sm">Server & Support Shift</h5>
              <p className="text-xs text-slate-600">12 soatlik 2 smenali navbatchilik</p>
              <p className="text-[11px] text-slate-400">Qamrov: DevOps va IT Support</p>
            </div>
          </div>
        )}

        {/* SUBTAB 3: DELAYS */}
        {subTab === 'delays' && (
          <div className="space-y-2 pt-2">
            {delayedLogs.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
                <i className="fa-solid fa-circle-check text-emerald-500 mr-1"></i>Kechikishlar qayd etilmagan
              </p>
            ) : (
              delayedLogs.map((log) => (
                <div key={log.id} className="p-4 bg-red-50/50 border border-red-100 rounded-xl space-y-1">
                  <div className="flex justify-between items-center text-sm font-bold text-red-900">
                    <span>
                      {log.employeeName} ({log.department})
                    </span>
                    <span>
                      {log.delayMinutes !== undefined ? `${log.delayMinutes} daqiqa kechikish` : 'Kechikish'} (
                      {log.time.slice(0, 5)})
                    </span>
                  </div>
                  <p className="text-xs text-red-700">
                    {log.timestamp.slice(0, 10)} • {log.device}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
