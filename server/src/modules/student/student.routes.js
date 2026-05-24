import { Router } from "express";
import { getStudentOverview } from "./student.controller.js";

const router = Router();

router.get("/overview", getStudentOverview);

export default router;
