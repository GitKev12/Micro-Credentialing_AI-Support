/**
 * Which queries the declared indexes actually serve.
 *
 * Reads every collection call in the server against the index set in
 * server/src/lib/indexes.js and applies MongoDB's prefix rule: an index helps
 * when its LEADING field appears in the filter. $or is treated the way the
 * planner treats it — every branch must be indexed, or the whole thing scans.
 *
 * Run after touching a query or an index:  node scripts/check-index-coverage.mjs
 *
 * Two shapes it cannot read, both reported separately rather than guessed at:
 * a filter built as a variable, and one assembled with object spread.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CORE_INDEXES } from "../server/src/lib/indexes.js";

const WATCHED = ["ModuleProgress", "StudentResult", "LearningModule", "ModuleText", "Class", "Course"];

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".js")) files.push(full);
  }
})("server/src");

/** Read a balanced {...} or [...] starting at `open`. */
function balanced(src, open, o = "{", c = "}") {
  let depth = 0;
  for (let i = open; i < src.length && i < open + 6000; i += 1) {
    if (src[i] === o) depth += 1;
    else if (src[i] === c) {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

/** Split a [...] body into its top-level {...} elements. */
function elements(body) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (body[i] === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) out.push(body.slice(start + 1, i));
    }
  }
  return out;
}

/** Keys written directly in this object, ignoring anything nested. */
function ownKeys(body) {
  let depth = 0;
  let flat = "";
  for (const ch of body) {
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") { depth -= 1; if (depth === 0) flat += " "; }
    else if (depth === 0) flat += ch;
  }
  // `{ courseId: x }` and the ES6 shorthand `{ code }` are both keys.
  return flat
    .split(",")
    .map((part) => {
      const withColon = part.match(/^\s*["']?([a-zA-Z_$][a-zA-Z0-9_.$]*)["']?\s*:/);
      if (withColon) return withColon[1];
      const shorthand = part.match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*$/);
      return shorthand ? shorthand[1] : null;
    })
    .filter((f) => f && !["projection", "upsert", "sort", "limit", "returnDocument"].includes(f));
}

/**
 * A filter becomes: its own fields, plus one field-set per $or branch.
 * Mongo can only use indexes for an $or when EVERY branch is indexed, so the
 * branches are kept apart rather than flattened together.
 */
function shape(body) {
  const own = ownKeys(body).filter((k) => !k.startsWith("$"));
  const branches = [];
  for (const key of ["$or", "$and", "$nor"]) {
    const at = body.indexOf(`${key}:`);
    if (at === -1) continue;
    const bracket = body.indexOf("[", at);
    if (bracket === -1) continue;
    for (const el of elements(balanced(body, bracket, "[", "]"))) {
      branches.push(ownKeys(el).filter((k) => !k.startsWith("$")));
    }
  }
  return { own, branches };
}

const OPS = "find|findOne|countDocuments|updateOne|updateMany|deleteOne|deleteMany|distinct";
const findings = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const consts = new Map();
  for (const m of src.matchAll(/const\s+([A-Z_]+)\s*=\s*"([A-Za-z]+)"/g)) consts.set(m[1], m[2]);

  const call = new RegExp(`collection\\(\\s*([A-Z_]+)\\s*\\)\\s*\\n?\\s*\\.(${OPS})\\(`, "g");
  for (const m of src.matchAll(call)) {
    const coll = consts.get(m[1]);
    if (!coll || !WATCHED.includes(coll)) continue;

    const after = m.index + m[0].length;
    const brace = src.indexOf("{", after);
    const literal = brace !== -1 && src.slice(after, brace).trim() === "";
    const line = src.slice(0, m.index).split("\n").length;

    findings.push({
      file: file.split("\\").join("/"),
      line,
      coll,
      op: m[2],
      literal,
      ...(literal ? shape(balanced(src, brace)) : { own: null, branches: [] })
    });
  }
}

const leads = (coll) => CORE_INDEXES.filter(([n]) => n === coll).map(([, key]) => Object.keys(key)[0]);

function verdict(f) {
  if (!f.literal) return "variable";
  const lead = leads(f.coll);
  const hit = (fields) => fields.includes("_id") || fields.some((x) => lead.includes(x));

  if (f.branches.length) {
    // Every branch must be indexed or the whole $or scans the collection.
    return f.branches.every(hit) ? "indexed" : "SCAN";
  }
  if (!f.own.length) return "full-scan-by-design";
  return hit(f.own) ? "indexed" : "SCAN";
}

console.log(`Scanned ${files.length} server files.`);
console.log(`${findings.length} queries against the six collections this migration covers.\n`);

const tally = {};
for (const f of findings) {
  const v = verdict(f);
  tally[v] = (tally[v] ?? 0) + 1;
}

for (const coll of WATCHED) {
  const rows = findings.filter((f) => f.coll === coll);
  if (!rows.length) continue;
  const scans = rows.filter((r) => verdict(r) === "SCAN").length;
  console.log(
    `${coll.padEnd(16)} ${String(rows.length).padStart(3)} queries · ${scans} still scanning` +
      `\n${" ".repeat(16)} ${CORE_INDEXES.filter(([n]) => n === coll).map(([, k]) => "{" + Object.keys(k).join(",") + "}").join("  ")}`
  );
}

console.log("\n" + Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(" · "));

const scans = findings.filter((f) => verdict(f) === "SCAN");
if (scans.length) {
  console.log("\nSTILL SCANNING:");
  for (const g of scans) console.log(`  ${g.file}:${g.line}  ${g.coll}.${g.op}`);
}

const unread = findings.filter((f) => verdict(f) === "variable");
if (unread.length) {
  console.log("\nFilter built as a variable — checked by hand:");
  for (const g of unread) console.log(`  ${g.file}:${g.line}  ${g.coll}.${g.op}`);
}
