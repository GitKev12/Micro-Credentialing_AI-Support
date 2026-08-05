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
import { applyStoredTheme } from "./services/theme";
import "./styles.css";

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

// Route each request to its fixture, with a short delay so loading and
// skeleton states are actually visible while looking at the page.
const ROUTES = [
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
    data: hit ? hit[1](match) : {},
    status: 200,
    statusText: "OK",
    headers: {},
    config
  };
};

applyStoredTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* Swap to "/student/courses/c1/modules" to look at the lesson rail. */}
    <MemoryRouter
      initialEntries={["/student/dashboard", "/student/courses/c1/modules"]}
      initialIndex={Number(new URLSearchParams(window.location.search).get("modules") ?? 0)}
    >
      <div className="app-shell">
        <Routes>
          <Route path="/student" element={<StudentLayout />}>
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="courses/:courseId/modules" element={<LearningModules />} />
          </Route>
        </Routes>
      </div>
    </MemoryRouter>
  </StrictMode>
);
