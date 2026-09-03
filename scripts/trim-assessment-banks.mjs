/**
 * Trims every Assessment down from a bank to the paper it used to serve.
 *
 *   node scripts/trim-assessment-banks.mjs            # report only
 *   node scripts/trim-assessment-banks.mjs --write    # apply
 *   node scripts/trim-assessment-banks.mjs --restore=assessment-bank-backup-….json --write
 *
 * Assessments used to hold a bank: the generator wrote three times what a quiz
 * needed and `itemsPerAttempt` said how many of them any one student was dealt.
 * That is gone — a paper is now its whole item list, and every student sits all
 * of it (see assessments.format.js).
 *
 * Which leaves the documents written under the old rule holding three times the
 * questions they were ever meant to ask. Nothing is broken in the code: the
 * paper is read as its items, correctly. But a quiz that asked five questions
 * would start asking fifteen, marked out of fifteen, and the marks already
 * recorded against it were earned over five.
 *
 * So the bank is trimmed rather than the rule bent. Two rules decide which
 * questions survive:
 *
 *   A paper somebody has already sat keeps exactly the questions they were
 *   served — `servedItemIds` on the submission records them. Their score then
 *   still means what it meant on the day: four out of five, not four out of
 *   fifteen. Where two students were served different sets, the union is kept
 *   and the paper ends up longer than one sitting was; that is the honest
 *   answer, since every one of those questions was really asked of somebody.
 *
 *   A paper nobody has sat keeps its first `itemsPerAttempt` questions, in
 *   bank order. No mark depends on the choice, and the generator wrote them in
 *   the order it wanted them read.
 *
 * `itemsPerAttempt` is then removed, along with `source.bankSize`, and
 * totalPoints and passMark are rewritten from what is left — the same
 * arithmetic normalizeAssessment does on the way out, stored so the document
 * agrees with itself.
 *
 * `--write` saves every document as it stood to a backup file first.
 */

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

const ASSESSMENTS = "Assessment";
const RESULTS = "StudentResult";

/** TSU's passing share, and the per-item value — both as the server holds them. */
const PASS_RATIO = 0.6;
const DEFAULT_POINTS_PER_ITEM = 1;

const asId = (value) => String(value);
const flag = (name) => process.argv.includes(name);
const option = (name) =>
  process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=").slice(1).join("=") ?? null;

const write = flag("--write");
const restoreFrom = option("--restore");

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set in server/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}

/** Puts a backup file's documents back exactly as they were. */
async function restore(db) {
  const saved = JSON.parse(fs.readFileSync(restoreFrom, "utf8"));
  console.log(`\nRestoring ${saved.length} assessment(s) from ${restoreFrom}\n`);

  for (const doc of saved) {
    const { _id, ...rest } = doc;
    console.log(`  ${rest.title} — ${(rest.items ?? []).length} questions`);
    if (write) {
      await db.collection(ASSESSMENTS).replaceOne({ _id: new mongoose.Types.ObjectId(_id) }, rest);
    }
  }

  console.log(write ? "\nRestored.\n" : "\nReport only — pass --write to apply.\n");
}

async function trim(db) {
  const [assessments, results] = await Promise.all([
    db.collection(ASSESSMENTS).find({}).toArray(),
    db.collection(RESULTS).find({}).toArray()
  ]);

  // Every question ever served for a paper, across every attempt — superseded
  // ones included. A retired attempt's mark is still on record, and it was
  // earned over the questions it was actually asked.
  const servedByAssessment = new Map();
  for (const result of results) {
    const key = asId(result.assessmentId);
    const ids = (result.servedItemIds ?? []).map(asId);
    if (ids.length === 0) continue;
    if (!servedByAssessment.has(key)) servedByAssessment.set(key, new Set());
    ids.forEach((id) => servedByAssessment.get(key).add(id));
  }

  const planned = [];

  for (const doc of assessments) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    const served = servedByAssessment.get(asId(doc._id)) ?? new Set();
    const perAttempt = Math.floor(Number(doc.itemsPerAttempt)) || items.length;

    // Bank order either way, so the paper reads as it was written.
    const kept =
      served.size > 0
        ? items.filter((item) => served.has(asId(item.id)))
        : items.slice(0, perAttempt);

    if (kept.length === 0) {
      console.log(`  ! ${doc.title} — nothing would survive; left alone.`);
      continue;
    }

    const pointsPerItem = Number(doc.pointsPerItem) > 0
      ? Number(doc.pointsPerItem)
      : DEFAULT_POINTS_PER_ITEM;
    const totalPoints = pointsPerItem * kept.length;

    planned.push({
      doc,
      reason: served.size > 0 ? `${served.size} question(s) already served` : `first ${perAttempt}`,
      // Renumbered, because `n` is what the screen counts by and a trimmed
      // paper numbered 3, 7, 11 reads as one with questions missing.
      items: kept.map((item, index) => ({ ...item, n: index + 1 })),
      totalPoints,
      passMark: Math.ceil(totalPoints * PASS_RATIO)
    });
  }

  console.log(`\n${planned.length} assessment(s) to trim\n`);

  for (const plan of planned) {
    const { doc } = plan;
    console.log(`  ${doc.title}  [${doc.status ?? "(no status)"}]`);
    console.log(
      `    items      ${(doc.items ?? []).length} -> ${plan.items.length}   (${plan.reason})`
    );
    console.log(`    total      ${doc.totalPoints ?? "—"} -> ${plan.totalPoints}`);
    console.log(`    pass mark  ${doc.passMark ?? "—"} -> ${plan.passMark}`);
    console.log(`    dropping   itemsPerAttempt=${doc.itemsPerAttempt ?? "—"}, source.bankSize`);
    console.log("");
  }

  if (!write) {
    console.log("Report only — pass --write to apply.\n");
    return;
  }

  const backup = `assessment-bank-backup-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(backup, JSON.stringify(planned.map((plan) => plan.doc), null, 2));
  console.log(`Backed up ${planned.length} document(s) to ${backup}`);

  for (const plan of planned) {
    await db.collection(ASSESSMENTS).updateOne(
      { _id: plan.doc._id },
      {
        $set: {
          items: plan.items,
          totalPoints: plan.totalPoints,
          passMark: plan.passMark,
          updatedAt: new Date()
        },
        $unset: { itemsPerAttempt: "", "source.bankSize": "" }
      }
    );
  }

  console.log(`Trimmed ${planned.length} assessment(s).\n`);
}

const db = await connect();
await (restoreFrom ? restore(db) : trim(db));
await mongoose.disconnect();
