import React, { useState, useMemo } from 'react';
import { HRMModuleData } from '../../data/allModulesData';
import { Employee } from '../../types/hrm';

interface GenericModuleViewProps {
  moduleData: HRMModuleData;
  onOpenAddModal: () => void;
  onShowToast: (message: string) => void;
  /** Finds a real employee by a name or EMP code shown in a table cell. */
  resolveEmployee?: (nameOrCode: string) => Employee | undefined;
  onOpenEmployee?: (employee: Employee) => void;
  /** Enhanced pages render their own KPI cards above the table. */
  showKpis?: boolean;
}

const PAGE_SIZE = 10;

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Visible text of a cell (tags stripped, entities decoded). */
const cellText = (cellHtml: string) =>
  decodeEntities(cellHtml.replace(/<div class="pavatar">[^<]*<\/div>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

const STATUS_HEADER = /^(status|holat|result|natija)$/i;

const badgeTone = (text: string, cellHtml = '') => {
  const t = text.toLowerCase();
  if (cellHtml.includes('danger') || /rad etilgan|failed|arxiv|lost|critical|yo‘q/.test(t)) return 'bg-red-50 text-red-700 border-red-200';
  if (cellHtml.includes('warn') || /kutil|jarayon|sinov|pending|kechikish|review|qoralama|tezkor|suhbat/.test(t))
    return 'bg-amber-50 text-amber-700 border-amber-200';
  if (cellHtml.includes('info') || /ta'til|ta’til|remote|to‘langan|yopilgan|tugallangan/.test(t)) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

export const GenericModuleView: React.FC<GenericModuleViewProps> = ({
  moduleData,
  onOpenAddModal,
  onShowToast,
  resolveEmployee,
  onOpenEmployee,
  showKpis = true,
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [filterOption, setFilterOption] = useState('all');
  const [page, setPage] = useState(1);

  const headers = moduleData.headers ?? [];
  const rows = moduleData.rows ?? [];

  // Status filter works on the status column (or the last named column when there is none)
  const statusCol = useMemo(() => {
    const idx = headers.findIndex((h) => STATUS_HEADER.test(h.trim()));
    if (idx >= 0) return idx;
    for (let i = headers.length - 1; i >= 0; i--) if (headers[i].trim()) return i;
    return -1;
  }, [headers]);

  const statusOptions = useMemo(() => {
    if (statusCol < 0 || !STATUS_HEADER.test(headers[statusCol]?.trim() ?? '')) return [];
    return Array.from(new Set(rows.map((r) => cellText(r[statusCol] ?? '')).filter(Boolean)));
  }, [rows, headers, statusCol]);

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.map(cellText).join(' ').toLowerCase().includes(q)) return false;
      if (filterOption !== 'all' && cellText(row[statusCol] ?? '') !== filterOption) return false;
      return true;
    });
  }, [rows, tableSearch, filterOption, statusCol]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Export to CSV (UTF-8 BOM so Excel shows Uzbek letters correctly)
  const handleExportCSV = () => {
    if (!headers.length) {
      onShowToast('Bu bo‘limda eksport qilinadigan jadval yo‘q');
      return;
    }
    const csvCell = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const namedCols = headers.map((h, i) => (h.trim() ? i : -1)).filter((i) => i >= 0);
    const lines = [
      namedCols.map((i) => csvCell(headers[i])).join(','),
      ...filteredRows.map((row) => namedCols.map((i) => csvCell(cellText(row[i] ?? ''))).join(',')),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleData.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onShowToast(`"${moduleData.title}" ma’lumotlari CSV (Excel) formatda yuklab olindi!`);
  };

  // The employee a row is about: the avatar cell first, then any cell holding a known name or EMP code
  const findRowEmployee = (rowCells: string[]): Employee | undefined => {
    if (!resolveEmployee) return undefined;
    const peopleCell = rowCells.find((c) => c.includes('class="people"'));
    if (peopleCell) {
      const name = peopleCell.match(/<b>([^<]+)<\/b>/)?.[1];
      const found = name ? resolveEmployee(decodeEntities(name)) : undefined;
      if (found) return found;
    }
    for (const c of rowCells) {
      if (c.includes('<button')) continue;
      const found = resolveEmployee(cellText(c));
      if (found) return found;
    }
    return undefined;
  };

  const renderCellContent = (cellHtml: string, colIndex: number, rowCells: string[]) => {
    // Person avatar block
    if (cellHtml.includes('class="people"') || cellHtml.includes('class="pavatar"')) {
      const avatar = cellHtml.match(/<div class="pavatar">([^<]+)<\/div>/)?.[1] ?? 'HR';
      const name = decodeEntities(cellHtml.match(/<b>([^<]+)<\/b>/)?.[1] ?? '');
      const sub = decodeEntities(cellHtml.match(/<\/b><div>([^<]+)<\/div>/)?.[1] ?? '');
      const employee = findRowEmployee(rowCells);

      const content = (
        <>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs flex items-center justify-center shadow-xs flex-shrink-0 group-hover:scale-105 transition-transform">
            {decodeEntities(avatar)}
          </div>
          <div className="text-left">
            <p className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors flex items-center space-x-1.5">
              <span>{name}</span>
              {employee && (
                <i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-slate-300 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></i>
              )}
            </p>
            {sub && <p className="text-xs text-slate-500 font-mono">{sub}</p>}
          </div>
        </>
      );

      return employee && onOpenEmployee ? (
        <button
          type="button"
          onClick={() => onOpenEmployee(employee)}
          className="flex items-center space-x-3 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title={`${name} profilini ochish`}
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center space-x-3">{content}</div>
      );
    }

    // Action button: opens the row's employee profile, otherwise just confirms the action
    if (cellHtml.includes('<button')) {
      const text = decodeEntities(cellHtml.match(/>([^<]+)<\/button>/)?.[1]?.trim() ?? 'Ko‘rish');
      const toastText = decodeEntities(cellHtml.match(/data-toast="([^"]*)"/)?.[1] ?? `"${text}" amali bajarildi`);
      const employee = findRowEmployee(rowCells);

      return (
        <button
          type="button"
          onClick={() => {
            if (employee && onOpenEmployee) onOpenEmployee(employee);
            else onShowToast(toastText);
          }}
          className="px-3 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-semibold rounded-lg transition-colors border border-indigo-100 flex items-center space-x-1"
        >
          <span>{text}</span>
          <i className="fa-solid fa-chevron-right text-[10px]"></i>
        </button>
      );
    }

    const text = cellText(cellHtml);

    // Badge markup, or plain text in the status column
    if (cellHtml.includes('class="badge') || (colIndex === statusCol && STATUS_HEADER.test(headers[colIndex]?.trim() ?? '') && text && text !== '—')) {
      return (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${badgeTone(text, cellHtml)}`}>
          {text}
        </span>
      );
    }

    const isBold = cellHtml.includes('<b>') || cellHtml.includes('<strong');
    return <span className={isBold ? 'font-bold text-slate-800' : 'text-slate-700'}>{text}</span>;
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header and Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="text-xs font-bold text-indigo-600 mb-1 flex items-center space-x-1.5 uppercase tracking-wider">
            <i className="fa-solid fa-folder-tree text-[11px]"></i>
            <span>{moduleData.crumb || `HRM / ${moduleData.title}`}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{moduleData.h1 || moduleData.title}</h1>
          {moduleData.sub && <p className="text-xs text-slate-500 mt-1">{moduleData.sub}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={handleExportCSV}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs border border-slate-200 transition-all flex items-center space-x-1.5 shadow-2xs"
          >
            <i className="fa-solid fa-file-excel text-emerald-600 text-sm"></i>
            <span>Excel eksport</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-xs transition-all flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-plus text-xs"></i>
            <span>Yangi qo‘shish</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (Up to 5 KPI Cards exactly matching original platform) */}
      {showKpis && moduleData.kpis && moduleData.kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {moduleData.kpis.map((kpi, index) => {
            const trend = kpi.trend.toLowerCase();
            const isGood = kpi.trend.includes('+') || trend.includes('faol') || kpi.trend.includes('%');
            const isWarn = trend.includes('kutil') || trend.includes('ochiq') || trend.includes('sinov') || trend.includes('tasdiqlash');

            return (
              <div
                key={index}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">{kpi.lbl}</span>
                  <div className="text-2xl font-extrabold text-slate-800 mt-1">{kpi.num}</div>
                </div>
                {kpi.trend && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span
                      className={`font-semibold text-[11px] flex items-center ${
                        isWarn ? 'text-amber-600' : isGood ? 'text-emerald-600' : 'text-indigo-600'
                      }`}
                    >
                      {kpi.trend}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table Card Container (modules like calendar / org chart have no table) */}
      {headers.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Table Search & Filter Toolbar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <i className="fa-solid fa-magnifying-glass text-xs"></i>
              </span>
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Jadval bo‘yicha qidirish..."
                aria-label="Jadval bo‘yicha qidirish"
                className="pl-8 pr-4 py-2 w-full bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
              />
            </div>

            {statusOptions.length > 1 && (
              <div className="flex items-center space-x-2 justify-end">
                <select
                  value={filterOption}
                  onChange={(e) => {
                    setFilterOption(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Holat bo‘yicha filtr"
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Barcha holatlar</option>
                  {statusOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {headers.map((h, i) => (
                    <th key={i} className="py-3.5 px-5">
                      {h || <span className="sr-only">Amallar</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={headers.length} className="text-center py-12 text-slate-400 text-sm">
                      <i className="fa-regular fa-folder-open text-3xl mb-2 block"></i>
                      Mos keluvchi yozuvlar topilmadi.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, rIndex) => (
                    <tr key={(currentPage - 1) * PAGE_SIZE + rIndex} className="hover:bg-slate-50/80 transition-colors">
                      {row.map((cellHtml, cIndex) => (
                        <td key={cIndex} className="py-3.5 px-5">
                          {renderCellContent(cellHtml, cIndex, row)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer pagination */}
          <div className="p-3.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Jami: <strong className="text-slate-700">{filteredRows.length}</strong> ta yozuv
            </span>
            {pageCount > 1 && (
              <nav className="flex items-center space-x-1" aria-label="Sahifalar">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Oldingi sahifa"
                >
                  ←
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setPage(n)}
                    aria-current={n === currentPage ? 'page' : undefined}
                    className={`w-6 h-6 rounded flex items-center justify-center text-xs ${
                      n === currentPage ? 'bg-indigo-600 text-white font-bold shadow-2xs' : 'hover:bg-slate-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent"
                  aria-label="Keyingi sahifa"
                >
                  →
                </button>
              </nav>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
          <i className="fa-regular fa-calendar text-3xl mb-2 block"></i>
          Bu bo‘lim uchun jadval ko‘rinishi mavjud emas.
        </div>
      )}
    </div>
  );
};
