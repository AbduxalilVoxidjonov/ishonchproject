import React, { useState } from 'react';
import { AuditLogItem } from '../types/hrm';

interface SettingsPageProps {
  auditLogs: AuditLogItem[];
  onShowToast: (msg: string) => void;
}

const AUDIT_DOT: Record<AuditLogItem['status'], string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ auditLogs, onShowToast }) => {
  const [subTab, setSubTab] = useState<'audit' | 'roles' | 'users' | 'security'>('audit');

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Tizim Sozlamalari va Audit Log</h3>
            <p className="text-xs text-slate-500">
              Rollar va ruxsatlar (RBAC), foydalanuvchilar boshqaruvi, xavfsizlik va harakatlar auditi.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSubTab('audit')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'audit'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-list-check mr-1"></i>Audit Log ({auditLogs.length})
            </button>
            <button
              onClick={() => setSubTab('roles')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'roles'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rollar & Ruxsatlar
            </button>
            <button
              onClick={() => setSubTab('users')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'users'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-users mr-1"></i>Foydalanuvchilar
            </button>
            <button
              onClick={() => setSubTab('security')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'security'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Xavfsizlik
            </button>
          </div>
        </div>

        {/* SUBTAB 1: AUDIT LOGS matching hrm_platform_update.html */}
        {subTab === 'audit' && (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>Barcha amalga oshirilgan tizim operatsiyalari qaydlari</span>
              <button
                onClick={() => onShowToast('Audit loglari CSV formatda eksport qilindi')}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Loglarni eksport qilish
              </button>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {auditLogs.length === 0 && (
                <p className="p-6 text-center text-xs text-slate-400 bg-white">Audit qaydlari hozircha yo‘q</p>
              )}
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 bg-white hover:bg-slate-50 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-800 flex items-center space-x-2">
                      <span className={`w-2 h-2 rounded-full ${AUDIT_DOT[log.status]}`}></span>
                      <span>{log.userName}</span>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                        {log.userRole}
                      </span>
                    </p>
                    <p className="text-slate-600">
                      Amal: <span className="font-semibold text-slate-700">{log.action}</span>
                    </p>
                    <p className="text-slate-400 font-mono text-[11px]">
                      Modul: {log.module} • IP: {log.ipAddress}
                    </p>
                  </div>
                  <span className="text-slate-400 font-mono whitespace-nowrap">{log.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUBTAB 2: ROLES & PERMISSIONS */}
        {subTab === 'roles' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-indigo-600 uppercase">Super Admin</span>
              <h5 className="font-bold text-slate-800 text-sm">To‘liq ma’muriy huquqlar</h5>
              <p className="text-xs text-slate-600">Barcha modullarga kirish, maoshlarni ko‘rish va o‘zgartirish, audit.</p>
              <span className="text-[11px] text-slate-400 block pt-1">Tayinlangan: 1 nafar</span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-purple-600 uppercase">HR Manager</span>
              <h5 className="font-bold text-slate-800 text-sm">Kadrlar va Rekruting</h5>
              <p className="text-xs text-slate-600">Xodimlarni qabul qilish, ta’tillarni tasdiqlash, vakansiyalar boshqaruvi.</p>
              <span className="text-[11px] text-slate-400 block pt-1">Tayinlangan: 4 nafar</span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-emerald-600 uppercase">Department Head</span>
              <h5 className="font-bold text-slate-800 text-sm">Bo‘lim boshliqlari</h5>
              <p className="text-xs text-slate-600">O‘z bo‘limi xodimlarining davomati, KPI baholash va ta’til so‘rovlarini tasdiqlash.</p>
              <span className="text-[11px] text-slate-400 block pt-1">Tayinlangan: 12 nafar</span>
            </div>
          </div>
        )}

        {/* SUBTAB: USERS */}
        {subTab === 'users' && (
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Tizim Administratorlari va Foydalanuvchilar</h4>
                <p className="text-xs text-slate-500">
                  HRM tizimiga kirish huquqiga ega bo‘lgan ichki foydalanuvchilar akkauntlari
                </p>
              </div>
              <button
                onClick={() => onShowToast('Yangi tizim foydalanuvchisi taklif qilindi')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
              >
                <i className="fa-solid fa-user-plus text-[10px]"></i>
                <span>Foydalanuvchi qo‘shish</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="p-3">Foydalanuvchi</th>
                    <th className="p-3">Email / Login</th>
                    <th className="p-3">Roli</th>
                    <th className="p-3">Filial / Bo‘lim</th>
                    <th className="p-3">2FA</th>
                    <th className="p-3">Holati</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-800">Admin User (Siz)</td>
                    <td className="p-3 text-slate-500 font-mono">admin@ishonch.uz</td>
                    <td className="p-3">
                      <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-semibold text-[11px]">
                        Super Admin
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">HQ Bosh ofis</td>
                    <td className="p-3"><span className="text-emerald-600 font-bold">Yoqilgan</span></td>
                    <td className="p-3">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        Faol
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-800">Zarina Ismoilova</td>
                    <td className="p-3 text-slate-500 font-mono">z.ismoilova@ishonch.uz</td>
                    <td className="p-3">
                      <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-semibold text-[11px]">
                        HR Manager
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">Inson resurslari</td>
                    <td className="p-3"><span className="text-emerald-600 font-bold">Yoqilgan</span></td>
                    <td className="p-3">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        Faol
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-800">Madina Usmonova</td>
                    <td className="p-3 text-slate-500 font-mono">m.usmonova@ishonch.uz</td>
                    <td className="p-3">
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold text-[11px]">
                        Finance / Payroll
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">Moliya va hisob-kitob</td>
                    <td className="p-3"><span className="text-slate-400">O‘chirilgan</span></td>
                    <td className="p-3">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        Faol
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 4: SECURITY */}
        {subTab === 'security' && (
          <div className="space-y-3 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800 text-sm">Ikki bosqichli autentifikatsiya (2FA)</p>
                <p className="text-xs text-slate-500">Barcha admin darajasidagi foydalanuvchilar uchun majburiy OTP</p>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">Faol</span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800 text-sm">Sessiya davomiyligi cheklovi</p>
                <p className="text-xs text-slate-500">60 daqiqa harakatsizlikdan so‘ng tizimdan avtomatik chiqish</p>
              </div>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-3 py-1 rounded-full">60 daqiqa</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
