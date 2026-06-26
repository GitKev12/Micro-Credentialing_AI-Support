export function getHealthStatus(_request, response) {
  response.json({
    status: "ok",
    message: "Server is running.",
    timestamp: new Date().toISOString()
  });
}
