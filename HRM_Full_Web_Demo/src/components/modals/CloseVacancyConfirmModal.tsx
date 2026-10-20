import React, { useEffect, useRef } from 'react';
import { Vacancy } from '../../types/hrm';

interface CloseVacancyConfirmModalProps {
  vacancy: Vacancy;
  onClose: () => void;
  onConfirm: () => void;
}

export const CloseVacancyConfirmModal: React.FC<CloseVacancyConfirmModalProps> = ({
  vacancy,
  onClose,
  onConfirm,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const isReopen = vacancy.status === 'closed';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in slide-in-from-top-2 duration-150"
      >
        <div className="flex items-start space-x-3.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 border ${
              isReopen
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}
          >
            <i className={`fa-solid ${isReopen ? 'fa-rotate-left' : 'fa-triangle-exclamation'}`}></i>
          </div>
          <div>
            <h3 id="confirm-modal-title" className="text-base font-bold text-slate-800">
              {isReopen ? 'Vakansiyani qayta ochish' : 'Vakansiyani vaqtincha yopish'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isReopen
                ? 'Ushbu amal tanlangan vakansiyani qayta faol holatga keltiradi va nomzodlar qabulini tiklaydi.'
                : 'Ushbu amal tanlangan vakansiya bo‘yicha yangi arizalar qabulini to‘xtatadi.'}
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
          <p className="text-slate-800 font-bold text-sm">
            {isReopen
              ? 'Rostdan ham ushbu vakansiyani qayta ochmoqchimisiz?'
              : 'Rostdan ham ushbu vakansiyani yopmoqchimisiz?'}
          </p>
          <div className="text-slate-600 pt-1 space-y-0.5">
            <p>• <strong>Lavozim:</strong> {vacancy.title}</p>
            <p>• <strong>Bo‘lim:</strong> {vacancy.department} ({vacancy.location})</p>
            <p>• <strong>Ish turi:</strong> {vacancy.type}</p>
          </div>
          <p
            className={`font-medium pt-1 text-[11px] ${
              isReopen ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {isReopen
              ? 'Eslatma: Vakansiya qayta "Faol qabul" holatiga o‘tadi va nomzodlar uchun arizalar qabuli boshlanadi.'
              : 'Eslatma: Mavjud barcha nomzodlar va suhbatlar tarixi saqlanib qoladi. Istalgan vaqtda vakansiyani qayta faollashtirishingiz mumkin.'}
          </p>
        </div>

        <div className="flex justify-end items-center space-x-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 text-white ${
              isReopen
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <i className={`fa-solid ${isReopen ? 'fa-rotate-left' : 'fa-pause'} text-[10px]`}></i>
            <span>{isReopen ? 'Ha, qayta ochish' : 'Ha, yopish'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
