import React, { useMemo } from 'react';
import { Branch, Company, Department, Employee, Vacancy } from '../types/hrm';
import { toDisplayDate } from '../utils/dates';

/** Where the user is inside the structure: company (both null) → branch → department. */
export interface OrgPath {
  branchId: string | null;
  departmentId: string | null;
}

interface OrganizationPageProps {
  company: Company;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  vacancies: Vacancy[];
  path: OrgPath;
  onPathChange: (path: OrgPath) => void;
  onAddBranch: () => void;
  onAddDepartment: (branchId: string) => void;
  onAddEmployee: (departmentId: string) => void;
  onOpenEmployee: (employee: Employee) => void;
}

const statusBadge: Record<Employee['status'], { label: string; cls: string }> = {
  active: { label: 'Faol', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  probation: { label: 'Sinov', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  on_leave: { label: 'Ta’tilda', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  terminated: { label: 'Arxiv', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const deptColor: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  purple: 'bg-purple-50 text-purple-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();

const StatTile: React.FC<{ label: string; value: number | string; icon: string }> = ({ label, value, icon }) => (
  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-3">
    <span className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-indigo-600 flex items-center justify-center text-sm">
      <i className={`fa-solid ${icon}`}></i>
    </span>
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
    </div>
  </div>
);

const AddCard: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="min-h-[148px] border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 rounded-2xl flex flex-col items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors space-y-2"
  >
    <i className="fa-solid fa-plus text-lg"></i>
    <span className="text-xs font-semibold">{label}</span>
  </button>
);

export const OrganizationPage: React.FC<OrganizationPageProps> = ({
  company,
  branches,
  departments,
  employees,
  vacancies,
  path,
  onPathChange,
  onAddBranch,
  onAddDepartment,
  onAddEmployee,
  onOpenEmployee,
}) => {
  // Terminated employees are not part of the current structure
  const staff = useMemo(() => employees.filter((e) => e.status !== 'terminated'), [employees]);

  const deptStaff = (deptId: string) => staff.filter((e) => e.departmentId === deptId);
  const branchDepts = (branchId: string) => departments.filter((d) => d.branchId === branchId);
  const branchStaff = (branchId: string) => {
    const ids = new Set(branchDepts(branchId).map((d) => d.id));
    return staff.filter((e) => ids.has(e.departmentId));
  };
  const openVacancies = (dept: Department) => vacancies.filter((v) => v.departmentId === dept.id && v.status !== 'closed').length;

  // Resolve the path; ids that no longer exist fall back to the level above
  const branch = branches.find((b) => b.id === path.branchId) ?? null;
  const department = branch ? departments.find((d) => d.id === path.departmentId && d.branchId === branch.id) ?? null : null;

  const goCompany = () => onPathChange({ branchId: null, departmentId: null });
  const goBranch = (branchId: string) => onPathChange({ branchId, departmentId: null });
  const goDepartment = (d: Department) => onPathChange({ branchId: d.branchId, departmentId: d.id });

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: company.name, onClick: branch ? goCompany : undefined },
    ...(branch ? [{ label: branch.name, onClick: department ? () => goBranch(branch.id) : undefined }] : []),
    ...(department ? [{ label: department.name }] : []),
  ];

  // -------------------------------------------------------------
  // LEVEL 1: COMPANY → branches
  // -------------------------------------------------------------
  const renderCompany = () => (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
          <div className="flex items-center space-x-3">
            <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center text-lg shadow-md">
              <i className="fa-solid fa-building-columns"></i>
            </span>
            <div>
              <h2 className="font-bold text-slate-900 text-lg leading-tight">{company.legalName}</h2>
              <p className="text-xs text-slate-500">
                STIR: {company.inn} • Direktor: <strong className="text-slate-700">{company.director}</strong>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {company.address} • {company.phone}
              </p>
            </div>
          </div>
          <button
            onClick={onAddBranch}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-plus text-xs"></i>
            <span>Filial qo‘shish</span>
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Filiallar" value={branches.length} icon="fa-building" />
          <StatTile label="Bo‘limlar" value={departments.length} icon="fa-sitemap" />
          <StatTile label="Xodimlar" value={staff.length} icon="fa-users" />
          <StatTile label="Lavozimlar" value={new Set(staff.map((e) => e.position)).size} icon="fa-id-badge" />
        </div>
      </div>

      <div>
        <h3 className="font-bold text-slate-800 text-sm mb-3">Filiallar ({branches.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((b) => {
            const bDepts = branchDepts(b.id);
            const bStaff = branchStaff(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => goBranch(b.id)}
                className="text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all space-y-3 group"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <i className="fa-solid fa-building"></i>
                    </span>
                    <div>
                      <p className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{b.name}</p>
                      <p className="text-xs text-slate-500">{b.city}</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      b.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    {b.status === 'active' ? 'Faol' : 'Nofaol'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Rahbar: <strong className="text-slate-700">{b.headName}</strong>
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    <i className="fa-solid fa-sitemap text-slate-400 mr-1"></i>
                    {bDepts.length} bo‘lim
                  </span>
                  <span className="text-slate-600">
                    <i className="fa-solid fa-users text-slate-400 mr-1"></i>
                    {bStaff.length} xodim
                  </span>
                  <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-indigo-600"></i>
                </div>
              </button>
            );
          })}
          <AddCard label="Yangi filial" onClick={onAddBranch} />
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------
  // LEVEL 2: BRANCH → departments
  // -------------------------------------------------------------
  const renderBranch = (b: Branch) => {
    const bDepts = branchDepts(b.id);
    const bStaff = branchStaff(b.id);
    return (
      <div className="space-y-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div className="flex items-center space-x-3">
              <span className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
                <i className="fa-solid fa-building"></i>
              </span>
              <div>
                <h2 className="font-bold text-slate-900 text-lg leading-tight">{b.name} filiali</h2>
                <p className="text-xs text-slate-500">
                  {b.city}
                  {b.address && ` • ${b.address}`}
                  {b.phone && ` • ${b.phone}`}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rahbar: <strong className="text-slate-700">{b.headName}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={() => onAddDepartment(b.id)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>Bo‘lim qo‘shish</span>
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatTile label="Bo‘limlar" value={bDepts.length} icon="fa-sitemap" />
            <StatTile label="Xodimlar" value={bStaff.length} icon="fa-users" />
            <StatTile label="Lavozimlar" value={new Set(bStaff.map((e) => e.position)).size} icon="fa-id-badge" />
          </div>
        </div>

        <div>
          <h3 className="font-bold text-slate-800 text-sm mb-3">Bo‘limlar ({bDepts.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {bDepts.map((d) => {
              const dStaff = deptStaff(d.id);
              const vac = openVacancies(d);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => goDepartment(d)}
                  className="text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all space-y-3 group"
                >
                  <div className="flex items-center space-x-3">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${deptColor[d.color] ?? deptColor.indigo}`}>
                      {initialsOf(d.headName)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{d.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{d.code}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Rahbar: <strong className="text-slate-700">{d.headName}</strong>
                  </p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      <i className="fa-solid fa-users text-slate-400 mr-1"></i>
                      {dStaff.length} xodim
                    </span>
                    <span className="text-slate-600">
                      <i className="fa-solid fa-id-badge text-slate-400 mr-1"></i>
                      {new Set(dStaff.map((e) => e.position)).size} lavozim
                    </span>
                    {vac > 0 ? (
                      <span className="text-amber-600 font-semibold">{vac} vakansiya</span>
                    ) : (
                      <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-indigo-600"></i>
                    )}
                  </div>
                </button>
              );
            })}
            <AddCard label="Yangi bo‘lim" onClick={() => onAddDepartment(b.id)} />
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // LEVEL 3: DEPARTMENT → positions → employees
  // -------------------------------------------------------------
  const renderDepartment = (d: Department) => {
    const dStaff = deptStaff(d.id);
    const archived = employees.filter((e) => e.departmentId === d.id && e.status === 'terminated').length;
    const byPosition = new Map<string, Employee[]>();
    for (const e of [...dStaff].sort((a, b) => a.joinedDate.localeCompare(b.joinedDate))) {
      byPosition.set(e.position, [...(byPosition.get(e.position) ?? []), e]);
    }
    const positions = [...byPosition.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    return (
      <div className="space-y-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div className="flex items-center space-x-3">
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${deptColor[d.color] ?? deptColor.indigo}`}>
                {initialsOf(d.headName)}
              </span>
              <div>
                <h2 className="font-bold text-slate-900 text-lg leading-tight">{d.name}</h2>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{d.code}</span> • Rahbar: <strong className="text-slate-700">{d.headName}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={() => onAddEmployee(d.id)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs flex items-center space-x-1.5"
            >
              <i className="fa-solid fa-user-plus text-xs"></i>
              <span>Xodim qo‘shish</span>
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Xodimlar" value={dStaff.length} icon="fa-users" />
            <StatTile label="Lavozimlar" value={positions.length} icon="fa-id-badge" />
            <StatTile label="Sinovda" value={dStaff.filter((e) => e.status === 'probation').length} icon="fa-user-clock" />
            <StatTile label="Ochiq vakansiya" value={openVacancies(d)} icon="fa-briefcase" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Lavozimlar va xodimlar</h3>
            {archived > 0 && <span className="text-[11px] text-slate-400">Arxivda: {archived} nafar</span>}
          </div>

          {positions.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <i className="fa-solid fa-users-slash text-3xl text-slate-300"></i>
              <p className="text-sm text-slate-500">Bu bo‘limda hali xodim yo‘q.</p>
              <button onClick={() => onAddEmployee(d.id)} className="text-xs font-semibold text-indigo-600 hover:underline">
                Birinchi xodimni qo‘shish
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {positions.map(([position, people]) => (
                <div key={position}>
                  <div className="px-5 py-2.5 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center">
                      <i className="fa-solid fa-id-badge text-indigo-500 mr-2"></i>
                      {position}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">{people.length} nafar</span>
                  </div>
                  <ul className="divide-y divide-slate-50">
                    {people.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => onOpenEmployee(e)}
                          className="w-full px-5 py-3 flex items-center justify-between hover:bg-indigo-50/40 transition-colors text-left group"
                        >
                          <span className="flex items-center space-x-3">
                            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs flex items-center justify-center">
                              {e.initials}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-slate-800 group-hover:text-indigo-600">{e.fullName}</span>
                              <span className="block text-[11px] text-slate-500 font-mono">
                                {e.code.replace('#', '')} • {toDisplayDate(e.joinedDate)} dan
                              </span>
                            </span>
                          </span>
                          <span className="flex items-center space-x-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge[e.status].cls}`}>
                              {statusBadge[e.status].label}
                            </span>
                            <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-indigo-600"></i>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 animate-in fade-in duration-200">
      {/* Structure tree */}
      <nav className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 h-fit lg:sticky lg:top-0" aria-label="Tashkiliy tuzilma">
        <button
          type="button"
          onClick={goCompany}
          aria-current={!branch ? 'page' : undefined}
          className={`w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg text-xs font-bold text-left ${
            !branch ? 'bg-indigo-600 text-white' : 'text-slate-800 hover:bg-slate-100'
          }`}
        >
          <i className="fa-solid fa-building-columns"></i>
          <span className="truncate">{company.name}</span>
        </button>
        <ul className="mt-1 space-y-0.5">
          {branches.map((b) => {
            const expanded = branch?.id === b.id;
            const bDepts = branchDepts(b.id);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => goBranch(b.id)}
                  aria-expanded={expanded}
                  aria-current={expanded && !department ? 'page' : undefined}
                  className={`w-full flex items-center justify-between pl-5 pr-2.5 py-1.5 rounded-lg text-xs text-left ${
                    expanded && !department ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100 font-semibold'
                  }`}
                >
                  <span className="flex items-center space-x-2 min-w-0">
                    <i className={`fa-solid fa-chevron-${expanded ? 'down' : 'right'} text-[9px] text-slate-400`}></i>
                    <span className="truncate">{b.name}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">{branchStaff(b.id).length}</span>
                </button>
                {expanded && (
                  <ul className="mt-0.5 space-y-0.5">
                    {bDepts.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => goDepartment(d)}
                          aria-current={department?.id === d.id ? 'page' : undefined}
                          className={`w-full flex items-center justify-between pl-10 pr-2.5 py-1.5 rounded-lg text-xs text-left ${
                            department?.id === d.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">{d.name}</span>
                          <span className="text-[10px] text-slate-400">{deptStaff(d.id).length}</span>
                        </button>
                      </li>
                    ))}
                    {bDepts.length === 0 && <li className="pl-10 py-1 text-[11px] text-slate-400">Bo‘lim yo‘q</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-4 min-w-0">
        {/* Breadcrumb */}
        <nav className="flex items-center flex-wrap gap-1.5 text-xs" aria-label="Joylashuv">
          {branch && (
            <button
              type="button"
              onClick={() => (department ? goBranch(branch.id) : goCompany())}
              className="mr-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
            >
              <i className="fa-solid fa-arrow-left text-[10px] mr-1"></i>Yuqoriga
            </button>
          )}
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <i className="fa-solid fa-chevron-right text-[9px] text-slate-300"></i>}
              {c.onClick ? (
                <button type="button" onClick={c.onClick} className="text-indigo-600 font-semibold hover:underline">
                  {c.label}
                </button>
              ) : (
                <span className="font-bold text-slate-800">{c.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>

        {department ? renderDepartment(department) : branch ? renderBranch(branch) : renderCompany()}
      </div>
    </div>
  );
};
