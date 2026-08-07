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

export default app;
