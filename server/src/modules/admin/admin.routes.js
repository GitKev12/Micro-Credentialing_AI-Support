import { Router } from "express";
import { getAdminOverview } from "./admin.controller.js";

const router = Router();

router.get("/overview", getAdminOverview);

export default router;
