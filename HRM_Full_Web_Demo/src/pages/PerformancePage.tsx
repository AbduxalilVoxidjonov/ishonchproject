import React, { useState } from 'react';
import { KPIReview } from '../types/hrm';

interface PerformancePageProps {
  kpiReviews: KPIReview[];
  onShowToast: (msg: string) => void;
}

const REVIEW_STATUS: Record<KPIReview['status'], { label: string; cls: string }> = {
  completed: { label: 'Yakunlangan', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'Jarayonda', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending: { label: 'Kutilmoqda', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const PerformancePage: React.FC<PerformancePageProps> = ({ kpiReviews, onShowToast }) => {
  const [subTab, setSubTab] = useState<'kpi' | 'okr' | 'feedback360' | 'development'>('kpi');

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">KPI va Performance Review</h3>
            <p className="text-xs text-slate-500">
              Xodimlarning choraklik KPI ko‘rsatkichlari, OKR maqsadlari, 360° baholash va rivojlanish rejalari.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSubTab('kpi')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'kpi'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              KPI Ko‘rsatkichlar
            </button>
            <button
              onClick={() => setSubTab('okr')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'okr'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kompaniya OKR
            </button>
            <button
              onClick={() => setSubTab('feedback360')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'feedback360'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              360° Baholash
            </button>
            <button
              onClick={() => setSubTab('development')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'development'
                  ? 'bg-white text-slate-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-graduation-cap mr-1"></i>Rivojlanish (PDP)
            </button>
          </div>
        </div>

        {/* Current Review Cycle Banner matching hrm_platform_update.html */}
        <div className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50">
          <div>
            <div className="flex items-center space-x-2">
              <p className="font-bold text-slate-800 text-sm">Q3 2026 Choraklik baholash sikli</p>
              <span className="bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-purple-200">
                Faol sikl
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Holat: Manager Review bosqichi (84% yakunlangan) • Yakunlanish sanasi: 10.10.2026
            </p>
          </div>
          <button
            onClick={() => onShowToast('Baholash sikli eslatmasi barcha rahbarlarga yuborildi')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-colors"
          >
            Rahbarlarga eslatma yuborish
          </button>
        </div>

        {/* KPI Reviews Cards */}
        {subTab === 'kpi' && (
          <div className="space-y-4 pt-2">
            {kpiReviews.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-400">KPI baholash natijalari hozircha yo‘q</p>
            )}
            {kpiReviews.map((kpi) => (
              <div
                key={kpi.id}
                className="p-5 border border-slate-200 rounded-xl space-y-3 hover:border-indigo-300 transition-colors bg-white shadow-2xs"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800 text-base">{kpi.employeeName}</h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${REVIEW_STATUS[kpi.status].cls}`}
                      >
                        {REVIEW_STATUS[kpi.status].label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{kpi.department} • Davr: {kpi.period}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-indigo-600">{kpi.percentage}%</span>
                    <span className="text-xs text-emerald-600 font-semibold block">
                      {kpi.achievedScore} / {kpi.targetScore} ball
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, kpi.percentage))}%` }}
                  ></div>
                </div>

                {kpi.managerComment && (
                  <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <i className="fa-solid fa-quote-left text-slate-300 mr-2"></i>
                    {kpi.managerComment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* OKR TAB */}
        {subTab === 'okr' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-indigo-600 uppercase">Kompaniya Maqsadi #1</span>
              <h5 className="font-bold text-slate-800 text-sm">Xodimlar qoniqish darajasini (eNPS) 85% ga yetkazish</h5>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '88%' }}></div>
              </div>
              <p className="text-xs text-slate-500 pt-1">Joriy natija: 88% (Rejadan ortiq)</p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-purple-600 uppercase">Kompaniya Maqsadi #2</span>
              <h5 className="font-bold text-slate-800 text-sm">O‘rtacha ishga qabul qilish vaqtini (Time-to-Hire) 18 kunga qisqartirish</h5>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                <div className="bg-purple-600 h-2 rounded-full" style={{ width: '75%' }}></div>
              </div>
              <p className="text-xs text-slate-500 pt-1">Joriy natija: 21 kun (Jarayonda)</p>
            </div>
          </div>
        )}

        {/* 360 TAB */}
        {subTab === 'feedback360' && (
          <div className="p-5 border border-slate-200 rounded-xl text-center space-y-3">
            <i className="fa-solid fa-arrows-spin text-3xl text-indigo-500"></i>
            <h4 className="font-bold text-slate-800 text-base">360° Anonim Baholash So‘rovnomalari</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Hamkasblar, bo‘ysunuvchilar va rahbarlar o‘rtasida xolis baholash mexanizmi.
            </p>
            <button
              onClick={() => onShowToast('360° yangi so‘rovnoma tarqatildi')}
              className="bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-xl"
            >
              Yangi 360° so‘rovnoma boshlash
            </button>
          </div>
        )}

        {/* PDP & DEVELOPMENT TAB */}
        {subTab === 'development' && (
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Shaxsiy Rivojlanish Rejalari (Individual PDP)</h4>
                <p className="text-xs text-slate-500">
                  Xodimlarning kasbiy mahorati, malaka oshirish kurslari va ichki mentorlik monitoringi
                </p>
              </div>
              <button
                onClick={() => onShowToast('Yangi individual rivojlanish rejasi (PDP) shakllantirildi')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs transition-colors"
              >
                + PDP yaratish
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 hover:border-indigo-200 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="font-bold text-slate-800 text-sm">Azizbek Aliyev</h5>
                    <p className="text-xs text-slate-500">Lead Frontend Engineer • IT & Engineering</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    85% Bajarildi
                  </span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>• <strong>Maqsad:</strong> Cloud Architecture (AWS/GCP Professional) sertifikatsiyasi</p>
                  <p>• <strong>Mentor:</strong> Timur Vohidov (CTO)</p>
                  <p>• <strong>Muddat:</strong> 2026-yil Q4</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '85%' }}></div>
                </div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 hover:border-indigo-200 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="font-bold text-slate-800 text-sm">Zarina Ismoilova</h5>
                    <p className="text-xs text-slate-500">Senior HR Manager • Inson Resurslari</p>
                  </div>
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    60% Bajarildi
                  </span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>• <strong>Maqsad:</strong> SHRM-CP xalqaro HR sertifikati imtihoni</p>
                  <p>• <strong>Mentor:</strong> Malika Karimova (HR Director)</p>
                  <p>• <strong>Muddat:</strong> 2026-yil Q4</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: '60%' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
