import cors from "cors";
import express from "express";
import adminRoutes from "./admin/admin.routes.js";
import assessmentRoutes from "./assessments/assessments.routes.js";
import assessorRoutes from "./assessors/assessors.routes.js";
import authRoutes from "./auth/auth.routes.js";
import certificateRoutes from "./certificates/certificates.routes.js";
import courseRoutes from "./courses/courses.routes.js";
import healthRoutes from "./health/health.routes.js";
import moduleRoutes from "./modules/modules.routes.js";
import { trackRequestUsage } from "./middleware/requestMetrics.js";

const app = express();

/**
 * In production the client is a separate Render service, so its origin has to
 * be named explicitly — `cors()` with no arguments answers every origin, which
 * with credentials in play means any site could call this API as your user.
 *
 * CORS_ORIGIN takes a comma-separated list. Left unset (local development) it
 * falls back to reflecting the request origin, which is the old behaviour.
 */
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(trackRequestUsage);

app.get("/", (_request, response) => {
  response.json({
    message: "Capstone Project Dev API is running.",
    entities: ["Student", "Assessor", "Admin"]
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/students", courseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/assessors", assessorRoutes);
app.use("/api", certificateRoutes);
app.use("/api", moduleRoutes);
app.use("/api", assessmentRoutes);

/**
 * An unknown /api path is a JSON 404, not Express's HTML one.
 *
 * Scoped to /api so anything else served from this app keeps whatever handling
 * it already had. A client that asked for JSON and got a page of markup cannot
 * tell a wrong URL from a broken server.
 */
app.use("/api", (_request, response) => {
  response.status(404).json({ message: "No such endpoint." });
});

/**
 * The one place an unexpected failure becomes a response.
 *
 * Express 5 forwards a rejected async handler here on its own, so nothing
 * hangs — but with no handler of our own it lands on the built-in one, which
 * answers with an HTML error page. Every screen in this project reads
 * `error.response.data.message`, which is undefined for markup, so a real cause
 * was being thrown away and shown as a generic "try again".
 *
 * The message is only returned outside production: it can carry a driver error
 * or a file path, which helps while developing and helps an attacker in the
 * open. The stack is logged either way, because that is the copy we need.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies the error
// handler by its four parameters; dropping `next` would make it ordinary
// middleware and the built-in HTML handler would take over again.
app.use((error, _request, response, _next) => {
  const status = Number(error?.status ?? error?.statusCode) || 500;

  if (status >= 500) console.error(error);

  // A body that failed to parse is the caller's mistake, not ours, and it is
  // worth naming — "Unexpected token in JSON" tells them exactly what to fix.
  const isClientFault = status < 500;
  const exposeMessage = isClientFault || process.env.NODE_ENV !== "production";

  response.status(status).json({
    message:
      (exposeMessage && error?.message) ||
      "Something went wrong on the server. Please try again."
  });
});

export default app;
