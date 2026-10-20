import React, { useMemo, useState } from 'react';
import { ApplicationQuestion, Branch, Department, Employee, Vacancy } from '../../types/hrm';
import { ModalShell, Field } from '../common/ModalShell';
import { localDateISO, uid } from '../../utils/dates';

interface AddVacancyModalProps {
  onClose: () => void;
  branches: Branch[];
  departments: Department[];
  /** Used to suggest position names that already exist in the chosen department. */
  employees: Employee[];
  vacancies: Vacancy[];
  onAddVacancy: (v: Omit<Vacancy, 'id' | 'stages'>) => void;
}

type Errors = Partial<Record<'branchId' | 'departmentId' | 'title' | 'deadline' | 'tags' | 'questions', string>>;

const ANSWER_TYPES: { value: ApplicationQuestion['answerType']; label: string; icon: string }[] = [
  { value: 'text', label: 'Matn', icon: 'fa-align-left' },
  { value: 'file', label: 'Fayl', icon: 'fa-file-lines' },
  { value: 'image', label: 'Rasm', icon: 'fa-image' },
];

// One-click presets for the documents most vacancies ask for
const QUESTION_PRESETS: Omit<ApplicationQuestion, 'id'>[] = [
  { label: 'Rezyume (CV)', answerType: 'file', required: true },
  { label: 'Pasport nusxasi', answerType: 'image', required: true },
  { label: 'Diplom nusxasi', answerType: 'image', required: false },
  { label: 'Rasm 3×4', answerType: 'image', required: false },
  { label: 'Motivatsion xat', answerType: 'text', required: false },
  { label: 'Portfolio havolasi', answerType: 'text', required: false },
];

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, "'")
    .replace(/\s+/g, ' ');

const in30Days = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return localDateISO(d);
};

// Larger controls: this modal is shown near full-screen
const bigInputCls =
  'w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all';

/** Skills are separated by commas or new lines. */
const parseSkills = (text: string) =>
  text
    .split(/[,\n]/)
    .map((x) => x.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

export const AddVacancyModal: React.FC<AddVacancyModalProps> = ({
  onClose,
  branches,
  departments,
  employees,
  vacancies,
  onAddVacancy,
}) => {
  const today = localDateISO();
  const firstDeptOf = (branchId: string) => departments.find((d) => d.branchId === branchId)?.id ?? '';

  // Branches that have at least one department come first in the default choice
  const initialBranchId = branches.find((b) => firstDeptOf(b.id))?.id ?? branches[0]?.id ?? '';
  const [branchId, setBranchId] = useState(initialBranchId);
  const [departmentId, setDepartmentId] = useState(firstDeptOf(initialBranchId));
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Vacancy['type']>('Full-time');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [salaryRange, setSalaryRange] = useState('');
  const [deadline, setDeadline] = useState(in30Days());
  const [skillsText, setSkillsText] = useState('');
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [invalidQuestionIds, setInvalidQuestionIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  const branch = branches.find((b) => b.id === branchId);
  const branchDepartments = departments.filter((d) => d.branchId === branchId);
  const department = branchDepartments.find((d) => d.id === departmentId);
  const skills = parseSkills(skillsText);

  // Position names already used in this department (staff and earlier vacancies)
  const positionSuggestions = useMemo(() => {
    const names = [
      ...employees.filter((e) => e.departmentId === departmentId && e.status !== 'terminated').map((e) => e.position),
      ...vacancies.filter((v) => v.departmentId === departmentId).map((v) => v.title),
    ];
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [employees, vacancies, departmentId]);

  const addQuestion = (preset: Omit<ApplicationQuestion, 'id'> = { label: '', answerType: 'text', required: true }) =>
    setQuestions((prev) => [...prev, { ...preset, id: uid('q') }]);
  const updateQuestion = (id: string, patch: Partial<ApplicationQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const removeQuestion = (id: string) => setQuestions((prev) => prev.filter((q) => q.id !== id));
  const hasQuestion = (label: string) => questions.some((q) => normalize(q.label) === normalize(label));

  const handleBranchChange = (id: string) => {
    setBranchId(id);
    setDepartmentId(firstDeptOf(id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const t = title.trim().replace(/\s+/g, ' ');
    if (!branch) next.branchId = 'Filialni tanlang.';
    if (!department) next.departmentId = 'Bo‘limni tanlang.';
    if (!t) next.title = 'Lavozim nomini kiriting.';
    if (!deadline || deadline < today) next.deadline = 'Muddat bugungi sanadan oldin bo‘lishi mumkin emas.';
    if (skills.length === 0) next.tags = 'Kamida bitta ko‘nikma yoki talabni kiriting.';
    // Every question needs a name, and names must not repeat
    const seen = new Set<string>();
    const badQuestions = questions
      .filter((q) => {
        const key = normalize(q.label);
        const bad = !key || seen.has(key);
        seen.add(key);
        return bad;
      })
      .map((q) => q.id);
    setInvalidQuestionIds(badQuestions);
    if (badQuestions.length > 0) next.questions = 'Savol nomi bo‘sh yoki takrorlangan bo‘lmasligi kerak.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !branch || !department) return;

    onAddVacancy({
      title: t,
      branchId: branch.id,
      departmentId: department.id,
      department: department.name,
      location: branch.name,
      type,
      experienceLevel: experienceLevel.trim() || 'Talab qilinmaydi',
      salaryRange: salaryRange.trim() || 'Kelishiladi',
      deadline,
      status: 'open',
      tags: skills,
      questions: questions.map((q) => ({ ...q, label: q.label.trim().replace(/\s+/g, ' ') })),
    });
    onClose();
  };

  return (
    <ModalShell
      title="Yangi vakansiya ochish"
      icon="fa-briefcase"
      onClose={onClose}
      maxWidthClass="max-w-[1408px]"
      large
    >
      <form onSubmit={handleSubmit} className="h-full flex flex-col gap-5" noValidate>
        {/* Left: structure, position and conditions. Right: a tall column for the skills text */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-1 gap-8 overflow-y-auto lg:overflow-visible custom-scrollbar">
          <div className="space-y-6 lg:overflow-y-auto lg:pr-2 custom-scrollbar">
            {/* 1. Place in the organization structure */}
            <section className="space-y-3">
              <h4 className="text-[13px] font-bold text-indigo-600 uppercase tracking-wider flex items-center">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center mr-2">
                  1
                </span>
                Tashkiliy tuzilma
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field large label="Filial" required error={errors.branchId}>
                  <select value={branchId} onChange={(e) => handleBranchChange(e.target.value)} className={bigInputCls}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field large label="Bo‘lim" required error={errors.departmentId}>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    disabled={branchDepartments.length === 0}
                    className={`${bigInputCls} disabled:opacity-60`}
                  >
                    {branchDepartments.length === 0 && <option value="">Bo‘lim yo‘q</option>}
                    {branchDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {branch && branchDepartments.length === 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <i className="fa-solid fa-triangle-exclamation mr-1"></i>“{branch.name}” filialida hali bo‘lim yo‘q.
                  Avval Tashkiliy tuzilmada bo‘lim yarating.
                </p>
              )}
            </section>

            {/* 2. Position inside the chosen department */}
            <section className="space-y-3">
              <h4 className="text-[13px] font-bold text-indigo-600 uppercase tracking-wider flex items-center">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center mr-2">
                  2
                </span>
                Lavozim
              </h4>
              <Field large label="Lavozim nomi" required error={errors.title}>
                <input
                  type="text"
                  list="vacancy-position-options"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!department}
                  placeholder={department ? 'Masalan: Senior Backend Developer' : 'Avval bo‘limni tanlang'}
                  className={`${bigInputCls} disabled:opacity-60`}
                />
                <datalist id="vacancy-position-options">
                  {positionSuggestions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
              {department && (
                <p className="text-sm text-slate-500 flex items-center flex-wrap gap-1.5">
                  <i className="fa-solid fa-sitemap text-slate-400 mr-1"></i>
                  <span>{branch?.name}</span>
                  <i className="fa-solid fa-chevron-right text-[8px] text-slate-300"></i>
                  <span>{department.name}</span>
                  <i className="fa-solid fa-chevron-right text-[8px] text-slate-300"></i>
                  <strong className="text-slate-700">{title.trim() || 'Lavozim nomi'}</strong>
                </p>
              )}
            </section>

            {/* 3. Conditions */}
            <section className="space-y-3">
              <h4 className="text-[13px] font-bold text-indigo-600 uppercase tracking-wider flex items-center">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center mr-2">
                  3
                </span>
                Shartlar
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field large label="Ish tartibi">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as Vacancy['type'])}
                    className={bigInputCls}
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </Field>
                <Field large label="Ariza muddati" error={errors.deadline}>
                  <input
                    type="date"
                    value={deadline}
                    min={today}
                    onChange={(e) => setDeadline(e.target.value)}
                    className={bigInputCls}
                  />
                </Field>
                <Field large label="Maosh diapazoni">
                  <input
                    type="text"
                    value={salaryRange}
                    onChange={(e) => setSalaryRange(e.target.value)}
                    placeholder="15,000,000 - 25,000,000 UZS"
                    className={bigInputCls}
                  />
                </Field>
                <Field large label="Talab qilingan tajriba">
                  <input
                    type="text"
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    placeholder="Masalan: 3+ yil"
                    className={bigInputCls}
                  />
                </Field>
              </div>
            </section>

            {/* 4. What the candidate must submit: each item is answered as text, a file or an image */}
            <section className="space-y-3">
              <h4 className="text-[13px] font-bold text-indigo-600 uppercase tracking-wider flex items-center">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center mr-2">
                  4
                </span>
                Ariza savollari va hujjatlar
              </h4>
              <p className="text-sm text-slate-500">
                Nomzod ariza topshirganda nimalarni yuborishi kerak. Har bir savolga javob matn, fayl yoki rasm
                ko‘rinishida olinadi.
              </p>

              {questions.length === 0 && (
                <p className="text-sm text-slate-400 border border-dashed border-slate-300 rounded-xl px-4 py-3">
                  Hali savol yoki hujjat qo‘shilmagan.
                </p>
              )}

              {questions.map((q, i) => (
                <div
                  key={q.id}
                  className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-xl border ${
                    invalidQuestionIds.includes(q.id)
                      ? 'border-red-300 bg-red-50/50'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <span className="w-6 text-center text-xs font-bold text-slate-400 flex-shrink-0">{i + 1}.</span>
                  <input
                    type="text"
                    value={q.label}
                    onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                    placeholder="Savol yoki hujjat nomi, masalan: Rezyume (CV)"
                    aria-label={`${i + 1}-savol nomi`}
                    className={`${bigInputCls} flex-1 min-w-[180px]`}
                  />
                  <select
                    value={q.answerType}
                    onChange={(e) =>
                      updateQuestion(q.id, { answerType: e.target.value as ApplicationQuestion['answerType'] })
                    }
                    aria-label={`${i + 1}-savol javob turi`}
                    className="w-28 flex-shrink-0 px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ANSWER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-1 flex-shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    Majburiy
                  </label>
                  <button
                    type="button"
                    onClick={() => removeQuestion(q.id)}
                    aria-label={`${i + 1}-savolni o‘chirish`}
                    className="w-9 h-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white flex-shrink-0"
                  >
                    <i className="fa-solid fa-trash text-xs"></i>
                  </button>
                </div>
              ))}
              {errors.questions && <p className="text-sm text-red-600">{errors.questions}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => addQuestion()}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg"
                >
                  <i className="fa-solid fa-plus mr-1"></i>Savol qo‘shish
                </button>
                <span className="text-xs text-slate-400 ml-1">Tez qo‘shish:</span>
                {QUESTION_PRESETS.map((p) => {
                  const icon = ANSWER_TYPES.find((t) => t.value === p.answerType)?.icon;
                  const added = hasQuestion(p.label);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => addQuestion(p)}
                      disabled={added}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 text-xs rounded-lg disabled:opacity-40 disabled:hover:border-slate-200"
                    >
                      <i className={`fa-solid ${icon} mr-1 text-slate-400`}></i>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* 5. Skills: long free text, one skill per comma or line */}
          <section className="flex flex-col gap-3 min-h-0 lg:border-l lg:border-slate-100 lg:pl-8">
            <h4 className="text-[13px] font-bold text-indigo-600 uppercase tracking-wider flex items-center">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center mr-2">
                5
              </span>
              <label htmlFor="vacancy-skills">
                Talab qilinadigan ko‘nikmalar <span className="text-red-500">*</span>
              </label>
            </h4>
            <p className="text-sm text-slate-500">
              Har bir ko‘nikma yoki talabni vergul bilan yoki yangi qatordan yozing.
            </p>
            <textarea
              id="vacancy-skills"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder={
                'Masalan:\nPython va Django bilan 3 yildan ortiq tajriba\nPostgreSQL, Docker, REST API\nJamoada ishlash va kod review madaniyati\nIngliz tili B2 darajada'
              }
              className={`${bigInputCls} flex-1 min-h-[336px] lg:min-h-0 resize-none leading-relaxed`}
            />
            {errors.tags && <p className="text-sm text-red-600">{errors.tags}</p>}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar flex-shrink-0">
                <span className="text-sm text-slate-500 mr-1">{skills.length} ta ko‘nikma:</span>
                {skills.map((s, i) => (
                  <span
                    key={i}
                    className="text-sm bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg break-words max-w-full"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={!department}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-xs"
          >
            Vakansiyani e’lon qilish
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
