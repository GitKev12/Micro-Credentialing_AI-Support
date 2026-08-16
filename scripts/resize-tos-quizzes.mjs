/**
 * Sets every lesson quiz in the Table of Specification to a fixed item count.
 *
 *   node scripts/resize-tos-quizzes.mjs             # report only
 *   node scripts/resize-tos-quizzes.mjs --write     # apply
 *   node scripts/resize-tos-quizzes.mjs --items=10  # a different length
 *   node scripts/resize-tos-quizzes.mjs --restore=tos-backup-….json [--write]
 *                                                   # put the old rows back
 *
 * Each TOS row is one lesson's quiz, and its six level counts say how many
 * items to write at each level of thinking. The imported blueprints spread a
 * fixed 60-item examination across however many lessons a course has, so quiz
 * length varied by course — 4 items in TSM3, 8 in CC2 — and a percentage pass
 * mark landed differently on each. On a 4-item quiz, 60% rounds up to 3 of 4,
 * which is 75%.
 *
 * Giving every row the same length makes the pass mark mean the same thing
 * everywhere: at 10 items, 60% is exactly 6.
 *
 * The mix across levels is not invented here — it comes from each blueprint's
 * own `levelWeights`, the weighting the official spreadsheet was imported with.
 * Largest-remainder rounding keeps the six counts summing to exactly `items`.
 *
 * `--write` saves every document as it stood to a backup file first, so the
 * old blueprint can be restored if the new one is wrong.
 */

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const TOS_COLLECTION = "TableOfSpecification";
// Matches TOS_LEVELS in server/src/assessments/assessments.format.js — the
// order the rows are read in, and the order the admin screen shows.
const LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

const FALLBACK_WEIGHTS = {
  remember: 0.1,
  understand: 0.2,
  apply: 0,
  analyze: 0.3,
  evaluate: 0.4,
  create: 0
};

const flag = (name) => process.argv.some((arg) => arg === `--${name}`);
const option = (name, fallback) => {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const value = match ? Number.parseInt(match.split("=")[1], 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Ids are stored as ObjectId or string depending on how a document was
 *  seeded, and a JSON backup flattens them to strings — match either. */
function idCandidates(value) {
  const candidates = [value, String(value)];
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    candidates.push(new mongoose.Types.ObjectId(String(value)));
  }
  return candidates;
}

const itemsOf = (row) => LEVELS.reduce((sum, level) => sum + (Number(row?.[level]) || 0), 0);
const shape = (row) => LEVELS.map((level) => Number(row?.[level]) || 0).join("-");

/**
 * `items` split across the levels by weight.
 *
 * Whole questions only, and they must add up: each level takes its floor, then
 * the leftovers go to the levels with the largest fractions. A level weighted
 * zero stays zero — the blueprint saying "no `create` items" is a decision, not
 * a rounding artefact.
 */
function distribute(items, weights) {
  const total = LEVELS.reduce((sum, level) => sum + (Number(weights?.[level]) || 0), 0);
  if (total <= 0) return null;

  const exact = LEVELS.map((level) => ((Number(weights[level]) || 0) / total) * items);
  const counts = exact.map(Math.floor);
  let remaining = items - counts.reduce((sum, n) => sum + n, 0);

  const order = LEVELS.map((level, index) => ({ index, fraction: exact[index] - counts[index] }))
    .filter((entry) => (Number(weights[LEVELS[entry.index]]) || 0) > 0)
    .sort((a, b) => b.fraction - a.fraction);

  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    counts[order[cursor % order.length].index] += 1;
    remaining -= 1;
    cursor += 1;
  }

  return Object.fromEntries(LEVELS.map((level, index) => [level, counts[index]]));
}

/**
 * Puts the rows from a backup file back, matching documents by their id.
 *
 * Only `rows` is restored. The rest of a blueprint — its examination name, its
 * level weights, where it was imported from — is not what this script changes,
 * so writing it back would risk undoing something else that happened since.
 */
async function restore(collection, file, write) {
  const backup = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  console.log(
    `${write ? "Restoring" : "Dry run — restoring"} rows from ${file} (${backup.length} blueprints)\n`
  );

  let changed = 0;
  for (const saved of backup.sort((a, b) => (a.courseCode ?? "").localeCompare(b.courseCode ?? ""))) {
    // The backup is plain JSON, so an ObjectId came back as its hex string.
    // Match on both forms, the same way lib/mongo.js does for every other id
    // in this project.
    const current = await collection.findOne({ _id: { $in: idCandidates(saved._id) } });
    if (!current) {
      console.log(`${(saved.courseCode ?? "?").padEnd(15)} no longer in the database — skipped.`);
      continue;
    }

    const now = (current.rows ?? []).map(itemsOf);
    const back = (saved.rows ?? []).map(itemsOf);
    console.log(
      `${(saved.courseCode ?? "?").padEnd(15)} ${back.length} rows | ` +
        `${Math.min(...now)}–${Math.max(...now)} items each (${now.reduce((s, n) => s + n, 0)} total) ` +
        `→ ${Math.min(...back)}–${Math.max(...back)} each (${back.reduce((s, n) => s + n, 0)} total)`
    );

    if (!write) continue;
    const result = await collection.updateOne(
      { _id: current._id },
      { $set: { rows: saved.rows, updatedAt: new Date() } }
    );
    changed += result.modifiedCount;
  }

  console.log(
    write ? `\nRestored ${changed} blueprints.` : "\nNothing was written. Add --write to apply."
  );
}

async function main() {
  const items = option("items", 10);
  const write = flag("write");
  const restoreFrom = process.argv
    .find((arg) => arg.startsWith("--restore="))
    ?.slice("--restore=".length)
    .replace(/^["']|["']$/g, "");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set — check server/.env.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection(TOS_COLLECTION);
  const docs = await collection.find().toArray();

  if (docs.length === 0) {
    console.log("No Table of Specification documents found — nothing to do.");
    await mongoose.disconnect();
    return;
  }

  if (restoreFrom) {
    await restore(collection, restoreFrom, write);
    await mongoose.disconnect();
    return;
  }

  console.log(
    `${write ? "Applying" : "Dry run"} — every lesson quiz to ${items} items, across ${docs.length} blueprints.\n`
  );

  const planned = [];

  for (const doc of docs.sort((a, b) => (a.courseCode ?? "").localeCompare(b.courseCode ?? ""))) {
    const weights = doc.levelWeights ?? FALLBACK_WEIGHTS;
    const spread = distribute(items, weights);

    if (!spread) {
      console.log(`${doc.courseCode}: no usable levelWeights — skipped.`);
      continue;
    }

    const before = (doc.rows ?? []).map(itemsOf);
    const rows = (doc.rows ?? []).map((row) => ({ ...row, ...spread }));
    const beforeTotal = before.reduce((sum, n) => sum + n, 0);
    const afterTotal = rows.length * items;

    console.log(
      `${(doc.courseCode ?? "?").padEnd(15)} ${rows.length} lessons | ` +
        `was ${Math.min(...before)}–${Math.max(...before)} items each (${beforeTotal} total) ` +
        `→ ${items} each (${afterTotal} total)`
    );
    console.log(
      `${"".padEnd(15)} every row becomes ${LEVELS.map((l) => `${l[0].toUpperCase()}${spread[l]}`).join(" ")}  = ${shape(spread)}`
    );
    console.log(
      `${"".padEnd(15)} lesson quiz ${items * 5} pts, pass at 60% = ${Math.ceil(items * 5 * 0.6)} pts (${Math.ceil(items * 5 * 0.6) / 5} of ${items})`
    );
    console.log(
      `${"".padEnd(15)} final assessment ${afterTotal} items, ${afterTotal * 5} pts, pass ${Math.ceil(afterTotal * 5 * 0.6)}\n`
    );

    planned.push({ doc, rows });
  }

  if (!write) {
    console.log("Nothing was written. Re-run with --write to apply.");
    await mongoose.disconnect();
    return;
  }

  // The old blueprints, kept before anything is overwritten.
  const backupPath = path.resolve(
    process.cwd(),
    `tos-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(docs, null, 2));
  console.log(`Backed up ${docs.length} blueprints to ${backupPath}`);

  let changed = 0;
  for (const { doc, rows } of planned) {
    const result = await collection.updateOne(
      { _id: doc._id },
      { $set: { rows, updatedAt: new Date() } }
    );
    changed += result.modifiedCount;
  }

  console.log(`Updated ${changed} of ${planned.length} blueprints.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exitCode = 1;
});
