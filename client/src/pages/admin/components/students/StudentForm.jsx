import { useState } from "react";

import { MIN_PASSWORD_LENGTH } from "../../../../services/admin";
import { plural } from "../../lib/format";
import { AdminButton, AdminField, AdminModal } from "../ui";
import { readStudentsFile } from "./importStudents";
import StudentImport from "./StudentImport";

/**
 * Add a student, or correct one who already exists.
 *
 * One form for both, the way the course form works: the fields are identical
 * and the only difference is whether it opens empty, so a second near-copy
 * would just be a second place to fix when a field is added.
 *
 * The password is the one field that behaves differently between the two. On a
 * new account it is required — there is nothing to fall back on. On an existing
 * one an empty box means "keep the current one" rather than "clear it", and
 * says so: a form that silently blanked a password because a name was being
 * fixed would lock someone out without ever saying it had.
 */
function StudentForm({ student, busy, error, onCancel, onSave, onImport }) {
  const creating = !student;

  // Import tab: "details" types one student, "import" reads many from a file.
  const [tab, setTab] = useState("details");
  const [imported, setImported] = useState(null); // { fileName, students }
  const [fileError, setFileError] = useState(null);
  const [failed, setFailed] = useState([]); // rows the server refused

  const [firstName, setFirstName] = useState(student?.name?.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(student?.name?.split(" ").slice(1).join(" ") ?? "");
  const [email, setEmail] = useState(student?.email ?? "");
  const [studentNumber, setStudentNumber] = useState(student?.studentNumber ?? "");
  const [password, setPassword] = useState("");

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordOk = creating ? longEnough : password === "" || longEnough;
  const ready =
    firstName.trim() && lastName.trim() && email.trim() && studentNumber.trim() && passwordOk;

  const chooseFile = async (file) => {
    if (!file) return;
    setImported(null);
    setFileError(null);
    setFailed([]);

    try {
      const students = await readStudentsFile(file);
      if (students.length === 0) throw new Error("The file has no students in it.");
      setImported({ fileName: file.name, students });
    } catch (readError) {
      setFileError(readError.message || "Couldn't read this file.");
    }
  };

  const importing = tab === "import";

  return (
    <AdminModal
      title={creating ? "New student" : "Edit student"}
      subtitle={creating ? null : student.name}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            className="admin-chip-btn admin-chip-btn--quiet"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          {importing ? (
            <AdminButton
              variant="admin-btn--compact"
              disabled={busy || !imported}
              onClick={async () => {
                setFailed(await onImport(imported.students));
                setImported(null); // so the same rows can't be sent twice
              }}
            >
              {busy
                ? "Importing…"
                : `Import ${plural(imported?.students.length ?? 0, "student")}`}
            </AdminButton>
          ) : (
            <AdminButton
              variant="admin-btn--compact"
              disabled={busy || !ready}
              onClick={() =>
                onSave({
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  email: email.trim(),
                  studentNumber: studentNumber.trim(),
                  ...(password ? { password } : {})
                })
              }
            >
              {busy ? "Saving…" : creating ? "Create student" : "Save changes"}
            </AdminButton>
          )}
        </>
      }
    >
      {/* Tabs only when adding. Editing is always one student. */}
      {creating ? (
        <div className="admin-form-tabs">
          <button
            type="button"
            className={`admin-form-tabs__tab${importing ? "" : " is-active"}`}
            aria-pressed={!importing}
            disabled={busy}
            onClick={() => setTab("details")}
          >
            Enter details
          </button>
          <button
            type="button"
            className={`admin-form-tabs__tab${importing ? " is-active" : ""}`}
            aria-pressed={importing}
            disabled={busy}
            onClick={() => setTab("import")}
          >
            Import
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="admin-notice admin-notice--error" role="status">
          {error}
        </p>
      ) : null}

      {importing ? (
        <StudentImport
          busy={busy}
          imported={imported}
          fileError={fileError}
          failed={failed}
          onFile={chooseFile}
        />
      ) : (
        <>
          <AdminField label="First name" value={firstName} onChange={setFirstName} required />
          <AdminField label="Last name" value={lastName} onChange={setLastName} required />
          <AdminField label="Email" type="email" value={email} onChange={setEmail} required />
          {/* Required, so the student can sign in with it as well as their email. */}
          <AdminField
            label="ID number"
            value={studentNumber}
            onChange={setStudentNumber}
            placeholder="e.g. 202300007"
            required
          />
          {/* No program or year. A degree batch is not what a micro-credential is
              awarded against, so the form does not collect one. */}
          <AdminField
            label={creating ? "Password" : "New password"}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required={creating}
            placeholder={
              creating
                ? `At least ${MIN_PASSWORD_LENGTH} characters`
                : "Leave blank to keep the current one"
            }
            hint={
              password && !longEnough
                ? `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`
                : undefined
            }
          />
        </>
      )}
    </AdminModal>
  );
}

export default StudentForm;
