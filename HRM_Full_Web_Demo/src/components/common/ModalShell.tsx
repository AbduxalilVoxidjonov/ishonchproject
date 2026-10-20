import React, { useEffect, useId, useRef } from 'react';

interface ModalShellProps {
  title: string;
  icon: string; // Font Awesome class, e.g. 'fa-user-plus'
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  /** Near full-screen panel with larger heading; children get the full remaining height. */
  large?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared input styling for modal forms. */
export const inputCls =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all';

interface FieldProps {
  label: React.ReactNode;
  required?: boolean;
  error?: string | null;
  large?: boolean;
  children: React.ReactNode;
}

/** Label + control + optional inline validation error. */
export const Field: React.FC<FieldProps> = ({ label, required, error, large, children }) => (
  <div>
    <label className={`block font-semibold text-slate-600 uppercase ${large ? 'text-[13px] mb-1.5' : 'text-xs mb-1'}`}>
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {error && <p className={`${large ? 'text-sm' : 'text-xs'} text-red-600 mt-1`}>{error}</p>}
  </div>
);

export const ModalShell: React.FC<ModalShellProps> = ({
  title,
  icon,
  onClose,
  children,
  maxWidthClass = 'max-w-lg',
  large = false,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep latest onClose without re-binding listeners on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>('input, select, textarea');
    (firstField ?? panel)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Simple focus trap: wrap between first and last focusable elements
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-2xl ${maxWidthClass} w-full shadow-2xl border border-slate-200 focus:outline-none ${
          large ? 'p-6 h-[74vh] flex flex-col gap-5' : 'p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar'
        }`}
      >
        <div
          className={`flex justify-between items-center border-b border-slate-100 flex-shrink-0 ${large ? 'pb-4' : 'pb-3'}`}
        >
          <div className={`flex items-center ${large ? 'space-x-3' : 'space-x-2'}`}>
            <div
              className={`rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold ${
                large ? 'w-10 h-10' : 'w-8 h-8'
              }`}
            >
              <i className={`fa-solid ${icon} ${large ? 'text-base' : 'text-sm'}`}></i>
            </div>
            <h3 id={titleId} className={`font-bold text-slate-800 ${large ? 'text-xl' : 'text-lg'}`}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="text-slate-400 hover:text-slate-600 w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        {large ? <div className="flex-1 min-h-0">{children}</div> : children}
      </div>
    </div>
  );
};
