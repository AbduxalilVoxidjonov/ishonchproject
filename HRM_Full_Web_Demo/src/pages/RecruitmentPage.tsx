import React, { useState } from 'react';
import { Branch, Candidate, Department, Employee, Vacancy } from '../types/hrm';
import { toDisplayDate } from '../utils/dates';
import { CloseVacancyConfirmModal } from '../components/modals/CloseVacancyConfirmModal';
import { EditVacancyModal } from '../components/modals/EditVacancyModal';

interface RecruitmentPageProps {
  vacancies: Vacancy[];
  /** Only used for the per-vacancy candidate counts; candidates are managed inside a vacancy. */
  candidates: Candidate[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  onOpenAddVacancy: () => void;
  onOpenVacancy: (vacancyId: string) => void;
  onToggleVacancyStatus: (vacancyId: string) => void;
  onUpdateVacancy: (updated: Vacancy) => void;
}

const VACANCY_STATUS: Record<Vacancy['status'], { label: string; text: string; dot: string; pulse: boolean }> = {
  open: { label: 'Faol qabul', text: 'text-emerald-600', dot: 'bg-emerald-500', pulse: true },
  interviewing: { label: 'Suhbatlar bosqichi', text: 'text-amber-600', dot: 'bg-amber-500', pulse: true },
  closed: { label: 'Yopilgan', text: 'text-slate-500', dot: 'bg-slate-400', pulse: false },
};

export const RecruitmentPage: React.FC<RecruitmentPageProps> = ({
  vacancies,
  candidates,
  branches,
  departments,
  employees,
  onOpenAddVacancy,
  onOpenVacancy,
  onToggleVacancyStatus,
  onUpdateVacancy,
}) => {
  const [confirmingVacancy, setConfirmingVacancy] = useState<Vacancy | null>(null);
  const [editingVacancy, setEditingVacancy] = useState<Vacancy | null>(null);
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Vakansiyalar ({vacancies.length})</h3>
          <p className="text-xs text-slate-500">Tashkiliy tuzilma bo‘yicha ochiq ish o‘rinlari.</p>
        </div>

        <button
          onClick={onOpenAddVacancy}
          className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-xs hover:bg-indigo-700 transition-all flex items-center space-x-1.5"
        >
          <i className="fa-solid fa-plus text-xs"></i>
          <span>Vakansiya ochish</span>
        </button>
      </div>

      {/* Vacancy cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {vacancies.length === 0 && (
          <div className="col-span-full bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-400">
            Hozircha vakansiyalar yo‘q
          </div>
        )}
        {vacancies.map((vac) => {
          const vacCandidates = candidates.filter((c) => c.vacancyId === vac.id);
          const inProgress = vacCandidates.filter((c) => {
            const stage = vac.stages.find((s) => s.id === c.stageId);
            return stage && !stage.outcome;
          }).length;
          const st = VACANCY_STATUS[vac.status];
          return (
            <div
              key={vac.id}
              role="link"
              tabIndex={0}
              aria-label={`${vac.title} vakansiyasini ochish`}
              onClick={() => onOpenVacancy(vac.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpenVacancy(vac.id);
              }}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all space-y-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="flex justify-between items-start">
                <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                  {vac.department}
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500 font-semibold flex items-center">
                    <i className="fa-solid fa-users mr-1 text-slate-400"></i>
                    {vacCandidates.length} nomzod
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingVacancy(vac);
                    }}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 flex items-center justify-center transition-colors"
                    title="Vakansiyani tahrirlash"
                    aria-label="Vakansiyani tahrirlash"
                  >
                    <i className="fa-solid fa-pencil text-[11px]"></i>
                  </button>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-base">{vac.title}</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {vac.type} • {vac.location}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Taklif maoshi:</span>
                  <span className="font-bold text-indigo-700">{vac.salaryRange}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tajriba talabi:</span>
                  <span className="font-semibold text-slate-700">{vac.experienceLevel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Qabul muddati:</span>
                  <span className="font-medium text-slate-600">{toDisplayDate(vac.deadline)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {vac.tags.map((t, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded break-words max-w-full"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-2">
                  <span className={`${st.text} font-bold flex items-center`}>
                    <span className={`w-2 h-2 rounded-full ${st.dot} mr-1.5 ${st.pulse ? 'animate-pulse' : ''}`}></span>
                    {st.label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingVacancy(vac);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                      vac.status === 'closed'
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 hover:bg-amber-50 text-slate-500 hover:text-amber-700'
                    }`}
                    title={vac.status === 'closed' ? 'Vakansiyani qayta faollashtirish' : 'Vakansiyani vaqtincha yopish'}
                  >
                    <i className={`fa-solid ${vac.status === 'closed' ? 'fa-rotate-left' : 'fa-pause'} text-[9px]`}></i>
                    <span>{vac.status === 'closed' ? 'Qayta ochish' : 'Vaqtincha yopish'}</span>
                  </button>
                </div>
                <span className="text-indigo-600 font-bold flex items-center space-x-1">
                  <span>Nomzodlar ({inProgress})</span>
                  <i className="fa-solid fa-arrow-right text-[10px]"></i>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {confirmingVacancy && (
        <CloseVacancyConfirmModal
          vacancy={confirmingVacancy}
          onClose={() => setConfirmingVacancy(null)}
          onConfirm={() => onToggleVacancyStatus(confirmingVacancy.id)}
        />
      )}

      {editingVacancy && (
        <EditVacancyModal
          vacancy={editingVacancy}
          branches={branches}
          departments={departments}
          employees={employees}
          vacancies={vacancies}
          onClose={() => setEditingVacancy(null)}
          onSaveVacancy={onUpdateVacancy}
        />
      )}
    </div>
  );
};
