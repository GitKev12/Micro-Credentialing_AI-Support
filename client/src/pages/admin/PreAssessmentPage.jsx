import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  deleteModulePreAssessment,
  fetchModulePreAssessment,
  saveModulePreAssessment
} from "../../services/admin";
import { CoursesIcon, PlusIcon, TrashIcon } from "./components/icons";
import { AdminButton, AdminField, AdminSelect, BackLink, PageHeader } from "./components/ui";
import { errorMessage } from "./lib/format";
import { SkeletonText } from "../../components/Skeleton";

/**
 * The Pre-Assessment for one lesson: 1–5 questions a student answers once
 * before the lesson opens. Not graded, no badge.
 */

const MAX_ITEMS = 5;
const TYPE_OPTIONS = [
  { value: "multiple-choice", label: "Multiple choice" },
  { value: "true-false", label: "True / False" }
];
const TRUE_FALSE = [
  { id: "true", text: "True" },
  { id: "false", text: "False" }
];

const letter = (index) => String.fromCharCode(97 + index);

const blankItem = () => ({
  type: "multiple-choice",
  q: "",
  choices: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }],
  key: "",
  explanation: ""
});

// The saved shape back into the form's shape (choices as text only).
const toFormItem = (item) => ({
  type: item.type,
  q: item.q,
  choices: item.type === "true-false" ? [] : item.choices.map((choice) => ({ text: choice.text })),
  key: item.key,
  explanation: item.explanation ?? ""
});

function PreAssessmentPage() {
  const { courseId, moduleId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading");
  const [lesson, setLesson] = useState(null);
  const [saved, setSaved] = useState(null);
  const [items, setItems] = useState([blankItem()]);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [askingDelete, setAskingDelete] = useState(false);

  useEffect(() => {
    let live = true;
    fetchModulePreAssessment(moduleId)
      .then((data) => {
        if (!live) return;
        setLesson(data.module);
        setSaved(data.preAssessment);
        if (data.preAssessment) {
          setItems(data.preAssessment.items.map(toFormItem));
          setActive(data.preAssessment.active);
        }
        setStatus("ready");
      })
      .catch(() => live && setStatus("error"));
    return () => {
      live = false;
    };
  }, [moduleId]);

  // Back to the course this lesson belongs to.
  const backToCourse = () => navigate("/admin/courses", { state: { openCourseId: courseId } });

  const changeItem = (index, changes) =>
    setItems((list) => list.map((item, at) => (at === index ? { ...item, ...changes } : item)));

  const changeType = (index, type) =>
    changeItem(index, type === "true-false" ? { type, choices: [], key: "" } : { type, choices: blankItem().choices, key: "" });

  const changeChoice = (index, choiceIndex, text) =>
    setItems((list) =>
      list.map((item, at) =>
        at === index
          ? { ...item, choices: item.choices.map((choice, c) => (c === choiceIndex ? { text } : choice)) }
          : item
      )
    );

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveModulePreAssessment(moduleId, { items, active });
      setSaved(result);
      setItems(result.items.map(toFormItem));
      setNotice({ tone: "ok", text: "The pre-assessment was saved." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, "Couldn't save the pre-assessment.") });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await deleteModulePreAssessment(moduleId);
      backToCourse();
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error, "Couldn't delete the pre-assessment.") });
      setBusy(false);
    }
  };

  return (
    <div className="admin-main__inner">
      <BackLink onClick={backToCourse}>Back to course</BackLink>
      <PageHeader
        title="Pre-Assessment"
        subtitle={lesson ? `${lesson.courseCode ? `${lesson.courseCode} · ` : ""}${lesson.title}` : null}
        icon={CoursesIcon}
      />

      {notice ? (
        <p className={`admin-notice admin-notice--${notice.tone}`} role="status">
          {notice.text}
        </p>
      ) : null}

      {status === "loading" ? (
        <SkeletonText lines={6} label="Loading the pre-assessment…" />
      ) : status === "error" ? (
        <p className="admin-empty-note">Couldn&apos;t load this lesson.</p>
      ) : (
        <>
          <ol className="admin-pre-list">
            {items.map((item, index) => {
              const choices = item.type === "true-false" ? TRUE_FALSE : item.choices;
              return (
                <li className="admin-card admin-pre-item" key={index}>
                  <div className="admin-pre-item__head">
                    <span className="admin-pre-item__num">Question {index + 1}</span>
                    <div className="admin-pre-item__type">
                      <AdminSelect
                        value={item.type}
                        onChange={(type) => changeType(index, type)}
                        options={TYPE_OPTIONS}
                        label={`Question ${index + 1} type`}
                      />
                    </div>
                    {items.length > 1 ? (
                      <button
                        type="button"
                        className="admin-lesson__remove"
                        disabled={busy}
                        onClick={() => setItems((list) => list.filter((_, at) => at !== index))}
                        aria-label={`Remove question ${index + 1}`}
                        title="Remove"
                      >
                        <TrashIcon size={15} />
                      </button>
                    ) : null}
                  </div>

                  <AdminField
                    label="Question"
                    maxLength={500}
                    value={item.q}
                    onChange={(q) => changeItem(index, { q })}
                    multiline
                    rows={2}
                    required
                  />

                  {/* Pick the correct answer with the radio beside it. */}
                  <fieldset className="admin-pre-choices">
                    <legend className="admin-field__label">Choices</legend>
                    {choices.map((choice, choiceIndex) => {
                      const id = item.type === "true-false" ? choice.id : letter(choiceIndex);
                      return (
                        <div className="admin-pre-choice" key={id}>
                          <input
                            type="radio"
                            name={`key-${index}`}
                            checked={item.key === id}
                            onChange={() => changeItem(index, { key: id })}
                            aria-label={`Correct answer: choice ${id.toUpperCase()}`}
                          />
                          {item.type === "true-false" ? (
                            <span className="admin-pre-choice__text">{choice.text}</span>
                          ) : (
                            <input
                              className="admin-input"
                              type="text"
                              value={choice.text}
                              maxLength={200}
                              placeholder={`Choice ${id.toUpperCase()}`}
                              aria-label={`Question ${index + 1} choice ${id.toUpperCase()}`}
                              onChange={(event) => changeChoice(index, choiceIndex, event.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </fieldset>

                  <AdminField
                    label="Explanation"
                    maxLength={1000}
                    value={item.explanation}
                    onChange={(explanation) => changeItem(index, { explanation })}
                    placeholder="Shown to the student after they answer"
                  />
                </li>
              );
            })}
          </ol>

          {items.length < MAX_ITEMS ? (
            <button
              type="button"
              className="admin-chip-btn admin-pre-add"
              disabled={busy}
              onClick={() => setItems((list) => [...list, blankItem()])}
            >
              <PlusIcon />
              Question
            </button>
          ) : null}

          <div className="admin-pre-foot">
            <label className="admin-check">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              Enable for students
            </label>
            <div className="admin-pre-foot__actions">
              {saved ? (
                askingDelete ? (
                  <button type="button" className="admin-chip-btn" disabled={busy} onClick={remove}>
                    Yes, delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-chip-btn admin-chip-btn--quiet"
                    disabled={busy}
                    onClick={() => setAskingDelete(true)}
                  >
                    Delete pre-assessment
                  </button>
                )
              ) : null}
              <AdminButton variant="admin-btn--compact" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </AdminButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PreAssessmentPage;
