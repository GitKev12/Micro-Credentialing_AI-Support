export function getHealthStatus(_request, response) {
  response.json({
    status: "ok",
    message: "Server is healthy and entity modules are registered.",
    architecture: "Entity-first MERN workspace",
    availableEntities: ["Student", "Professor", "Admin"],
    timestamp: new Date().toISOString()
  });
}
