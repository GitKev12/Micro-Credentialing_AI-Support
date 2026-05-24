import Admin from "./admin.model.js";

export function getAdminOverview(_request, response) {
  response.json({
    entity: "Admin",
    model: Admin.modelName,
    routeBase: "/api/admins",
    focus: "Manage program governance, user oversight, and reporting workflows.",
    summary:
      "Admin resources should hold cross-cutting operational controls such as role management, scheduling rules, and institutional reporting.",
    collections: ["admins", "system_roles", "program_reports"],
    dashboardSections: [
      "Operations and approvals",
      "Role and account management",
      "Program reporting and audit trail"
    ],
    starterFeatures: [
      "Manage user roles and access scope",
      "Control program schedules and milestone windows",
      "Generate oversight reports across student and professor activity"
    ]
  });
}
