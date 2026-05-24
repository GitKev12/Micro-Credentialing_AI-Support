import cors from "cors";
import express from "express";
import adminRoutes from "./modules/admin/admin.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import overviewRoutes from "./modules/overview/overview.routes.js";
import professorRoutes from "./modules/professor/professor.routes.js";
import studentRoutes from "./modules/student/student.routes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_request, response) => {
  response.json({
    message: "Capstone Project Dev API is running.",
    architecture: "Entity-first MERN workspace",
    entities: ["Student", "Professor", "Admin"]
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/professors", professorRoutes);
app.use("/api/admins", adminRoutes);

export default app;
