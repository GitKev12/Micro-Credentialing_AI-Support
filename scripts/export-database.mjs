/**
 * Writes every collection in the database out as JSON.
 *
 *   node scripts/export-database.mjs                     # into ./database-export
 *   node scripts/export-database.mjs --out="F:\\backups"  # somewhere else
 *
 * One file per collection, plus a manifest naming what was written and how
 * many documents each file holds.
 *
 * The documents are written as **canonical Extended JSON**, not as whatever
 * `JSON.stringify` makes of them. That matters: an ObjectId stringifies to
 * `{}`, a Date to a string, and the binary inside a GridFS chunk to nothing
 * usable — a backup that cannot be restored is not a backup. Extended JSON
 * keeps each type as `{"$oid": …}`, `{"$date": …}`, `{"$binary": …}`, which is
 * also the form `mongoimport` reads back.
 *
 * Collections are streamed a document at a time rather than gathered into an
 * array first, because the GridFS chunk collections are tens of megabytes and
 * there is no reason to hold them all in memory at once.
 */

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { EJSON } from "bson";

dotenv.config({ path: new URL("../server/.env", import.meta.url) });

function option(name, fallback) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!match) return fallback;
  return match.slice(`--${name}=`.length).replace(/^["']|["']$/g, "");
}

const asMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/** Streams one collection into `<name>.json` as an array of documents. */
async function exportCollection(db, name, directory) {
  const file = path.join(directory, `${name}.json`);
  const stream = fs.createWriteStream(file, { encoding: "utf8" });

  const write = (chunk) =>
    new Promise((resolve, reject) => {
      stream.write(chunk, (error) => (error ? reject(error) : resolve()));
    });

  await write("[\n");

  let count = 0;
  const cursor = db.collection(name).find();
  for await (const document of cursor) {
    await write(`${count === 0 ? "" : ",\n"}${EJSON.stringify(document, { relaxed: false })}`);
    count += 1;
  }

  await write("\n]\n");
  await new Promise((resolve, reject) => {
    stream.end((error) => (error ? reject(error) : resolve()));
  });

  return { count, bytes: fs.statSync(file).size };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set — check server/.env.");
    process.exitCode = 1;
    return;
  }

  const directory = path.resolve(option("out", "database-export"));
  fs.mkdirSync(directory, { recursive: true });

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const names = (await db.listCollections().toArray()).map((entry) => entry.name).sort();
  console.log(`Exporting ${names.length} collections from ${db.databaseName} into ${directory}\n`);

  const written = [];
  let bytes = 0;

  for (const name of names) {
    const result = await exportCollection(db, name, directory);
    written.push({ collection: name, documents: result.count, bytes: result.bytes });
    bytes += result.bytes;
    console.log(
      `  ${name.padEnd(26)} ${String(result.count).padStart(5)} docs  ${asMb(result.bytes).padStart(9)}`
    );
  }

  const manifest = {
    database: db.databaseName,
    exportedAt: new Date().toISOString(),
    format: "canonical Extended JSON (mongoimport-compatible)",
    collections: written,
    totalDocuments: written.reduce((sum, entry) => sum + entry.documents, 0),
    totalBytes: bytes
  };
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(
    `\n${manifest.totalDocuments} documents, ${asMb(bytes)} written. Manifest: ${path.join(directory, "manifest.json")}`
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exitCode = 1;
});
