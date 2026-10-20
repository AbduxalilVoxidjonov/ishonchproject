import React, { useEffect, useState } from 'react';
import { ApplicationQuestion, Candidate, CandidateAnswer, Vacancy } from '../../types/hrm';
import { ModalShell } from '../common/ModalShell';
import { toDisplayDate } from '../../utils/dates';

interface CandidateDetailModalProps {
  candidate: Candidate;
  vacancy: Vacancy;
  onClose: () => void;
  onMoveCandidate: (candidateId: string, stageId: string) => void;
}

const TYPE_META: Record<ApplicationQuestion['answerType'], { label: string; icon: string }> = {
  text: { label: 'Matn', icon: 'fa-align-left' },
  file: { label: 'Fayl', icon: 'fa-file-lines' },
  image: { label: 'Rasm', icon: 'fa-image' },
};

/** "github.com/x" or "https://..." → clickable URL; anything else stays plain text. */
const asLink = (text: string): string | null => {
  const t = text.trim();
  if (/\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+\/\S*$/.test(t)) return `https://${t}`;
  return null;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();

export const CandidateDetailModal: React.FC<CandidateDetailModalProps> = ({
  candidate,
  vacancy,
  onClose,
  onMoveCandidate,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Escape closes only the image preview, not the whole modal
  useEffect(() => {
    if (!previewUrl) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPreviewUrl(null);
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [previewUrl]);

  const stage = vacancy.stages.find((s) => s.id === candidate.stageId);
  const answerFor = (questionId: string): CandidateAnswer | undefined =>
    candidate.answers.find((a) => a.questionId === questionId);
  const answeredCount = vacancy.questions.filter((q) => answerFor(q.id)).length;

  const renderAnswer = (q: ApplicationQuestion) => {
    const a = answerFor(q.id);
    if (!a || (!a.text && !a.fileName)) {
      return (
        <p className={`text-xs italic ${q.required ? 'text-red-500' : 'text-slate-400'}`}>
          Javob berilmagan{q.required ? ' (majburiy)' : ''}
        </p>
      );
    }
    if (q.answerType === 'text') {
      const link = asLink(a.text ?? '');
      return link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-600 hover:underline break-all"
        >
          {a.text} <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
        </a>
      ) : (
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{a.text}</p>
      );
    }
    if (q.answerType === 'image' && a.fileUrl) {
      return (
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setPreviewUrl(a.fileUrl ?? null)}
            className="w-40 h-28 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 flex-shrink-0 hover:ring-2 hover:ring-indigo-400"
            aria-label={`${q.label}: kattalashtirib ko‘rish`}
          >
            <img src={a.fileUrl} alt={q.label} className="w-full h-full object-cover" />
          </button>
          <div className="text-xs text-slate-500 space-y-1 min-w-0">
            <p className="font-semibold text-slate-700 break-all">{a.fileName}</p>
            {a.fileSize && <p>{a.fileSize}</p>}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPreviewUrl(a.fileUrl ?? null)}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Kattalashtirish
              </button>
              <a href={a.fileUrl} download={a.fileName} className="text-indigo-600 font-semibold hover:underline">
                Yuklab olish
              </a>
            </div>
          </div>
        </div>
      );
    }
    // File (or an image without viewable content)
    return (
      <div className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-lg">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
            <i className={`fa-solid ${a.fileName?.toLowerCase().endsWith('.pdf') ? 'fa-file-pdf' : 'fa-file'}`}></i>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-700 truncate">{a.fileName}</span>
            {a.fileSize && <span className="block text-[11px] text-slate-400">{a.fileSize}</span>}
          </span>
        </span>
        {a.fileUrl ? (
          <a
            href={a.fileUrl}
            download={a.fileName}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg flex-shrink-0"
          >
            Yuklab olish
          </a>
        ) : (
          <span className="text-[11px] text-slate-400 flex-shrink-0" title="Demo ma’lumot: faylning o‘zi yuklanmagan">
            Demo fayl
          </span>
        )}
      </div>
    );
  };

  return (
    <ModalShell title="Nomzod ma’lumotlari" icon="fa-id-card" onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="space-y-5">
        {/* Identity */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-lg flex items-center justify-center">
              {initialsOf(candidate.fullName)}
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{candidate.fullName}</h2>
              <p className="text-xs text-slate-500">
                {vacancy.title} • <span className="font-mono">{vacancy.id}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              Baho: {candidate.score}%
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                stage?.outcome === 'hired'
                  ? 'bg-emerald-50 text-emerald-700'
                  : stage?.outcome === 'rejected'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              {stage?.name ?? '—'}
            </span>
          </div>
        </div>

        {/* Contacts and dates */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl min-w-0">
            <span className="text-slate-500 block">Telefon</span>
            <a
              href={`tel:${candidate.phone.replace(/[^\d+]/g, '')}`}
              className="font-semibold text-slate-800 hover:text-indigo-600"
            >
              {candidate.phone}
            </a>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl min-w-0">
            <span className="text-slate-500 block">Email</span>
            {candidate.email ? (
              <a
                href={`mailto:${candidate.email}`}
                className="font-semibold text-slate-800 hover:text-indigo-600 break-all"
              >
                {candidate.email}
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-500 block">Ariza sanasi</span>
            <span className="font-semibold text-slate-800">{toDisplayDate(candidate.appliedDate)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-500 block">Suhbat</span>
            <span className="font-semibold text-slate-800">{candidate.interviewDate ?? '—'}</span>
          </div>
        </div>

        {/* Submitted answers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Yuborgan ma’lumotlari</h3>
            {vacancy.questions.length > 0 && (
              <span className="text-xs text-slate-500">
                {answeredCount} / {vacancy.questions.length} ta javob
              </span>
            )}
          </div>
          {vacancy.questions.length === 0 && (
            <p className="text-sm text-slate-400 border border-dashed border-slate-300 rounded-xl px-4 py-3">
              Bu vakansiya uchun ariza savollari belgilanmagan.
            </p>
          )}
          {vacancy.questions.map((q, i) => (
            <div key={q.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold text-slate-700">
                  {i + 1}. {q.label}
                  {q.required && <span className="text-red-500 ml-0.5">*</span>}
                </p>
                <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full flex-shrink-0">
                  <i className={`fa-solid ${TYPE_META[q.answerType].icon} mr-1`}></i>
                  {TYPE_META[q.answerType].label}
                </span>
              </div>
              {renderAnswer(q)}
            </div>
          ))}
        </div>

        {/* Stage change */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            Bosqich:
            <select
              value={candidate.stageId}
              onChange={(e) => onMoveCandidate(candidate.id, e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {vacancy.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
          >
            Yopish
          </button>
        </div>
      </div>

      {/* Image preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-6 cursor-zoom-out"
          onMouseDown={(e) => {
            e.stopPropagation();
            setPreviewUrl(null);
          }}
          role="presentation"
        >
          <img src={previewUrl} alt="Hujjat" className="max-w-full max-h-full rounded-xl shadow-2xl bg-white" />
        </div>
      )}
    </ModalShell>
  );
};
