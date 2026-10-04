import { useEffect, useState } from "react";

import { MAX_LENGTH, checkEmail, checkName } from "../../../../lib/fieldRules";
import { fetchNextIdNumber } from "../../../../services/admin";
import { plural } from "../../lib/format";
import { AdminButton, AdminField, AdminModal, NewPasswordChoice } from "../ui";
import { readStudentsFile } from "./importStudents";
import StudentImport from "./StudentImport";

/**
 * Add a student, or correct one who already exists.
 *
 * One form for both, the way the course form works: the fields are identical
 * and the only difference is whether it opens empty, so a second near-copy
 * would just be a second place to fix when a field is added.
 *
 * A new student gets their ID number and password from the server, so the
 * form only asks for names and email. Editing can ask for a new password,
 * which the server also makes.
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
  const [resetPassword, setResetPassword] = useState(false);

  // A new account shows the ID it will most likely get. The server picks the
  // final one when saving, so this is only a preview.
  useEffect(() => {
    if (!creating) return;
    fetchNextIdNumber("students")
      .then(setStudentNumber)
      .catch(() => setStudentNumber(""));
  }, [creating]);

  // A message shows only once something is typed; an empty box just keeps
  // the button off.
  const firstNameError = firstName ? checkName(firstName, "First name") : null;
  const lastNameError = lastName ? checkName(lastName, "Last name") : null;
  const emailError = email ? checkEmail(email) : null;
  const ready =
    !checkName(firstName) &&
    !checkName(lastName) &&
    !checkEmail(email);

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
                  ...(resetPassword ? { resetPassword: true } : {})
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
          <AdminField
            label="First name"
            maxLength={MAX_LENGTH.name}
            value={firstName}
            onChange={setFirstName}
            error={firstNameError}
            required
          />
          <AdminField
            label="Last name"
            maxLength={MAX_LENGTH.name}
            value={lastName}
            onChange={setLastName}
            error={lastNameError}
            required
          />
          <AdminField
            label="Email"
            maxLength={MAX_LENGTH.email}
            type="email"
            value={email}
            onChange={setEmail}
            error={emailError}
            required
          />
          {/* No program or year. A degree batch is not what a micro-credential is
              awarded against, so the form does not collect one. */}
          <AdminField
            label="ID number"
            maxLength={MAX_LENGTH.idNumber}
            value={studentNumber}
            onChange={setStudentNumber}
            placeholder={creating ? "Loading…" : undefined}
            hint={
              creating
                ? "Assigned automatically when you save. It can't be changed."
                : "Assigned automatically. It can't be changed."
            }
            locked
          />
          {creating ? null : (
            <NewPasswordChoice checked={resetPassword} onChange={setResetPassword} />
          )}
        </>
      )}
    </AdminModal>
  );
}

export default StudentForm;
