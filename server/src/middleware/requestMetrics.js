const requestMetricsStore = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  routeHits: {}
};

export function trackRequestUsage(request, _response, next) {
  requestMetricsStore.totalRequests += 1;

  const routeKey = `${request.method} ${request.path}`;
  requestMetricsStore.routeHits[routeKey] = (requestMetricsStore.routeHits[routeKey] || 0) + 1;

  next();
}

export function getRequestMetricsSnapshot() {
  const topRoutes = Object.entries(requestMetricsStore.routeHits)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([route, hits]) => ({ route, hits }));

  return {
    startedAt: requestMetricsStore.startedAt,
    totalRequests: requestMetricsStore.totalRequests,
    topRoutes
  };
}
