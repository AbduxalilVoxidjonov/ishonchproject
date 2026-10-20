import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HRMModuleData, navigationGroups } from '../../data/allModulesData';
import { Employee } from '../../types/hrm';

interface HeaderProps {
  currentModule: HRMModuleData;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  employees: Employee[];
  onOpenEmployee: (employee: Employee) => void;
  pendingLeavesCount: number;
  probationEndingCount: number;
  delayedTodayCount: number;
  onQuickNavigate: (modId: string) => void;
}

// Apostrophe variants in Uzbek Latin (o‘, g‘, ʼ) are treated as equal while searching
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, "'")
    .trim();

export const Header: React.FC<HeaderProps> = ({
  currentModule,
  searchQuery,
  onSearchChange,
  employees,
  onOpenEmployee,
  pendingLeavesCount,
  probationEndingCount,
  delayedTodayCount,
  onQuickNavigate,
}) => {
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notificationRef.current && !notificationRef.current.contains(target)) setShowNotificationMenu(false);
      if (searchRef.current && !searchRef.current.contains(target)) setSearchFocused(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchResults = useMemo(() => {
    const q = normalize(searchQuery);
    if (!q) return { people: [] as Employee[], modules: [] as { id: string; title: string; group: string }[] };
    const people = employees
      .filter((e) => [e.fullName, e.code, e.position, e.departmentName].some((f) => normalize(f).includes(q)))
      .slice(0, 6);
    const modules = navigationGroups
      .flatMap((g) => g.links.map((l) => ({ id: l.id, title: l.title, group: g.group })))
      .filter((m) => normalize(m.title).includes(q) || normalize(m.group).includes(q))
      .slice(0, 6);
    return { people, modules };
  }, [searchQuery, employees]);

  const showResults = searchFocused && searchQuery.trim().length > 0;
  const hasResults = searchResults.people.length > 0 || searchResults.modules.length > 0;

  const notifications = [
    {
      key: 'probation',
      show: probationEndingCount > 0,
      icon: 'fa-clock',
      tone: 'bg-red-100 text-red-600',
      title: 'Sinov muddati tugayapti',
      text: `${probationEndingCount} nafar xodim uchun 30 kun ichida yakuniy baholash`,
      target: 'probation',
    },
    {
      key: 'leaves',
      show: pendingLeavesCount > 0,
      icon: 'fa-calendar-day',
      tone: 'bg-amber-100 text-amber-600',
      title: 'Ta’til so‘rovlari',
      text: `${pendingLeavesCount} ta tasdiqlanmagan ariza mavjud`,
      target: 'leaves',
    },
    {
      key: 'attendance',
      show: delayedTodayCount > 0,
      icon: 'fa-fingerprint',
      tone: 'bg-emerald-100 text-emerald-600',
      title: 'Kechikishlar',
      text: `${delayedTodayCount} ta kechikish qayd etildi`,
      target: 'attendance',
    },
  ].filter((n) => n.show);

  return (
    <header className="h-16 bg-white border-b border-slate-200 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 shadow-xs z-20 sticky top-0 flex-shrink-0">
      {/* Current Module Title & Breadcrumb */}
      <div className="flex items-center space-x-3.5 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shadow-xs">
          <i className="fa-solid fa-layer-group"></i>
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-indigo-600 font-bold uppercase tracking-wider font-mono">
              {currentModule.crumb || 'HRM Enterprise'}
            </span>
          </div>
          <h1 className="text-base font-bold text-slate-800 leading-tight flex items-center space-x-2">
            <span>{currentModule.title || currentModule.h1}</span>
          </h1>
        </div>
      </div>

      {/* Global Search Bar (centered): employees and modules */}
      <div className="relative hidden md:block justify-self-center" ref={searchRef}>
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
          <i className="fa-solid fa-magnifying-glass"></i>
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setSearchFocused(true);
          }}
          onFocus={() => setSearchFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setSearchFocused(false);
            }
          }}
          placeholder="Xodim yoki bo‘lim qidirish..."
          aria-label="Global qidiruv"
          className="pl-10 pr-9 py-2.5 w-80 lg:w-[28rem] xl:w-[34rem] bg-slate-100 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            aria-label="Qidiruvni tozalash"
          >
            <i className="fa-solid fa-xmark text-xs"></i>
          </button>
        )}

        {showResults && (
          <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-96 overflow-y-auto custom-scrollbar">
            {!hasResults && <p className="px-4 py-3 text-xs text-slate-400">Hech narsa topilmadi.</p>}
            {searchResults.people.length > 0 && (
              <div>
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Xodimlar
                </p>
                {searchResults.people.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      onOpenEmployee(e);
                      onSearchChange('');
                      setSearchFocused(false);
                    }}
                    className="w-full px-4 py-2 flex items-center space-x-3 hover:bg-slate-50 text-left"
                  >
                    <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {e.initials}
                    </span>
                    <span>
                      <span className="block text-xs font-semibold text-slate-800">{e.fullName}</span>
                      <span className="block text-[11px] text-slate-500">
                        {e.position} • {e.code}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searchResults.modules.length > 0 && (
              <div className={searchResults.people.length > 0 ? 'border-t border-slate-100 mt-1 pt-1' : ''}>
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Bo‘limlar
                </p>
                {searchResults.modules.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onQuickNavigate(m.id);
                      onSearchChange('');
                      setSearchFocused(false);
                    }}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-50 text-left"
                  >
                    <span className="text-xs font-semibold text-slate-800">{m.title}</span>
                    <span className="text-[10px] text-slate-400">{m.group}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end">
        {/* Notifications Dropdown */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotificationMenu(!showNotificationMenu)}
            className="relative p-2.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-all"
            title="Bildirishnomalar"
            aria-label={`Bildirishnomalar (${notifications.length} ta)`}
            aria-expanded={showNotificationMenu}
          >
            <i className="fa-regular fa-bell text-lg"></i>
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-white"></span>
              </span>
            )}
          </button>

          {showNotificationMenu && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm">Bildirishnomalar</span>
                <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                  {notifications.length} yangi
                </span>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="p-4 text-xs text-slate-400 text-center">Yangi bildirishnomalar yo‘q.</p>
                )}
                {notifications.map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => {
                      onQuickNavigate(n.target);
                      setShowNotificationMenu(false);
                    }}
                    className="w-full p-3 hover:bg-slate-50 transition-colors flex items-start space-x-3 text-left"
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${n.tone}`}
                    >
                      <i className={`fa-solid ${n.icon}`}></i>
                    </span>
                    <span>
                      <span className="block text-xs font-semibold text-slate-800">{n.title}</span>
                      <span className="block text-[11px] text-slate-500">{n.text}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="pt-2 px-4 border-t border-slate-100 text-center">
                <button
                  onClick={() => setShowNotificationMenu(false)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Yopish
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
