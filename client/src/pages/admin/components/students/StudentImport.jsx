import { useRef, useState } from "react";

import { plural } from "../../lib/format";
import { UploadIcon } from "../icons";
import { IMPORT_COLUMNS } from "./importStudents";

const PREVIEW_COUNT = 5;
const LETTERS = "ABCDEFGHIJ";

// The Import tab of the New student form.
function StudentImport({ busy, imported, fileError, failed, onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  return (
    <>
      <button
        type="button"
        className={`admin-dropzone${dragging ? " is-dragging" : ""}${imported ? " has-file" : ""}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFile(event.dataTransfer.files?.[0]);
        }}
      >
        {imported ? (
          <>
            <span className="admin-dropzone__doc" aria-hidden="true">
              XLSX
            </span>
            <span className="admin-dropzone__chosen">
              <span className="admin-dropzone__name">{imported.fileName}</span>
              <span className="admin-dropzone__file">
                {plural(imported.students.length, "student")}
                <span className="admin-dropzone__link">Change</span>
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="admin-dropzone__icon">
              <UploadIcon size={22} />
            </span>
            <span className="admin-dropzone__text">
              Drag an Excel file here, or <span className="admin-dropzone__link">browse</span>
            </span>
            <span className="admin-dropzone__file">.xlsx only</span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        className="admin-visually-hidden"
        type="file"
        accept=".xlsx"
        tabIndex={-1}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = ""; // lets the same file be picked again
        }}
      />

      {fileError ? (
        <p className="admin-notice admin-notice--error" role="status">
          {fileError}
        </p>
      ) : null}

      {failed.length > 0 ? (
        <RowList title="Not added" rows={failed} tone="error" />
      ) : imported ? (
        <RowList
          title="Preview"
          rows={imported.students.slice(0, PREVIEW_COUNT).map(({ row, details }) => ({
            row,
            name: `${details.firstName} ${details.lastName}`,
            message: details.email
          }))}
          more={imported.students.length - PREVIEW_COUNT}
        />
      ) : (
        <ColumnGuide />
      )}
    </>
  );
}

// Shows row 1 of a spreadsheet, so the admin sees which headers to type.
function ColumnGuide() {
  const names = Object.keys(IMPORT_COLUMNS);

  return (
    <div className="admin-field">
      <div className="admin-field__label">Put these headers in row 1</div>
      <table className="admin-import-sheet">
        <thead>
          <tr>
            <th aria-hidden="true" />
            {names.map((name, index) => (
              <th key={name} scope="col">
                {LETTERS[index]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">1</th>
            {names.map((name) => (
              <td key={name}>{name}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// A list of spreadsheet rows: the preview, or the rows that failed.
function RowList({ title, rows, more = 0, tone = "" }) {
  return (
    <div className="admin-field">
      <div className="admin-field__label">{title}</div>
      <ul className={`admin-import-rows${tone ? ` admin-import-rows--${tone}` : ""}`}>
        {rows.map((item) => (
          <li key={item.row} className="admin-import-rows__item">
            <span className="admin-import-rows__num" aria-label={`Row ${item.row}`}>
              {item.row}
            </span>
            <span className="admin-import-rows__text">
              <span className="admin-import-rows__name">{item.name}</span>
              <span className="admin-import-rows__meta">{item.message}</span>
            </span>
          </li>
        ))}
        {more > 0 ? (
          <li className="admin-import-rows__more">and {plural(more, "more student")}</li>
        ) : null}
      </ul>
    </div>
  );
}

export default StudentImport;
