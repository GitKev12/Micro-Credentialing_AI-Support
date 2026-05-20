export function getHealthStatus(_request, response) {
  response.json({
    status: "ok",
    message: "Server is healthy.",
    timestamp: new Date().toISOString()
  });
}
