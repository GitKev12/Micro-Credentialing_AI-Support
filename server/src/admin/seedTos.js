/**
 * Seeds the TableOfSpecification collection from tos.sample.json.
 *
 *   npm run seed:tos            (from /server)
 *
 * Safe to re-run: it refuses to overwrite an existing blueprint unless you
 * pass --force, so a saved TOS is never clobbered by accident.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mongoose from "mongoose";

const TOS_COLLECTION = "TableOfSpecification";
const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const force = process.argv.includes("--force");
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to server/.env first.");
    process.exitCode = 1;
    return;
  }

  const raw = await readFile(path.join(here, "tos.sample.json"), "utf8");
  const { examination, rows } = JSON.parse(raw);

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection(TOS_COLLECTION);

  const existing = await collection.countDocuments();
  if (existing > 0 && !force) {
    console.log(
      `${TOS_COLLECTION} already has ${existing} document(s) — nothing written.\n` +
        "Re-run with --force to replace the existing blueprint."
    );
    await mongoose.disconnect();
    return;
  }

  if (existing > 0) {
    await collection.deleteMany({});
    console.log(`Removed ${existing} existing document(s) (--force).`);
  }

  const now = new Date();
  // Drop the per-row courseCode helper; the blueprint stores course names.
  const cleanRows = rows.map(({ courseCode: _courseCode, ...row }) => row);

  await collection.insertOne({
    examination,
    rows: cleanRows,
    createdAt: now,
    updatedAt: now
  });

  console.log(`Seeded ${TOS_COLLECTION} with ${cleanRows.length} course rows.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
});
