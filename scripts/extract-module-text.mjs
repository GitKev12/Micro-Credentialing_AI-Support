/**
 * Pulls the text out of every lesson PDF, ahead of time.
 *
 *   node scripts/extract-module-text.mjs            # report what is missing
 *   node scripts/extract-module-text.mjs --write    # extract it
 *   node scripts/extract-module-text.mjs --write --force   # re-extract everything
 *
 * Extraction already happens by itself the first time anyone opens a lesson,
 * and the result is cached in ModuleText. The problem is that nothing has
 * opened most of them: two thirds of the lessons have no text, and a lesson
 * with no text cannot have a quiz generated from it.
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
const force = process.argv.includes("--force");

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
    return force || !existing?.hasText;
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
      const response = await fetch(`${BASE}/api/modules/${module._id}/text`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        failed += 1;
        console.log(`${label} — HTTP ${response.status}`);
        continue;
      }

      const body = await response.json();
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (body.hasText) {
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
