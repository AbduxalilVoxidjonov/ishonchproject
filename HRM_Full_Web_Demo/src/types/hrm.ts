export type NavTabId =
  | 'dashboard'
  | 'employees'
  | 'organization'
  | 'recruitment'
  | 'attendance'
  | 'leaves'
  | 'payroll'
  | 'performance'
  | 'documents'
  | 'reports'
  | 'settings';

export interface Employee {
  id: string;
  code: string; // e.g. #EMP-1024
  fullName: string;
  avatar?: string;
  initials: string;
  email: string;
  phone: string;
  position: string;
  departmentId: string;
  departmentName: string;
  unit?: string; // sub-unit shown in tables, e.g. "IT / Backend"
  branch: string;
  status: 'active' | 'probation' | 'on_leave' | 'terminated';
  joinedDate: string;
  salary: number;
  currency: string;
  manager?: string;
  performanceScore?: number;
  kpiCompletion?: number;
  attendanceRate?: number;
  remainingLeaveDays: number;
  birthDate?: string;
  passportNo?: string;
  inn?: string;
  address?: string;
  // Probation details (status === 'probation')
  mentor?: string;
  probationEndDate?: string;
  probationRating?: string;
  // Exit details (status === 'terminated')
  exitDate?: string;
  exitReason?: string;
  exitInterview?: boolean;
}

export interface Company {
  name: string;
  legalName: string;
  inn: string;
  address: string;
  director: string;
  phone: string;
}

// Organization hierarchy: Company → Branch → Department → Employee (grouped by position).
// Headcounts are always derived from the employee list, never stored.
export interface Department {
  id: string;
  branchId: string;
  name: string;
  code: string;
  headName: string;
  color: string;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  address: string;
  headName: string;
  phone: string;
  status: 'active' | 'inactive';
}

export interface Position {
  id: string;
  title: string;
  departmentName: string;
  level: 'Junior' | 'Middle' | 'Senior' | 'Lead' | 'Head' | 'Director';
  plannedCount: number;
  activeCount: number;
  baseSalaryMin: number;
  baseSalaryMax: number;
}

export interface Vacancy {
  id: string;
  title: string; // position name
  // Place in the organization structure; department / location keep the display names
  branchId: string;
  departmentId: string;
  department: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Remote' | 'Hybrid';
  experienceLevel: string;
  salaryRange: string;
  deadline: string;
  status: 'open' | 'interviewing' | 'closed';
  tags: string[];
  /** Kanban columns of this vacancy's candidate pipeline, in display order. */
  stages: PipelineStage[];
  /** Questions and documents a candidate must submit when applying. */
  questions: ApplicationQuestion[];
}

export interface ApplicationQuestion {
  id: string;
  label: string; // e.g. "Rezyume (CV)", "Nega aynan bizning kompaniya?"
  answerType: 'text' | 'file' | 'image';
  required: boolean;
}

/** A candidate's answer to one ApplicationQuestion. */
export interface CandidateAnswer {
  questionId: string;
  text?: string;
  fileName?: string;
  fileSize?: string;
  /** Viewable content (data: URL). Demo files may have none. */
  fileUrl?: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  /** Final columns: candidates here are no longer "in progress". */
  outcome?: 'hired' | 'rejected';
}

export interface Candidate {
  id: string;
  fullName: string;
  vacancyId: string;
  vacancyTitle: string;
  phone: string;
  email: string;
  stageId: string; // id of a column in the vacancy's `stages`
  answers: CandidateAnswer[];
  score: number;
  appliedDate: string;
  interviewDate?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  initials: string;
  department: string;
  device: string; // e.g. "Turniket #1 (Lobby)", "FaceID #3"
  type: 'in' | 'out';
  status: 'on_time' | 'delayed' | 'early_leave' | 'normal';
  timestamp: string;
  time: string;
  delayMinutes?: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  type: 'yillik' | 'kasallik' | 'ruxsatnoma' | 'oqish' | 'ishhaqisiz';
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  department: string;
  baseSalary: number;
  kpiBonus: number;
  overtimePay: number;
  allowances: number;
  deductions: number; // e.g. jarima yoki ushlab qolishlar
  taxRate: number; // 12%
  netSalary: number;
  paymentStatus: 'draft' | 'approved' | 'paid';
  month: string;
}

export interface KPIReview {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  period: string; // e.g. "Q3 2026"
  targetScore: number;
  achievedScore: number;
  percentage: number;
  status: 'completed' | 'in_progress' | 'pending';
  managerComment?: string;
}

export interface HRDocument {
  id: string;
  number: string; // "№ 142-k"
  title: string;
  type: 'order' | 'contract' | 'request' | 'internal';
  employeeName?: string;
  createdDate: string;
  status: 'signed' | 'pending' | 'archived';
  fileSize: string;
}

export interface AuditLogItem {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  ipAddress: string;
  timestamp: string;
  status: 'success' | 'warning' | 'danger';
}
