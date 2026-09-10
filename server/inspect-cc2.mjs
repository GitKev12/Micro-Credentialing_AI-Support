/**
 * Read-only: what the reader draws for CC2 today, against what it will draw
 * once the cache re-extracts. Nothing here writes.
 *
 *   node server/inspect-cc2.mjs
 */
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildLessonBlocks,
  buildSections,
  insertFigureBlocks
} from "./src/modules/modules.format.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim()
    ])
);

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection;
const rule = (t) => console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));

const courses = await db.collection("Course").find({}).toArray();

const count = (blocks, type) => blocks.filter((b) => b.type === type).length;
const singles = (blocks) =>
  blocks.filter((b) => b.type === "list" && b.items.length === 1).length;
const activities = (blocks) =>
  blocks.filter((b) => b.type === "heading" && /^ACTIVITIES$/i.test(b.text ?? "")).length;

const total = { oldS: 0, newS: 0, oldA: 0, newA: 0, oldT: 0, newT: 0, oldF: 0, newF: 0 };
const problems = [];

for (const course of courses) {
  const modules = await db
    .collection("LearningModule")
    .find({ $or: [{ courseId: String(course._id) }, { courseId: course._id }] })
    .toArray();

  rule(`${course.courseCode} — ${course.courseName}   (${modules.length} modules)`);

  let seen = 0;
  for (const module of modules) {
  const cached = await db.collection("ModuleText").findOne({ moduleId: String(module._id) });
  if (!cached?.pages?.length) {
    console.log(`\n${module.title}\n  never opened — nothing cached to compare`);
    continue;
  }
  seen += 1;

  const before = cached.blocks ?? [];
  const figures = before
    .filter((b) => b.type === "figure")
    .map(({ page, fileId, width, height }) => ({ page, fileId, width, height }));
  const fresh = buildLessonBlocks(cached.pages);
  const after = insertFigureBlocks(fresh, figures);

  total.oldS += singles(before);
  total.newS += singles(after);
  total.oldA += activities(before);
  total.newA += activities(after);
  total.oldT += count(before, "term");
  total.newT += count(after, "term");
  total.oldF += figures.length;
  total.newF += count(after, "figure");

  // A page that used to carry text and now carries none. Harmless in itself
  // (its prose was joined to the sentence it continued, or the page was a
  // stripped evaluation section) — it only matters when a figure was standing
  // on it, because that figure then has nowhere to go.
  const pageCounts = (blocks) => {
    const counts = new Map();
    for (const b of blocks) {
      if (b.page == null || b.type === "figure") continue;
      counts.set(b.page, (counts.get(b.page) ?? 0) + 1);
    }
    return counts;
  };
  const oldPages = pageCounts(before);
  const newPages = pageCounts(fresh);
  const figurePages = new Set(figures.map((f) => f.page));
  const emptied = [...oldPages.keys()].filter((p) => (newPages.get(p) ?? 0) === 0);
  const orphaned = emptied.filter((p) => figurePages.has(p));

  const was = (cached.sections ?? []).map((s) => s.title);
  const now = buildSections(after).map((s) => s.title);

  console.log(`\n${module.title}`);
  console.log(`  one-item lists    ${singles(before)} -> ${singles(after)}`);
  console.log(`  bogus ACTIVITIES  ${activities(before)} -> ${activities(after)}`);
  console.log(`  definition cards  ${count(before, "term")} -> ${count(after, "term")}`);
  console.log(`  figures           ${figures.length} -> ${count(after, "figure")}`);
  console.log(`  sections now: ${now.join(" | ")}`);

  if (figures.length !== count(after, "figure")) {
    problems.push(`${module.title}: lost a figure`);
  }
  if (orphaned.length) {
    problems.push(
      `${module.title}: pages ${orphaned.join(", ")} went empty and had figures on them`
    );
  } else if (emptied.length) {
    console.log(`  (pages ${emptied.join(", ")} went empty — no figures on them)`);
  }
  if (was.length - activities(before) !== now.length) {
    problems.push(`${module.title}: section count moved unexpectedly`);
  }
  }

  if (!seen) console.log("\n  (no module of this course has ever been opened)");
}

rule("ACROSS EVERY COURSE");
console.log(`  one-item lists    ${total.oldS} -> ${total.newS}`);
console.log(`  bogus ACTIVITIES  ${total.oldA} -> ${total.newA}`);
console.log(`  definition cards  ${total.oldT} -> ${total.newT}`);
console.log(`  figures           ${total.oldF} -> ${total.newF}`);

rule(problems.length ? "PROBLEMS" : "NO PROBLEMS DETECTED");
for (const problem of problems) console.log(`  !! ${problem}`);

await mongoose.disconnect();
