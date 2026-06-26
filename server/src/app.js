import cors from "cors";
import express from "express";
import authRoutes from "./auth/auth.routes.js";
import courseRoutes from "./courses/courses.routes.js";
import healthRoutes from "./health/health.routes.js";
import { trackRequestUsage } from "./middleware/requestMetrics.js";

const app = express();

app.use(cors());
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

export default app;
