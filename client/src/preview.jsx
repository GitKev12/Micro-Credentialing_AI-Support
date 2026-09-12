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
import StudentCourses from "./pages/student/components/StudentCourses";
import LearningModules from "./pages/student/LearningModules";
import QuizRunner from "./pages/student/components/QuizRunner";
import StudentPaper from "./pages/assessor/components/StudentPaper";
import "./pages/assessor/assessor.css";
import ccsBackground from "./assets/CCS-Background.jpg";
import AdminLayout from "./pages/admin/AdminLayout";
import CourseManagement from "./pages/admin/CourseManagement";
import StudentsManagement from "./pages/admin/StudentsManagement";

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
    startsOn: "2026-08-04T00:00:00.000Z",
    endsOn: "2026-10-10T00:00:00.000Z",
    moduleCount: 12,
    studentCount: 48
  },
  {
    id: "ac2",
    code: "IT 214",
    title: "Web Systems and Technologies",
    description: "Client and server architecture, markup, styling and the request lifecycle.",
    startsOn: "2026-08-04T00:00:00.000Z",
    endsOn: "2026-12-12T00:00:00.000Z",
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
    startsOn: "2026-11-02T00:00:00.000Z",
    endsOn: "2027-01-15T00:00:00.000Z",
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
    startsOn: "2026-09-01T00:00:00.000Z",
    moduleCount: 14,
    studentCount: 52
  }
];

// The student's home — one course in every state a card can be in: working
// through, nearly done, untouched, finished, ended, switched off, and empty.
const HOME_COURSES = [
  {
    id: "h1",
    code: "IT 214",
    title: "Web Systems and Technologies",
    description: "Client and server architecture, markup, styling and the request lifecycle.",
    startsOn: "2026-08-04T00:00:00.000Z",
    endsOn: "2026-12-12T00:00:00.000Z",
    imageUrl: ccsBackground,
    moduleCount: 8,
    completedModules: 4,
    itemCount: 17,
    completedItems: 7,
    status: "in-progress"
  },
  {
    id: "h2",
    code: "CS 101",
    title: "Introduction to Computing",
    description:
      "Foundations of computer systems, number representation and the basics of algorithmic thinking.",
    startsOn: "2026-08-04T00:00:00.000Z",
    endsOn: "2026-10-10T00:00:00.000Z",
    imageUrl: new URLSearchParams(window.location.search).get("pic") ? ccsBackground : null,
    moduleCount: 12,
    completedModules: 12,
    itemCount: 25,
    completedItems: 22,
    status: "in-progress"
  },
  {
    id: "h3",
    code: "DB 205",
    title: "Database Management Systems",
    description: "Relational modelling, normalisation and query planning.",
    startsOn: "2026-09-01T00:00:00.000Z",
    endsOn: "2026-11-28T00:00:00.000Z",
    moduleCount: 14,
    completedModules: 0,
    itemCount: 29,
    completedItems: 0,
    status: "not-started"
  },
  {
    id: "h4",
    code: "HCI 240",
    title: "Human Computer Interaction",
    description: "Heuristic evaluation, prototyping and usability testing.",
    startsOn: "2026-07-01T00:00:00.000Z",
    endsOn: "2026-12-01T00:00:00.000Z",
    moduleCount: 5,
    completedModules: 5,
    itemCount: 11,
    completedItems: 11,
    status: "completed"
  },
  {
    id: "h5",
    code: "IA 301",
    title: "Information Assurance and Security Management for Enterprise Systems",
    description:
      "Threat modelling, access control and the policy side of keeping an organisation's data intact.",
    startsOn: "2026-06-01T00:00:00.000Z",
    endsOn: "2026-08-30T00:00:00.000Z",
    ended: true,
    moduleCount: 6,
    completedModules: 5,
    itemCount: 13,
    completedItems: 9,
    status: "in-progress"
  },
  {
    id: "h6",
    code: "CS 226",
    title: "Data Structures and Algorithms",
    description: "",
    startsOn: "2026-08-18T00:00:00.000Z",
    endsOn: "2026-12-05T00:00:00.000Z",
    suspended: true,
    suspendedReason: "Your class for this course is switched off, so its lessons are closed for now.",
    moduleCount: 10,
    completedModules: 2,
    itemCount: 21,
    completedItems: 3,
    status: "in-progress"
  },
  {
    id: "h7",
    code: "SE 310",
    title: "Software Engineering",
    description: "Requirements, design, testing and the work of shipping software as a team.",
    moduleCount: 0,
    completedModules: 0,
    itemCount: 0,
    completedItems: 0,
    status: "not-started"
  }
];

// The paper any quiz in the rail opens: one question traced for its output, one
// searched for its error, and one with no code, so the code box can be seen
// both there and absent.
const QUIZ_PAPER = {
  id: "a1",
  scope: "lesson",
  title: "Markup basics quiz",
  itemCount: 3,
  totalPoints: 3,
  passMark: 2,
  items: [
    {
      id: "q1",
      n: 1,
      type: "multiple-choice",
      q: "What does this program print?",
      code: "int total = 0;\nfor (int i = 1; i <= 4; i++) {\n    if (i % 2 == 0) {\n        total += i;\n    }\n}\nSystem.out.println(total);",
      choices: [
        { id: "a", text: "6" },
        { id: "b", text: "10" },
        { id: "c", text: "4" },
        { id: "d", text: "2" }
      ]
    },
    {
      id: "q2",
      n: 2,
      type: "multiple-choice",
      q: "Which line stops this code from compiling?",
      code: "int score = 85;\nString grade;\nif (score = 90) {\n    grade = \"A\";\n} else {\n    grade = \"B\";\n}",
      choices: [
        { id: "a", text: "Line 1" },
        { id: "b", text: "Line 2" },
        { id: "c", text: "Line 3" },
        { id: "d", text: "Line 6" }
      ]
    },
    {
      id: "q3",
      n: 3,
      type: "true-false",
      q: "A switch statement without break statements runs every case after the one that matches.",
      choices: [
        { id: "true", text: "True" },
        { id: "false", text: "False" }
      ]
    }
  ]
};

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
  [/\/students\/[^/]+\/courses$/, () => ({ courses: HOME_COURSES })],
  [/\/students\/[^/]+\/assessments\/[^/]+$/, () => ({ assessment: QUIZ_PAPER, result: null })],
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
  if (params.get("home")) return 4;
  if (params.get("students")) return 3;
  if (params.get("admin")) return 2;
  if (params.get("modules")) return 1;
  return 0;
}

// The same paper as the assessor reads it back, key and explanations included.
const MARKED_PAPER = QUIZ_PAPER.items.map((item, index) => ({
  ...item,
  key: ["a", "c", "true"][index],
  chosen: ["a", "b", "true"][index],
  answered: true,
  verdict: ["correct", "incorrect", "correct"][index],
  explanation: [
    "Only the even values 2 and 4 are added, so total ends at 6.",
    "Line 3 uses = inside the condition. That assigns 90 to score, and an int is not a boolean, so it does not compile.",
    "Without break, execution falls through into every case below the one that matched."
  ][index]
}));

function previewScreen() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("quiz")) {
    return (
      <div className="app-shell">
        <div className="student-page student-app">
          <QuizRunner
            studentId="preview-student"
            assessment={{ id: "a1", scope: "lesson", title: QUIZ_PAPER.title }}
            onSubmitted={() => {}}
            onBadgeEarned={() => {}}
          />
        </div>
      </div>
    );
  }

  if (params.get("paper")) {
    return (
      <div className="assessor-app">
        <div className="assessor-main" style={{ padding: 24 }}>
          <StudentPaper
            student={{ name: "Andrea Lim", sid: "2022-TSU-0138" }}
            assessment={{ itemCount: 3 }}
            result={{ score: 2, totalPoints: 3, passMark: 2, passed: true, answered: 3 }}
            items={MARKED_PAPER}
          />
        </div>
      </div>
    );
  }

  return null;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* ?modules=1 lesson rail · ?admin=1 course grid · ?students=1 students · ?home=1 student home (add &pic=1 to give the lead course a picture) · ?quiz=1 a quiz with code · ?paper=1 the assessor's marked copy */}
    {previewScreen() ?? (
    <MemoryRouter
      initialEntries={[
        "/student/dashboard",
        "/student/courses/c1/modules",
        "/admin/courses",
        "/admin/students",
        "/student"
      ]}
      initialIndex={previewRoute()}
    >
      <div className="app-shell">
        <Routes>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentCourses />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="courses/:courseId/modules" element={<LearningModules />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="courses" element={<CourseManagement />} />
            <Route path="students" element={<StudentsManagement />} />
          </Route>
        </Routes>
      </div>
    </MemoryRouter>
    )}
  </StrictMode>
);
