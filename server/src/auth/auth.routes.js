import { Router } from "express";
import { loginAdmin, loginUser } from "./auth.controller.js";

const router = Router();

router.post("/login", loginUser);
router.post("/admin/login", loginAdmin);

export default router;
