import { Router } from "express";
import { getStanding, loginAdmin, loginUser } from "./auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", loginUser);
router.post("/admin/login", loginAdmin);

// What is closed for whoever is signed in, asked again while a screen is open.
// Guarded like everything else, which is the point of it: a suspended account
// is refused here too, and that refusal is the answer the client is watching
// for. See getStanding.
router.get("/standing", requireAuth, getStanding);

export default router;
