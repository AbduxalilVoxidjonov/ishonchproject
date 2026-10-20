// Full module dataset from the original HRM platform files.
// Organization, employee and vacancy modules are shown by their interactive pages; leave and payroll rows are built from app state in derivedModules.ts.
export interface NavItem {
  href: string;
  id: string;
  icon: string;
  title: string;
}

export interface NavGroup {
  group: string;
  links: NavItem[];
}

export interface ModuleKPI {
  lbl: string;
  num: string;
  trend: string;
}

export interface HRMModuleData {
  id: string;
  file: string;
  title: string;
  crumb: string;
  h1: string;
  sub: string;
  kpis: ModuleKPI[];
  headers: string[];
  rows: string[][];
}

export const navigationGroups: NavGroup[] = [
  {
    "group": "Boshqaruv",
    "links": [
      {
        "href": "dashboard.html",
        "id": "dashboard",
        "icon": "⌂",
        "title": "Dashboard"
      }
    ]
  },
  {
    "group": "Vakansiyalar",
    "links": [
      {
        "href": "vacancies.html",
        "id": "vacancies",
        "icon": "✦",
        "title": "Vakansiyalar"
      }
    ]
  },
  {
    "group": "Xodimlar",
    "links": [
      {
        "href": "employees.html",
        "id": "employees",
        "icon": "◉",
        "title": "Xodimlar"
      }
    ]
  },
  {
    "group": "Tashkiliy tuzilma",
    "links": [
      {
        "href": "organization.html",
        "id": "organization",
        "icon": "▦",
        "title": "Tashkiliy tuzilma"
      }
    ]
  },
  {
    "group": "Davomat",
    "links": [
      {
        "href": "attendance.html",
        "id": "attendance",
        "icon": "◴",
        "title": "Davomat"
      }
    ]
  },
  {
    "group": "Ta'tillar",
    "links": [
      {
        "href": "leaves.html",
        "id": "leaves",
        "icon": "☀",
        "title": "Ta'tillar"
      }
    ]
  },
  {
    "group": "Ish haqi",
    "links": [
      {
        "href": "payroll.html",
        "id": "payroll",
        "icon": "₸",
        "title": "Ish haqi (Payroll)"
      }
    ]
  },
  {
    "group": "Samaradorlik",
    "links": [
      {
        "href": "performance.html",
        "id": "performance",
        "icon": "◈",
        "title": "Samaradorlik & KPI"
      }
    ]
  },
  {
    "group": "Hujjatlar",
    "links": [
      {
        "href": "documents.html",
        "id": "documents",
        "icon": "▤",
        "title": "Hujjatlar"
      }
    ]
  },
  {
    "group": "Korporativ",
    "links": [
      {
        "href": "assets.html",
        "id": "assets",
        "icon": "▣",
        "title": "Aktivlar"
      },
      {
        "href": "business-trips.html",
        "id": "business-trips",
        "icon": "✈",
        "title": "Xizmat safarlari"
      },
      {
        "href": "benefits.html",
        "id": "benefits",
        "icon": "♢",
        "title": "Benefits"
      },
      {
        "href": "events.html",
        "id": "events",
        "icon": "★",
        "title": "Tadbirlar"
      }
    ]
  },
  {
    "group": "Tahlil",
    "links": [
      {
        "href": "reports.html",
        "id": "reports",
        "icon": "▥",
        "title": "Hisobotlar"
      }
    ]
  },
  {
    "group": "Tizim",
    "links": [
      {
        "href": "settings.html",
        "id": "settings",
        "icon": "⚙",
        "title": "Sozlamalar"
      }
    ]
  }
];

export const allModulesMap: Record<string, HRMModuleData> = {
  "assets": {
    "id": "assets",
    "file": "assets.html",
    "title": "Aktivlar",
    "crumb": "HRM / Aktivlar",
    "h1": "Aktivlar",
    "sub": "Xodimlarga berilgan IT va boshqa korporativ aktivlar",
    "kpis": [
      {
        "lbl": "Assets",
        "num": "472",
        "trend": "Jami"
      },
      {
        "lbl": "Issued",
        "num": "388",
        "trend": "82%"
      },
      {
        "lbl": "Available",
        "num": "51",
        "trend": "Stock"
      },
      {
        "lbl": "Return due",
        "num": "11",
        "trend": "Exit"
      },
      {
        "lbl": "Lost/damaged",
        "num": "3",
        "trend": ""
      }
    ],
    "headers": [
      "Asset",
      "Category",
      "Employee",
      "Issued",
      "Condition",
      "Return",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>LAP-00125</b>",
        "Laptop",
        "Azizbek Aliyev",
        "10.01.2024",
        "Good",
        "—",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>MON-00881</b>",
        "Monitor",
        "Madina Ergasheva",
        "12.09.2022",
        "Good",
        "02.10.2026",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>PHONE-00211</b>",
        "Phone",
        "Sardor Mamatov",
        "20.01.2024",
        "Good",
        "—",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>LAP-00151</b>",
        "Laptop",
        "Akmal Qosimov",
        "05.01.2025",
        "Fair",
        "12.09.2026",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "attendance": {
    "id": "attendance",
    "file": "attendance.html",
    "title": "Davomat",
    "crumb": "HRM / Davomat",
    "h1": "Davomat",
    "sub": "Kelish-ketish, Face ID, turniket va remote monitoring",
    "kpis": [
      {
        "lbl": "Attendance",
        "num": "96.4%",
        "trend": "+1.2%"
      },
      {
        "lbl": "Kelgan",
        "num": "231",
        "trend": "94.2%"
      },
      {
        "lbl": "Kechikkan",
        "num": "9",
        "trend": "Avg. 18 min"
      },
      {
        "lbl": "Kelmagan",
        "num": "5",
        "trend": "2.0%"
      },
      {
        "lbl": "Remote",
        "num": "3",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Kirish",
      "Chiqish",
      "Jami",
      "Manba",
      "Kechikish",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "08:53",
        "18:04",
        "9:11",
        "Face ID",
        "0 min",
        "Normal",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Zarina Ismoilova</b>",
        "08:47",
        "18:05",
        "9:18",
        "Face ID",
        "0 min",
        "Normal",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sardor Mamatov</b>",
        "09:17",
        "18:02",
        "8:45",
        "Turniket",
        "17 min",
        "Kechikish",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Kamron Saidov</b>",
        "09:04",
        "18:11",
        "9:07",
        "Face ID",
        "4 min",
        "Kechikish",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "audit-log": {
    "id": "audit-log",
    "file": "audit-log.html",
    "title": "Audit Log",
    "crumb": "HRM / Audit Log",
    "h1": "Audit Log",
    "sub": "Tizimdagi barcha muhim harakatlarning audit jurnali",
    "kpis": [
      {
        "lbl": "Events today",
        "num": "4,812",
        "trend": "System"
      },
      {
        "lbl": "Admin actions",
        "num": "286",
        "trend": "Today"
      },
      {
        "lbl": "Security",
        "num": "12",
        "trend": "Alerts"
      },
      {
        "lbl": "Failed login",
        "num": "3",
        "trend": "Review"
      },
      {
        "lbl": "Retention",
        "num": "365d",
        "trend": ""
      }
    ],
    "headers": [
      "Time",
      "User",
      "Action",
      "Module",
      "Object",
      "IP",
      "Result",
      ""
    ],
    "rows": [
      [
        "<b>12:58</b>",
        "Admin Manager",
        "Updated",
        "Employees",
        "EMP-1024",
        "10.2.4.19",
        "Success",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>12:47</b>",
        "Malika Karimova",
        "Approved",
        "Requests",
        "REQ-219",
        "10.2.4.22",
        "Success",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>12:31</b>",
        "Kamron Saidov",
        "Created",
        "Candidate",
        "CAN-2121",
        "10.2.4.31",
        "Success",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>12:13</b>",
        "System",
        "Auto notification",
        "Probation",
        "EMP-1218",
        "—",
        "Success",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "benefits": {
    "id": "benefits",
    "file": "benefits.html",
    "title": "Benefits",
    "crumb": "HRM / Benefits",
    "h1": "Benefits",
    "sub": "Sug‘urta, ovqat, transport va korporativ imtiyozlar",
    "kpis": [
      {
        "lbl": "Programs",
        "num": "12",
        "trend": "Active"
      },
      {
        "lbl": "Employees",
        "num": "221",
        "trend": "Covered"
      },
      {
        "lbl": "Insurance",
        "num": "184",
        "trend": "Members"
      },
      {
        "lbl": "Lunch",
        "num": "162",
        "trend": "Users"
      },
      {
        "lbl": "Budget",
        "num": "94M",
        "trend": ""
      }
    ],
    "headers": [
      "Benefit",
      "Type",
      "Employees",
      "Budget",
      "Provider",
      "Renewal",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Medical Insurance</b>",
        "Insurance",
        "184",
        "48M",
        "UzLife",
        "31.12.2026",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Lunch Card</b>",
        "Food",
        "162",
        "26M",
        "Meal Partner",
        "Monthly",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Gym Membership</b>",
        "Wellness",
        "42",
        "8M",
        "FitClub",
        "31.10.2026",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Transport</b>",
        "Mobility",
        "31",
        "12M",
        "City Taxi",
        "Monthly",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "bonuses": {
    "id": "bonuses",
    "file": "bonuses.html",
    "title": "Bonuslar",
    "crumb": "HRM / Bonuslar",
    "h1": "Bonuslar",
    "sub": "KPI, performance va maxsus rag‘batlar",
    "kpis": [
      {
        "lbl": "Bu oy bonus",
        "num": "286M",
        "trend": "UZS"
      },
      {
        "lbl": "Pending",
        "num": "31",
        "trend": "Approval"
      },
      {
        "lbl": "KPI Bonus",
        "num": "192M",
        "trend": "67%"
      },
      {
        "lbl": "Special",
        "num": "47M",
        "trend": "Recognition"
      },
      {
        "lbl": "Avg.",
        "num": "1.16M",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Bonus turi",
      "Asos",
      "Summa",
      "Oy",
      "Approver",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "KPI Bonus",
        "92% KPI",
        "2.1M",
        "Sep",
        "Jasur Karimov",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sardor Mamatov</b>",
        "Sales Bonus",
        "Target 118%",
        "4.2M",
        "Sep",
        "Commercial",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Zarina Ismoilova</b>",
        "Recognition",
        "Best campaign",
        "1.5M",
        "Sep",
        "CEO",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "business-trips": {
    "id": "business-trips",
    "file": "business-trips.html",
    "title": "Xizmat safarlari",
    "crumb": "HRM / Xizmat safarlari",
    "h1": "Xizmat safarlari",
    "sub": "Safar so‘rovlari, xarajatlar va yakuniy hisobotlar",
    "kpis": [
      {
        "lbl": "Active trips",
        "num": "7",
        "trend": "Joriy"
      },
      {
        "lbl": "Pending",
        "num": "4",
        "trend": "Approval"
      },
      {
        "lbl": "Completed",
        "num": "31",
        "trend": "2026"
      },
      {
        "lbl": "Budget",
        "num": "128M",
        "trend": "UZS"
      },
      {
        "lbl": "Reports due",
        "num": "3",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Manzil",
      "Sana",
      "Maqsad",
      "Budget",
      "Report",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "Toshkent",
        "01–03.10",
        "Partner meeting",
        "4.2M",
        "Due 04.10",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sardor Mamatov</b>",
        "Buxoro",
        "05–07.10",
        "Sales meeting",
        "5.1M",
        "Due 08.10",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Zarina Ismoilova</b>",
        "Samarqand",
        "12–13.10",
        "Conference",
        "3.8M",
        "Due 14.10",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "calendar": {
    "id": "calendar",
    "file": "calendar.html",
    "title": "HR Calendar",
    "crumb": "HRM / HR Calendar",
    "h1": "HR Calendar",
    "sub": "Intervyu, ta’til, trening, birthday va HR eventlar yagona kalendarda",
    "kpis": [
      {
        "lbl": "Today",
        "num": "18",
        "trend": "HR events"
      },
      {
        "lbl": "Interviews",
        "num": "8",
        "trend": "Scheduled"
      },
      {
        "lbl": "Leaves",
        "num": "17",
        "trend": "Active"
      },
      {
        "lbl": "Training",
        "num": "3",
        "trend": "Upcoming"
      },
      {
        "lbl": "Birthdays",
        "num": "3",
        "trend": ""
      }
    ],
    "headers": [],
    "rows": []
  },
  "career": {
    "id": "career",
    "file": "career.html",
    "title": "Career Path",
    "crumb": "HRM / Career Path",
    "h1": "Career Path",
    "sub": "Lavozimlar orasidagi o‘sish yo‘llari va xodimlar karyera xaritasi",
    "kpis": [],
    "headers": [
      "Xodim",
      "Hozirgi",
      "Keyingi",
      "Readiness",
      "Skill gap",
      "Status"
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "Senior Backend",
        "Team Lead",
        "88%",
        "Leadership",
        "<span class=\"badge warning\">Jarayonda</span>"
      ],
      [
        "<b>Malika Karimova</b>",
        "HR Manager",
        "HR Director",
        "94%",
        "Strategic HR",
        "<span class=\"badge success\">Faol</span>"
      ],
      [
        "<b>Sardor Mamatov</b>",
        "Sales Lead",
        "Commercial Head",
        "81%",
        "Budgeting",
        "<span class=\"badge warning\">Jarayonda</span>"
      ]
    ]
  },
  "certificates": {
    "id": "certificates",
    "file": "certificates.html",
    "title": "Sertifikatlar",
    "crumb": "HRM / Sertifikatlar",
    "h1": "Sertifikatlar",
    "sub": "Xodim sertifikatlari va amal qilish muddatlari",
    "kpis": [
      {
        "lbl": "Jami",
        "num": "386",
        "trend": "Sertifikat"
      },
      {
        "lbl": "Valid",
        "num": "348",
        "trend": "90%"
      },
      {
        "lbl": "Expiring",
        "num": "23",
        "trend": "90 kun"
      },
      {
        "lbl": "Expired",
        "num": "15",
        "trend": "Review"
      },
      {
        "lbl": "Bu yil",
        "num": "97",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Sertifikat",
      "Beruvchi",
      "Olingan",
      "Tugash",
      "Level",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "AWS Developer",
        "AWS",
        "10.01.2026",
        "10.01.2029",
        "Professional",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Malika Karimova</b>",
        "HR Analytics",
        "Coursera",
        "12.02.2026",
        "12.02.2028",
        "Advanced",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Javohir Rasulov</b>",
        "Figma Advanced",
        "Figma",
        "05.03.2025",
        "05.03.2027",
        "Advanced",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "contracts": {
    "id": "contracts",
    "file": "contracts.html",
    "title": "Shartnomalar",
    "crumb": "HRM / Shartnomalar",
    "h1": "Shartnomalar",
    "sub": "Mehnat shartnomalari va shartnoma muddatlari",
    "kpis": [
      {
        "lbl": "Jami",
        "num": "248",
        "trend": "Active"
      },
      {
        "lbl": "Active",
        "num": "236",
        "trend": "95%"
      },
      {
        "lbl": "Expiring",
        "num": "9",
        "trend": "90 kun"
      },
      {
        "lbl": "Draft",
        "num": "3",
        "trend": "Review"
      },
      {
        "lbl": "Archived",
        "num": "37",
        "trend": ""
      }
    ],
    "headers": [
      "Contract",
      "Xodim",
      "Turi",
      "Boshlangan",
      "Tugash",
      "Maosh",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>CTR-1024</b>",
        "Azizbek Aliyev",
        "Indefinite",
        "12.03.2024",
        "—",
        "18.5M",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>CTR-0987</b>",
        "Malika Karimova",
        "Indefinite",
        "08.06.2023",
        "—",
        "16.2M",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>CTR-1218</b>",
        "Dilnoza Tursunova",
        "Probation",
        "02.08.2026",
        "02.11.2026",
        "9.8M",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>CTR-1155</b>",
        "Kamron Saidov",
        "Indefinite",
        "05.05.2025",
        "—",
        "11.4M",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "dashboard": {
    "id": "dashboard",
    "file": "dashboard.html",
    "title": "Dashboard",
    "crumb": "HRM / Dashboard",
    "h1": "Dashboard",
    "sub": "Dashboard",
    "kpis": [
      {
        "lbl": "Jami",
        "num": "248",
        "trend": "Seed data"
      },
      {
        "lbl": "Faol",
        "num": "231",
        "trend": "93.1%"
      },
      {
        "lbl": "Kutilmoqda",
        "num": "17",
        "trend": "Action"
      },
      {
        "lbl": "Bu oy",
        "num": "38",
        "trend": "+6.4%"
      },
      {
        "lbl": "Status",
        "num": "Live",
        "trend": ""
      }
    ],
    "headers": [
      "Yozuv",
      "Bo‘lim",
      "Sana",
      "Ko‘rsatkich",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "IT",
        "28.09.2026",
        "92%",
        "<span class=\"badge success\">Faol</span>",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Malika Karimova</b>",
        "HR",
        "28.09.2026",
        "95%",
        "<span class=\"badge success\">Faol</span>",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sardor Mamatov</b>",
        "Sales",
        "27.09.2026",
        "90%",
        "<span class=\"badge warning\">Kutilmoqda</span>",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Dilnoza Tursunova</b>",
        "Finance",
        "27.09.2026",
        "81%",
        "<span class=\"badge warning\">Jarayonda</span>",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "delays": {
    "id": "delays",
    "file": "delays.html",
    "title": "Kechikishlar",
    "crumb": "HRM / Kechikishlar",
    "h1": "Kechikishlar",
    "sub": "Kechikish, erta ketish va attendance exceptionlari",
    "kpis": [
      {
        "lbl": "Bugun",
        "num": "9",
        "trend": "Xodim"
      },
      {
        "lbl": "Hafta",
        "num": "27",
        "trend": "Jami"
      },
      {
        "lbl": "Avg. delay",
        "num": "18 min",
        "trend": "Trend"
      },
      {
        "lbl": "Critical",
        "num": "3",
        "trend": ">30 min"
      },
      {
        "lbl": "Resolved",
        "num": "21",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Sana",
      "Kirish",
      "Schedule",
      "Kechikish",
      "Sabab",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Sardor Mamatov</b>",
        "28.09.2026",
        "09:17",
        "09:00",
        "17 min",
        "Traffic",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Kamron Saidov</b>",
        "28.09.2026",
        "09:04",
        "09:00",
        "4 min",
        "Transport",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Bekzod Jo‘rayev</b>",
        "27.09.2026",
        "09:36",
        "09:00",
        "36 min",
        "Personal",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "development-plan": {
    "id": "development-plan",
    "file": "development-plan.html",
    "title": "Development Plan",
    "crumb": "HRM / Development Plan",
    "h1": "Development Plan",
    "sub": "Individual rivojlanish rejalari (IDP)",
    "kpis": [
      {
        "lbl": "Active plans",
        "num": "84",
        "trend": "Employees"
      },
      {
        "lbl": "On track",
        "num": "61",
        "trend": "73%"
      },
      {
        "lbl": "At risk",
        "num": "13",
        "trend": "Review"
      },
      {
        "lbl": "Completed",
        "num": "10",
        "trend": "2026"
      },
      {
        "lbl": "Courses",
        "num": "148",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Maqsad",
      "Skill gap",
      "Action",
      "Deadline",
      "Progress",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Dilnoza Tursunova</b>",
        "Finance lead",
        "Financial Analysis",
        "Advanced Excel + course",
        "31.12.2026",
        "64%",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Bekzod Jo‘rayev</b>",
        "Senior QA",
        "Automation",
        "Selenium + API testing",
        "30.11.2026",
        "78%",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Javohir Rasulov</b>",
        "Product Lead",
        "Leadership",
        "Mentoring + workshop",
        "30.10.2026",
        "92%",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "documents": {
    "id": "documents",
    "file": "documents.html",
    "title": "Hujjatlar",
    "crumb": "HRM / Hujjatlar",
    "h1": "Hujjatlar",
    "sub": "Xodimlar hujjatlari, amal qilish muddati va versiyalar",
    "kpis": [
      {
        "lbl": "Hujjatlar",
        "num": "1,842",
        "trend": "Jami"
      },
      {
        "lbl": "Valid",
        "num": "1,711",
        "trend": "93%"
      },
      {
        "lbl": "Expiring",
        "num": "94",
        "trend": "30 kun"
      },
      {
        "lbl": "Missing",
        "num": "27",
        "trend": "Action"
      },
      {
        "lbl": "Archive",
        "num": "10",
        "trend": ""
      }
    ],
    "headers": [
      "Hujjat",
      "Xodim",
      "Turi",
      "Tugash",
      "Version",
      "Owner",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Passport</b>",
        "Azizbek Aliyev",
        "Identity",
        "2028",
        "v1",
        "HR",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Mehnat shartnomasi</b>",
        "Malika Karimova",
        "Contract",
        "2027",
        "v2",
        "HR",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Diploma</b>",
        "Dilnoza Tursunova",
        "Education",
        "—",
        "v1",
        "HR",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Medical form</b>",
        "Javohir Rasulov",
        "Medical",
        "30.10.2026",
        "v1",
        "HR",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "employee-profile": {
    "id": "employee-profile",
    "file": "employee-profile.html",
    "title": "Xodim profili",
    "crumb": "HRM / Xodim profili",
    "h1": "Xodim profili",
    "sub": "EMP-1024 • Azizbek Aliyev • Senior Backend Developer • IT",
    "kpis": [],
    "headers": [],
    "rows": []
  },
  "employees": {
    "id": "employees",
    "file": "employees.html",
    "title": "Xodimlar",
    "crumb": "HRM / Xodimlar",
    "h1": "Xodimlar",
    "sub": "Barcha xodimlar: faol, sinov muddatidagi, ta’tildagi va ishdan ketganlar",
    "kpis": [
      {
        "lbl": "Jami xodimlar",
        "num": "248",
        "trend": "Barcha filiallar"
      },
      {
        "lbl": "Faol",
        "num": "231",
        "trend": "93.1%"
      },
      {
        "lbl": "Sinov",
        "num": "12",
        "trend": "4 tasi yakunlanmoqda"
      },
      {
        "lbl": "Ta’til",
        "num": "17",
        "trend": "Jami bugun"
      },
      {
        "lbl": "Bu oy qo‘shilgan",
        "num": "9",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Lavozim",
      "Bo‘lim",
      "Status",
      "Ishga kirgan",
      "KPI",
      ""
    ],
    "rows": []
  },
  "events": {
    "id": "events",
    "file": "events.html",
    "title": "Events",
    "crumb": "HRM / Events",
    "h1": "Events",
    "sub": "Korporativ tadbirlar, tug‘ilgan kunlar va jamoaviy tadbirlar",
    "kpis": [
      {
        "lbl": "Upcoming",
        "num": "9",
        "trend": "Bu oy"
      },
      {
        "lbl": "Participants",
        "num": "182",
        "trend": "Registered"
      },
      {
        "lbl": "Budget",
        "num": "36M",
        "trend": "UZS"
      },
      {
        "lbl": "Feedback",
        "num": "4.8/5",
        "trend": "Last event"
      },
      {
        "lbl": "Birthdays",
        "num": "21",
        "trend": ""
      }
    ],
    "headers": [
      "Event",
      "Turi",
      "Sana",
      "Ishtirokchi",
      "Budget",
      "Organizer",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Team Building Q4</b>",
        "Team",
        "12.10.2026",
        "86",
        "18M",
        "HR",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>New Employee Day</b>",
        "Onboarding",
        "03.10.2026",
        "24",
        "4M",
        "HR",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Leadership Meetup</b>",
        "Training",
        "07.10.2026",
        "31",
        "7M",
        "L&D",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>September Birthdays</b>",
        "Culture",
        "30.09.2026",
        "21",
        "3M",
        "HR",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "feedback-360": {
    "id": "feedback-360",
    "file": "feedback-360.html",
    "title": "360° baholash",
    "crumb": "HRM / 360° baholash",
    "h1": "360° baholash",
    "sub": "Manager, peer, self va subordinate feedback",
    "kpis": [
      {
        "lbl": "Active cycle",
        "num": "Q3 2026",
        "trend": "28 teams"
      },
      {
        "lbl": "Responses",
        "num": "1,104",
        "trend": "87% complete"
      },
      {
        "lbl": "Avg score",
        "num": "8.5/10",
        "trend": "+0.3"
      },
      {
        "lbl": "Pending",
        "num": "112",
        "trend": "Follow-up"
      },
      {
        "lbl": "Confidential",
        "num": "100%",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Respondents",
      "Self",
      "Peer",
      "Manager",
      "Score",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "8",
        "9.0",
        "8.6",
        "9.2",
        "8.9/10",
        "Tugallangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Malika Karimova</b>",
        "7",
        "9.4",
        "9.1",
        "9.3",
        "9.3/10",
        "Tugallangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Javohir Rasulov</b>",
        "6",
        "8.5",
        "8.1",
        "8.7",
        "8.4/10",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "feedback": {
    "id": "feedback",
    "file": "feedback.html",
    "title": "Feedback",
    "crumb": "HRM / Feedback",
    "h1": "Feedback",
    "sub": "Takliflar, shikoyatlar, anonim feedback va satisfaction",
    "kpis": [
      {
        "lbl": "Feedback",
        "num": "126",
        "trend": "2026"
      },
      {
        "lbl": "Open",
        "num": "17",
        "trend": "Action"
      },
      {
        "lbl": "Resolved",
        "num": "98",
        "trend": "78%"
      },
      {
        "lbl": "Anonymous",
        "num": "42",
        "trend": "33%"
      },
      {
        "lbl": "Satisfaction",
        "num": "4.4/5",
        "trend": ""
      }
    ],
    "headers": [
      "Feedback",
      "Xodim",
      "Turi",
      "Sana",
      "Topic",
      "Owner",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>FB-126</b>",
        "Anonymous",
        "Suggestion",
        "28.09.2026",
        "Remote work",
        "HR",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>FB-125</b>",
        "EMP-1102",
        "Complaint",
        "27.09.2026",
        "Workload",
        "HR",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>FB-124</b>",
        "EMP-0987",
        "Suggestion",
        "26.09.2026",
        "Benefits",
        "L&D",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "incidents": {
    "id": "incidents",
    "file": "incidents.html",
    "title": "Hodisalar",
    "crumb": "HRM / Hodisalar",
    "h1": "Hodisalar",
    "sub": "Baxtsiz hodisalar, intizom va xavfsizlik incidentlari",
    "kpis": [
      {
        "lbl": "Cases",
        "num": "14",
        "trend": "2026"
      },
      {
        "lbl": "Open",
        "num": "3",
        "trend": "Investigation"
      },
      {
        "lbl": "Resolved",
        "num": "10",
        "trend": "71%"
      },
      {
        "lbl": "High severity",
        "num": "1",
        "trend": "Urgent"
      },
      {
        "lbl": "Documents",
        "num": "18",
        "trend": ""
      }
    ],
    "headers": [
      "Incident",
      "Xodim",
      "Turi",
      "Sana",
      "Severity",
      "Owner",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>INC-2026-014</b>",
        "EMP-1102",
        "Workplace",
        "22.09.2026",
        "Low",
        "HR",
        "Tugallangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>INC-2026-012</b>",
        "EMP-0902",
        "Safety",
        "18.09.2026",
        "High",
        "Security",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>INC-2026-009</b>",
        "EMP-0874",
        "Discipline",
        "09.09.2026",
        "Medium",
        "HR",
        "Tugallangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "kpi": {
    "id": "kpi",
    "file": "kpi.html",
    "title": "KPI",
    "crumb": "HRM / KPI",
    "h1": "KPI",
    "sub": "Xodim va bo‘lim KPI ko‘rsatkichlari",
    "kpis": [
      {
        "lbl": "Avg KPI",
        "num": "87%",
        "trend": "+3% QoQ"
      },
      {
        "lbl": "Above target",
        "num": "154",
        "trend": "62%"
      },
      {
        "lbl": "On target",
        "num": "67",
        "trend": "27%"
      },
      {
        "lbl": "Below target",
        "num": "27",
        "trend": "11%"
      },
      {
        "lbl": "Critical",
        "num": "7",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Department",
      "KPI target",
      "Actual",
      "Score",
      "Review",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "IT",
        "90%",
        "92%",
        "92%",
        "Q3",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Malika Karimova</b>",
        "HR",
        "90%",
        "95%",
        "95%",
        "Q3",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Javohir Rasulov</b>",
        "IT",
        "90%",
        "87%",
        "87%",
        "Q3",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Dilnoza Tursunova</b>",
        "Finance",
        "90%",
        "81%",
        "81%",
        "Q3",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "leave-calendar": {
    "id": "leave-calendar",
    "file": "leave-calendar.html",
    "title": "Ta’til grafigi",
    "crumb": "HRM / Ta’til grafigi",
    "h1": "Ta’til grafigi",
    "sub": "Xodimlarning ta’til rejasi va jamoa qamrovini kuzatish",
    "kpis": [],
    "headers": [],
    "rows": []
  },
  "leaves": {
    "id": "leaves",
    "file": "leaves.html",
    "title": "Ta'tillar",
    "crumb": "HRM / Ta'tillar",
    "h1": "Ta'tillar",
    "sub": "Ta’til so‘rovlari, balans va tasdiqlash workflow",
    "kpis": [
      {
        "lbl": "Qolgan kunlar",
        "num": "2,184",
        "trend": "Jami"
      },
      {
        "lbl": "Pending",
        "num": "7",
        "trend": "Approval"
      },
      {
        "lbl": "Approved",
        "num": "31",
        "trend": "Bu oy"
      },
      {
        "lbl": "Sick",
        "num": "12",
        "trend": "Cases"
      },
      {
        "lbl": "Used",
        "num": "1,040",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Turi",
      "Boshlanish",
      "Tugash",
      "Kun",
      "Manager",
      "Status",
      ""
    ],
    "rows": []
  },
  "notifications": {
    "id": "notifications",
    "file": "notifications.html",
    "title": "Bildirishnomalar",
    "crumb": "HRM / Bildirishnomalar",
    "h1": "Bildirishnomalar",
    "sub": "Email, web, Telegram va push notificationlar markazi",
    "kpis": [
      {
        "lbl": "Today",
        "num": "126",
        "trend": "Sent"
      },
      {
        "lbl": "Pending",
        "num": "17",
        "trend": "Queue"
      },
      {
        "lbl": "Failed",
        "num": "3",
        "trend": "Retry"
      },
      {
        "lbl": "Templates",
        "num": "38",
        "trend": "Active"
      },
      {
        "lbl": "Read",
        "num": "91%",
        "trend": ""
      }
    ],
    "headers": [
      "Notification",
      "Channel",
      "Recipient",
      "Created",
      "Type",
      "Delivery",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Probation expiry alert</b>",
        "Web + Email",
        "HR / Manager",
        "28.09.2026 12:40",
        "Automation",
        "Delivered",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Leave request</b>",
        "Web",
        "Finance Head",
        "28.09.2026 12:35",
        "Request",
        "Delivered",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Document expiry</b>",
        "Telegram",
        "EMP-1218",
        "28.09.2026 12:10",
        "Reminder",
        "Queued",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Birthday reminder</b>",
        "Web",
        "HR team",
        "28.09.2026 08:00",
        "Event",
        "Delivered",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "okr": {
    "id": "okr",
    "file": "okr.html",
    "title": "OKR",
    "crumb": "HRM / OKR",
    "h1": "OKR",
    "sub": "Maqsadlar va key results boshqaruvi",
    "kpis": [
      {
        "lbl": "Objectives",
        "num": "86",
        "trend": "Q3"
      },
      {
        "lbl": "Key Results",
        "num": "312",
        "trend": "Jami"
      },
      {
        "lbl": "Avg. progress",
        "num": "78%",
        "trend": "+4%"
      },
      {
        "lbl": "At risk",
        "num": "18",
        "trend": "Review"
      },
      {
        "lbl": "Completed",
        "num": "59",
        "trend": ""
      }
    ],
    "headers": [
      "Objective",
      "Owner",
      "KR",
      "Progress",
      "Deadline",
      "Team",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Reduce time-to-hire</b>",
        "Malika Karimova",
        "4 / 5",
        "88%",
        "30.09.2026",
        "HR",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Improve API reliability</b>",
        "Azizbek Aliyev",
        "3 / 4",
        "82%",
        "30.09.2026",
        "IT",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Grow qualified leads</b>",
        "Zarina Ismoilova",
        "4 / 4",
        "100%",
        "30.09.2026",
        "Marketing",
        "Tugallangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "orders": {
    "id": "orders",
    "file": "orders.html",
    "title": "Buyruqlar",
    "crumb": "HRM / Buyruqlar",
    "h1": "Buyruqlar",
    "sub": "Kadrlar bo‘yicha buyruqlarni yaratish, tasdiqlash va arxivlash",
    "kpis": [
      {
        "lbl": "Bu oy",
        "num": "38",
        "trend": "Orders"
      },
      {
        "lbl": "Signed",
        "num": "31",
        "trend": "82%"
      },
      {
        "lbl": "Draft",
        "num": "4",
        "trend": "Review"
      },
      {
        "lbl": "Pending",
        "num": "3",
        "trend": "Approval"
      },
      {
        "lbl": "Archive",
        "num": "512",
        "trend": ""
      }
    ],
    "headers": [
      "Buyruq",
      "Turi",
      "Xodim",
      "Sana",
      "Muallif",
      "Approval",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>ORD-2026-118</b>",
        "Promotion",
        "Azizbek Aliyev",
        "01.06.2026",
        "HR",
        "CEO",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>ORD-2026-127</b>",
        "Leave",
        "Javohir Rasulov",
        "26.09.2026",
        "HR",
        "Manager",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>ORD-2026-132</b>",
        "Hire",
        "Dilnoza Tursunova",
        "02.08.2026",
        "HR",
        "CEO",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>ORD-2026-141</b>",
        "Salary change",
        "Sardor Mamatov",
        "29.09.2026",
        "HR",
        "CFO",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "organization": {
    "id": "organization",
    "file": "organization.html",
    "title": "Tashkiliy tuzilma",
    "crumb": "HRM / Tashkiliy tuzilma",
    "h1": "Tashkiliy tuzilma",
    "sub": "Tashkilot → filiallar → bo‘limlar → lavozimlar va xodimlar",
    "kpis": [
      {
        "lbl": "Filiallar",
        "num": "6",
        "trend": "2 hudud"
      },
      {
        "lbl": "Departamentlar",
        "num": "14",
        "trend": "48 bo‘lim"
      },
      {
        "lbl": "Shtat birliklari",
        "num": "312",
        "trend": "248 band"
      },
      {
        "lbl": "Rahbarlar",
        "num": "31",
        "trend": "14 department"
      },
      {
        "lbl": "Ochiq pozitsiya",
        "num": "18",
        "trend": ""
      }
    ],
    "headers": [
      "Nomi",
      "Rahbar",
      "Xodim",
      "Status"
    ],
    "rows": []
  },
  "overtime": {
    "id": "overtime",
    "file": "overtime.html",
    "title": "Overtime",
    "crumb": "HRM / Overtime",
    "h1": "Overtime",
    "sub": "Qo‘shimcha ish vaqti va tasdiqlash",
    "kpis": [
      {
        "lbl": "Overtime hours",
        "num": "184",
        "trend": "Bu oy"
      },
      {
        "lbl": "Pending",
        "num": "21",
        "trend": "Approval"
      },
      {
        "lbl": "Approved",
        "num": "146",
        "trend": "79%"
      },
      {
        "lbl": "Cost",
        "num": "48.6M",
        "trend": "UZS"
      },
      {
        "lbl": "Limit exceeded",
        "num": "3",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Sana",
      "Soat",
      "Sabab",
      "Manager",
      "Cost",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "27.09.2026",
        "2.5h",
        "Release",
        "Jasur Karimov",
        "1.2M",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sardor Mamatov</b>",
        "26.09.2026",
        "1.5h",
        "Sales close",
        "Commercial",
        "0.7M",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Kamron Saidov</b>",
        "25.09.2026",
        "2.0h",
        "Candidate interviews",
        "Malika",
        "0.5M",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "payroll": {
    "id": "payroll",
    "file": "payroll.html",
    "title": "Payroll",
    "crumb": "HRM / Payroll",
    "h1": "Payroll",
    "sub": "Ish haqi, bonus, qo‘shimcha to‘lov va deductions",
    "kpis": [
      {
        "lbl": "Payroll",
        "num": "2.84B",
        "trend": "UZS / month"
      },
      {
        "lbl": "Xodim",
        "num": "248",
        "trend": "Processed"
      },
      {
        "lbl": "Bonus",
        "num": "286M",
        "trend": "Bu oy"
      },
      {
        "lbl": "Deductions",
        "num": "74M",
        "trend": "Jami"
      },
      {
        "lbl": "Pending",
        "num": "7",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Base",
      "Bonus",
      "Deduction",
      "Net salary",
      "Pay date",
      "Status",
      ""
    ],
    "rows": []
  },
  "penalties": {
    "id": "penalties",
    "file": "penalties.html",
    "title": "Jarimalar",
    "crumb": "HRM / Jarimalar",
    "h1": "Jarimalar",
    "sub": "Intizomiy choralar va deductions",
    "kpis": [
      {
        "lbl": "Cases",
        "num": "14",
        "trend": "2026"
      },
      {
        "lbl": "Pending",
        "num": "3",
        "trend": "Review"
      },
      {
        "lbl": "Resolved",
        "num": "10",
        "trend": "71%"
      },
      {
        "lbl": "Summa",
        "num": "11.4M",
        "trend": "UZS"
      },
      {
        "lbl": "Appeal",
        "num": "1",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Sana",
      "Sabab",
      "Chora",
      "Summa",
      "Approver",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Bekzod Jo‘rayev</b>",
        "12.09.2026",
        "Kechikishlar",
        "Warning",
        "0",
        "HR",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Rustam Aliyev</b>",
        "08.09.2026",
        "Policy breach",
        "Deduction",
        "1.2M",
        "HR Director",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Akmal Qosimov</b>",
        "02.09.2026",
        "Unapproved absence",
        "Deduction",
        "0.8M",
        "Manager",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "performance": {
    "id": "performance",
    "file": "performance.html",
    "title": "Performance",
    "crumb": "HRM / Performance",
    "h1": "Performance",
    "sub": "KPI, OKR, review cycle va 360° baholash markazi",
    "kpis": [
      {
        "lbl": "Review cycle",
        "num": "Q3 2026",
        "trend": "92% done"
      },
      {
        "lbl": "KPI coverage",
        "num": "98%",
        "trend": "Employees"
      },
      {
        "lbl": "Avg. score",
        "num": "87%",
        "trend": "+3%"
      },
      {
        "lbl": "Action plans",
        "num": "21",
        "trend": "Open"
      },
      {
        "lbl": "Low scores",
        "num": "7",
        "trend": ""
      }
    ],
    "headers": [],
    "rows": []
  },
  "permissions": {
    "id": "permissions",
    "file": "permissions.html",
    "title": "Ruxsatlar",
    "crumb": "HRM / Ruxsatlar",
    "h1": "Ruxsatlar",
    "sub": "RBAC: role, module va action darajasida kirish nazorati",
    "kpis": [
      {
        "lbl": "Roles",
        "num": "8",
        "trend": "Configured"
      },
      {
        "lbl": "Permissions",
        "num": "126",
        "trend": "Unique"
      },
      {
        "lbl": "Users",
        "num": "48",
        "trend": "Mapped"
      },
      {
        "lbl": "Restricted",
        "num": "19",
        "trend": "Sensitive"
      },
      {
        "lbl": "Audited",
        "num": "100%",
        "trend": ""
      }
    ],
    "headers": [
      "Role",
      "Employees",
      "Payroll",
      "Documents",
      "Reports",
      "Settings",
      ""
    ],
    "rows": [
      [
        "<b>Super Admin</b>",
        "✓",
        "✓",
        "✓",
        "✓",
        "✓",
        "<button class=\"btn\" data-toast=\"Role ochildi\">Manage</button>"
      ],
      [
        "<b>HR Director</b>",
        "✓",
        "View",
        "✓",
        "✓",
        "—",
        "<button class=\"btn\">Manage</button>"
      ],
      [
        "<b>HR Specialist</b>",
        "✓",
        "View",
        "✓",
        "View",
        "—",
        "<button class=\"btn\">Manage</button>"
      ],
      [
        "<b>Manager</b>",
        "Own team",
        "—",
        "View",
        "Own team",
        "—",
        "<button class=\"btn\">Manage</button>"
      ],
      [
        "<b>Employee</b>",
        "Own",
        "Own",
        "Own",
        "Own",
        "—",
        "<button class=\"btn\">Manage</button>"
      ]
    ]
  },
  "promotions": {
    "id": "promotions",
    "file": "promotions.html",
    "title": "Promotion",
    "crumb": "HRM / Promotion",
    "h1": "Promotion",
    "sub": "Lavozim oshirish va tasdiqlash",
    "kpis": [
      {
        "lbl": "Pending",
        "num": "9",
        "trend": "Approval"
      },
      {
        "lbl": "Approved",
        "num": "21",
        "trend": "2026"
      },
      {
        "lbl": "Avg. increase",
        "num": "18%",
        "trend": "Salary"
      },
      {
        "lbl": "Ready",
        "num": "24",
        "trend": "Talent"
      },
      {
        "lbl": "Cycle",
        "num": "34 days",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Old role",
      "New role",
      "New salary",
      "Effective",
      "Approver",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "Middle Backend",
        "Senior Backend",
        "18.5M",
        "01.06.2026",
        "CTO",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Malika Karimova</b>",
        "HR Specialist",
        "HR Manager",
        "16.2M",
        "01.01.2026",
        "CEO",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Javohir Rasulov</b>",
        "Product Designer",
        "Senior Designer",
        "16.0M",
        "01.10.2026",
        "CPO",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "references": {
    "id": "references",
    "file": "references.html",
    "title": "Ma'lumotnomalar",
    "crumb": "HRM / Ma'lumotnomalar",
    "h1": "Ma'lumotnomalar",
    "sub": "Ichki qoidalar, lavozim yo‘riqnomalari va HR qo‘llanmalar bazasi",
    "kpis": [
      {
        "lbl": "Documents",
        "num": "248",
        "trend": "Knowledge base"
      },
      {
        "lbl": "Policies",
        "num": "37",
        "trend": "Active"
      },
      {
        "lbl": "Job descriptions",
        "num": "118",
        "trend": "Roles"
      },
      {
        "lbl": "Read rate",
        "num": "88%",
        "trend": "Employees"
      },
      {
        "lbl": "Updates",
        "num": "9",
        "trend": ""
      }
    ],
    "headers": [
      "Material",
      "Kategoriya",
      "Version",
      "Owner",
      "Updated",
      "Readers",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Employee Handbook</b>",
        "Policy",
        "v4.2",
        "HR",
        "18.09.2026",
        "221",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Remote Work Policy</b>",
        "Policy",
        "v2.1",
        "HR",
        "10.09.2026",
        "198",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Backend Developer JD</b>",
        "Job Description",
        "v3",
        "IT",
        "02.09.2026",
        "54",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Safety Guidelines</b>",
        "Safety",
        "v1.8",
        "Security",
        "12.08.2026",
        "248",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "reports": {
    "id": "reports",
    "file": "reports.html",
    "title": "Hisobotlar",
    "crumb": "HRM / Hisobotlar",
    "h1": "Hisobotlar",
    "sub": "HR analytics, trendlar va eksportlar",
    "kpis": [
      {
        "lbl": "Turnover",
        "num": "8.7%",
        "trend": "-1.4%"
      },
      {
        "lbl": "Retention",
        "num": "91.3%",
        "trend": "+2.2%"
      },
      {
        "lbl": "Time to Hire",
        "num": "18 kun",
        "trend": "Target 21"
      },
      {
        "lbl": "Absence",
        "num": "2.0%",
        "trend": "Stable"
      },
      {
        "lbl": "Payroll",
        "num": "2.84B",
        "trend": ""
      }
    ],
    "headers": [
      "Report",
      "Period",
      "Owner",
      "Format",
      "Last generated",
      ""
    ],
    "rows": [
      [
        "<b>Employee Master</b>",
        "Sep 2026",
        "HR",
        "Excel / PDF",
        "28.09.2026 12:20",
        "<button class=\"btn\" data-toast=\"Report yuklanmoqda\">Download</button>"
      ],
      [
        "<b>Turnover Analysis</b>",
        "Q3 2026",
        "HR Director",
        "PDF",
        "27.09.2026 17:10",
        "<button class=\"btn\" data-toast=\"Report yuklanmoqda\">Download</button>"
      ],
      [
        "<b>Payroll Summary</b>",
        "Sep 2026",
        "Finance",
        "Excel",
        "28.09.2026 11:45",
        "<button class=\"btn\" data-toast=\"Report yuklanmoqda\">Download</button>"
      ]
    ]
  },
  "requests": {
    "id": "requests",
    "file": "requests.html",
    "title": "Arizalar va so‘rovlar",
    "crumb": "HRM / Arizalar va so‘rovlar",
    "h1": "Arizalar va so‘rovlar",
    "sub": "Xodimlardan keladigan barcha HR requestlar",
    "kpis": [
      {
        "lbl": "Pending",
        "num": "17",
        "trend": "Approval"
      },
      {
        "lbl": "Today",
        "num": "9",
        "trend": "New"
      },
      {
        "lbl": "Approved",
        "num": "48",
        "trend": "Bu oy"
      },
      {
        "lbl": "Rejected",
        "num": "5",
        "trend": "Bu oy"
      },
      {
        "lbl": "SLA",
        "num": "96%",
        "trend": ""
      }
    ],
    "headers": [
      "Request",
      "Xodim",
      "Turi",
      "Sana",
      "Approver",
      "SLA",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>REQ-221</b>",
        "Dilnoza Tursunova",
        "Unpaid Leave",
        "28.09.2026",
        "Finance Head",
        "1d",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>REQ-219</b>",
        "Sardor Mamatov",
        "Certificate",
        "27.09.2026",
        "HR",
        "4h",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>REQ-215</b>",
        "Madina Ergasheva",
        "Remote Work",
        "26.09.2026",
        "Manager",
        "1d",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>REQ-212</b>",
        "Bekzod Jo‘rayev",
        "Transfer",
        "25.09.2026",
        "CTO",
        "2d",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "settings": {
    "id": "settings",
    "file": "settings.html",
    "title": "Sozlamalar",
    "crumb": "HRM / Sozlamalar",
    "h1": "Sozlamalar",
    "sub": "Kompaniya, filiallar, workflow, integratsiyalar va tizim parametrlari",
    "kpis": [],
    "headers": [
      "Integration",
      "Purpose",
      "Status"
    ],
    "rows": [
      [
        "<b>Face ID / Turnstile</b>",
        "Attendance",
        "<span class=\"badge success\">Faol</span>"
      ],
      [
        "<b>Telegram Bot</b>",
        "Notifications",
        "<span class=\"badge success\">Faol</span>"
      ],
      [
        "<b>Email SMTP</b>",
        "Mail",
        "<span class=\"badge success\">Faol</span>"
      ],
      [
        "<b>Payroll API</b>",
        "Finance",
        "<span class=\"badge warning\">Jarayonda</span>"
      ]
    ]
  },
  "shifts": {
    "id": "shifts",
    "file": "shifts.html",
    "title": "Shiftlar",
    "crumb": "HRM / Shiftlar",
    "h1": "Shiftlar",
    "sub": "Smena jadvallari va shift assignment",
    "kpis": [
      {
        "lbl": "Shiftlar",
        "num": "12",
        "trend": "Faol"
      },
      {
        "lbl": "Shift employees",
        "num": "62",
        "trend": "Assigned"
      },
      {
        "lbl": "Overtime",
        "num": "18",
        "trend": "Bu oy"
      },
      {
        "lbl": "Coverage",
        "num": "98%",
        "trend": "Target"
      },
      {
        "lbl": "Conflict",
        "num": "2",
        "trend": ""
      }
    ],
    "headers": [
      "Shift",
      "Vaqt",
      "Bo‘lim",
      "Xodim",
      "Coverage",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Shift A</b>",
        "08:00–17:00",
        "Sales",
        "17",
        "100%",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Shift B</b>",
        "10:00–19:00",
        "Support",
        "26",
        "96%",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Night Support</b>",
        "19:00–04:00",
        "Support",
        "11",
        "91%",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Flexible</b>",
        "09:00–18:00",
        "IT",
        "54",
        "100%",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "skills": {
    "id": "skills",
    "file": "skills.html",
    "title": "Skill Matrix",
    "crumb": "HRM / Skill Matrix",
    "h1": "Skill Matrix",
    "sub": "Lavozim talablariga nisbatan xodim ko‘nikmalari",
    "kpis": [
      {
        "lbl": "Skills",
        "num": "1,248",
        "trend": "Unique"
      },
      {
        "lbl": "Mapped",
        "num": "93%",
        "trend": "Employees"
      },
      {
        "lbl": "Gap",
        "num": "74",
        "trend": "Critical"
      },
      {
        "lbl": "Advanced",
        "num": "381",
        "trend": "Skills"
      },
      {
        "lbl": "Learning",
        "num": "164",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "Skill",
      "Required",
      "Current",
      "Gap",
      "Verified",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Azizbek Aliyev</b>",
        "Python",
        "Expert",
        "Advanced",
        "1 level",
        "Manager",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Azizbek Aliyev</b>",
        "PostgreSQL",
        "Advanced",
        "Advanced",
        "0",
        "Manager",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Dilnoza Tursunova</b>",
        "Financial Analysis",
        "Advanced",
        "Intermediate",
        "1 level",
        "Mentor",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sardor Mamatov</b>",
        "Negotiation",
        "Advanced",
        "Advanced",
        "0",
        "Manager",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "succession": {
    "id": "succession",
    "file": "succession.html",
    "title": "Succession Plan",
    "crumb": "HRM / Succession Plan",
    "h1": "Succession Plan",
    "sub": "Muhim lavozimlar uchun vorislik va tayyorlik",
    "kpis": [
      {
        "lbl": "Critical roles",
        "num": "18",
        "trend": "Company"
      },
      {
        "lbl": "Ready now",
        "num": "6",
        "trend": "Candidate"
      },
      {
        "lbl": "Ready 6–12m",
        "num": "11",
        "trend": "Pipeline"
      },
      {
        "lbl": "High risk",
        "num": "3",
        "trend": "Needs plan"
      },
      {
        "lbl": "Talent pool",
        "num": "47",
        "trend": ""
      }
    ],
    "headers": [
      "Role",
      "Current owner",
      "Successor",
      "Readiness",
      "Gap",
      "Target",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>HR Director</b>",
        "Malika Karimova",
        "Nilufar Oripova",
        "68%",
        "Strategic HR",
        "12m",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>CTO</b>",
        "Jasur Karimov",
        "Azizbek Aliyev",
        "74%",
        "Leadership",
        "18m",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sales Head</b>",
        "Sardor Mamatov",
        "Otabek Hasanov",
        "52%",
        "Team management",
        "24m",
        "<span class=\"badge warning\">Jarayonda</span>",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "tasks": {
    "id": "tasks",
    "file": "tasks.html",
    "title": "HR Tasks",
    "crumb": "HRM / HR Tasks",
    "h1": "HR Tasks",
    "sub": "HR jamoasining deadline va vazifalar nazorati",
    "kpis": [
      {
        "lbl": "My Tasks",
        "num": "24",
        "trend": "Active"
      },
      {
        "lbl": "Due today",
        "num": "5",
        "trend": "Action"
      },
      {
        "lbl": "Overdue",
        "num": "2",
        "trend": "Urgent"
      },
      {
        "lbl": "Completed",
        "num": "184",
        "trend": "2026"
      },
      {
        "lbl": "SLA",
        "num": "94%",
        "trend": ""
      }
    ],
    "headers": [
      "Task",
      "Responsible",
      "Module",
      "Deadline",
      "Priority",
      "Progress",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Review probation — Dilnoza</b>",
        "Malika Karimova",
        "Probation",
        "28.09.2026",
        "High",
        "90%",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Verify candidate — Shahnoza</b>",
        "Kamron Saidov",
        "Recruitment",
        "28.09.2026",
        "High",
        "60%",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Prepare order — Sardor</b>",
        "HR Specialist",
        "Orders",
        "29.09.2026",
        "Medium",
        "30%",
        "Jarayonda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Probation review — Bekzod</b>",
        "Azizbek Aliyev",
        "Xodimlar",
        "30.09.2026",
        "Low",
        "100%",
        "Tugallangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "training": {
    "id": "training",
    "file": "training.html",
    "title": "Kurslar",
    "crumb": "HRM / Kurslar",
    "h1": "Kurslar",
    "sub": "O‘qitish, kurslar va malaka oshirish",
    "kpis": [
      {
        "lbl": "Kurslar",
        "num": "42",
        "trend": "Katalog"
      },
      {
        "lbl": "Enrolled",
        "num": "218",
        "trend": "Employee"
      },
      {
        "lbl": "Completed",
        "num": "164",
        "trend": "75%"
      },
      {
        "lbl": "Avg score",
        "num": "89%",
        "trend": "+2%"
      },
      {
        "lbl": "Budget",
        "num": "184M",
        "trend": ""
      }
    ],
    "headers": [
      "Kurs",
      "Kategoriya",
      "Enrolled",
      "Completed",
      "Score",
      "Instructor",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Python Advanced</b>",
        "Technical",
        "31",
        "27",
        "92%",
        "Azizbek Aliyev",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Leadership Essentials</b>",
        "Leadership",
        "24",
        "18",
        "88%",
        "Malika Karimova",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Business English B2</b>",
        "Language",
        "46",
        "36",
        "87%",
        "External",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Advanced Excel</b>",
        "Productivity",
        "22",
        "19",
        "91%",
        "Dilnoza Tursunova",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "trainings": {
    "id": "trainings",
    "file": "trainings.html",
    "title": "Treninglar",
    "crumb": "HRM / Treninglar",
    "h1": "Treninglar",
    "sub": "Ichki treninglar va seminarlar taqvimi",
    "kpis": [
      {
        "lbl": "Upcoming",
        "num": "9",
        "trend": "Bu oy"
      },
      {
        "lbl": "Participants",
        "num": "142",
        "trend": "Registered"
      },
      {
        "lbl": "Completed",
        "num": "27",
        "trend": "2026"
      },
      {
        "lbl": "Feedback",
        "num": "4.7/5",
        "trend": "Avg."
      },
      {
        "lbl": "Budget",
        "num": "42M",
        "trend": ""
      }
    ],
    "headers": [
      "Trening",
      "Sana",
      "Trainer",
      "Participants",
      "Rating",
      "Location",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Leadership Workshop</b>",
        "02.10.2026",
        "Malika Karimova",
        "24",
        "4.8/5",
        "HQ Room 1",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Secure Coding</b>",
        "05.10.2026",
        "Azizbek Aliyev",
        "18",
        "4.6/5",
        "IT Lab",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sales Mastery</b>",
        "09.10.2026",
        "External",
        "31",
        "4.7/5",
        "Conference",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "transfers": {
    "id": "transfers",
    "file": "transfers.html",
    "title": "Transfer",
    "crumb": "HRM / Transfer",
    "h1": "Transfer",
    "sub": "Ichki bo‘lim va filiallar bo‘yicha transferlar",
    "kpis": [
      {
        "lbl": "Requests",
        "num": "12",
        "trend": "Bu oy"
      },
      {
        "lbl": "Approved",
        "num": "8",
        "trend": "67%"
      },
      {
        "lbl": "Pending",
        "num": "3",
        "trend": "Review"
      },
      {
        "lbl": "Branches",
        "num": "6",
        "trend": "Coverage"
      },
      {
        "lbl": "Avg. process",
        "num": "6 kun",
        "trend": ""
      }
    ],
    "headers": [
      "Xodim",
      "From",
      "To",
      "Sabab",
      "Sana",
      "Approver",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Bekzod Jo‘rayev</b>",
        "IT / QA",
        "IT / Automation",
        "Career",
        "05.10.2026",
        "CTO",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Nodira Oripova</b>",
        "HR",
        "HR / L&D",
        "Development",
        "01.10.2026",
        "HR Director",
        "Tasdiqlangan",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Otabek Hasanov</b>",
        "Toshkent",
        "Qo‘qon",
        "Branch need",
        "15.10.2026",
        "COO",
        "Kutilmoqda",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "users": {
    "id": "users",
    "file": "users.html",
    "title": "Foydalanuvchilar",
    "crumb": "HRM / Foydalanuvchilar",
    "h1": "Foydalanuvchilar",
    "sub": "Tizimga kirish huquqiga ega foydalanuvchilar",
    "kpis": [
      {
        "lbl": "Users",
        "num": "48",
        "trend": "Jami"
      },
      {
        "lbl": "Active",
        "num": "45",
        "trend": "94%"
      },
      {
        "lbl": "Locked",
        "num": "1",
        "trend": "Review"
      },
      {
        "lbl": "2FA",
        "num": "41",
        "trend": "85%"
      },
      {
        "lbl": "Pending",
        "num": "2",
        "trend": ""
      }
    ],
    "headers": [
      "User",
      "Role",
      "Department",
      "Last login",
      "2FA",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Admin Manager</b>",
        "Super Admin",
        "Management",
        "28.09.2026 12:57",
        "Yes",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Malika Karimova</b>",
        "HR Director",
        "HR",
        "28.09.2026 12:49",
        "Yes",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Kamron Saidov</b>",
        "Recruiter",
        "HR",
        "28.09.2026 12:20",
        "Yes",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Nargiza Sobirova</b>",
        "Finance",
        "Finance",
        "27.09.2026 18:02",
        "No",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  },
  "vacancies": {
    "id": "vacancies",
    "file": "vacancies.html",
    "title": "Vakansiyalar",
    "crumb": "HRM / Vakansiyalar",
    "h1": "Vakansiyalar",
    "sub": "Ochiq ish o‘rinlari va hiring pipeline",
    "kpis": [
      {
        "lbl": "Ochiq vakansiyalar",
        "num": "18",
        "trend": "7 IT / 4 Sales"
      },
      {
        "lbl": "Arizalar",
        "num": "146",
        "trend": "Bu oy"
      },
      {
        "lbl": "Intervyu",
        "num": "39",
        "trend": "Scheduled"
      },
      {
        "lbl": "Offer",
        "num": "18",
        "trend": "12 accepted"
      },
      {
        "lbl": "Time to Hire",
        "num": "18 kun",
        "trend": ""
      }
    ],
    "headers": [
      "ID / Vakansiya",
      "Departament",
      "Ariza",
      "Intervyu",
      "Deadline",
      "Status",
      ""
    ],
    "rows": []
  },
  "work-schedule": {
    "id": "work-schedule",
    "file": "work-schedule.html",
    "title": "Ish jadvali",
    "crumb": "HRM / Ish jadvali",
    "h1": "Ish jadvali",
    "sub": "Xodimlarning ish jadvali va kalendar rejasi",
    "kpis": [
      {
        "lbl": "Jadval",
        "num": "38",
        "trend": "Template"
      },
      {
        "lbl": "Xodim",
        "num": "248",
        "trend": "Assigned"
      },
      {
        "lbl": "Mon-Fri",
        "num": "192",
        "trend": "Default"
      },
      {
        "lbl": "Remote",
        "num": "34",
        "trend": "Policy"
      },
      {
        "lbl": "O‘zgarish",
        "num": "12",
        "trend": ""
      }
    ],
    "headers": [
      "Schedule",
      "Bo‘lim",
      "Vaqt",
      "Break",
      "Xodim",
      "Effective",
      "Status",
      ""
    ],
    "rows": [
      [
        "<b>Standard Office</b>",
        "All",
        "09:00–18:00",
        "13:00–14:00",
        "167",
        "01.01.2026",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>IT Flexible</b>",
        "IT",
        "10:00–19:00",
        "14:00–15:00",
        "54",
        "01.03.2026",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Sales Shift A</b>",
        "Sales",
        "08:00–17:00",
        "12:00–13:00",
        "17",
        "01.06.2026",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ],
      [
        "<b>Part-time</b>",
        "Finance",
        "09:00–14:00",
        "12:00–12:30",
        "10",
        "01.09.2026",
        "Faol",
        "<button class=\"btn\" data-toast=\"Yozuv ochildi\">Ko‘rish</button>"
      ]
    ]
  }
};
