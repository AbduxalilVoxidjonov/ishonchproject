import React, { useState } from 'react';
import { HRDocument } from '../types/hrm';
import { toDisplayDate } from '../utils/dates';

interface DocumentsPageProps {
  documents: HRDocument[];
  onShowToast: (msg: string) => void;
}

const DOC_STATUS: Record<HRDocument['status'], { label: string; cls: string }> = {
  signed: { label: 'Elektron raqamli imzo (ERI) bilan tasdiqlangan', cls: 'text-emerald-600' },
  pending: { label: 'Imzo kutilmoqda', cls: 'text-amber-600' },
  archived: { label: 'Arxivlangan', cls: 'text-slate-500' },
};

export const DocumentsPage: React.FC<DocumentsPageProps> = ({ documents, onShowToast }) => {
  const [subTab, setSubTab] = useState<'all' | 'order' | 'contract' | 'request'>('all');

  const filteredDocs = documents.filter((doc) => {
    if (subTab === 'all') return true;
    return doc.type === subTab;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Elektron hujjatlar va Buyruqlar</h3>
            <p className="text-xs text-slate-500">
              Mehnat shartnomalari, kadrlar bo‘yicha ichki buyruqlar (K-seriya), arizalar va arxiv hujjatlari.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setSubTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'all'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Barchasi ({documents.length})
              </button>
              <button
                onClick={() => setSubTab('order')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'order'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Buyruqlar ({documents.filter((d) => d.type === 'order').length})
              </button>
              <button
                onClick={() => setSubTab('contract')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'contract'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shartnomalar ({documents.filter((d) => d.type === 'contract').length})
              </button>
              <button
                onClick={() => setSubTab('request')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  subTab === 'request'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Arizalar ({documents.filter((d) => d.type === 'request').length})
              </button>
            </div>

            <button
              onClick={() => onShowToast('Yangi kadrlar buyrug‘i generatori ochildi')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-all flex items-center space-x-1.5"
            >
              <i className="fa-solid fa-file-circle-plus text-xs"></i>
              <span>Buyruq yaratish</span>
            </button>
          </div>
        </div>

        {/* Documents List matching hrm_platform_update.html */}
        <div className="space-y-3 pt-2">
          {filteredDocs.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">
              <i className="fa-regular fa-folder-open text-3xl mb-2 block"></i>
              Ushbu toifada hujjatlar mavjud emas.
            </div>
          )}
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                  <i className={doc.type === 'contract' ? 'fa-solid fa-file-contract' : 'fa-solid fa-file-lines'}></i>
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">
                    {doc.title}
                    {doc.employeeName && <span className="font-medium text-slate-500"> • {doc.employeeName}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Hujjat raqami: <span className="font-semibold text-slate-700">{doc.number}</span> • Sana:{' '}
                    {toDisplayDate(doc.createdDate)} •{' '}
                    <span className={`${DOC_STATUS[doc.status].cls} font-medium`}>{DOC_STATUS[doc.status].label}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                <span className="text-xs text-slate-400 font-mono hidden md:inline">{doc.fileSize}</span>
                <button
                  onClick={() => onShowToast(`"${doc.title}" hujjati yuklab olinmoqda (PDF)`)}
                  className="bg-slate-100 hover:bg-slate-200 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1"
                >
                  <i className="fa-solid fa-download text-xs"></i>
                  <span>Yuklab olish</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
