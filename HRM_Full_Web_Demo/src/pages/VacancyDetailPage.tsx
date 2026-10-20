import React, { useRef, useState } from 'react';
import { Branch, Candidate, Department, Employee, PipelineStage, Vacancy } from '../types/hrm';
import { toDisplayDate } from '../utils/dates';
import { CandidateDetailModal } from '../components/modals/CandidateDetailModal';
import { CloseVacancyConfirmModal } from '../components/modals/CloseVacancyConfirmModal';
import { EditVacancyModal } from '../components/modals/EditVacancyModal';

interface VacancyDetailPageProps {
  vacancy: Vacancy;
  branchName: string;
  /** Candidates of this vacancy only. */
  candidates: Candidate[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  vacancies: Vacancy[];
  onBack: () => void;
  onAddStage: (name: string) => void;
  onRenameStage: (stageId: string, name: string) => void;
  onDeleteStage: (stageId: string) => void;
  onMoveStage: (stageId: string, direction: -1 | 1) => void;
  onMoveCandidate: (candidateId: string, stageId: string) => void;
  onToggleStatus: (vacancyId: string) => void;
  onUpdateVacancy: (updated: Vacancy) => void;
  onShowToast: (msg: string) => void;
}

const STATUS_LABEL: Record<Vacancy['status'], { label: string; cls: string }> = {
  open: { label: 'Faol qabul', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  interviewing: { label: 'Suhbatlar bosqichi', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  closed: { label: 'Yopilgan', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const columnTone = (stage: PipelineStage) =>
  stage.outcome === 'hired'
    ? 'bg-emerald-50/70 border-emerald-200'
    : stage.outcome === 'rejected'
      ? 'bg-red-50/60 border-red-200'
      : 'bg-slate-100/70 border-slate-200';

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, "'");

const DRAG_TYPE = 'text/x-candidate-id';

export const VacancyDetailPage: React.FC<VacancyDetailPageProps> = ({
  vacancy,
  branchName,
  candidates,
  branches,
  departments,
  employees,
  vacancies,
  onBack,
  onAddStage,
  onRenameStage,
  onDeleteStage,
  onMoveStage,
  onMoveCandidate,
  onToggleStatus,
  onUpdateVacancy,
  onShowToast,
}) => {
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const openCandidate = candidates.find((c) => c.id === openCandidateId) ?? null;
  const answeredCount = (c: Candidate) =>
    vacancy.questions.filter((q) => c.answers.some((a) => a.questionId === q.id)).length;
  // Enter / Escape already finished the rename; ignore the blur that follows when the input disappears
  const skipBlurRef = useRef(false);

  const stages = vacancy.stages;
  const stageIndex = (id: string) => stages.findIndex((s) => s.id === id);
  const inStage = (stageId: string) => candidates.filter((c) => c.stageId === stageId);
  const countByOutcome = (outcome: PipelineStage['outcome']) =>
    candidates.filter((c) => stages.find((s) => s.id === c.stageId)?.outcome === outcome).length;

  const nameTaken = (name: string, exceptId?: string) =>
    stages.some((s) => s.id !== exceptId && normalize(s.name) === normalize(name));

  const startRename = (stage: PipelineStage) => {
    skipBlurRef.current = false;
    setEditingStageId(stage.id);
    setEditValue(stage.name);
  };

  /** Returns false (and keeps editing) when the name is invalid. */
  const saveRename = (stage: PipelineStage): boolean => {
    const name = editValue.trim();
    if (!name) {
      onShowToast('Ustun nomi bo‘sh bo‘lishi mumkin emas');
      return false;
    }
    if (nameTaken(name, stage.id)) {
      onShowToast(`"${name}" nomli ustun allaqachon bor`);
      return false;
    }
    if (name !== stage.name) onRenameStage(stage.id, name);
    setEditingStageId(null);
    return true;
  };

  const saveNewColumn = () => {
    const name = newColumnName.trim();
    if (!name) {
      onShowToast('Ustun nomini kiriting');
      return;
    }
    if (nameTaken(name)) {
      onShowToast(`"${name}" nomli ustun allaqachon bor`);
      return;
    }
    onAddStage(name);
    setNewColumnName('');
    setAddingColumn(false);
  };

  const handleDelete = (stage: PipelineStage) => {
    if (inStage(stage.id).length > 0) {
      onShowToast('Avval bu ustundagi nomzodlarni boshqa ustunga o‘tkazing');
      return;
    }
    if (stages.length === 1) {
      onShowToast('Kamida bitta ustun qolishi kerak');
      return;
    }
    onDeleteStage(stage.id);
  };

  const moveCandidateBy = (candidate: Candidate, direction: -1 | 1) => {
    const target = stages[stageIndex(candidate.stageId) + direction];
    if (target) onMoveCandidate(candidate.id, target.id);
  };

  const st = STATUS_LABEL[vacancy.status];

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Breadcrumb */}
      <nav className="flex items-center flex-wrap gap-1.5 text-xs" aria-label="Joylashuv">
        <button
          type="button"
          onClick={onBack}
          className="mr-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
        >
          <i className="fa-solid fa-arrow-left text-[10px] mr-1"></i>Vakansiyalar
        </button>
        <i className="fa-solid fa-chevron-right text-[9px] text-slate-300"></i>
        <span className="font-bold text-slate-800">
          {vacancy.id} · {vacancy.title}
        </span>
      </nav>

      {/* Vacancy summary */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{vacancy.title}</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="ml-2 px-3 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 border border-slate-200"
                title="Vakansiya ma’lumotlarini tahrirlash"
              >
                <i className="fa-solid fa-pencil text-[10px]"></i>
                <span>Tahrirlash</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCloseConfirm(true)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                  vacancy.status === 'closed'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                }`}
                title={vacancy.status === 'closed' ? 'Vakansiyani qayta faollashtirish' : 'Vakansiyani vaqtincha yopish'}
              >
                <i className={`fa-solid ${vacancy.status === 'closed' ? 'fa-rotate-left' : 'fa-pause'} text-[10px]`}></i>
                <span>{vacancy.status === 'closed' ? 'Vakansiyani qayta ochish' : 'Vaqtincha yopish'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 flex items-center flex-wrap gap-1.5">
              <i className="fa-solid fa-sitemap text-slate-400"></i>
              <span>{branchName}</span>
              <i className="fa-solid fa-chevron-right text-[8px] text-slate-300"></i>
              <span>{vacancy.department}</span>
              <span className="text-slate-300">•</span>
              <span>{vacancy.type}</span>
              <span className="text-slate-300">•</span>
              <span className="font-mono">{vacancy.id}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center w-full lg:w-auto">
            {[
              { label: 'Nomzodlar', value: candidates.length, cls: 'text-slate-800' },
              {
                label: 'Jarayonda',
                value: candidates.length - countByOutcome('hired') - countByOutcome('rejected'),
                cls: 'text-indigo-600',
              },
              { label: 'Qabul qilindi', value: countByOutcome('hired'), cls: 'text-emerald-600' },
              { label: 'Rad etildi', value: countByOutcome('rejected'), cls: 'text-red-500' },
            ].map((x) => (
              <div key={x.label} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                <p className={`text-lg font-bold ${x.cls}`}>{x.value}</p>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{x.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-500 block">Taklif maoshi</span>
            <span className="font-bold text-indigo-700">{vacancy.salaryRange}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-500 block">Tajriba talabi</span>
            <span className="font-semibold text-slate-700">{vacancy.experienceLevel}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-500 block">Qabul muddati</span>
            <span className="font-semibold text-slate-700">{toDisplayDate(vacancy.deadline)}</span>
          </div>
        </div>

        {vacancy.tags.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Talab qilinadigan ko‘nikmalar
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vacancy.tags.map((t, i) => (
                <span
                  key={i}
                  className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg break-words max-w-full"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {vacancy.questions.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Nomzoddan so‘raladigan hujjatlar va savollar
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vacancy.questions.map((q) => (
                <span key={q.id} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                  <i
                    className={`fa-solid ${
                      q.answerType === 'text' ? 'fa-align-left' : q.answerType === 'file' ? 'fa-file-lines' : 'fa-image'
                    } mr-1.5 text-slate-400`}
                  ></i>
                  {q.label}
                  {q.required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Candidate pipeline (kanban) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            Nomzodlar pipeline’i{' '}
            <span className="text-slate-400 font-medium">· nomzodni ustunlar orasida sudrab o‘tkazing</span>
          </h3>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar items-start">
          {stages.map((stage, idx) => {
            const stageCandidates = inStage(stage.id);
            const isEditing = editingStageId === stage.id;
            return (
              <section
                key={stage.id}
                aria-label={stage.name}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  setDragOverStageId(stage.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverStageId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStageId(null);
                  const id = e.dataTransfer.getData(DRAG_TYPE);
                  if (id) onMoveCandidate(id, stage.id);
                }}
                className={`w-72 flex-shrink-0 p-3 rounded-2xl border flex flex-col transition-shadow ${columnTone(stage)} ${
                  dragOverStageId === stage.id ? 'ring-2 ring-indigo-400' : ''
                }`}
              >
                {/* Column header */}
                <div className="flex items-center justify-between gap-2 mb-3 px-1 min-h-[28px]">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && saveRename(stage)) skipBlurRef.current = true;
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          skipBlurRef.current = true;
                          setEditingStageId(null);
                        }
                      }}
                      onBlur={() => {
                        if (skipBlurRef.current) {
                          skipBlurRef.current = false;
                          return;
                        }
                        // Clicking elsewhere keeps a valid new name, silently drops an invalid one
                        const name = editValue.trim();
                        if (name && !nameTaken(name, stage.id) && name !== stage.name) onRenameStage(stage.id, name);
                        setEditingStageId(null);
                      }}
                      aria-label="Ustun nomi"
                      className="flex-1 min-w-0 px-2 py-1 text-xs font-bold bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <h4
                      className="font-bold text-xs text-slate-700 uppercase truncate cursor-text"
                      title="Nomini o‘zgartirish uchun ikki marta bosing"
                      onDoubleClick={() => {
                        startRename(stage);
                      }}
                    >
                      {stage.outcome === 'hired' && <i className="fa-solid fa-circle-check text-emerald-500 mr-1"></i>}
                      {stage.outcome === 'rejected' && <i className="fa-solid fa-circle-xmark text-red-400 mr-1"></i>}
                      {stage.name}
                    </h4>
                  )}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <span className="text-xs font-bold bg-white text-slate-700 px-2 py-0.5 rounded-full shadow-xs mr-1">
                      {stageCandidates.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => onMoveStage(stage.id, -1)}
                      disabled={idx === 0}
                      aria-label={`${stage.name} ustunini chapga surish`}
                      className="w-6 h-6 rounded-md text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-[10px]"
                    >
                      <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveStage(stage.id, 1)}
                      disabled={idx === stages.length - 1}
                      aria-label={`${stage.name} ustunini o‘ngga surish`}
                      className="w-6 h-6 rounded-md text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-[10px]"
                    >
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        startRename(stage);
                      }}
                      aria-label={`${stage.name} ustunini qayta nomlash`}
                      className="w-6 h-6 rounded-md text-slate-400 hover:bg-white hover:text-slate-700 text-[10px]"
                    >
                      <i className="fa-solid fa-pen"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(stage)}
                      aria-label={`${stage.name} ustunini o‘chirish`}
                      title={
                        stageCandidates.length > 0 ? 'Bo‘sh bo‘lmagan ustunni o‘chirib bo‘lmaydi' : 'Ustunni o‘chirish'
                      }
                      className="w-6 h-6 rounded-md text-slate-400 hover:bg-white hover:text-red-600 text-[10px]"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div className="space-y-3 flex-1 min-h-[80px]">
                  {stageCandidates.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-300 rounded-xl">
                      Nomzod yo‘q
                    </div>
                  )}
                  {stageCandidates.map((cand) => (
                    <article
                      key={cand.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_TYPE, cand.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${cand.fullName}: yuborgan ma’lumotlarini ko‘rish`}
                      onClick={() => setOpenCandidateId(cand.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) setOpenCandidateId(cand.id);
                      }}
                      className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <p className="font-bold text-slate-800 text-xs">{cand.fullName}</p>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded flex-shrink-0">
                          {cand.score}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <p>{cand.phone}</p>
                        {cand.email && <p className="truncate">{cand.email}</p>}
                      </div>
                      {cand.interviewDate && (
                        <p className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded-lg">
                          <i className="fa-solid fa-video mr-1"></i>
                          {cand.interviewDate}
                        </p>
                      )}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                        <span>
                          Ariza: {toDisplayDate(cand.appliedDate)}
                          {vacancy.questions.length > 0 && (
                            <span className="ml-2" title="Javob berilgan savollar">
                              <i className="fa-solid fa-paperclip mr-0.5"></i>
                              {answeredCount(cand)}/{vacancy.questions.length}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveCandidateBy(cand, -1);
                            }}
                            disabled={idx === 0}
                            aria-label={`${cand.fullName}ni oldingi ustunga o‘tkazish`}
                            className="w-6 h-6 rounded-md hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <i className="fa-solid fa-arrow-left"></i>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveCandidateBy(cand, 1);
                            }}
                            disabled={idx === stages.length - 1}
                            aria-label={`${cand.fullName}ni keyingi ustunga o‘tkazish`}
                            className="w-6 h-6 rounded-md hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <i className="fa-solid fa-arrow-right"></i>
                          </button>
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          {/* New column */}
          <div className="w-72 flex-shrink-0">
            {addingColumn ? (
              <div className="p-3 rounded-2xl border border-indigo-200 bg-white space-y-2">
                <input
                  autoFocus
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNewColumn();
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setAddingColumn(false);
                      setNewColumnName('');
                    }
                  }}
                  placeholder="Ustun nomi, masalan: Rahbar suhbati"
                  aria-label="Yangi ustun nomi"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveNewColumn}
                    className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                  >
                    Qo‘shish
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingColumn(false);
                      setNewColumnName('');
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg"
                  >
                    Bekor
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="w-full min-h-[120px] border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 rounded-2xl flex flex-col items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors space-y-1"
              >
                <i className="fa-solid fa-plus"></i>
                <span className="text-xs font-semibold">Ustun qo‘shish</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {openCandidate && (
        <CandidateDetailModal
          candidate={openCandidate}
          vacancy={vacancy}
          onClose={() => setOpenCandidateId(null)}
          onMoveCandidate={onMoveCandidate}
        />
      )}

      {showCloseConfirm && (
        <CloseVacancyConfirmModal
          vacancy={vacancy}
          onClose={() => setShowCloseConfirm(false)}
          onConfirm={() => onToggleStatus(vacancy.id)}
        />
      )}

      {showEditModal && (
        <EditVacancyModal
          vacancy={vacancy}
          branches={branches}
          departments={departments}
          employees={employees}
          vacancies={vacancies}
          onClose={() => setShowEditModal(false)}
          onSaveVacancy={onUpdateVacancy}
        />
      )}
    </div>
  );
};
