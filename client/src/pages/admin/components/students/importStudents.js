import { readSheet } from "read-excel-file/browser";

import { createStudent } from "../../../../services/admin";

// Each column header in the spreadsheet, and the student field it fills.
export const IMPORT_COLUMNS = {
  "First name": "firstName",
  "Last name": "lastName",
  Email: "email",
  "ID number": "studentNumber",
  Password: "password"
};

// Reads the first sheet of an .xlsx file into a list of students.
export async function readStudentsFile(file) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Choose an Excel file that ends in .xlsx.");
  }

  const [header = [], ...rows] = await readSheet(file);

  // Match headers without caring about capitals or extra spaces.
  const clean = (cell) => String(cell ?? "").trim().toLowerCase();
  const headers = header.map(clean);

  const missing = Object.keys(IMPORT_COLUMNS).filter((name) => !headers.includes(clean(name)));
  if (missing.length > 0) {
    throw new Error(`The file is missing these columns: ${missing.join(", ")}.`);
  }

  const students = [];

  rows.forEach((row, index) => {
    const details = {};
    for (const [name, field] of Object.entries(IMPORT_COLUMNS)) {
      const cell = row[headers.indexOf(clean(name))];
      details[field] = String(cell ?? "").trim();
    }

    // Skip rows that are completely empty.
    if (Object.values(details).every((value) => value === "")) return;

    // +2 because row 1 is the header, so the first student is on row 2.
    students.push({ row: index + 2, details });
  });

  return students;
}

// Saves the students one by one and returns the rows that failed.
export async function saveStudents(students) {
  const failed = [];

  for (const { row, details } of students) {
    try {
      await createStudent(details);
    } catch (error) {
      failed.push({
        row,
        name: `${details.firstName} ${details.lastName}`.trim(),
        message: error?.response?.data?.message || "Couldn't save this student."
      });
    }
  }

  return failed;
}
