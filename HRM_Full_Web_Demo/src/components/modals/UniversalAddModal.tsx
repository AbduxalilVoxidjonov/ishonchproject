import React, { useState } from 'react';
import { ModalShell, Field } from '../common/ModalShell';

interface UniversalAddModalProps {
  onClose: () => void;
  moduleTitle: string;
  headers: string[];
  onAddRow: (cells: string[]) => void;
}

const inputCls =
  'w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all';

const ACTION_CELL = '<button class="btn">Ko‘rish</button>';

/** Cells are rendered as HTML by the module table, so user text must be escaped. */
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const UniversalAddModal: React.FC<UniversalAddModalProps> = ({ onClose, moduleTitle, headers, onAddRow }) => {
  // Keyed by column index: header texts are not guaranteed to be unique
  const [values, setValues] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  const isActionColumn = (h: string) => h.trim() === '';
  const hasFields = headers.some((h) => !isActionColumn(h));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasFields) return;

    const nextErrors: Record<number, string> = {};
    headers.forEach((h, i) => {
      if (!isActionColumn(h) && !(values[i] ?? '').trim()) nextErrors[i] = 'Qiymat kiriting.';
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const cells = headers.map((h, i) => (isActionColumn(h) ? ACTION_CELL : escapeHtml((values[i] ?? '').trim())));
    onAddRow(cells);
    onClose();
  };

  return (
    <ModalShell title={`Yangi yozuv: ${moduleTitle}`} icon="fa-plus" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {!hasFields && (
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <i className="fa-solid fa-circle-info mr-1 text-indigo-500"></i>
            Bu bo‘limga jadval yozuvi qo‘shib bo‘lmaydi
          </p>
        )}

        {headers.map((header, i) =>
          isActionColumn(header) ? null : (
            <Field key={i} label={header} required error={errors[i]}>
              <input
                type="text"
                value={values[i] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                placeholder={`${header} qiymatini kiriting...`}
                className={inputCls}
              />
            </Field>
          )
        )}

        <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={!hasFields}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-check"></i>
            <span>Saqlash</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
