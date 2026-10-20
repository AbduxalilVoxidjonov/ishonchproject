import {
  ApplicationQuestion,
  CandidateAnswer,
  Company,
  Employee,
  Department,
  Branch,
  Vacancy,
  Candidate,
  AttendanceRecord,
  LeaveRequest,
  PayrollRecord,
  KPIReview,
  HRDocument,
  AuditLogItem
} from '../types/hrm';
import { inclusiveDays } from '../utils/dates';
import { payrollNet } from '../utils/payroll';
import { defaultPipelineStages } from '../utils/pipeline';

// Demo snapshot date: every record below is consistent with 28.09.2026.
// Names use the "Ism Familiya" order and the same EMP codes as the module tables in allModulesData.ts.

export const initialEmployees: Employee[] = [
  {
    id: 'emp-1024',
    code: '#EMP-1024',
    fullName: 'Azizbek Aliyev',
    initials: 'AA',
    email: 'a.aliyev@hrm-enterprise.uz',
    phone: '+998 (90) 123-45-67',
    position: 'Senior Backend Developer',
    departmentId: 'dept-1',
    departmentName: 'IT & Engineering',
    unit: 'IT / Backend',
    branch: 'Toshkent HQ',
    status: 'active',
    joinedDate: '2024-03-12',
    salary: 18500000,
    currency: 'UZS',
    manager: 'Jasur Karimov',
    performanceScore: 94,
    kpiCompletion: 92,
    attendanceRate: 98.5,
    remainingLeaveDays: 16,
    birthDate: '1995-04-12',
    passportNo: 'AA 1234567',
    inn: '302485912',
    address: 'Toshkent sh., Chilonzor tumani, 9-mavze'
  },
  {
    id: 'emp-0987',
    code: '#EMP-0987',
    fullName: 'Malika Karimova',
    initials: 'MK',
    email: 'm.karimova@hrm-enterprise.uz',
    phone: '+998 (93) 456-78-90',
    position: 'HR Manager',
    departmentId: 'dept-2',
    departmentName: 'HR & People Operations',
    unit: 'HR',
    branch: 'Toshkent HQ',
    status: 'active',
    joinedDate: '2023-06-08',
    salary: 16200000,
    currency: 'UZS',
    manager: 'Anvarbek Director',
    performanceScore: 97,
    kpiCompletion: 95,
    attendanceRate: 99.1,
    remainingLeaveDays: 18,
    birthDate: '1993-08-22',
    passportNo: 'AB 8765432',
    inn: '308976541',
    address: 'Toshkent sh., Mirzo Ulug‘bek tumani'
  },
  {
    id: 'emp-1102',
    code: '#EMP-1102',
    fullName: 'Javohir Rasulov',
    initials: 'JR',
    email: 'j.rasulov@hrm-enterprise.uz',
    phone: '+998 (97) 210-33-44',
    position: 'Product Designer',
    departmentId: 'dept-1',
    departmentName: 'IT & Engineering',
    unit: 'IT / Product',
    branch: 'Toshkent HQ',
    status: 'on_leave',
    joinedDate: '2025-11-17',
    salary: 13500000,
    currency: 'UZS',
    manager: 'Jasur Karimov',
    performanceScore: 88,
    kpiCompletion: 87,
    attendanceRate: 96.2,
    remainingLeaveDays: 4,
    birthDate: '1997-01-09',
    passportNo: 'AC 2233445',
    inn: '311204567',
    address: 'Toshkent sh., Yunusobod tumani, 4-mavze'
  },
  {
    id: 'emp-1218',
    code: '#EMP-1218',
    fullName: 'Dilnoza Tursunova',
    initials: 'DT',
    email: 'd.tursunova@hrm-enterprise.uz',
    phone: '+998 (94) 321-65-43',
    position: 'Finance Specialist',
    departmentId: 'dept-4',
    departmentName: 'Finance & Accounting',
    unit: 'Finance',
    branch: 'Toshkent HQ',
    status: 'probation',
    joinedDate: '2026-08-02',
    salary: 9800000,
    currency: 'UZS',
    manager: 'Nargiza Sobirova',
    performanceScore: 82,
    kpiCompletion: 81,
    attendanceRate: 97.0,
    remainingLeaveDays: 0,
    birthDate: '1999-11-05',
    passportNo: 'AD 5544332',
    inn: '315674890',
    address: 'Toshkent sh., Yashnobod tumani',
    mentor: 'Malika Karimova',
    probationEndDate: '2026-11-02',
    probationRating: '8.1/10'
  },
  {
    id: 'emp-0874',
    code: '#EMP-0874',
    fullName: 'Sardor Mamatov',
    initials: 'SM',
    email: 's.mamatov@hrm-enterprise.uz',
    phone: '+998 (91) 333-44-55',
    position: 'Sales Team Lead',
    departmentId: 'dept-3',
    departmentName: 'Sales',
    unit: 'Sales',
    branch: 'Toshkent HQ',
    status: 'active',
    joinedDate: '2024-01-20',
    salary: 17300000,
    currency: 'UZS',
    manager: 'Anvarbek Director',
    performanceScore: 91,
    kpiCompletion: 90,
    attendanceRate: 95.8,
    remainingLeaveDays: 12,
    birthDate: '1991-07-30',
    passportNo: 'AE 3322119',
    inn: '305544332',
    address: 'Toshkent sh., Sergeli tumani'
  },
  {
    id: 'emp-0765',
    code: '#EMP-0765',
    fullName: 'Madina Ergasheva',
    initials: 'ME',
    email: 'm.ergasheva@hrm-enterprise.uz',
    phone: '+998 (99) 777-11-44',
    position: 'Frontend Developer',
    departmentId: 'dept-1',
    departmentName: 'IT & Engineering',
    unit: 'IT / Frontend',
    branch: 'Toshkent HQ',
    status: 'on_leave',
    joinedDate: '2022-09-11',
    salary: 15000000,
    currency: 'UZS',
    manager: 'Jasur Karimov',
    performanceScore: 93,
    kpiCompletion: 93,
    attendanceRate: 97.6,
    remainingLeaveDays: 11,
    birthDate: '1996-09-14',
    passportNo: 'AF 7766554',
    inn: '319800234',
    address: 'Toshkent sh., Yakkasaroy tumani'
  },
  {
    id: 'emp-1155',
    code: '#EMP-1155',
    fullName: 'Kamron Saidov',
    initials: 'KS',
    email: 'k.saidov@hrm-enterprise.uz',
    phone: '+998 (90) 990-88-77',
    position: 'Recruiter',
    departmentId: 'dept-2',
    departmentName: 'HR & People Operations',
    unit: 'HR / Recruitment',
    branch: 'Toshkent HQ',
    status: 'active',
    joinedDate: '2025-05-05',
    salary: 11400000,
    currency: 'UZS',
    manager: 'Malika Karimova',
    performanceScore: 89,
    kpiCompletion: 89,
    attendanceRate: 96.9,
    remainingLeaveDays: 15,
    birthDate: '1998-03-02',
    passportNo: 'AG 1122334',
    inn: '309988776',
    address: 'Toshkent sh., Mirobod tumani'
  },
  {
    id: 'emp-0941',
    code: '#EMP-0941',
    fullName: 'Zarina Ismoilova',
    initials: 'ZI',
    email: 'z.ismoilova@hrm-enterprise.uz',
    phone: '+998 (93) 111-00-22',
    position: 'Marketing Manager',
    departmentId: 'dept-5',
    departmentName: 'Marketing & Growth',
    unit: 'Marketing',
    branch: 'Toshkent HQ',
    status: 'active',
    joinedDate: '2024-02-14',
    salary: 14500000,
    currency: 'UZS',
    manager: 'Anvarbek Director',
    performanceScore: 92,
    kpiCompletion: 91,
    attendanceRate: 98.0,
    remainingLeaveDays: 9,
    birthDate: '1994-02-18',
    passportNo: 'AH 9900112',
    inn: '301298456',
    address: 'Toshkent sh., Shayxontohur tumani'
  },
  {
    id: 'emp-1291',
    code: '#EMP-1291',
    fullName: 'Bekzod Jo‘rayev',
    initials: 'BJ',
    email: 'b.jorayev@hrm-enterprise.uz',
    phone: '+998 (95) 404-12-12',
    position: 'QA Engineer',
    departmentId: 'dept-1',
    departmentName: 'IT & Engineering',
    unit: 'IT / QA',
    branch: 'Toshkent HQ',
    status: 'probation',
    joinedDate: '2026-07-21',
    salary: 9500000,
    currency: 'UZS',
    manager: 'Jasur Karimov',
    performanceScore: 86,
    kpiCompletion: 86,
    attendanceRate: 94.1,
    remainingLeaveDays: 0,
    birthDate: '2000-05-27',
    passportNo: 'AI 4455667',
    inn: '320011445',
    address: 'Toshkent sh., Olmazor tumani',
    mentor: 'Azizbek Aliyev',
    probationEndDate: '2026-10-21',
    probationRating: '8.6/10'
  },
  {
    id: 'emp-1302',
    code: '#EMP-1302',
    fullName: 'Nilufar Oripova',
    initials: 'NO',
    email: 'n.oripova@hrm-enterprise.uz',
    phone: '+998 (94) 888-22-11',
    position: 'HR Specialist',
    departmentId: 'dept-2',
    departmentName: 'HR & People Operations',
    unit: 'HR',
    branch: 'Toshkent HQ',
    status: 'probation',
    joinedDate: '2026-08-12',
    salary: 8800000,
    currency: 'UZS',
    manager: 'Malika Karimova',
    performanceScore: 88,
    kpiCompletion: 88,
    attendanceRate: 99.0,
    remainingLeaveDays: 0,
    birthDate: '1999-12-04',
    passportNo: 'AJ 7788990',
    inn: '321456789',
    address: 'Toshkent sh., Bektemir tumani',
    mentor: 'Malika Karimova',
    probationEndDate: '2026-11-12',
    probationRating: '8.8/10'
  },
  {
    id: 'emp-1320',
    code: '#EMP-1320',
    fullName: 'Otabek Hasanov',
    initials: 'OH',
    email: 'o.hasanov@hrm-enterprise.uz',
    phone: '+998 (97) 500-60-70',
    position: 'Sales Manager',
    departmentId: 'dept-3',
    departmentName: 'Sales',
    unit: 'Sales',
    branch: 'Toshkent HQ',
    status: 'probation',
    joinedDate: '2026-09-04',
    salary: 10500000,
    currency: 'UZS',
    manager: 'Sardor Mamatov',
    remainingLeaveDays: 0,
    birthDate: '1997-10-19',
    passportNo: 'AK 1231231',
    inn: '322789456',
    address: 'Toshkent sh., Uchtepa tumani',
    mentor: 'Sardor Mamatov',
    probationEndDate: '2026-12-04',
    probationRating: '9.0/10'
  },
  {
    id: 'emp-1063',
    code: '#EMP-1063',
    fullName: 'Nodira Oripova',
    initials: 'NO',
    email: 'no.oripova@hrm-enterprise.uz',
    phone: '+998 (90) 616-17-18',
    position: 'HR Generalist',
    departmentId: 'dept-2',
    departmentName: 'HR & People Operations',
    unit: 'HR',
    branch: 'Toshkent HQ',
    status: 'on_leave',
    joinedDate: '2025-02-03',
    salary: 9200000,
    currency: 'UZS',
    manager: 'Malika Karimova',
    performanceScore: 85,
    kpiCompletion: 85,
    attendanceRate: 95.4,
    remainingLeaveDays: 14,
    birthDate: '1996-06-21',
    passportNo: 'AL 3213214',
    inn: '317654321',
    address: 'Toshkent sh., Chilonzor tumani, 19-mavze'
  },
  {
    id: 'emp-0655',
    code: '#EMP-0655',
    fullName: 'Diyorbek Xasanov',
    initials: 'DX',
    email: 'd.xasanov@hrm-enterprise.uz',
    phone: '+998 (91) 150-20-30',
    position: 'Filial direktori',
    departmentId: 'dept-6',
    departmentName: 'Sales (Qo‘qon)',
    unit: 'Sales / Qo‘qon',
    branch: 'Qo‘qon',
    status: 'active',
    joinedDate: '2023-03-01',
    salary: 15000000,
    currency: 'UZS',
    manager: 'Anvarbek Director',
    performanceScore: 90,
    kpiCompletion: 89,
    attendanceRate: 97.8,
    remainingLeaveDays: 10,
    birthDate: '1988-05-14',
    passportNo: 'AM 2468024',
    inn: '303579135',
    address: 'Qo‘qon sh., Istiqlol ko‘chasi, 12'
  },
  {
    id: 'emp-1244',
    code: '#EMP-1244',
    fullName: 'Shohruh Nematov',
    initials: 'SN',
    email: 's.nematov@hrm-enterprise.uz',
    phone: '+998 (90) 321-44-55',
    position: 'Sales Manager',
    departmentId: 'dept-6',
    departmentName: 'Sales (Qo‘qon)',
    unit: 'Sales / Qo‘qon',
    branch: 'Qo‘qon',
    status: 'active',
    joinedDate: '2025-10-06',
    salary: 9500000,
    currency: 'UZS',
    manager: 'Diyorbek Xasanov',
    performanceScore: 87,
    kpiCompletion: 86,
    attendanceRate: 96.5,
    remainingLeaveDays: 15,
    birthDate: '1998-08-03',
    passportNo: 'AN 1357913',
    inn: '318642097',
    address: 'Qo‘qon sh., Navoiy ko‘chasi, 44'
  },
  {
    id: 'emp-0690',
    code: '#EMP-0690',
    fullName: 'Umid Rahimov',
    initials: 'UR',
    email: 'u.rahimov@hrm-enterprise.uz',
    phone: '+998 (93) 720-11-22',
    position: 'Filial direktori',
    departmentId: 'dept-7',
    departmentName: 'IT Hub (Samarqand)',
    unit: 'IT / Samarqand',
    branch: 'Samarqand',
    status: 'active',
    joinedDate: '2023-09-11',
    salary: 16000000,
    currency: 'UZS',
    manager: 'Anvarbek Director',
    performanceScore: 92,
    kpiCompletion: 91,
    attendanceRate: 98.2,
    remainingLeaveDays: 13,
    birthDate: '1990-01-27',
    passportNo: 'AO 9753197',
    inn: '306482159',
    address: 'Samarqand sh., Registon ko‘chasi, 3'
  },
  {
    id: 'emp-0731',
    code: '#EMP-0731',
    fullName: 'Kamoliddin Aliyev',
    initials: 'KA',
    email: 'k.aliyev@hrm-enterprise.uz',
    phone: '+998 (94) 610-70-80',
    position: 'Filial direktori',
    departmentId: 'dept-8',
    departmentName: 'Sales (Andijon)',
    unit: 'Sales / Andijon',
    branch: 'Andijon',
    status: 'active',
    joinedDate: '2024-04-15',
    salary: 14000000,
    currency: 'UZS',
    manager: 'Anvarbek Director',
    performanceScore: 88,
    kpiCompletion: 87,
    attendanceRate: 97.1,
    remainingLeaveDays: 17,
    birthDate: '1989-11-09',
    passportNo: 'AP 8642086',
    inn: '310864297',
    address: 'Andijon sh., Bobur shoh ko‘chasi, 21'
  },
  {
    id: 'emp-0712',
    code: '#EMP-0712',
    fullName: 'Akmal Qosimov',
    initials: 'AQ',
    email: 'a.qosimov@hrm-enterprise.uz',
    phone: '+998 (93) 212-34-56',
    position: 'Senior QA',
    departmentId: 'dept-1',
    departmentName: 'IT & Engineering',
    unit: 'IT / QA',
    branch: 'Toshkent HQ',
    status: 'terminated',
    joinedDate: '2022-04-18',
    salary: 14000000,
    currency: 'UZS',
    manager: 'Jasur Karimov',
    performanceScore: 84,
    kpiCompletion: 83,
    attendanceRate: 93.5,
    remainingLeaveDays: 0,
    exitDate: '2026-09-12',
    exitReason: 'Career change',
    exitInterview: true
  },
  {
    id: 'emp-0833',
    code: '#EMP-0833',
    fullName: 'Feruza Nazarova',
    initials: 'FN',
    email: 'f.nazarova@hrm-enterprise.uz',
    phone: '+998 (91) 404-50-60',
    position: 'HR Specialist',
    departmentId: 'dept-2',
    departmentName: 'HR & People Operations',
    unit: 'HR',
    branch: 'Toshkent HQ',
    status: 'terminated',
    joinedDate: '2023-11-01',
    salary: 8500000,
    currency: 'UZS',
    manager: 'Malika Karimova',
    performanceScore: 80,
    kpiCompletion: 79,
    attendanceRate: 94.8,
    remainingLeaveDays: 0,
    exitDate: '2026-08-28',
    exitReason: 'Relocation',
    exitInterview: true
  },
  {
    id: 'emp-0902',
    code: '#EMP-0902',
    fullName: 'Rustam Aliyev',
    initials: 'RA',
    email: 'r.aliyev@hrm-enterprise.uz',
    phone: '+998 (99) 303-40-50',
    position: 'Sales Manager',
    departmentId: 'dept-6',
    departmentName: 'Sales (Qo‘qon)',
    unit: 'Sales / Qo‘qon',
    branch: 'Qo‘qon',
    status: 'terminated',
    joinedDate: '2024-05-13',
    salary: 10000000,
    currency: 'UZS',
    manager: 'Sardor Mamatov',
    performanceScore: 72,
    kpiCompletion: 70,
    attendanceRate: 88.0,
    remainingLeaveDays: 0,
    exitDate: '2026-07-16',
    exitReason: 'Personal',
    exitInterview: false
  }
];

export const companyInfo: Company = {
  name: 'HRM Enterprise',
  legalName: '“HRM Enterprise” MChJ',
  inn: '307845120',
  address: 'Toshkent sh., Amir Temur shoh ko‘chasi, 107B',
  director: 'Anvarbek Director',
  phone: '+998 (71) 200-00-11'
};

export const initialBranches: Branch[] = [
  {
    id: 'br-1',
    name: 'Toshkent HQ',
    city: 'Toshkent',
    address: 'Amir Temur shoh ko‘chasi, 107B',
    headName: 'Sherzod Karimov',
    phone: '+998 (71) 200-00-11',
    status: 'active'
  },
  {
    id: 'br-2',
    name: 'Qo‘qon',
    city: 'Farg‘ona',
    address: 'Turkiston ko‘chasi, 21',
    headName: 'Diyorbek Xasanov',
    phone: '+998 (73) 542-10-20',
    status: 'active'
  },
  {
    id: 'br-3',
    name: 'Samarqand',
    city: 'Samarqand',
    address: 'Universitet xiyoboni, 15',
    headName: 'Umid Rahimov',
    phone: '+998 (66) 230-10-20',
    status: 'active'
  },
  {
    id: 'br-4',
    name: 'Andijon',
    city: 'Andijon',
    address: 'Bobur shoh ko‘chasi, 8',
    headName: 'Kamoliddin Aliyev',
    phone: '+998 (74) 244-55-66',
    status: 'active'
  }
];

export const initialDepartments: Department[] = [
  { id: 'dept-1', branchId: 'br-1', name: 'IT & Engineering', code: 'DEP-IT', headName: 'Jasur Karimov', color: 'indigo' },
  { id: 'dept-2', branchId: 'br-1', name: 'HR & People Operations', code: 'DEP-HR', headName: 'Malika Karimova', color: 'purple' },
  { id: 'dept-3', branchId: 'br-1', name: 'Sales', code: 'DEP-SLS', headName: 'Sardor Mamatov', color: 'amber' },
  { id: 'dept-4', branchId: 'br-1', name: 'Finance & Accounting', code: 'DEP-FIN', headName: 'Nargiza Sobirova', color: 'emerald' },
  { id: 'dept-5', branchId: 'br-1', name: 'Marketing & Growth', code: 'DEP-MKT', headName: 'Zarina Ismoilova', color: 'rose' },
  { id: 'dept-6', branchId: 'br-2', name: 'Sales (Qo‘qon)', code: 'DEP-SLS-QQ', headName: 'Diyorbek Xasanov', color: 'amber' },
  { id: 'dept-7', branchId: 'br-3', name: 'IT Hub (Samarqand)', code: 'DEP-IT-SMQ', headName: 'Umid Rahimov', color: 'indigo' },
  { id: 'dept-8', branchId: 'br-4', name: 'Sales (Andijon)', code: 'DEP-SLS-AND', headName: 'Kamoliddin Aliyev', color: 'amber' }
];

const question = (id: string, label: string, answerType: ApplicationQuestion['answerType'], required = true): ApplicationQuestion => ({
  id,
  label,
  answerType,
  required
});

// What each vacancy asks applicants to submit (entered by HR when the vacancy is created)
const VACANCY_QUESTIONS: Record<string, ApplicationQuestion[]> = {
  'VAC-041': [
    question('q-cv', 'Rezyume (CV)', 'file'),
    question('q-github', 'GitHub yoki portfolio havolasi', 'text'),
    question('q-project', 'Eng murakkab loyihangiz haqida qisqacha', 'text', false),
    question('q-passport', 'Pasport nusxasi', 'image')
  ],
  'VAC-037': [
    question('q-cv', 'Rezyume (CV)', 'file'),
    question('q-diploma', 'Diplom nusxasi', 'image'),
    question('q-why-hr', 'Nega HR sohasini tanladingiz?', 'text')
  ],
  'VAC-044': [
    question('q-cv', 'Rezyume (CV)', 'file'),
    question('q-sales', 'Oxirgi yildagi savdo natijalaringiz', 'text'),
    question('q-photo', 'Rasm 3×4', 'image', false)
  ],
  'VAC-039': [
    question('q-portfolio', 'Portfolio (PDF)', 'file'),
    question('q-behance', 'Behance / Dribbble havolasi', 'text'),
    question('q-cv', 'Rezyume (CV)', 'file', false)
  ],
  'VAC-046': [
    question('q-cv', 'Rezyume (CV)', 'file'),
    question('q-tools', 'Qaysi test vositalari bilan ishlagansiz?', 'text')
  ],
  'VAC-048': [
    question('q-cv', 'Rezyume (CV)', 'file'),
    question('q-diploma', 'Diplom nusxasi', 'image'),
    question('q-1c', '1C bilan ishlash tajribangiz', 'text')
  ]
};

export const initialVacancies: Vacancy[] = [
  {
    id: 'VAC-041',
    branchId: 'br-1',
    departmentId: 'dept-1',
    title: 'Senior Backend Developer',
    department: 'IT & Engineering',
    location: 'Toshkent HQ',
    type: 'Hybrid',
    experienceLevel: '4+ yil',
    salaryRange: '18,000,000 - 26,000,000 UZS',
    deadline: '2026-10-10',
    status: 'open',
    stages: defaultPipelineStages(),
    questions: VACANCY_QUESTIONS['VAC-041'],
    tags: ['Python', 'PostgreSQL', 'Docker', 'REST']
  },
  {
    id: 'VAC-037',
    branchId: 'br-1',
    departmentId: 'dept-2',
    title: 'HR Specialist',
    department: 'HR & People Operations',
    location: 'Toshkent HQ',
    type: 'Full-time',
    experienceLevel: '2+ yil',
    salaryRange: '9,000,000 - 12,000,000 UZS',
    deadline: '2026-10-05',
    status: 'interviewing',
    stages: defaultPipelineStages(),
    questions: VACANCY_QUESTIONS['VAC-037'],
    tags: ['Recruitment', 'Onboarding', 'Kadrlar hisobi']
  },
  {
    id: 'VAC-044',
    branchId: 'br-1',
    departmentId: 'dept-3',
    title: 'Sales Manager',
    department: 'Sales',
    location: 'Toshkent HQ',
    type: 'Full-time',
    experienceLevel: '2+ yil',
    salaryRange: '12,000,000 - 18,000,000 UZS',
    deadline: '2026-10-18',
    status: 'open',
    stages: defaultPipelineStages(),
    questions: VACANCY_QUESTIONS['VAC-044'],
    tags: ['B2B', 'CRM', 'Negotiation']
  },
  {
    id: 'VAC-039',
    branchId: 'br-1',
    departmentId: 'dept-1',
    title: 'Product Designer',
    department: 'IT & Engineering',
    location: 'Toshkent HQ',
    type: 'Hybrid',
    experienceLevel: '3+ yil',
    salaryRange: '13,000,000 - 17,000,000 UZS',
    deadline: '2026-10-12',
    status: 'open',
    stages: defaultPipelineStages(),
    questions: VACANCY_QUESTIONS['VAC-039'],
    tags: ['Figma', 'UX Research', 'Design System']
  },
  {
    id: 'VAC-046',
    branchId: 'br-1',
    departmentId: 'dept-1',
    title: 'QA Engineer',
    department: 'IT & Engineering',
    location: 'Toshkent HQ',
    type: 'Full-time',
    experienceLevel: '1+ yil',
    salaryRange: '8,000,000 - 11,000,000 UZS',
    deadline: '2026-10-22',
    status: 'open',
    stages: defaultPipelineStages(),
    questions: VACANCY_QUESTIONS['VAC-046'],
    tags: ['Manual QA', 'Selenium', 'API testing']
  },
  {
    id: 'VAC-048',
    branchId: 'br-1',
    departmentId: 'dept-4',
    title: 'Accountant',
    department: 'Finance & Accounting',
    location: 'Toshkent HQ',
    type: 'Full-time',
    experienceLevel: '3+ yil',
    salaryRange: '10,000,000 - 14,000,000 UZS',
    deadline: '2026-10-28',
    status: 'open',
    stages: defaultPipelineStages(),
    questions: VACANCY_QUESTIONS['VAC-048'],
    tags: ['1C 8.3', 'Soliq', 'IFRS']
  }
];

const vacancyTitle = (id: string) => initialVacancies.find((v) => v.id === id)?.title ?? '';

/** Placeholder scan of an uploaded document, so image answers have something to show in the demo. */
const demoImage = (title: string, name: string, hue: number): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
<rect width="640" height="420" rx="24" fill="hsl(${hue},55%,96%)"/>
<rect x="24" y="24" width="592" height="372" rx="16" fill="#fff" stroke="hsl(${hue},45%,70%)" stroke-width="3"/>
<rect x="56" y="96" width="150" height="190" rx="10" fill="hsl(${hue},40%,88%)"/>
<circle cx="131" cy="160" r="38" fill="hsl(${hue},35%,72%)"/>
<rect x="81" y="210" width="100" height="56" rx="28" fill="hsl(${hue},35%,72%)"/>
<text x="56" y="70" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="hsl(${hue},45%,30%)">${title.toUpperCase()}</text>
<text x="236" y="130" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#1e293b">${name}</text>
<rect x="236" y="160" width="320" height="14" rx="7" fill="#e2e8f0"/>
<rect x="236" y="190" width="260" height="14" rx="7" fill="#e2e8f0"/>
<rect x="236" y="220" width="290" height="14" rx="7" fill="#e2e8f0"/>
<text x="56" y="360" font-family="Arial,sans-serif" font-size="18" fill="#94a3b8">Demo nusxa • HRM Enterprise</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// Sample text answers per question id; candidates get them round-robin
const SAMPLE_TEXT: Record<string, string[]> = {
  'q-github': ['github.com/myusuf-dev', 'github.com/bakramov', 'gitlab.com/jtoirov', 'github.com/eldorq', 'github.com/smirzayev'],
  'q-project': [
    'To‘lov tizimi uchun mikroservis arxitekturasini loyihalab, kuniga 2 mln tranzaksiyani qayta ishlashga erishdim.',
    'Logistika kompaniyasi uchun marshrutlarni optimallashtirish API sini yozdim (Python, PostgreSQL, Redis).',
    'Universitet uchun elektron jurnal tizimini noldan ishlab chiqdim.'
  ],
  'q-why-hr': [
    'Odamlar bilan ishlash va ularning rivojlanishiga hissa qo‘shish menga zavq beradi. 4 yil rekruting tajribam bor.',
    'Psixologiya ma’lumotim bor, jamoadagi muhitni yaxshilash bo‘yicha loyihalarda qatnashganman.',
    'Kadrlar hisobi va onboarding jarayonlarini tizimlashtirishni yaxshi ko‘raman.'
  ],
  'q-sales': [
    'B2B savdoda yillik reja 118% ga bajarildi, 42 ta yangi korporativ mijoz jalb qilindi.',
    'Chakana savdo tarmog‘ida oylik o‘rtacha 350 mln so‘m savdo, jamoada 1-o‘rin.',
    'Distribyutsiya kompaniyasida hududiy savdoni 35% ga oshirdim.'
  ],
  'q-behance': ['behance.net/gulnoza-ux', 'dribbble.com/kamola_design'],
  'q-tools': [
    'Postman, Selenium WebDriver, Jira, TestRail; API testlarni Postman kolleksiyalarida avtomatlashtirganman.',
    'Manual testlash, Jira, qisman Cypress bilan tanishman.'
  ],
  'q-1c': [
    '1C:Buxgalteriya 8.3 da 5 yil, oylik va yillik hisobotlar, soliq deklaratsiyalari.',
    '1C:ZUP da ish haqi hisob-kitobi, 2 yil tajriba.'
  ]
};

const FILE_SUFFIX: Record<string, string> = { 'q-cv': 'CV.pdf', 'q-portfolio': 'Portfolio.pdf' };

/**
 * Answers for a demo candidate. Required questions are always answered; optional ones are skipped
 * for part of the fresh applications so the "no answer" state is visible too.
 */
const buildAnswers = (index: number, fullName: string, vacancyId: string, stageId: string): CandidateAnswer[] => {
  const slug = fullName.replace(/[‘’ʻʼ']/g, '').replace(/\s+/g, '_');
  return (VACANCY_QUESTIONS[vacancyId] ?? []).flatMap((q): CandidateAnswer[] => {
    if (!q.required && (stageId === 'new' || index % 2 === 1)) return [];
    if (q.answerType === 'text') {
      const options = SAMPLE_TEXT[q.id] ?? ['Javob kiritilgan.'];
      return [{ questionId: q.id, text: options[index % options.length] }];
    }
    if (q.answerType === 'file') {
      return [{ questionId: q.id, fileName: `${slug}_${FILE_SUFFIX[q.id] ?? 'hujjat.pdf'}`, fileSize: `${(0.3 + ((index * 37) % 19) / 10).toFixed(1)} MB` }];
    }
    return [
      {
        questionId: q.id,
        fileName: `${slug}_${q.id.replace('q-', '')}.jpg`,
        fileSize: `${(0.8 + ((index * 23) % 15) / 10).toFixed(1)} MB`,
        fileUrl: demoImage(q.label, fullName, (index * 47) % 360)
      }
    ];
  });
};

let candidateIndex = 0;

const cand = (
  id: string,
  fullName: string,
  vacancyId: string,
  stageId: string,
  score: number,
  appliedDate: string,
  phone: string,
  email: string,
  interviewDate?: string
): Candidate => ({
  id,
  fullName,
  vacancyId,
  vacancyTitle: vacancyTitle(vacancyId),
  phone,
  email,
  stageId,
  answers: buildAnswers(candidateIndex++, fullName, vacancyId, stageId),
  score,
  appliedDate,
  ...(interviewDate ? { interviewDate } : {})
});

// Pipeline columns use the default stage ids from utils/pipeline.ts
export const initialCandidates: Candidate[] = [
  cand('cand-2121', 'Muhammad Yusuf', 'VAC-041', 'offer', 88, '2026-09-12', '+998 (90) 555-12-34', 'm.yusuf@gmail.com', '28.09.2026, 14:00'),
  cand('cand-2133', 'Bobur Akramov', 'VAC-041', 'interview', 79, '2026-09-22', '+998 (90) 777-45-12', 'b.akramov@dev.uz', '30.09.2026, 11:00'),
  cand('cand-2141', 'Jasur Toirov', 'VAC-041', 'screening', 75, '2026-09-25', '+998 (93) 210-54-76', 'jasur.toirov@mail.uz'),
  cand('cand-2147', 'Eldor Qahhorov', 'VAC-041', 'new', 71, '2026-09-27', '+998 (99) 404-22-18', 'eldor.q@gmail.com'),
  cand('cand-2112', 'Sanjar Mirzayev', 'VAC-041', 'rejected', 58, '2026-09-08', '+998 (97) 333-81-90', 's.mirzayev@inbox.uz'),
  cand('cand-2124', 'Shahnoza Raxmatova', 'VAC-037', 'offer', 91, '2026-09-15', '+998 (93) 444-22-11', 'sh.raxmatova@mail.uz', '28.09.2026, 15:30'),
  cand('cand-2138', 'Munisa Aliqulova', 'VAC-037', 'interview', 84, '2026-09-21', '+998 (94) 125-67-89', 'munisa.a@gmail.com', '01.10.2026, 10:30'),
  cand('cand-2149', 'Gavhar Yo‘ldosheva', 'VAC-037', 'new', 72, '2026-09-27', '+998 (91) 780-12-40', 'gavhar.y@mail.uz'),
  cand('cand-2118', 'Umidjon Qodirov', 'VAC-044', 'offer', 86, '2026-09-10', '+998 (97) 123-99-88', 'u.qodirov@gmail.com', '29.09.2026, 10:00'),
  cand('cand-2135', 'Ravshan Ergashev', 'VAC-044', 'screening', 77, '2026-09-23', '+998 (90) 650-30-20', 'ravshan.e@mail.uz'),
  cand('cand-2150', 'Doniyor Sattorov', 'VAC-044', 'new', 69, '2026-09-28', '+998 (95) 112-43-65', 'd.sattorov@gmail.com'),
  cand('cand-2130', 'Gulnoza Tursunova', 'VAC-039', 'test', 82, '2026-09-19', '+998 (99) 456-78-90', 'g.tursunova@design.uz', '29.09.2026, 16:00'),
  cand('cand-2142', 'Kamola Rustamova', 'VAC-039', 'screening', 78, '2026-09-24', '+998 (93) 901-23-45', 'kamola.r@design.uz'),
  cand('cand-2136', 'Sherzod Nazarov', 'VAC-046', 'screening', 74, '2026-09-25', '+998 (94) 222-18-19', 's.nazarov@gmail.com'),
  cand('cand-2151', 'Asadbek Hamroyev', 'VAC-046', 'new', 70, '2026-09-28', '+998 (90) 318-47-26', 'asadbek.h@mail.uz'),
  cand('cand-2139', 'Laylo Karimova', 'VAC-048', 'new', 70, '2026-09-27', '+998 (91) 600-70-80', 'laylo.k@mail.uz'),
  cand('cand-2127', 'Nargiza Umarova', 'VAC-048', 'interview', 83, '2026-09-17', '+998 (97) 245-68-13', 'n.umarova@gmail.com', '30.09.2026, 15:00')
];

const att = (
  n: number,
  emp: Employee,
  device: string,
  type: AttendanceRecord['type'],
  time: string,
  status: AttendanceRecord['status'] = 'on_time',
  delayMinutes?: number
): AttendanceRecord => ({
  id: `att-${n}`,
  employeeId: emp.id,
  employeeName: emp.fullName,
  initials: emp.initials,
  department: emp.departmentName,
  device,
  type,
  status,
  timestamp: `2026-09-28 ${time}`,
  time,
  ...(delayMinutes !== undefined ? { delayMinutes } : {})
});

const emp = (code: string): Employee => {
  const found = initialEmployees.find((e) => e.code === code);
  if (!found) throw new Error(`Unknown employee code in mock data: ${code}`);
  return found;
};

// 28.09.2026 turnstile / Face ID stream, newest first. Employees on leave (Javohir, Madina, Nodira) have no records.
export const initialAttendanceLogs: AttendanceRecord[] = [
  att(12, emp('#EMP-1155'), 'Face ID #2 (2-qavat)', 'out', '18:11:05', 'normal'),
  att(11, emp('#EMP-1024'), 'Face ID #1 (Lobby)', 'out', '18:04:37', 'normal'),
  att(10, emp('#EMP-0874'), 'Turniket #2 (Markaziy)', 'out', '18:02:10', 'normal'),
  att(9, emp('#EMP-0874'), 'Turniket #2 (Markaziy)', 'in', '09:17:22', 'delayed', 17),
  att(8, emp('#EMP-1155'), 'Face ID #2 (2-qavat)', 'in', '09:04:48', 'delayed', 4),
  att(7, emp('#EMP-0987'), 'Face ID #2 (2-qavat)', 'in', '08:58:30', 'on_time'),
  att(6, emp('#EMP-1302'), 'Face ID #2 (2-qavat)', 'in', '08:57:03', 'on_time'),
  att(5, emp('#EMP-1218'), 'Turniket #1 (Lobby)', 'in', '08:55:41', 'on_time'),
  att(4, emp('#EMP-1024'), 'Face ID #1 (Lobby)', 'in', '08:53:14', 'on_time'),
  att(3, emp('#EMP-1291'), 'Turniket #1 (Lobby)', 'in', '08:49:26', 'on_time'),
  att(2, emp('#EMP-0941'), 'Face ID #1 (Lobby)', 'in', '08:47:09', 'on_time'),
  att(1, emp('#EMP-1320'), 'Turniket #1 (Lobby)', 'in', '08:40:55', 'on_time')
];

const leave = (
  id: string,
  e: Employee,
  type: LeaveRequest['type'],
  startDate: string,
  endDate: string,
  reason: string,
  requestedAt: string,
  status: LeaveRequest['status'],
  approvedBy?: string
): LeaveRequest => ({
  id,
  employeeId: e.id,
  employeeName: e.fullName,
  department: e.departmentName,
  position: e.position,
  type,
  startDate,
  endDate,
  daysCount: inclusiveDays(startDate, endDate),
  reason,
  requestedAt,
  status,
  ...(approvedBy ? { approvedBy } : {})
});

export const initialLeaveRequests: LeaveRequest[] = [
  leave('lr-6', emp('#EMP-1024'), 'yillik', '2026-10-12', '2026-10-16', 'Yillik rejali mehnat ta’tili', '2026-09-27', 'pending'),
  leave('lr-5', emp('#EMP-0874'), 'ruxsatnoma', '2026-10-06', '2026-10-06', 'Oilaviy sabab bilan 1 kunlik ruxsat', '2026-09-27', 'pending'),
  leave('lr-4', emp('#EMP-1218'), 'ishhaqisiz', '2026-10-15', '2026-10-19', 'Sinov muddatida ish haqi saqlanmagan ta’til (to‘y marosimi)', '2026-09-28', 'pending'),
  leave('lr-3', emp('#EMP-1063'), 'kasallik', '2026-09-28', '2026-09-29', 'Shifokor byulleteni (№ 044-U)', '2026-09-28', 'approved', 'Malika Karimova'),
  leave('lr-2', emp('#EMP-0765'), 'yillik', '2026-09-28', '2026-10-02', 'Yillik mehnat ta’tili', '2026-09-18', 'approved', 'Jasur Karimov'),
  leave('lr-1', emp('#EMP-1102'), 'yillik', '2026-09-26', '2026-09-30', 'Yillik mehnat ta’tili', '2026-09-15', 'approved', 'Jasur Karimov')
];

// Monthly components per employee (UZS): [kpiBonus, overtimePay, allowances, deductions]
const payrollInputs: [code: string, components: [number, number, number, number]][] = [
  ['#EMP-1024', [2100000, 1200000, 500000, 0]],
  ['#EMP-0987', [1400000, 0, 500000, 200000]],
  ['#EMP-0874', [4200000, 0, 500000, 0]],
  ['#EMP-0941', [1500000, 0, 500000, 0]],
  ['#EMP-1155', [900000, 500000, 300000, 0]],
  ['#EMP-0765', [1300000, 0, 500000, 0]],
  ['#EMP-1102', [800000, 0, 300000, 0]],
  ['#EMP-1063', [500000, 0, 300000, 0]],
  ['#EMP-1218', [400000, 0, 200000, 0]],
  ['#EMP-1291', [300000, 0, 200000, 0]],
  ['#EMP-1302', [300000, 0, 200000, 0]],
  ['#EMP-1320', [0, 0, 200000, 0]],
  ['#EMP-0655', [1600000, 0, 500000, 0]],
  ['#EMP-1244', [1100000, 0, 300000, 0]],
  ['#EMP-0690', [1500000, 0, 500000, 0]],
  ['#EMP-0731', [1200000, 0, 500000, 0]]
];

const PAYROLL_MONTHS: { month: string; status: PayrollRecord['paymentStatus']; bonusFactor: number; fromDate: string }[] = [
  { month: 'Sentyabr 2026', status: 'approved', bonusFactor: 1, fromDate: '2026-09-30' },
  { month: 'Avgust 2026', status: 'paid', bonusFactor: 0.9, fromDate: '2026-08-31' },
  { month: 'Iyul 2026', status: 'paid', bonusFactor: 0.85, fromDate: '2026-07-31' }
];

const roundTo1000 = (n: number) => Math.round(n / 1000) * 1000;

// Only employees already hired by the end of the month get a payroll record for it.
export const initialPayrollRecords: PayrollRecord[] = PAYROLL_MONTHS.flatMap(({ month, status, bonusFactor, fromDate }, mi) =>
  payrollInputs
    .map(([code, [kpiBonus, overtimePay, allowances, deductions]]) => ({ e: emp(code), kpiBonus, overtimePay, allowances, deductions }))
    .filter(({ e }) => e.joinedDate <= fromDate)
    .map(({ e, kpiBonus, overtimePay, allowances, deductions }) => {
      const record: PayrollRecord = {
        id: `pay-${mi + 1}-${e.code.replace('#EMP-', '')}`,
        employeeId: e.id,
        employeeName: e.fullName,
        position: e.position,
        department: e.departmentName,
        baseSalary: e.salary,
        kpiBonus: roundTo1000(kpiBonus * bonusFactor),
        overtimePay: mi === 0 ? overtimePay : 0,
        allowances,
        deductions: mi === 0 ? deductions : 0,
        taxRate: 12,
        netSalary: 0,
        paymentStatus: status,
        month
      };
      return { ...record, netSalary: payrollNet(record) };
    })
);

export const initialKPIReviews: KPIReview[] = [
  {
    id: 'kpi-1',
    employeeId: 'emp-1024',
    employeeName: 'Azizbek Aliyev',
    department: 'IT & Engineering',
    period: 'Q3 2026',
    targetScore: 90,
    achievedScore: 92,
    percentage: 102,
    status: 'completed',
    managerComment: 'API barqarorligi 99.9% ga yetkazildi, mikroservislar optimizatsiyasi a’lo darajada bajarildi.'
  },
  {
    id: 'kpi-2',
    employeeId: 'emp-0987',
    employeeName: 'Malika Karimova',
    department: 'HR & People Operations',
    period: 'Q3 2026',
    targetScore: 90,
    achievedScore: 95,
    percentage: 106,
    status: 'completed',
    managerComment: 'Time-to-hire 18 kungacha qisqardi, yangi onboarding jarayoni joriy qilindi.'
  },
  {
    id: 'kpi-3',
    employeeId: 'emp-1102',
    employeeName: 'Javohir Rasulov',
    department: 'IT & Engineering',
    period: 'Q3 2026',
    targetScore: 90,
    achievedScore: 87,
    percentage: 97,
    status: 'in_progress',
    managerComment: 'Design system 2.0 yakunlanish bosqichida.'
  },
  {
    id: 'kpi-4',
    employeeId: 'emp-1218',
    employeeName: 'Dilnoza Tursunova',
    department: 'Finance & Accounting',
    period: 'Q3 2026',
    targetScore: 90,
    achievedScore: 81,
    percentage: 90,
    status: 'in_progress',
    managerComment: 'Sinov muddati doirasida moliyaviy hisobotlar tahlili o‘rganilmoqda.'
  },
  {
    id: 'kpi-5',
    employeeId: 'emp-0874',
    employeeName: 'Sardor Mamatov',
    department: 'Sales',
    period: 'Q3 2026',
    targetScore: 90,
    achievedScore: 90,
    percentage: 100,
    status: 'pending'
  }
];

export const initialDocuments: HRDocument[] = [
  {
    id: 'doc-1',
    number: 'ORD-2026-141',
    title: 'Ish haqini o‘zgartirish to‘g‘risida buyruq (Sardor Mamatov)',
    type: 'order',
    employeeName: 'Sardor Mamatov',
    createdDate: '2026-09-29',
    status: 'pending',
    fileSize: '620 KB PDF'
  },
  {
    id: 'doc-2',
    number: 'ORD-2026-127',
    title: 'Mehnat ta’tili berish haqida buyruq (Javohir Rasulov)',
    type: 'order',
    employeeName: 'Javohir Rasulov',
    createdDate: '2026-09-26',
    status: 'signed',
    fileSize: '950 KB PDF'
  },
  {
    id: 'doc-3',
    number: 'ORD-2026-132',
    title: 'Xodimni ishga qabul qilish to‘g‘risida buyruq (Dilnoza Tursunova)',
    type: 'order',
    employeeName: 'Dilnoza Tursunova',
    createdDate: '2026-08-02',
    status: 'signed',
    fileSize: '1.4 MB PDF'
  },
  {
    id: 'doc-4',
    number: 'ORD-2026-118',
    title: 'Lavozimga ko‘tarish to‘g‘risida buyruq (Azizbek Aliyev)',
    type: 'order',
    employeeName: 'Azizbek Aliyev',
    createdDate: '2026-06-01',
    status: 'signed',
    fileSize: '840 KB PDF'
  },
  {
    id: 'doc-5',
    number: 'CTR-0987',
    title: 'Mehnat shartnomasi va qo‘shimcha kelishuv (Malika Karimova)',
    type: 'contract',
    employeeName: 'Malika Karimova',
    createdDate: '2023-06-08',
    status: 'signed',
    fileSize: '2.1 MB PDF'
  },
  {
    id: 'doc-6',
    number: 'REQ-2026-089',
    title: 'Xizmat safari xarajatlarini qoplash arizasi (Dilshod Rahimov)',
    type: 'request',
    employeeName: 'Dilshod Rahimov',
    createdDate: '2026-09-27',
    status: 'signed',
    fileSize: '410 KB PDF'
  },
  {
    id: 'doc-7',
    number: 'REQ-2026-091',
    title: 'Moddiy yordam ajratish to‘g‘risida ariza (Madina Usmonova)',
    type: 'request',
    employeeName: 'Madina Usmonova',
    createdDate: '2026-09-28',
    status: 'pending',
    fileSize: '320 KB PDF'
  }
];

export const initialAuditLogs: AuditLogItem[] = [
  {
    id: 'log-4',
    userName: 'Admin Manager',
    userRole: 'Super Admin',
    action: 'Xodim profili yangilandi: Azizbek Aliyev (EMP-1024)',
    module: 'Employees',
    ipAddress: '10.2.4.19',
    timestamp: '2026-09-28 12:58:04',
    status: 'success'
  },
  {
    id: 'log-3',
    userName: 'Malika Karimova',
    userRole: 'HR Manager',
    action: 'Ma’lumotnoma so‘rovi tasdiqlandi: Sardor Mamatov (REQ-219)',
    module: 'Requests',
    ipAddress: '10.2.4.22',
    timestamp: '2026-09-28 12:47:30',
    status: 'success'
  },
  {
    id: 'log-2',
    userName: 'Kamron Saidov',
    userRole: 'Recruiter',
    action: 'Yangi nomzod qo‘shildi: Shahnoza Raxmatova (HR Specialist)',
    module: 'Recruitment',
    ipAddress: '10.2.4.31',
    timestamp: '2026-09-28 12:31:12',
    status: 'success'
  },
  {
    id: 'log-1',
    userName: 'Tizim avtomatizatsiyasi',
    userRole: 'System',
    action: 'Sinov muddati eslatmasi yuborildi: Dilnoza Tursunova (EMP-1218)',
    module: 'Probation',
    ipAddress: '—',
    timestamp: '2026-09-28 12:13:00',
    status: 'warning'
  }
];
