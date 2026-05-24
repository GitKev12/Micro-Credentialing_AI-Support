import { Router } from "express";
import { getProfessorOverview } from "./professor.controller.js";

const router = Router();

router.get("/overview", getProfessorOverview);

export default router;
