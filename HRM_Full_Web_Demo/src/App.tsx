import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FullSidebar } from './components/layout/FullSidebar';
import { Header } from './components/layout/Header';
import { allModulesMap, HRMModuleData } from './data/allModulesData';
import { buildDerivedModules } from './data/derivedModules';
import { GenericModuleView } from './components/common/GenericModuleView';
import { Toast } from './components/common/Toast';
import { UniversalAddModal } from './components/modals/UniversalAddModal';
import { AddEmployeeModal } from './components/modals/AddEmployeeModal';
import { AddLeaveModal } from './components/modals/AddLeaveModal';
import { AddVacancyModal } from './components/modals/AddVacancyModal';
import { AddBranchModal } from './components/modals/AddBranchModal';
import { AddDepartmentModal } from './components/modals/AddDepartmentModal';
import { EmployeeDetailPage } from './pages/EmployeeDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage, EmployeesTab } from './pages/EmployeesPage';
import { OrganizationPage, OrgPath } from './pages/OrganizationPage';
import { AttendancePage } from './pages/AttendancePage';
import { RecruitmentPage } from './pages/RecruitmentPage';
import { VacancyDetailPage } from './pages/VacancyDetailPage';
import { LeavesPage } from './pages/LeavesPage';
import { PayrollPage } from './pages/PayrollPage';
import { PerformancePage } from './pages/PerformancePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

import {
  companyInfo,
  initialEmployees,
  initialDepartments,
  initialBranches,
  initialVacancies,
  initialCandidates,
  initialAttendanceLogs,
  initialLeaveRequests,
  initialPayrollRecords,
  initialKPIReviews,
  initialDocuments,
  initialAuditLogs,
} from './data/mockData';
import { Employee, Candidate, LeaveRequest, AttendanceRecord, AuditLogItem, Vacancy, Branch, Department } from './types/hrm';
import { inclusiveDays, localDateISO, localTime, localTimestamp, uid } from './utils/dates';
import { defaultPipelineStages } from './utils/pipeline';

// Browser history entries store ids only, so Back/Forward always shows the current employee data
interface NavState {
  activeModuleId: string;
  employeeId: string | null;
  /** Vacancy opened inside the vacancies module (its candidate kanban). */
  vacancyId?: string | null;
}

const DEFAULT_MODULE = 'dashboard';

// Former per-status employee modules are now tabs of the "Xodimlar" page; old links still land on the right tab
// Former branch / department / position modules are part of the organization structure page now
// Former recruiting modules (candidates, interviews, tests, ...) were dropped; old links open the vacancies page
const MODULE_ALIASES: Record<string, string> = {
  // Recruiting
  candidates: 'vacancies',
  interviews: 'vacancies',
  tests: 'vacancies',
  verification: 'vacancies',
  offers: 'vacancies',
  'talent-pool': 'vacancies',
  // Attendance
  'work-schedule': 'attendance',
  shifts: 'attendance',
  delays: 'attendance',
  overtime: 'attendance',
  // Leaves
  'leave-calendar': 'leaves',
  // Payroll
  bonuses: 'payroll',
  penalties: 'payroll',
  // Performance
  kpi: 'performance',
  okr: 'performance',
  'feedback-360': 'performance',
  'development-plan': 'performance',
  skills: 'performance',
  // Documents
  contracts: 'documents',
  orders: 'documents',
  requests: 'documents',
  // Settings & System
  'audit-log': 'settings',
  users: 'settings',
  permissions: 'settings',
  notifications: 'settings',
  references: 'settings',
};

const ORGANIZATION_ALIASES = new Set(['branches', 'departments', 'positions', 'org-chart', 'staffing']);

const EMPLOYEE_TAB_ALIASES: Record<string, EmployeesTab> = {
  'active-employees': 'active',
  probation: 'probation',
  'on-leave': 'on_leave',
  'former-employees': 'terminated',
};

/** Parses "#module", "#module/employee/<id>" or "#vacancies/vacancy/<id>". Unknown modules fall back to the dashboard. */
const parseHash = (hash: string): NavState => {
  const [rawModId, kind, rawId] = hash.replace(/^#/, '').split('/');
  const modId =
    rawModId && EMPLOYEE_TAB_ALIASES[rawModId]
      ? 'employees'
      : ORGANIZATION_ALIASES.has(rawModId ?? '')
        ? 'organization'
        : MODULE_ALIASES[rawModId ?? ''] ?? rawModId;
  const activeModuleId = modId && allModulesMap[modId] ? modId : DEFAULT_MODULE;
  const employeeId = kind === 'employee' && rawId ? decodeURIComponent(rawId) : null;
  const vacancyId = kind === 'vacancy' && rawId && activeModuleId === 'vacancies' ? decodeURIComponent(rawId) : null;
  return { activeModuleId, employeeId, vacancyId };
};

const hashFor = ({ activeModuleId, employeeId, vacancyId }: NavState) =>
  employeeId
    ? `#${activeModuleId}/employee/${encodeURIComponent(employeeId)}`
    : vacancyId
      ? `#${activeModuleId}/vacancy/${encodeURIComponent(vacancyId)}`
      : `#${activeModuleId}`;

/** Lowercase, unify Uzbek apostrophes, sort words: "Aliyev Azizbek" matches "Azizbek Aliyev". */
const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, "'")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

// Pre-selected parent for an add modal (branch → department, department → employee)
interface AddContext {
  branchId?: string;
  departmentId?: string;
}

type AddModalKind = 'employee' | 'leave' | 'vacancy' | 'branch' | 'department' | 'universal';

// Where "+ Yangi qo'shish" leads for modules backed by typed app state
const ADD_MODAL_FOR_MODULE: Record<string, AddModalKind> = {
  dashboard: 'employee',
  employees: 'employee',
  'employee-profile': 'employee',
  leaves: 'leave',
  'leave-calendar': 'leave',
  vacancies: 'vacancy',
};

const ADD_BLOCKED_MESSAGE: Record<string, string> = {
  payroll: 'Ish haqi yozuvlari xodim maoshi asosida avtomatik hisoblanadi',
};

// Modules that have an enhanced (interactive) view in addition to the table catalog
const ENHANCED_MODULES = new Set([
  'dashboard',
  'employees',
  'employee-profile',
  'organization',
  'attendance',
  'vacancies',
  'leaves',
  'leave-calendar',
  'payroll',
  'performance',
  'kpi',
  'documents',
  'reports',
  'settings',
  'audit-log',
]);

// Interactive pages that already show every record, so no duplicate table is rendered below them
const PAGE_ONLY_MODULES = new Set([
  'dashboard',
  'employees',
  'employee-profile',
  'organization',
  'vacancies',
  'attendance',
  'leaves',
  'leave-calendar',
  'payroll',
  'performance',
  'kpi',
  'documents',
  'reports',
  'settings',
  'audit-log',
]);

export const App: React.FC = () => {
  // Navigation State (restored from the URL hash on load)
  const [nav, setNav] = useState<NavState>(() => parseHash(window.location.hash));
  const { activeModuleId, employeeId: viewingEmployeeId } = nav;
  const openVacancyId = nav.vacancyId ?? null;
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [employeesTab, setEmployeesTab] = useState<EmployeesTab>(
    () => EMPLOYEE_TAB_ALIASES[window.location.hash.replace(/^#/, '').split('/')[0]] ?? 'all'
  );

  // Static module catalog; rows added through the universal modal are stored here
  const [modulesMap, setModulesMap] = useState<Record<string, HRMModuleData>>(allModulesMap);

  // Core interactive models state
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [branches, setBranches] = useState<Branch[]>(initialBranches);

  // Position inside the organization structure (kept here so it survives opening an employee profile)
  const [orgPath, setOrgPath] = useState<OrgPath>({ branchId: null, departmentId: null });
  const [vacancies, setVacancies] = useState<Vacancy[]>(initialVacancies);
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>(initialAttendanceLogs);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(initialLeaveRequests);
  const [payrollRecords] = useState(initialPayrollRecords);
  const [kpiReviews] = useState(initialKPIReviews);
  const [documents] = useState(initialDocuments);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(initialAuditLogs);

  // Biometrics Live Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('28.09.2026 18:11');
  const syncTimerRef = useRef<number | undefined>(undefined);

  // Modal State (a modal is mounted only while open, so its form starts fresh every time)
  const [addModal, setAddModal] = useState<AddModalKind | null>(null);
  // Pre-selected parent for the add modal (branch for a new department, department for a new employee)
  const [addContext, setAddContext] = useState<AddContext>({});

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2400);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimerRef.current);
      window.clearTimeout(syncTimerRef.current);
    },
    []
  );

  const addAudit = (action: string, module: string) => {
    const newLog: AuditLogItem = {
      id: uid('log'),
      userName: 'Anvarbek Director',
      userRole: 'Super Admin',
      action,
      module,
      ipAddress: '10.2.4.19',
      timestamp: localTimestamp(),
      status: 'success',
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const viewingEmployee = viewingEmployeeId ? employees.find((e) => e.id === viewingEmployeeId) ?? null : null;
  const openVacancy = openVacancyId ? vacancies.find((v) => v.id === openVacancyId) ?? null : null;

  // -------------------------------------------------------------
  // BROWSER HISTORY: Back / Forward (incl. the mouse Back button, which the browser maps to history.back)
  // -------------------------------------------------------------
  useEffect(() => {
    // Sync the current entry with the state restored from the hash (also after a reload)
    window.history.replaceState(nav, '', hashFor(nav));

    const handleLocationChange = (event?: PopStateEvent) => {
      const state = event?.state as NavState | null;
      setNav(state && state.activeModuleId ? state : parseHash(window.location.hash));
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', () => handleLocationChange());
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', () => handleLocationChange());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushNav = (next: NavState) => {
    setNav(next);
    window.history.pushState(next, '', hashFor(next));
  };

  // Navigate module with history push
  const handleSelectModule = (requestedId: string) => {
    setGlobalSearch('');
    const aliasTab = EMPLOYEE_TAB_ALIASES[requestedId];
    const modId = aliasTab
      ? 'employees'
      : ORGANIZATION_ALIASES.has(requestedId)
        ? 'organization'
        : MODULE_ALIASES[requestedId] ?? requestedId;
    if (aliasTab) setEmployeesTab(aliasTab);
    else if (modId === 'employees' && modId !== activeModuleId) setEmployeesTab('all');
    if (modId === activeModuleId && !viewingEmployeeId && !openVacancyId) return;
    pushNav({ activeModuleId: modId, employeeId: null, vacancyId: null });
  };

  const handleOpenEmployee = (emp: Employee) => {
    pushNav({ activeModuleId, employeeId: emp.id, vacancyId: openVacancyId });
  };

  const handleOpenVacancy = (vacancyId: string) => {
    pushNav({ activeModuleId: 'vacancies', employeeId: null, vacancyId });
  };

  // Back from a vacancy's kanban to the vacancy list
  const handleBackFromVacancy = () => {
    const state = window.history.state as NavState | null;
    if (state?.vacancyId && !state.employeeId) {
      window.history.back();
    } else {
      const next = { activeModuleId: 'vacancies', employeeId: null, vacancyId: null };
      setNav(next);
      window.history.replaceState(next, '', hashFor(next));
    }
  };

  // Back button handler (UI button and Escape key)
  const handleBackFromEmployeeProfile = () => {
    const state = window.history.state as NavState | null;
    if (state?.employeeId) {
      window.history.back();
    } else {
      const next = { activeModuleId, employeeId: null, vacancyId: openVacancyId };
      setNav(next);
      window.history.replaceState(next, '', hashFor(next));
    }
  };

  // Escape leaves the profile, unless a modal is open (the modal handles Escape itself)
  useEffect(() => {
    if (!viewingEmployeeId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      handleBackFromEmployeeProfile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingEmployeeId, activeModuleId]);

  // Finds an employee by EMP code or by name in any word order
  const employeeLookup = useMemo(() => {
    const byName = new Map<string, Employee>();
    const byCode = new Map<string, Employee>();
    for (const e of employees) {
      byName.set(nameKey(e.fullName), e);
      byCode.set(e.code.replace('#', '').toUpperCase(), e);
    }
    return { byName, byCode };
  }, [employees]);

  const resolveEmployee = useCallback(
    (nameOrCode: string): Employee | undefined => {
      const text = nameOrCode.trim();
      if (!text) return undefined;
      const code = text.match(/EMP-\d+/i)?.[0].toUpperCase();
      if (code) return employeeLookup.byCode.get(code);
      return employeeLookup.byName.get(nameKey(text));
    },
    [employeeLookup]
  );

  // -------------------------------------------------------------
  // ADD RECORD FLOWS
  // -------------------------------------------------------------
  const openAddModal = (kind: AddModalKind, context: AddContext = {}) => {
    setAddContext(context);
    setAddModal(kind);
  };

  const handleOpenAdd = (moduleId: string = activeModuleId) => {
    // Inside the organization structure "add" creates a child of the current level
    if (moduleId === 'organization') {
      if (orgPath.departmentId) openAddModal('employee', { departmentId: orgPath.departmentId });
      else if (orgPath.branchId) openAddModal('department', { branchId: orgPath.branchId });
      else openAddModal('branch');
      return;
    }
    const typed = ADD_MODAL_FOR_MODULE[moduleId];
    if (typed) {
      openAddModal(typed);
      return;
    }
    if (ADD_BLOCKED_MESSAGE[moduleId]) {
      showToast(ADD_BLOCKED_MESSAGE[moduleId]);
      return;
    }
    if ((modulesMap[moduleId]?.headers ?? []).some((h) => h.trim())) {
      openAddModal('universal');
    } else {
      showToast('Bu bo‘limga jadval yozuvi qo‘shib bo‘lmaydi');
    }
  };

  const handleAddRowToActiveModule = (newRowCells: string[]) => {
    const currentMod = modulesMap[activeModuleId];
    if (!currentMod) {
      showToast('Bo‘lim topilmadi, yozuv saqlanmadi');
      return;
    }

    setModulesMap((prev) => ({
      ...prev,
      [activeModuleId]: { ...prev[activeModuleId], rows: [newRowCells, ...prev[activeModuleId].rows] },
    }));

    addAudit(`Yangi yozuv qo‘shildi: ${currentMod.title}`, currentMod.title);
    showToast(`"${currentMod.title}" moduliga yangi yozuv saqlandi!`);
  };

  const handleAddEmployee = (data: Omit<Employee, 'id' | 'code'>) => {
    const nextNumber = Math.max(0, ...employees.map((e) => parseInt(e.code.replace(/\D/g, ''), 10) || 0)) + 1;
    const digits = String(nextNumber).padStart(4, '0');
    const newEmployee: Employee = { ...data, id: `emp-${digits}`, code: `#EMP-${digits}` };
    setEmployees((prev) => [newEmployee, ...prev]);
    addAudit(`Yangi xodim qo‘shildi: ${newEmployee.fullName} (EMP-${digits})`, 'Employees');
    showToast(`${newEmployee.fullName} xodimlar ro‘yxatiga qo‘shildi`);
  };

  const nextId = (prefix: string, ids: string[]) =>
    `${prefix}-${Math.max(0, ...ids.map((id) => parseInt(id.replace(/\D/g, ''), 10) || 0)) + 1}`;

  const handleAddBranch = (data: Omit<Branch, 'id'>) => {
    const newBranch: Branch = { ...data, id: nextId('br', branches.map((b) => b.id)) };
    setBranches((prev) => [...prev, newBranch]);
    addAudit(`Yangi filial qo‘shildi: ${newBranch.name}`, 'Organization');
    showToast(`"${newBranch.name}" filiali yaratildi`);
    if (activeModuleId === 'organization') setOrgPath({ branchId: newBranch.id, departmentId: null });
  };

  const handleAddDepartment = (data: Omit<Department, 'id'>) => {
    const newDept: Department = { ...data, id: nextId('dept', departments.map((d) => d.id)) };
    setDepartments((prev) => [...prev, newDept]);
    addAudit(`Yangi bo‘lim qo‘shildi: ${newDept.name}`, 'Organization');
    showToast(`"${newDept.name}" bo‘limi yaratildi`);
    if (activeModuleId === 'organization') setOrgPath({ branchId: newDept.branchId, departmentId: newDept.id });
  };

  const handleAddLeave = (data: Omit<LeaveRequest, 'id' | 'requestedAt' | 'status'>) => {
    const newLeave: LeaveRequest = { ...data, id: uid('lr'), requestedAt: localDateISO(), status: 'pending' };
    setLeaveRequests((prev) => [newLeave, ...prev]);
    addAudit(`Ta’til arizasi yaratildi: ${newLeave.employeeName}`, 'Leave');
    showToast('Ta’til arizasi yuborildi va tasdiqlash kutilmoqda');
  };

  const handleAddVacancy = (data: Omit<Vacancy, 'id' | 'stages'>) => {
    const nextNumber = Math.max(0, ...vacancies.map((v) => parseInt(v.id.replace(/\D/g, ''), 10) || 0)) + 1;
    const newVacancy: Vacancy = { ...data, id: `VAC-${String(nextNumber).padStart(3, '0')}`, stages: defaultPipelineStages() };
    setVacancies((prev) => [newVacancy, ...prev]);
    addAudit(`Yangi vakansiya ochildi: ${newVacancy.title}`, 'Recruitment');
    showToast(`"${newVacancy.title}" vakansiyasi ochildi`);
  };

  // -------------------------------------------------------------
  // VACANCY PIPELINE (kanban columns and candidates)
  // -------------------------------------------------------------
  const updateVacancyStages = (vacancyId: string, update: (stages: Vacancy['stages']) => Vacancy['stages']) => {
    setVacancies((prev) => prev.map((v) => (v.id === vacancyId ? { ...v, stages: update(v.stages) } : v)));
  };

  const handleAddStage = (vacancyId: string, name: string) => {
    updateVacancyStages(vacancyId, (stages) => [...stages, { id: uid('st'), name }]);
    showToast(`"${name}" ustuni qo‘shildi`);
  };

  const handleRenameStage = (vacancyId: string, stageId: string, name: string) => {
    updateVacancyStages(vacancyId, (stages) => stages.map((st) => (st.id === stageId ? { ...st, name } : st)));
  };

  const handleDeleteStage = (vacancyId: string, stageId: string) => {
    // The page only offers this for empty columns; double-check against current state
    if (candidates.some((c) => c.vacancyId === vacancyId && c.stageId === stageId)) return;
    updateVacancyStages(vacancyId, (stages) => stages.filter((st) => st.id !== stageId));
    showToast('Ustun o‘chirildi');
  };

  const handleMoveStage = (vacancyId: string, stageId: string, direction: -1 | 1) => {
    updateVacancyStages(vacancyId, (stages) => {
      const i = stages.findIndex((st) => st.id === stageId);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= stages.length) return stages;
      const next = [...stages];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const handleMoveCandidate = (candidateId: string, stageId: string) => {
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand || cand.stageId === stageId) return;
    const stage = vacancies.find((v) => v.id === cand.vacancyId)?.stages.find((st) => st.id === stageId);
    if (!stage) return;
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, stageId } : c)));
    if (stage.outcome) addAudit(`Nomzod "${stage.name}" ustuniga o‘tkazildi: ${cand.fullName}`, 'Recruitment');
    showToast(`${cand.fullName} → ${stage.name}`);
  };

  const handleToggleVacancyStatus = (vacancyId: string) => {
    const vac = vacancies.find((v) => v.id === vacancyId);
    if (!vac) return;
    const isCurrentlyClosed = vac.status === 'closed';
    const nextStatus: Vacancy['status'] = isCurrentlyClosed ? 'open' : 'closed';
    setVacancies((prev) =>
      prev.map((v) => (v.id === vacancyId ? { ...v, status: nextStatus } : v))
    );
    if (nextStatus === 'closed') {
      addAudit(`Vakansiya qabuli vaqtincha yopildi: ${vac.title}`, 'Recruitment');
      showToast(`"${vac.title}" vakansiyasi vaqtincha yopildi`);
    } else {
      addAudit(`Vakansiya qayta ochildi: ${vac.title}`, 'Recruitment');
      showToast(`"${vac.title}" vakansiyasi qayta faollashtirildi`);
    }
  };

  const handleUpdateVacancy = (updated: Vacancy) => {
    setVacancies((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    setCandidates((prev) =>
      prev.map((c) => (c.vacancyId === updated.id ? { ...c, vacancyTitle: updated.title } : c))
    );
    addAudit(`Vakansiya ma’lumotlari tahrirlandi: ${updated.title} (${updated.id})`, 'Recruitment');
    showToast(`"${updated.title}" vakansiyasi muvaffaqiyatli yangilandi`);
  };


  // -------------------------------------------------------------
  // STATE UPDATES
  // -------------------------------------------------------------
  // EmployeeDetailPage shows its own toast for each status change
  const handleUpdateEmployeeStatus = (empId: string, status: Employee['status']) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp || emp.status === status) return;
    setEmployees((prev) =>
      prev.map((e) => {
        if (e.id !== empId) return e;
        if (status === 'terminated') {
          return { ...e, status, exitDate: localDateISO(), exitReason: e.exitReason ?? 'Rahbariyat qarori', exitInterview: e.exitInterview ?? false };
        }
        if (e.status === 'terminated') {
          return { ...e, status, exitDate: undefined, exitReason: undefined, exitInterview: undefined };
        }
        return { ...e, status };
      })
    );
    addAudit(`Xodim holati o‘zgartirildi: ${emp.fullName} (${emp.status} → ${status})`, 'Employees');
  };

  const handleApproveLeave = (id: string) => {
    const leave = leaveRequests.find((l) => l.id === id);
    if (!leave || leave.status !== 'pending') return;
    const today = localDateISO();
    const days = inclusiveDays(leave.startDate, leave.endDate);

    setLeaveRequests((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'approved', approvedBy: 'Anvarbek Director' } : l)));
    setEmployees((prev) =>
      prev.map((e) => {
        if (e.id !== leave.employeeId) return e;
        const remainingLeaveDays = leave.type === 'yillik' ? Math.max(0, e.remainingLeaveDays - days) : e.remainingLeaveDays;
        const startsNow = leave.startDate <= today && today <= leave.endDate && e.status !== 'terminated';
        return { ...e, remainingLeaveDays, status: startsNow ? 'on_leave' : e.status };
      })
    );
    addAudit(`Ta’til arizasi tasdiqlandi: ${leave.employeeName} (${days} kun)`, 'Leave');
    showToast('Ta’til so‘rovi tasdiqlandi!');
  };

  const handleRejectLeave = (id: string) => {
    const leave = leaveRequests.find((l) => l.id === id);
    if (!leave || leave.status !== 'pending') return;
    setLeaveRequests((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'rejected' } : l)));
    addAudit(`Ta’til arizasi rad etildi: ${leave.employeeName}`, 'Leave');
    showToast('Ta’til so‘rovi rad etildi');
  };

  // Live Sync trigger matching hrm_platform_update.html
  const handleTriggerSync = () => {
    setIsSyncing(true);
    setLastSyncTime('Ma’lumotlar yangilanmoqda...');

    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      setIsSyncing(false);
      const now = new Date();
      setLastSyncTime(`Yangilandi (${localTime(now)})`);

      // Simulated turnstile event: the first present employee who has not checked out yet leaves the office
      const checkedIn = attendanceLogs.filter((l) => l.type === 'in');
      const candidate = checkedIn.find(
        (l) => !attendanceLogs.some((o) => o.type === 'out' && o.employeeId === l.employeeId && o.timestamp > l.timestamp)
      );
      if (candidate) {
        const record: AttendanceRecord = {
          id: uid('att'),
          employeeId: candidate.employeeId,
          employeeName: candidate.employeeName,
          initials: candidate.initials,
          department: candidate.department,
          device: candidate.device,
          type: 'out',
          status: 'normal',
          timestamp: localTimestamp(now),
          time: localTime(now),
        };
        setAttendanceLogs((prev) => [record, ...prev]);
        addAudit(`Biometrik davomat sinxronlashtirildi: ${candidate.employeeName}`, 'Attendance');
        showToast(`Biometrik ma’lumotlar yangilandi: ${candidate.employeeName} chiqish qayd etdi`);
      } else {
        showToast('Biometrik ma’lumotlar yangilandi: yangi qaydlar yo‘q');
      }
    }, 800);
  };

  // -------------------------------------------------------------
  // DERIVED DATA
  // -------------------------------------------------------------
  const derivedModules = useMemo(
    () =>
      buildDerivedModules(modulesMap, { employees, leaveRequests, payrollRecords }),
    [modulesMap, employees, leaveRequests, payrollRecords]
  );

  const currentModuleData: HRMModuleData = derivedModules[activeModuleId] ?? derivedModules[DEFAULT_MODULE];

  const today = localDateISO();
  const pendingLeavesCount = leaveRequests.filter((l) => l.status === 'pending').length;
  const probationEndingCount = employees.filter(
    (e) => e.status === 'probation' && e.probationEndDate && e.probationEndDate >= today && inclusiveDays(today, e.probationEndDate) <= 31
  ).length;
  const latestLogDate = attendanceLogs.reduce((max, l) => (l.timestamp > max ? l.timestamp : max), '').slice(0, 10);
  const delayedTodayCount = attendanceLogs.filter((l) => l.status === 'delayed' && l.timestamp.startsWith(latestLogDate)).length;

  const hasEnhancedView = ENHANCED_MODULES.has(activeModuleId);
  const hasTable = (currentModuleData.headers ?? []).length > 0;

  const renderEnhancedPage = () => {
    switch (activeModuleId) {
      case 'dashboard':
        return (
          <DashboardPage
            employees={employees}
            departments={departments}
            vacancies={vacancies}
            candidates={candidates}
            leaveRequests={leaveRequests}
            auditLogs={auditLogs}
            attendanceLogs={attendanceLogs}
            onNavigate={handleSelectModule}
            onOpenAddEmployee={() => handleOpenAdd('employees')}
            onOpenEmployee={(id) => {
              const emp = employees.find((e) => e.id === id);
              if (emp) handleOpenEmployee(emp);
            }}
          />
        );
      case 'employees':
      case 'employee-profile':
        return (
          <EmployeesPage
            employees={employees}
            departments={departments}
            leaveRequests={leaveRequests}
            tab={employeesTab}
            onTabChange={setEmployeesTab}
            searchQuery={globalSearch}
            onOpenAddModal={() => handleOpenAdd('employees')}
            onSelectEmployee={handleOpenEmployee}
          />
        );
      case 'organization':
        return (
          <OrganizationPage
            company={companyInfo}
            branches={branches}
            departments={departments}
            employees={employees}
            vacancies={vacancies}
            path={orgPath}
            onPathChange={setOrgPath}
            onAddBranch={() => openAddModal('branch')}
            onAddDepartment={(branchId) => openAddModal('department', { branchId })}
            onAddEmployee={(departmentId) => openAddModal('employee', { departmentId })}
            onOpenEmployee={handleOpenEmployee}
          />
        );
      case 'attendance':
        return (
          <AttendancePage
            attendanceLogs={attendanceLogs}
            onTriggerSync={handleTriggerSync}
            isSyncing={isSyncing}
            lastSyncTime={lastSyncTime}
            onShowToast={showToast}
          />
        );
      case 'vacancies':
        if (openVacancy) {
          const vacId = openVacancy.id;
          return (
            <VacancyDetailPage
              key={vacId}
              vacancy={openVacancy}
              branchName={branches.find((b) => b.id === openVacancy.branchId)?.name ?? openVacancy.location}
              candidates={candidates.filter((c) => c.vacancyId === vacId)}
              branches={branches}
              departments={departments}
              employees={employees}
              vacancies={vacancies}
              onBack={handleBackFromVacancy}
              onAddStage={(name) => handleAddStage(vacId, name)}
              onRenameStage={(stageId, name) => handleRenameStage(vacId, stageId, name)}
              onDeleteStage={(stageId) => handleDeleteStage(vacId, stageId)}
              onMoveStage={(stageId, direction) => handleMoveStage(vacId, stageId, direction)}
              onMoveCandidate={handleMoveCandidate}
              onToggleStatus={handleToggleVacancyStatus}
              onUpdateVacancy={handleUpdateVacancy}
              onShowToast={showToast}
            />
          );
        }
        return (
          <RecruitmentPage
            vacancies={vacancies}
            candidates={candidates}
            branches={branches}
            departments={departments}
            employees={employees}
            onOpenAddVacancy={() => handleOpenAdd('vacancies')}
            onOpenVacancy={handleOpenVacancy}
            onToggleVacancyStatus={handleToggleVacancyStatus}
            onUpdateVacancy={handleUpdateVacancy}
          />
        );
      case 'leaves':
      case 'leave-calendar':
        return (
          <LeavesPage
            leaveRequests={leaveRequests}
            onOpenAddLeave={() => handleOpenAdd('leaves')}
            onApproveLeave={handleApproveLeave}
            onRejectLeave={handleRejectLeave}
          />
        );
      case 'payroll':
        return (
          <PayrollPage
            payrollRecords={payrollRecords}
            onExport1C={(month) => {
              addAudit(`Payroll 1C tizimiga yuborildi (${month})`, 'Payroll & Finance');
              showToast(`${month} payroll 1C tizimiga yuborildi`);
            }}
            onShowToast={showToast}
          />
        );
      case 'performance':
      case 'kpi':
        return <PerformancePage kpiReviews={kpiReviews} onShowToast={showToast} />;
      case 'documents':
        return <DocumentsPage documents={documents} onShowToast={showToast} />;
      case 'reports':
        return <ReportsPage onShowToast={showToast} />;
      case 'settings':
      case 'audit-log':
        return <SettingsPage auditLogs={auditLogs} onShowToast={showToast} />;
      default:
        return null;
    }
  };

  const renderModuleTable = (showKpis: boolean) => (
    <GenericModuleView
      key={activeModuleId}
      moduleData={currentModuleData}
      onOpenAddModal={() => handleOpenAdd()}
      onShowToast={showToast}
      resolveEmployee={resolveEmployee}
      onOpenEmployee={handleOpenEmployee}
      showKpis={showKpis}
    />
  );

  return (
    <div className="flex h-screen h-[100dvh] w-full overflow-hidden bg-slate-50 font-sans text-slate-800 antialiased">
      {/* Grouped Modules Sidebar */}
      <FullSidebar
        activeModuleId={activeModuleId}
        onSelectModule={handleSelectModule}
        onLogout={() => showToast('Demo rejimida tizimdan chiqish o‘chirilgan')}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-50">
        {/* Header */}
        <Header
          currentModule={
            viewingEmployee
              ? {
                  id: 'employee-profile',
                  file: 'employee-profile.html',
                  title: viewingEmployee.fullName,
                  crumb: `HRM / Xodimlar / ${viewingEmployee.fullName}`,
                  h1: viewingEmployee.fullName,
                  sub: viewingEmployee.position,
                  kpis: [],
                  headers: [],
                  rows: [],
                }
              : openVacancy && activeModuleId === 'vacancies'
                ? {
                    ...currentModuleData,
                    title: openVacancy.title,
                    crumb: `HRM / Vakansiyalar / ${openVacancy.id}`,
                  }
                : currentModuleData
          }
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
          employees={employees}
          onOpenEmployee={handleOpenEmployee}
          pendingLeavesCount={pendingLeavesCount}
          probationEndingCount={probationEndingCount}
          delayedTodayCount={delayedTodayCount}
          onQuickNavigate={handleSelectModule}
        />

        {/* Dynamic Body Container */}
        <main className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar">
          {viewingEmployeeId ? (
            /* 1. FULL PAGE EMPLOYEE DETAIL VIEW */
            viewingEmployee ? (
              <EmployeeDetailPage
                key={viewingEmployee.id}
                employee={viewingEmployee}
                onBack={handleBackFromEmployeeProfile}
                onUpdateStatus={handleUpdateEmployeeStatus}
                onShowToast={showToast}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
                <i className="fa-solid fa-user-slash text-3xl text-slate-300"></i>
                <p className="text-sm text-slate-600">Xodim topilmadi.</p>
                <button onClick={handleBackFromEmployeeProfile} className="text-xs font-semibold text-indigo-600 hover:underline">
                  Ro‘yxatga qaytish
                </button>
              </div>
            )
          ) : hasEnhancedView ? (
            /* 2. SPECIALIZED ENHANCED VIEW + the module table below it */
            <div className="space-y-6">
              {renderEnhancedPage()}
              {hasTable && !PAGE_ONLY_MODULES.has(activeModuleId) && renderModuleTable(false)}
            </div>
          ) : (
            /* 3. STANDARD TABLE VIEW FOR ALL OTHER MODULES */
            renderModuleTable(true)
          )}
        </main>
      </div>

      {/* Add Record Modals */}
      {addModal === 'universal' && (
        <UniversalAddModal
          onClose={() => setAddModal(null)}
          moduleTitle={currentModuleData.title || currentModuleData.h1}
          headers={currentModuleData.headers || []}
          onAddRow={handleAddRowToActiveModule}
        />
      )}
      {addModal === 'employee' && (
        <AddEmployeeModal
          onClose={() => setAddModal(null)}
          departments={departments}
          branches={branches}
          initialDepartmentId={addContext.departmentId}
          onAddEmployee={handleAddEmployee}
        />
      )}
      {addModal === 'branch' && <AddBranchModal onClose={() => setAddModal(null)} branches={branches} onAddBranch={handleAddBranch} />}
      {addModal === 'department' && (
        <AddDepartmentModal
          onClose={() => setAddModal(null)}
          branches={branches}
          departments={departments}
          employees={employees}
          initialBranchId={addContext.branchId}
          onAddDepartment={handleAddDepartment}
        />
      )}
      {addModal === 'leave' && <AddLeaveModal onClose={() => setAddModal(null)} employees={employees} onAddLeave={handleAddLeave} />}
      {addModal === 'vacancy' && (
        <AddVacancyModal
          onClose={() => setAddModal(null)}
          branches={branches}
          departments={departments}
          employees={employees}
          vacancies={vacancies}
          onAddVacancy={handleAddVacancy}
        />
      )}

      {/* Toast Notification */}
      <Toast message={toastMessage} />
    </div>
  );
};

export default App;
