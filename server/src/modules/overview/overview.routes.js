import { Router } from "express";
import { getSystemOverview } from "./overview.controller.js";

const router = Router();

router.get("/", getSystemOverview);

export default router;
