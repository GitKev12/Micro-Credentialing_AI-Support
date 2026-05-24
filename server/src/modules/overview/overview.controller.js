export function getSystemOverview(_request, response) {
  response.json({
    projectName: "Capstone Project Dev",
    architecture: "Entity-first MERN workspace",
    entities: [
      {
        name: "Student",
        clientRoute: "/student",
        apiPath: "/api/students/overview",
        modulePath: "server/src/modules/student",
        focus: "Learner records, adviser assignments, and capstone milestone submissions."
      },
      {
        name: "Professor",
        clientRoute: "/professor",
        apiPath: "/api/professors/overview",
        modulePath: "server/src/modules/professor",
        focus: "Faculty advising, panel responsibilities, and evaluation workflows."
      },
      {
        name: "Admin",
        clientRoute: "/admin",
        apiPath: "/api/admins/overview",
        modulePath: "server/src/modules/admin",
        focus: "Program governance, user oversight, and reporting operations."
      }
    ]
  });
}
