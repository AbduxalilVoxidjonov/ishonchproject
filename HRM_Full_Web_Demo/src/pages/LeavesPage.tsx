import React, { useState } from 'react';
import { LeaveRequest } from '../types/hrm';
import { inclusiveDays, toDisplayDate } from '../utils/dates';

const LEAVE_TYPE_LABELS: Record<LeaveRequest['type'], string> = {
  yillik: 'Yillik ta’til',
  kasallik: 'Kasallik varaqasi',
  ruxsatnoma: 'Ruxsatnoma',
  oqish: 'O‘quv ta’tili',
  ishhaqisiz: 'Ish haqi saqlanmagan ta’til',
};

interface LeavesPageProps {
  leaveRequests: LeaveRequest[];
  onOpenAddLeave: () => void;
  onApproveLeave: (id: string) => void;
  onRejectLeave: (id: string) => void;
}

export const LeavesPage: React.FC<LeavesPageProps> = ({
  leaveRequests,
  onOpenAddLeave,
  onApproveLeave,
  onRejectLeave,
}) => {
  const [subTab, setSubTab] = useState<'pending' | 'approved' | 'rejected' | 'all' | 'calendar'>('pending');

  const filteredRequests = leaveRequests.filter((lr) => {
    if (subTab === 'pending') return lr.status === 'pending';
    if (subTab === 'approved') return lr.status === 'approved';
    if (subTab === 'rejected') return lr.status === 'rejected';
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Ta’tillar va yo‘qlamalar boshqaruvi</h3>
            <p className="text-xs text-slate-500">
              Xodimlar tomonidan yuborilgan yillik mehnat ta’tili, kasallik varaqasi va ruxsatnoma arizalari.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setSubTab('pending')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'pending'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kutilayotganlar ({leaveRequests.filter((x) => x.status === 'pending').length})
              </button>
              <button
                onClick={() => setSubTab('approved')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'approved'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tasdiqlanganlar ({leaveRequests.filter((x) => x.status === 'approved').length})
              </button>
              <button
                onClick={() => setSubTab('rejected')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'rejected'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rad etilganlar ({leaveRequests.filter((x) => x.status === 'rejected').length})
              </button>
              <button
                onClick={() => setSubTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'all'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Barchasi ({leaveRequests.length})
              </button>
              <button
                onClick={() => setSubTab('calendar')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'calendar'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fa-solid fa-calendar-days mr-1"></i>Ta'til grafigi
              </button>
            </div>

            <button
              onClick={onOpenAddLeave}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-all flex items-center space-x-1.5"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Ariza berish</span>
            </button>
          </div>
        </div>

        {/* SUBTAB: CALENDAR / SCHEDULE */}
        {subTab === 'calendar' ? (
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">2026-yil Mehnat ta’tillari yillik rejasi (Grafik)</h4>
                <p className="text-xs text-slate-500">
                  O‘zR Mehnat kodeksiga asosan tasdiqlangan yillik asosiy va qo‘shimcha ta’tillar grafigi
                </p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                Reja qamrovi: 98%
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="p-3">Xodim</th>
                    <th className="p-3">Lavozim & Bo‘lim</th>
                    <th className="p-3">Ta’til davomiyligi</th>
                    <th className="p-3">Rejadagi sana</th>
                    <th className="p-3">Haqiqiy davr</th>
                    <th className="p-3">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveRequests.map((lr) => (
                    <tr key={lr.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-semibold text-slate-800">{lr.employeeName}</td>
                      <td className="p-3 text-slate-600">
                        {lr.position} • {lr.department}
                      </td>
                      <td className="p-3 font-medium text-indigo-700">
                        {inclusiveDays(lr.startDate, lr.endDate)} ish kuni
                      </td>
                      <td className="p-3 text-slate-500 font-mono">
                        {lr.startDate} - {lr.endDate}
                      </td>
                      <td className="p-3 text-slate-700">
                        {lr.status === 'approved' ? (
                          <span className="text-emerald-700 font-semibold">O‘z vaqtida berilgan</span>
                        ) : lr.status === 'pending' ? (
                          <span className="text-amber-600">Tasdiqlash kutilmoqda</span>
                        ) : (
                          <span className="text-slate-400">Ko‘chirilgan</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            lr.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : lr.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {lr.status === 'approved'
                            ? 'Grafik bo‘yicha'
                            : lr.status === 'pending'
                              ? 'Rejada'
                              : 'Bekor qilingan'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Leave Requests Stream matching hrm_platform_update.html */
          <div className="space-y-3 pt-2">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                <i className="fa-regular fa-calendar-check text-3xl mb-2 block"></i>
                Ushbu toifada arizalar mavjud emas.
              </div>
            ) : (
              filteredRequests.map((lr) => (
                <div
                  key={lr.id}
                  className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-indigo-200 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <p className="font-bold text-slate-800 text-sm">
                        {LEAVE_TYPE_LABELS[lr.type]} • {inclusiveDays(lr.startDate, lr.endDate)} kun
                      </p>
                      {lr.status === 'pending' && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Kutilmoqda
                        </span>
                      )}
                      {lr.status === 'approved' && (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Tasdiqlangan
                        </span>
                      )}
                      {lr.status === 'rejected' && (
                        <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Rad etilgan
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">{lr.employeeName}</span> ({lr.position} • {lr.department})
                    </p>
                    <p className="text-xs text-slate-500">
                      Muddat: <span className="font-semibold text-indigo-700">{toDisplayDate(lr.startDate)}</span> dan{' '}
                      <span className="font-semibold text-indigo-700">{toDisplayDate(lr.endDate)}</span> gacha
                      {lr.reason && ` • Izoh: "${lr.reason}"`}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                    {lr.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => onApproveLeave(lr.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                        >
                          <i className="fa-solid fa-check text-xs"></i>
                          <span>Tasdiqlash</span>
                        </button>
                        <button
                          onClick={() => onRejectLeave(lr.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Rad etish
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">
                        Ko‘rib chiqilgan
                        {lr.approvedBy && (
                          <>
                            {' '}
                            • <span className="text-slate-600">{lr.approvedBy}</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
