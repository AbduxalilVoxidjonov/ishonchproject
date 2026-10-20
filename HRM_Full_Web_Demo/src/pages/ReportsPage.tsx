import React from 'react';

interface ReportsPageProps {
  onShowToast: (msg: string) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ onShowToast }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Analitika va HR Hisobotlar</h3>
          <p className="text-xs text-slate-500">
            Kadrlar qo‘nimsizligi (Turnover), rekruting konversiyasi, eNPS va oylik mehnat unumdorligi metrikalari.
          </p>
        </div>

        {/* Highlight Stats matching hrm_platform_update.html */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          <div className="p-5 border border-slate-200 rounded-2xl space-y-2 bg-gradient-to-br from-slate-50 to-indigo-50/20">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-slate-800 text-sm">Turnover (Kadrlar qo‘nimsizlik darajasi)</h4>
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-bold">Yaxshi</span>
            </div>
            <p className="text-4xl font-extrabold text-indigo-600">4.2%</p>
            <p className="text-xs text-slate-500">
              O‘tgan chorakka (5.3%) nisbatan 1.1% ga kamaygan. Standart xalqaro mezon: &lt; 7.0%.
            </p>
          </div>

          <div className="p-5 border border-slate-200 rounded-2xl space-y-2 bg-gradient-to-br from-slate-50 to-emerald-50/20">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-slate-800 text-sm">Recruitment Conversion (ATS voronkasi)</h4>
              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-bold">Barqaror</span>
            </div>
            <p className="text-4xl font-extrabold text-emerald-600">18.5%</p>
            <p className="text-xs text-slate-500">
              Kelib tushgan 100 ta arizadan o‘rtacha 18-19 tasi barcha suhbatlardan muvaffaqiyatli o‘tib taklif oladi.
            </p>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-xs text-slate-500 uppercase font-bold">O‘rtacha ish haqi</span>
            <p className="text-xl font-bold text-slate-800">18,500,000 UZS</p>
            <p className="text-[11px] text-slate-400">Bozor o‘rtacha ko‘rsatkichidan 14% yuqori</p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-xs text-slate-500 uppercase font-bold">Xodimlar yoshi</span>
            <p className="text-xl font-bold text-slate-800">28.4 yosh</p>
            <p className="text-[11px] text-slate-400">Yosh mutaxassislar ulushi: 68%</p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-xs text-slate-500 uppercase font-bold">O‘rtacha ish staji (Tenure)</span>
            <p className="text-xl font-bold text-slate-800">2.6 yil</p>
            <p className="text-[11px] text-slate-400">Retention ko‘rsatkichi: 92%</p>
          </div>
        </div>

        {/* Export Full Reports Section */}
        <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <p className="font-bold text-slate-800 text-sm">Choraklik to‘liq tahliliy hisobotni yuklab olish</p>
            <p className="text-xs text-slate-500">Barcha departamentlar bo‘yicha to‘liq taqqoslama ma’lumotlar to‘plami</p>
          </div>
          <button
            onClick={() => onShowToast('Choraklik kadrlar hisoboti (Excel & PDF) tayyorlandi va yuklanmoqda')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center space-x-2"
          >
            <i className="fa-solid fa-file-pdf"></i>
            <span>Hisobotni yuklab olish (PDF)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
