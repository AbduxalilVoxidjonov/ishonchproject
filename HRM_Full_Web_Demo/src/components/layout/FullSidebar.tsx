import React, { useState, useEffect } from 'react';
import { navigationGroups } from '../../data/allModulesData';

interface FullSidebarProps {
  activeModuleId: string;
  onSelectModule: (moduleId: string) => void;
  onLogout: () => void;
}

interface NavLinkProps {
  moduleId: string;
  isActive: boolean;
  className: string;
  onNavigate: () => void;
  children: React.ReactNode;
}

// Real links: labels navigate immediately, selection doesn't freeze navigation, and open in new tab works via hash URL
const NavLink: React.FC<NavLinkProps> = ({ moduleId, isActive, className, onNavigate, children }) => (
  <a
    href={`#${moduleId}`}
    draggable={false}
    aria-current={isActive ? 'page' : undefined}
    className={`${className} select-none`}
    onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let the browser open a new tab / window
      e.preventDefault();
      onNavigate();
    }}
  >
    {children}
  </a>
);

const MODULE_COUNT = navigationGroups.reduce((acc, g) => acc + g.links.length, 0);

// Find which accordion group a module belongs to (excluding Boshqaruv which is standalone)
const findGroupForModule = (modId: string): string => {
  if (modId === 'dashboard') return '';
  for (const grp of navigationGroups) {
    if (grp.group !== 'Boshqaruv' && grp.links.some((l) => l.id === modId)) {
      return grp.group;
    }
  }
  return '';
};

export const FullSidebar: React.FC<FullSidebarProps> = ({
  activeModuleId,
  onSelectModule,
  onLogout,
}) => {
  const [navSearch, setNavSearch] = useState('');

  // Accordion state: only one group is open at any time
  const [openGroup, setOpenGroup] = useState<string>(() => findGroupForModule(activeModuleId));

  // Automatically switch open group when active module changes
  useEffect(() => {
    const parentGroup = findGroupForModule(activeModuleId);
    setOpenGroup(parentGroup);
  }, [activeModuleId]);

  // Accordion toggle: clicking a group opens it and closes all other groups
  const handleGroupToggle = (groupTitle: string) => {
    setOpenGroup((prev) => (prev === groupTitle ? '' : groupTitle));
  };

  // Groups excluding 'Boshqaruv' (since Dashboard is rendered as top standalone item)
  const nonDashboardGroups = navigationGroups.filter((g) => g.group !== 'Boshqaruv');

  // Filter groups and links by search query
  const filteredGroups = nonDashboardGroups
    .map((grp) => {
      const filteredLinks = grp.links.filter(
        (link) =>
          link.title.toLowerCase().includes(navSearch.toLowerCase()) ||
          grp.group.toLowerCase().includes(navSearch.toLowerCase())
      );
      return {
        ...grp,
        links: filteredLinks,
      };
    })
    .filter((grp) => grp.links.length > 0);

  const isDashboardMatched =
    !navSearch ||
    'dashboard'.includes(navSearch.toLowerCase()) ||
    'boshqaruv'.includes(navSearch.toLowerCase()) ||
    'bosh sahifa'.includes(navSearch.toLowerCase());

  // Group icons map
  const getGroupIcon = (groupName: string) => {
    switch (groupName) {
      case 'Xodimlar':
        return 'fa-users';
      case 'Tashkiliy tuzilma':
        return 'fa-sitemap';
      case 'Vakansiyalar':
        return 'fa-briefcase';
      case 'Davomat':
        return 'fa-fingerprint';
      case 'Ta\'tillar':
        return 'fa-calendar-days';
      case 'Ish haqi':
        return 'fa-wallet';
      case 'Performance':
        return 'fa-chart-line';
      case 'Rivojlanish':
        return 'fa-graduation-cap';
      case 'Karyera':
        return 'fa-stairs';
      case 'Qo\'shimcha':
        return 'fa-folder-open';
      case 'Tahlil':
        return 'fa-chart-pie';
      case 'Tizim':
        return 'fa-gears';
      default:
        return 'fa-circle-dot';
    }
  };

  return (
    <aside className="w-72 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 z-30 shadow-2xl border-r border-slate-800 h-full max-h-screen select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 bg-slate-950 border-b border-slate-800 flex-shrink-0">
        <button
          type="button"
          className="flex items-center space-x-3 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          onClick={() => {
            onSelectModule('dashboard');
            setOpenGroup('');
          }}
        >
          <span className="bg-gradient-to-tr from-indigo-600 to-violet-600 text-white p-2 rounded-xl font-bold text-lg flex items-center justify-center w-10 h-10 shadow-lg shadow-indigo-500/20">
            <i className="fa-solid fa-users-gear text-base"></i>
          </span>
          <span className="block">
            <span className="flex items-center space-x-1.5">
              <span className="text-white font-bold text-base tracking-wide block leading-tight">HRM Platform</span>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">{MODULE_COUNT}</span>
            </span>
            <span className="block text-[11px] text-indigo-400 font-medium">Enterprise Suite</span>
          </span>
        </button>
      </div>

      {/* Fast Module Finder Search */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex-shrink-0">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
            <i className="fa-solid fa-magnifying-glass text-xs"></i>
          </span>
          <input
            type="text"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder={`${MODULE_COUNT} ta moduldan izlash...`}
            className="pl-8 pr-7 py-1.5 w-full bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-slate-800 transition-all"
          />
          {navSearch && (
            <button
              onClick={() => setNavSearch('')}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-white"
            >
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          )}
        </div>
      </div>

      {/* Nav List with Standalone Dashboard & Accordion Groups */}
      <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto custom-scrollbar">
        {/* STANDALONE DASHBOARD (Birinchi asosiy sahifa, boshqa ichki nav yo'qligi sababli to'g'ridan-to'g'ri havola) */}
        {isDashboardMatched && (
          <div className="mb-2">
            <NavLink
              moduleId="dashboard"
              isActive={activeModuleId === 'dashboard'}
              onNavigate={() => {
                onSelectModule('dashboard');
                setOpenGroup('');
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                activeModuleId === 'dashboard'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white bg-slate-950/40 border border-slate-800/80'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                    activeModuleId === 'dashboard'
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-500/20 text-indigo-400'
                  }`}
                >
                  <i className="fa-solid fa-chart-pie"></i>
                </div>
                <div>
                  <span className="block leading-tight font-semibold">Dashboard</span>
                  <span className="text-[10px] text-slate-400 font-normal block">Bosh sahifa</span>
                </div>
              </div>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded font-mono font-bold">
                Live
              </span>
            </NavLink>
          </div>
        )}

        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 pt-1 pb-1">
          Bo‘limlar va Modullar
        </div>

        {/* ACCORDION GROUPS */}
        {filteredGroups.map((group) => {
          const isOpen = navSearch ? true : openGroup === group.group;
          const hasActiveItem = group.links.some((l) => l.id === activeModuleId);

          // A group with a single page is shown as that page itself, without an accordion
          const isSinglePage = (nonDashboardGroups.find((g) => g.group === group.group)?.links.length ?? 0) === 1;
          if (isSinglePage) {
            const link = group.links[0];
            const isActive = link.id === activeModuleId;
            return (
              <div key={group.group} className="rounded-xl bg-slate-950/20 p-1">
                <NavLink
                  moduleId={link.id}
                  isActive={isActive}
                  onNavigate={() => {
                    onSelectModule(link.id);
                    setOpenGroup('');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all text-left ${
                    isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] transition-colors ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <i className={`fa-solid ${getGroupIcon(group.group)}`}></i>
                    </div>
                    <span className="truncate">{link.title}</span>
                  </div>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0 animate-pulse"></span>}
                </NavLink>
              </div>
            );
          }

          return (
            <div key={group.group} className="space-y-1 rounded-xl bg-slate-950/20 p-1">
              {/* Group Header Button (Accordion Trigger) */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => handleGroupToggle(group.group)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleGroupToggle(group.group);
                  }
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isOpen
                    ? 'bg-slate-800 text-white shadow-xs'
                    : hasActiveItem
                    ? 'text-indigo-400 hover:bg-slate-800/50'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] transition-colors ${
                      isOpen
                        ? 'bg-indigo-600 text-white'
                        : hasActiveItem
                        ? 'bg-indigo-500/20 text-indigo-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <i className={`fa-solid ${getGroupIcon(group.group)}`}></i>
                  </div>
                  <span className="truncate">{group.group}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-semibold ${
                      isOpen
                        ? 'bg-indigo-500/30 text-indigo-300'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {group.links.length}
                  </span>
                  <i
                    className={`fa-solid fa-chevron-down text-[9px] text-slate-500 transition-transform duration-200 ${
                      isOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  ></i>
                </div>
              </div>

              {/* Group Links (Only visible when this group is open) */}
              {isOpen && (
                <div className="space-y-0.5 pl-2.5 border-l-2 border-indigo-600/40 ml-4 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  {group.links.map((link) => {
                    const isActive = link.id === activeModuleId;
                    return (
                      <NavLink
                        key={link.id}
                        moduleId={link.id}
                        isActive={isActive}
                        onNavigate={() => onSelectModule(link.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-md font-semibold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <span className="text-[11px] opacity-70 w-3 text-center">{link.icon}</span>
                          <span className="truncate">{link.title}</span>
                        </div>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white ml-2 flex-shrink-0 animate-pulse"></span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-xs shadow">
            AD
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-white truncate">Anvarbek Director</p>
            <p className="text-[10px] text-indigo-400 truncate flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Super Admin • {MODULE_COUNT} modul</span>
            </p>
          </div>
        </div>
        <button
          title="Tizimdan chiqish"
          onClick={onLogout}
          className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-slate-900 text-xs"
        >
          <i className="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>
    </aside>
  );
};
