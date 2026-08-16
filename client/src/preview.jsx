/**
 * Throwaway design harness — renders the student dashboard against fixture
 * data so the redesign can be looked at without a database or a login.
 * Not referenced by the app; delete along with preview.html.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import api from "./services/api";
import StudentLayout from "./pages/student/StudentLayout";
import StudentDashboard from "./pages/student/StudentDashboard";
import LearningModules from "./pages/student/LearningModules";
import AdminLayout from "./pages/admin/AdminLayout";
import CourseManagement from "./pages/admin/CourseManagement";
import StudentsManagement from "./pages/admin/StudentsManagement";
import TableOfSpecification from "./pages/admin/TableOfSpecification";

const LEVEL_KEYS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

function tosRow(course, hours, spread) {
  const row = { course, hours };
  LEVEL_KEYS.forEach((key, i) => {
    row[key] = spread[i] ?? 0;
  });
  return row;
}

// Enough blueprints that the old tab strip would have scrolled sideways, plus
// one with no rows so the "empty" marker in the dropdown is on screen.
const TOS_BLUEPRINTS = [
  {
    id: "t1",
    courseId: "ac1",
    courseCode: "CS 101",
    examination: "Final Examination",
    rows: [
      tosRow("Number systems", 6, [4, 3, 2, 1, 0, 0]),
      tosRow("Boolean logic", 4, [3, 2, 2, 1, 1, 1]),
      tosRow("Algorithmic thinking", 8, [2, 3, 3, 1, 1, 0])
    ]
  },
  {
    id: "t2",
    courseId: "ac2",
    courseCode: "IT 214",
    examination: "Midterm Examination",
    rows: [
      tosRow("Markup and semantics", 5, [4, 3, 2, 1, 0, 0]),
      tosRow("Styling and layout", 7, [3, 3, 3, 2, 1, 0])
    ]
  },
  {
    id: "t3",
    courseId: "ac3",
    courseCode: "CS 226",
    examination: "Prelim Examination",
    rows: []
  },
  {
    id: "t4",
    courseId: "ac4",
    courseCode: "IA 301",
    examination: "Comprehensive Assessment for Enterprise Security",
    rows: [tosRow("Threat modelling", 6, [2, 2, 3, 2, 1, 1])]
  },
  {
    id: "t5",
    courseId: "ac6",
    courseCode: "DB 205",
    examination: "Final Examination",
    rows: [
      tosRow("Normalisation", 6, [3, 3, 2, 2, 0, 0]),
      tosRow("Query planning", 5, [2, 2, 3, 2, 1, 0])
    ]
  }
];
import { applyStoredTheme } from "./services/theme";
import "./styles.css";

// Admin course list — a spread that exercises every state the card has:
// long and short titles, a missing description, and courses with no modules.
const ADMIN_COURSES = [
  {
    id: "ac1",
    code: "CS 101",
    title: "Introduction to Computing",
    description:
      "Foundations of computer systems, number representation and the basics of algorithmic thinking.",
    moduleCount: 12,
    studentCount: 48
  },
  {
    id: "ac2",
    code: "IT 214",
    title: "Web Systems and Technologies",
    description: "Client and server architecture, markup, styling and the request lifecycle.",
    moduleCount: 8,
    studentCount: 31
  },
  {
    id: "ac3",
    code: "CS 226",
    title: "Data Structures and Algorithms",
    description: "",
    moduleCount: 0,
    studentCount: 27
  },
  {
    id: "ac4",
    code: "IA 301",
    title: "Information Assurance and Security Management for Enterprise Systems",
    description:
      "Threat modelling, access control and the policy side of keeping an organisation's data intact.",
    moduleCount: 5,
    studentCount: 19
  },
  {
    id: "ac5",
    code: "HCI 240",
    title: "Human Computer Interaction",
    description: "Heuristic evaluation, prototyping and usability testing.",
    moduleCount: 0,
    studentCount: 0
  },
  {
    id: "ac6",
    code: "DB 205",
    title: "Database Management Systems",
    description: "Relational modelling, normalisation and query planning.",
    moduleCount: 14,
    studentCount: 52
  }
];

const MODULES = [
  { id: "m1", title: "Introduction to Markup", subject: "WEBSYS" },
  { id: "m2", title: "Styling and the Box Model", subject: "WEBSYS" },
  { id: "m3", title: "Layout with Flexbox and Grid", subject: "WEBSYS" },
  { id: "m4", title: "Accessible Interfaces", subject: "WEBSYS" },
  { id: "m5", title: "Fetching Data from an API", subject: "WEBSYS" }
];

// One generated quiz per module, matching the Assessment collection's shape.
// m1 and m2 are completed in the fixture, so their quizzes are unlocked and
// the rest show the locked state.
const ASSESSMENTS = [
  { id: "a1", moduleId: "m1", title: "Markup basics quiz", status: "open" },
  { id: "a2", moduleId: "m2", title: "Box model quiz", status: "open" },
  { id: "a3", moduleId: "m3", title: "Flexbox and Grid quiz", status: "open" },
  { id: "a4", moduleId: "m5", title: "Async data quiz", status: "open" }
];

// Students list — includes two with no enrolments, so the "None" row flag is
// on screen.
const ADMIN_STUDENTS = [
  {
    id: "s1",
    studentNumber: "2021-TSU-0417",
    name: "Kevin Kharl Manalo",
    email: "kevin@tsu.edu.ph",
    enrolled: [
      { id: "ac1", code: "CS 101", title: "Introduction to Computing" },
      { id: "ac2", code: "IT 214", title: "Web Systems and Technologies" },
      { id: "ac6", code: "DB 205", title: "Database Management Systems" }
    ]
  },
  {
    id: "s2",
    studentNumber: "2022-TSU-0138",
    name: "Andrea Lim",
    email: "andrea@tsu.edu.ph",
    enrolled: [{ id: "ac2", code: "IT 214", title: "Web Systems and Technologies" }]
  },
  {
    id: "s3",
    studentNumber: "2023-TSU-0562",
    name: "Miguel Santos",
    email: "miguel@tsu.edu.ph",
    enrolled: []
  },
  {
    id: "s4",
    studentNumber: "2021-TSU-0904",
    name: "Rina Ocampo",
    email: "rina@tsu.edu.ph",
    enrolled: []
  }
];

const ADMIN_PROGRESS = {
  s1: [
    { label: "Introduction to Computing", pct: 100, completed: 12, total: 12 },
    { label: "Web Systems and Technologies", pct: 38, completed: 3, total: 8 },
    // total 0 exercises the "No modules yet" branch, which used to read 0%.
    { label: "Database Management Systems", pct: 0, completed: 0, total: 0 }
  ],
  s2: [{ label: "Web Systems and Technologies", pct: 63, completed: 5, total: 8 }]
};

const SECTIONS = {
  m1: [
    { id: "s1", title: "What markup is for", page: 1 },
    { id: "s2", title: "Elements, tags and attributes", page: 2 },
    { id: "s3", title: "Document structure", page: 4 },
    { id: "s4", title: "Semantic elements", page: 6 }
  ],
  m2: [
    { id: "s5", title: "Selectors and the cascade", page: 1 },
    { id: "s6", title: "The box model", page: 3 },
    { id: "s7", title: "Spacing and collapse", page: 5 }
  ],
  m3: [
    { id: "s8", title: "Flex containers", page: 1 },
    { id: "s9", title: "Grid tracks and areas", page: 4 }
  ],
  m4: [],
  m5: [
    { id: "s10", title: "Promises and async/await", page: 1 },
    { id: "s11", title: "Handling failure", page: 3 }
  ]
};

const COURSES = [
  {
    id: "c1",
    title: "Web Systems and Technologies",
    icon: "🌐",
    imageUrl: null,
    status: "in-progress",
    performance: 88,
    skills: [
      { topic: "HTML semantics", score: 94 },
      { topic: "CSS layout", score: 86 },
      { topic: "JavaScript DOM", score: 79 },
      { topic: "HTTP & REST", score: 71 },
      { topic: "Accessibility", score: 62 }
    ]
  },
  {
    id: "c2",
    title: "Data Structures and Algorithms",
    icon: "🧮",
    imageUrl: null,
    status: "in-progress",
    performance: 68,
    skills: [
      { topic: "Arrays & strings", score: 82 },
      { topic: "Linked lists", score: 74 },
      { topic: "Trees", score: 61 },
      { topic: "Graph traversal", score: 48 },
      { topic: "Complexity analysis", score: 57 }
    ]
  },
  {
    id: "c3",
    title: "Database Management Systems",
    icon: "🗄️",
    imageUrl: null,
    status: "completed",
    performance: 92,
    skills: [
      { topic: "Normalisation", score: 95 },
      { topic: "SQL joins", score: 91 },
      { topic: "Indexing", score: 88 },
      { topic: "Transactions", score: 84 }
    ]
  },
  {
    id: "c4",
    title: "Software Engineering",
    icon: "🛠️",
    imageUrl: null,
    status: "in-progress",
    performance: 76,
    skills: [
      { topic: "Requirements", score: 83 },
      { topic: "UML modelling", score: 72 },
      { topic: "Testing", score: 66 },
      { topic: "Version control", score: 90 }
    ]
  },
  {
    id: "c5",
    title: "Computer Networks",
    icon: "📡",
    imageUrl: null,
    status: "completed",
    performance: 81,
    skills: [
      { topic: "OSI model", score: 87 },
      { topic: "Subnetting", score: 69 },
      { topic: "Routing", score: 78 }
    ]
  },
  {
    id: "c6",
    title: "Information Assurance and Security",
    icon: "🔐",
    imageUrl: null,
    status: "in-progress",
    performance: 59,
    skills: [
      { topic: "Cryptography basics", score: 64 },
      { topic: "Threat modelling", score: 52 },
      { topic: "Access control", score: 61 }
    ]
  },
  {
    id: "c7",
    title: "Human Computer Interaction",
    icon: "🎨",
    imageUrl: null,
    status: "in-progress",
    performance: 85,
    skills: [
      { topic: "Heuristic evaluation", score: 89 },
      { topic: "Prototyping", score: 81 }
    ]
  }
];

window.localStorage.setItem(
  "capstoneAuthSession",
  JSON.stringify({
    user: {
      id: "preview-student",
      role: "student",
      displayName: "Kevin Kharl Manalo",
      identifier: "2021-TSU-0417"
    }
  })
);

function withProgress(student) {
  const progress = ADMIN_PROGRESS[student.id] ?? [];
  return {
    ...student,
    progress,
    credentials: progress.filter((row) => row.total > 0 && row.pct === 100).length
  };
}

// Route each request to its fixture, with a short delay so loading and
// skeleton states are actually visible while looking at the page.
const ROUTES = [
  [/\/admin\/courses$/, () => ({ courses: ADMIN_COURSES })],
  [
    /\/admin\/courses\/([^/]+)$/,
    (m) => ({
      course: { ...ADMIN_COURSES.find((c) => c.id === m[1]), modules: [] }
    })
  ],
  [/\/admin\/profile$/, () => ({ admin: { name: "Kevin Kharl Manalo", idNumber: "ADM-0042" } })],
  [/\/admin\/table-of-specification$/, () => ({ blueprints: TOS_BLUEPRINTS })],
  [/\/admin\/students$/, () => ({ students: ADMIN_STUDENTS })],
  // Enrol (POST .../courses) and unenrol (DELETE .../courses/:id), mutating
  // the fixture so the confirm flow and the notices behave like the real API.
  [
    /\/admin\/students\/([^/]+)\/courses(?:\/([^/]+))?$/,
    (m, config) => {
      const student = ADMIN_STUDENTS.find((s) => s.id === m[1]);
      if (m[2]) {
        student.enrolled = student.enrolled.filter((c) => c.id !== m[2]);
      } else {
        const { courseId } = JSON.parse(config.data ?? "{}");
        const course = ADMIN_COURSES.find((c) => c.id === courseId);
        if (course && !student.enrolled.some((c) => c.id === course.id)) {
          student.enrolled = [
            ...student.enrolled,
            { id: course.id, code: course.code, title: course.title }
          ];
        }
      }
      return { student: withProgress(student) };
    }
  ],
  [/\/admin\/students\/([^/]+)$/, (m) => ({ student: withProgress(ADMIN_STUDENTS.find((s) => s.id === m[1])) })],
  [/\/skill-gap$/, () => ({ courses: COURSES })],
  [/\/courses\/[^/]+\/modules$/, () => ({ modules: MODULES })],
  [/\/courses\/[^/]+\/assessments$/, () => ({ assessments: ASSESSMENTS })],
  [/\/progress$/, () => ({ completedModuleIds: ["m1", "m2"] })],
  [
    /\/modules\/([^/]+)\/sections$/,
    (m) => ({ sections: SECTIONS[m[1]] ?? [] })
  ],
  [
    /\/modules\/([^/]+)\/text$/,
    (m) => ({
      title: MODULES.find((x) => x.id === m[1])?.title ?? "Lesson",
      numPages: 8,
      hasText: true,
      readingMinutes: 6,
      blocks: (SECTIONS[m[1]] ?? []).flatMap((section) => [
        { type: "heading", id: section.id, text: section.title },
        {
          type: "paragraph",
          text:
            "Placeholder body copy for the design preview. The rail on the left is the part being looked at here — this column only exists so the section links have somewhere to scroll to."
        }
      ]),
      pages: []
    })
  ]
];

api.defaults.adapter = async (config) => {
  const url = config.url ?? "";
  const hit = ROUTES.find(([pattern]) => pattern.test(url));
  const match = hit ? url.match(hit[0]) : null;

  await new Promise((resolve) => setTimeout(resolve, 350));

  return {
    data: hit ? hit[1](match, config) : {},
    status: 200,
    statusText: "OK",
    headers: {},
    config
  };
};

applyStoredTheme();

function previewRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("tos")) return 4;
  if (params.get("students")) return 3;
  if (params.get("admin")) return 2;
  if (params.get("modules")) return 1;
  return 0;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* ?modules=1 lesson rail · ?admin=1 course grid · ?students=1 students */}
    <MemoryRouter
      initialEntries={[
        "/student/dashboard",
        "/student/courses/c1/modules",
        "/admin/courses",
        "/admin/students",
        "/admin/table-of-specification"
      ]}
      initialIndex={previewRoute()}
    >
      <div className="app-shell">
        <Routes>
          <Route path="/student" element={<StudentLayout />}>
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="courses/:courseId/modules" element={<LearningModules />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="courses" element={<CourseManagement />} />
            <Route path="students" element={<StudentsManagement />} />
            <Route path="table-of-specification" element={<TableOfSpecification />} />
          </Route>
        </Routes>
      </div>
    </MemoryRouter>
  </StrictMode>
);
