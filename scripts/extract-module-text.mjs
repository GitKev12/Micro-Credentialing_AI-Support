/**
 * Pulls the text out of every lesson PDF, ahead of time.
 *
 *   node scripts/extract-module-text.mjs            # report what is missing
 *   node scripts/extract-module-text.mjs --write    # extract it
 *
 * A lesson's text is prepared in the background after upload, or the first
 * time anyone opens it, and kept in ModuleText. Lessons uploaded before that
 * existed and never opened have no text, and a lesson with no text cannot
 * have a quiz generated from it.
 *
 * This asks for them one at a time and waits for each to finish, so it never
 * piles every lesson onto the server at once. A lesson already prepared for
 * its current PDF is not prepared again.
 *
 * So this is the step before generation — and it costs nothing, because
 * extraction is pdfjs and Tesseract, not a paid model. Scanned lessons fall
 * back to real OCR and are slow; that is expected, not a hang.
 *
 * The API server must be running: this drives the same endpoint the reader
 * does, so there is only one extraction path to keep working.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}`;
const write = process.argv.includes("--write");

// How often to ask whether a lesson has finished preparing, and for how long.
const POLL_MS = 3000;
const GIVE_UP_MS = 15 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks for the lesson's text, and keeps asking while it is queued or being
// prepared. Resolves to the final answer (ready or failed).
async function fetchPreparedText(moduleId, token) {
  const startedAt = Date.now();

  for (;;) {
    const response = await fetch(`${BASE}/api/modules/${moduleId}/text`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.json();
    if (body.status !== "queued" && body.status !== "extracting") return body;
    if (Date.now() - startedAt > GIVE_UP_MS) throw new Error(`still ${body.status} after 15 minutes`);

    await sleep(POLL_MS);
  }
}

function adminToken(adminId) {
  return jwt.sign({ role: "admin" }, process.env.AUTH_SECRET, {
    subject: String(adminId),
    issuer: "capstone-project-dev",
    expiresIn: "6h"
  });
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const admin = await db.collection("Admin").findOne();
  if (!admin) {
    console.error("No Admin account found to authorise the extraction calls.");
    process.exit(1);
  }
  const token = adminToken(admin._id);

  const modules = await db
    .collection("LearningModule")
    .find({}, { projection: { title: 1, courseId: 1, fileType: 1 } })
    .toArray();

  const texts = await db
    .collection("ModuleText")
    .find({}, { projection: { moduleId: 1, hasText: 1, textLength: 1 } })
    .toArray();
  const textByModule = new Map(texts.map((doc) => [String(doc.moduleId), doc]));

  const pending = modules.filter((module) => {
    const existing = textByModule.get(String(module._id));
    return !existing?.hasText;
  });

  console.log(`Lessons: ${modules.length}`);
  console.log(`With text already: ${modules.length - pending.length}`);
  console.log(`To extract: ${pending.length}`);

  if (!write) {
    console.log("\nReport only. Re-run with --write to extract.");
    await mongoose.disconnect();
    return;
  }

  // Reachability is worth failing fast on: without it every lesson below
  // reports the same connection error one at a time.
  try {
    const health = await fetch(`${BASE}/api/health`);
    if (!health.ok) throw new Error(`health check answered ${health.status}`);
  } catch (error) {
    console.error(`\nCannot reach the API at ${BASE} — start the server first.`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }

  let extracted = 0;
  let empty = 0;
  let failed = 0;

  for (const [index, module] of pending.entries()) {
    const label = `[${index + 1}/${pending.length}] ${String(module.title ?? "").slice(0, 48)}`;
    const startedAt = Date.now();

    try {
      const body = await fetchPreparedText(module._id, token);
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (body.status === "failed") {
        failed += 1;
        console.log(`${label} — could not be prepared, ${seconds}s`);
      } else if (body.hasText) {
        extracted += 1;
        console.log(`${label} — ${body.textLength} chars, ${body.source}, ${seconds}s`);
      } else {
        empty += 1;
        console.log(`${label} — no text (${body.source}), ${seconds}s`);
      }
    } catch (error) {
      failed += 1;
      console.log(`${label} — ${error.message}`);
    }
  }

  console.log(`\nExtracted ${extracted}, still empty ${empty}, failed ${failed}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Extraction failed:", error.message);
  process.exit(1);
});
