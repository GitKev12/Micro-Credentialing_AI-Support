import Professor from "./professor.model.js";

export function getProfessorOverview(_request, response) {
  response.json({
    entity: "Professor",
    model: Professor.modelName,
    routeBase: "/api/professors",
    focus: "Manage faculty advising, panel assignments, and evaluation workflows.",
    summary:
      "Professor resources should isolate advising and assessment concerns so faculty tools stay cleanly separated from student and admin operations.",
    collections: ["professors", "panel_assignments", "evaluation_records"],
    dashboardSections: [
      "Advisory load overview",
      "Panel schedules and assignments",
      "Evaluation and recommendation history"
    ],
    starterFeatures: [
      "Map faculty expertise and specialization",
      "Track assigned student groups and panel roles",
      "Record evaluation status and rubric outcomes"
    ]
  });
}
