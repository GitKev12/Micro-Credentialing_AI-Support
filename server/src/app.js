import cors from "cors";
import express from "express";
import healthRoutes from "./routes/healthRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_request, response) => {
  response.json({
    message: "Capstone Project Dev API is running."
  });
});

app.use("/api/health", healthRoutes);

export default app;
