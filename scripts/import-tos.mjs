/**
 * Imports a Table of Specification from the official TSU spreadsheet form
 * (TSU-OCI-SF-16) into the TableOfSpecification collection.
 *
 *   node scripts/import-tos.mjs <path-to.xlsx> [--all-courses] [--write]
 *
 * Without --write it parses and prints what it would store, changing nothing.
 * With --write it replaces the collection's contents with the single document
 * it parsed: the system holds ONE blueprint that governs every course, so an
 * import is a replacement rather than an addition.
 *
 * --all-courses takes the sheet's *distribution* — how many items to write at
 * each level of thinking — and draws up one blueprint per course, its rows
 * being that course's own lessons. Without the flag a single blueprint is
 * stored holding the sheet's own coverage topics, which name only the course
 * the form was filled in for.
 *
 * One TOS per course is the shape the system expects: each course's coverage
 * is its own lessons, and a row is one lesson's quiz.
 *
 * .xlsx is a zip of XML. Rather than take a spreadsheet dependency for one
 * form, the two pieces needed — inflate and a tag scan — are done here with
 * node's own zlib.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/* ────────────────────────────── zip reading ────────────────────────────── */

/** Files out of a zip, by name. Handles stored (0) and deflated (8) entries. */
function readZip(buffer) {
  // The end-of-central-directory record sits at the tail, after a comment of
  // unknown length, so it is found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record).");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // The local header repeats the name and extra fields with its own lengths.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    files.set(name, method === 0 ? data : zlib.inflateRawSync(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

/* ────────────────────────────── sheet reading ──────────────────────────── */

const decodeXml = (value) =>
  String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");

const columnIndex = (ref) =>
  [...ref.match(/^[A-Z]+/)[0]].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

function readGrid(files) {
  const sharedXml = files.has("xl/sharedStrings.xml")
    ? files.get("xl/sharedStrings.xml").toString("utf8")
    : "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("")
  );

  const sheetName = [...files.keys()].find((name) => /^xl\/worksheets\/sheet1\.xml$/.test(name));
  if (!sheetName) throw new Error("No worksheet found in the workbook.");
  const sheet = files.get(sheetName).toString("utf8");

  const grid = [];
  for (const row of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    // Empty cells are self-closing; matching only the paired form would run
    // past them and shift every value after a blank.
    for (const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;

      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      const body = cell[2] ?? "";
      const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const inline = (body.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];

      let value = "";
      if (type === "s" && raw != null) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr" && inline != null) value = decodeXml(inline);
      else if (raw != null) value = raw;

      cells[columnIndex(ref)] = String(value).trim();
    }
    grid[Number(row[1])] = cells;
  }

  return grid;
}

/* ──────────────────────────────── the form ─────────────────────────────── */

// Column positions on TSU-OCI-SF-16. The six thinking levels are merged pairs,
// so each starts two columns after the last.
const COL = {
  coverage: 0,
  hours: 3,
  remember: 5,
  understand: 7,
  apply: 9,
  analyze: 11,
  evaluate: 13,
  create: 15,
  items: 17
};

const LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

const count = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const cell = (grid, row, col) => grid[row]?.[col] ?? "";

/** Finds a labelled cell's value, e.g. "Course:" -> the text beside it. */
function labelled(grid, label) {
  for (let r = 0; r < grid.length; r += 1) {
    const cells = grid[r];
    if (!cells) continue;
    for (let c = 0; c < cells.length; c += 1) {
      if (String(cells[c] ?? "").toLowerCase().startsWith(label.toLowerCase())) {
        // The value sits in the next non-empty cell to the right.
        for (let k = c + 1; k < cells.length; k += 1) {
          if (cells[k]) return cells[k];
        }
      }
    }
  }
  return "";
}

export function parseTos(buffer) {
  const grid = readGrid(readZip(buffer));

  // Rows run from under the two header rows down to the TOTAL line.
  const headerRow = grid.findIndex((cells) => cells?.[COL.coverage] === "Coverage");
  const totalRow = grid.findIndex((cells) => cells?.[COL.coverage] === "TOTAL");
  if (headerRow < 0 || totalRow < 0) {
    throw new Error("Could not locate the 'Coverage' header or 'TOTAL' row — is this TSU-OCI-SF-16?");
  }

  const rows = [];
  for (let r = headerRow + 2; r < totalRow; r += 1) {
    const coverage = cell(grid, r, COL.coverage);
    if (!coverage || coverage === "Item Placement") continue;

    const row = { course: coverage, hours: count(cell(grid, r, COL.hours)) };
    LEVELS.forEach((level) => {
      row[level] = count(cell(grid, r, COL[level]));
    });
    rows.push(row);
  }

  const percentages = grid.findIndex((cells) => cells?.[COL.coverage] === "Percentage");
  const weights = {};
  if (percentages > 0) {
    LEVELS.forEach((level) => {
      weights[level] = Number(cell(grid, percentages, COL[level])) || 0;
    });
  }

  // The TOTAL line — how many items the examination asks for at each level.
  // This, not the per-topic rows, is what every course's blueprint must add up
  // to: the form specifies one 60-item examination however it is divided.
  const columnTotals = {};
  LEVELS.forEach((level) => {
    columnTotals[level] = count(cell(grid, totalRow, COL[level]));
  });

  return {
    // The course the form was filled in for. Each stored blueprint is named
    // after the course it belongs to, so this is only ever provenance: it says
    // where the distribution came from, not what it applies to.
    sheetCourse: labelled(grid, "Course:"),
    levelWeights: weights,
    columnTotals,
    rows,
    declaredTotalItems: count(cell(grid, totalRow, COL.items))
  };
}

/* ──────────────────────────────── the import ───────────────────────────── */

const summarise = (tos) => {
  const perRow = tos.rows.map((row) => LEVELS.reduce((sum, level) => sum + row[level], 0));
  const total = perRow.reduce((a, b) => a + b, 0);
  const uniform = perRow.every((n) => n === perRow[0]);
  return { perRow, total, uniform, itemsPerQuiz: uniform ? perRow[0] : null };
};

async function connect() {
  const dotenv = await import("dotenv");
  dotenv.default.config({ path: new URL("../server/.env", import.meta.url) });

  const { default: mongoose } = await import("mongoose");
  await mongoose.connect(process.env.MONGODB_URI);
  return mongoose;
}

/** Lessons sort by the last number in the title, as the API orders them. */
function lessonNumber(title) {
  const numbers = String(title ?? "").match(/\d+/g);
  return numbers ? Number(numbers[numbers.length - 1]) : Number.POSITIVE_INFINITY;
}

/**
 * Splits one level's item total across a course's lessons.
 *
 * Every lesson gets the floor, and the leftover goes one each to as many
 * lessons as there is remainder — starting at `from` rather than always at the
 * first row. Without that rotation the early lessons collect every level's
 * leftover and end up markedly longer than the late ones.
 *
 * Returns the counts and where the next level should start handing out.
 */
function spread(total, rowCount, from) {
  const base = Math.floor(total / rowCount);
  const extra = total % rowCount;
  const counts = new Array(rowCount).fill(base);

  for (let i = 0; i < extra; i += 1) {
    counts[(from + i) % rowCount] += 1;
  }

  return { counts, next: (from + extra) % rowCount };
}

/**
 * One blueprint per course, its rows being that course's lessons.
 *
 * The examination is 60 items whatever the course, so the sheet's column
 * totals are divided among that course's lessons rather than repeated on each
 * one. Courses have different lesson counts, so a lesson's quiz is 4 items in
 * a fifteen-lesson course and 7 or 8 in an eight-lesson one — the total is
 * what the form fixes, not the size of any single quiz.
 *
 * Each row records the lesson it covers, so a generated quiz can be traced to
 * the blueprint row it was written from — matching on the topic label alone
 * would break the moment someone edits the wording.
 */
async function buildPerCourseBlueprints(mongoose, columnTotals, hours) {
  const db = mongoose.connection;
  const courses = await db.collection("Course").find({}).toArray();
  const modules = await db.collection("LearningModule").find({}).toArray();

  const blueprints = courses
    .map((course) => {
      const lessons = modules
        .filter((module) => String(module.courseId ?? "") === String(course._id))
        .sort((a, b) => {
          const difference = lessonNumber(a.title) - lessonNumber(b.title);
          if (difference !== 0) return difference;
          return String(a.title ?? "").localeCompare(String(b.title ?? ""), "en", {
            numeric: true
          });
        });

      // Divide each level's total among this course's lessons, carrying the
      // rotation from one level to the next so the leftovers do not all land
      // on the same early rows.
      const byLevel = {};
      let pointer = 0;
      for (const level of LEVELS) {
        if (lessons.length === 0) {
          byLevel[level] = [];
          continue;
        }
        const { counts, next } = spread(columnTotals[level] ?? 0, lessons.length, pointer);
        byLevel[level] = counts;
        pointer = next;
      }

      const rows = lessons.map((module, index) => {
        const row = {
          course: String(module.title ?? "").trim(),
          moduleId: String(module._id),
          hours
        };
        LEVELS.forEach((level) => {
          row[level] = byLevel[level][index];
        });
        return row;
      });

      return {
        examination: (course.courseName ?? course.title ?? course.name ?? "").trim(),
        courseId: String(course._id),
        courseCode: (course.courseCode ?? course.code ?? "").trim(),
        rows
      };
    })
    .sort((a, b) => a.examination.localeCompare(b.examination, "en"));

  const known = new Set(courses.map((course) => String(course._id)));
  const orphans = modules.filter((module) => !known.has(String(module.courseId ?? "")));
  if (orphans.length > 0) {
    console.warn(`WARNING: ${orphans.length} lesson(s) have no matching course and were skipped.`);
  }

  return blueprints;
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  const write = flags.includes("--write");
  const allCourses = flags.includes("--all-courses");

  if (!file) {
    console.error(
      "usage: node scripts/import-tos.mjs <path-to.xlsx> [--all-courses] [--write]"
    );
    process.exit(1);
  }

  const tos = parseTos(fs.readFileSync(path.resolve(file)));
  const sheetSummary = summarise(tos);
  const examTotal = LEVELS.reduce((sum, level) => sum + (tos.columnTotals[level] ?? 0), 0);

  console.log(`source sheet:   ${tos.sheetCourse}`);
  console.log(
    `examination:    [${LEVELS.map((l) => `${l.slice(0, 3)}:${tos.columnTotals[l] ?? 0}`).join(" ")}]` +
      `  = ${examTotal} items per course`
  );

  let mongoose = null;
  let blueprints = null;

  if (allCourses) {
    if (examTotal !== tos.declaredTotalItems) {
      console.warn(
        `WARNING: the TOTAL row's levels sum to ${examTotal}, but it declares ${tos.declaredTotalItems}.`
      );
    }

    mongoose = await connect();
    blueprints = await buildPerCourseBlueprints(mongoose, tos.columnTotals, tos.rows[0].hours);

    console.log(`blueprints:     ${blueprints.length} (one per course)`);
    let grand = 0;
    for (const blueprint of blueprints) {
      const perRow = blueprint.rows.map((row) =>
        LEVELS.reduce((sum, level) => sum + row[level], 0)
      );
      const items = perRow.reduce((a, b) => a + b, 0);
      grand += items;

      const low = Math.min(...perRow);
      const high = Math.max(...perRow);
      console.log(
        `  ${(blueprint.courseCode || "—").padEnd(14)} ${blueprint.examination.padEnd(32)} ` +
          `${String(blueprint.rows.length).padStart(3)} lessons  ${String(items).padStart(4)} items  ` +
          `(${low === high ? `${low} each` : `${low}–${high} per quiz`})`
      );

      if (items !== examTotal) {
        console.warn(`  WARNING: ${blueprint.examination} totals ${items}, expected ${examTotal}.`);
      }
    }
    console.log(`total items:    ${grand} across all courses`);
  } else {
    console.log(`blueprints:     1 (the sheet's own coverage topics)`);
    tos.rows.forEach((row, i) => {
      console.log(`  ${String(sheetSummary.perRow[i]).padStart(3)} items  ${row.course}`);
    });
    console.log(`total items:    ${sheetSummary.total} (sheet declares ${tos.declaredTotalItems})`);
    if (sheetSummary.total !== tos.declaredTotalItems) {
      console.warn("WARNING: summed items do not match the sheet's TOTAL row.");
    }
  }

  if (!write) {
    console.log("\nParsed only. Re-run with --write to replace the stored blueprint(s).");
    if (mongoose) await mongoose.disconnect();
    return;
  }

  if (!mongoose) mongoose = await connect();

  const collection = mongoose.connection.collection("TableOfSpecification");
  const existing = await collection.countDocuments();

  const provenance = {
    file: path.basename(file),
    // Which sheet the distribution came from — not the course it applies to.
    distributionFrom: tos.sheetCourse,
    importedAt: new Date()
  };
  const now = new Date();

  const documents = allCourses
    ? blueprints.map((blueprint) => ({
        ...blueprint,
        levelWeights: tos.levelWeights,
        source: provenance,
        createdAt: now,
        updatedAt: now
      }))
    : [
        {
          examination: tos.sheetCourse,
          courseId: null,
          courseCode: "",
          rows: tos.rows,
          levelWeights: tos.levelWeights,
          source: provenance,
          createdAt: now,
          updatedAt: now
        }
      ];

  // An import is a re-draw of the whole set, not an addition to it.
  await collection.deleteMany({});
  await collection.insertMany(documents);

  console.log(`\nReplaced ${existing} document(s) with ${documents.length}.`);
  await mongoose.disconnect();
}

// Only run when invoked directly, so parseTos stays importable.
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
