import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getStoredSession } from "../../auth/services/authService";
import {
  fetchCourseModules,
  fetchCourseProgress,
  fetchModuleSections,
  fetchModuleText,
  moduleFigureUrl,
  setModuleCompleted
} from "../../services/learningModules";
// Student-scoped rather than the course-wide list in learningModules: a quiz's
// lock state and result only exist relative to who is asking.
import { fetchCourseAssessments } from "../../services/assessments";
import { hasCourseEnded } from "../../lib/courseDuration";
import {
  lessonPercent,
  lessonShare,
  mergeReading,
  readStoredReading,
  sectionPercents,
  writeStoredReading
} from "./lessonProgress";
import LessonNav from "./components/LessonNav";
import QuizRunner from "./components/QuizRunner";
import BadgeToast from "./components/BadgeToast";
import { BackIcon, BookIcon, LockIcon, QuizIcon } from "./components/icons";
import { SkeletonText } from "../../components/Skeleton";

// Breathing room left above a section heading when jumping to it.
const SECTION_SCROLL_MARGIN = 12;

// The extractor wraps runs that are italic in the source PDF with these
// control markers; render them as <em>.
const ITALIC_OPEN = String.fromCharCode(17); // U+0011
const ITALIC_CLOSE = String.fromCharCode(18); // U+0012

// "Figure 3 Sequence of a while loop" — the label the extractor keeps as a
// paragraph of its own, directly under the picture it names. It is a caption,
// so it is drawn as one rather than as the first line of the prose that
// follows.
//
// Recognised here rather than flagged on the server because flagging it there
// means a cache-version bump, and that re-runs OCR over every module in every
// course for what is only a change of appearance. The rule is the server's own
// (isFigureCaption in modules.format.js): the label comes first, and the line
// is short — length is what keeps a sentence that merely opens with "Figure 3"
// as prose.
const FIGURE_CAPTION = /^fig(?:ure)?\.?\s*\d+\b/i;
const CAPTION_MAX_LENGTH = 90;

function isFigureCaption(text) {
  const plain = String(text ?? "").replace(/[\u0011\u0012]/g, "");
  return FIGURE_CAPTION.test(plain) && plain.length <= CAPTION_MAX_LENGTH;
}

function renderStyledText(text) {
  if (!text || !text.includes(ITALIC_OPEN)) return text;

  const chunks = String(text).split(ITALIC_OPEN);
  const output = [chunks[0]];

  chunks.slice(1).forEach((chunk, index) => {
    const [italic, ...rest] = chunk.split(ITALIC_CLOSE);
    output.push(<em key={index}>{italic}</em>);
    output.push(rest.join(ITALIC_CLOSE));
  });

  return output;
}

// Renders the server's formatted lesson blocks (headings, paragraphs, lists,
// code samples, term definitions, and multiple-choice exercises).
function LessonBlocks({ blocks, answers, onAnswer, moduleId }) {
  return blocks.map((block, index) => {
    if (block.type === "figure") {
      return (
        <figure key={index} className="lesson-reader__figure">
          <img
            src={moduleFigureUrl(moduleId, block.fileId)}
            alt={`Figure from page ${block.page}`}
            loading="lazy"
            width={block.width}
            height={block.height}
          />
        </figure>
      );
    }

    if (block.type === "exercise") {
      const answeredCount = block.questions.filter(
        (question) => answers?.[question.id] !== undefined
      ).length;
      const allAnswered = answeredCount === block.questions.length;

      return (
        <div key={index} className="lesson-exercise">
          <p className="lesson-exercise__heading">Exercise</p>
          <ol className="lesson-exercise__questions">
            {block.questions.map((question) => (
              <li key={question.id} className="lesson-exercise__question">
                <p className="lesson-exercise__prompt">
                  {renderStyledText(question.prompt)}
                </p>
                <div className="lesson-exercise__choices">
                  {question.choices.map((choice, choiceIndex) => {
                    const checked = answers?.[question.id] === choiceIndex;
                    return (
                      <label
                        key={choiceIndex}
                        className={`lesson-exercise__choice${
                          checked ? " is-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`exercise-${question.id}`}
                          checked={checked}
                          onChange={() => onAnswer?.(question.id, choiceIndex)}
                        />
                        <span>{renderStyledText(choice)}</span>
                      </label>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
          <p
            className={`lesson-exercise__status${allAnswered ? " is-done" : ""}`}
          >
            {allAnswered
              ? "All questions answered."
              : `${answeredCount} of ${block.questions.length} answered — answer every question to complete this lesson.`}
          </p>
        </div>
      );
    }

    if (block.type === "heading") {
      return block.level === 2 ? (
        <h2 key={index} className="lesson-reader__h2">
          {block.text}
        </h2>
      ) : (
        <h3 key={index} className="lesson-reader__h3">
          {block.text}
        </h3>
      );
    }

    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={index}
          className="lesson-reader__list"
          // Where the run resumes. A numbered run in a module can still be
          // split by something the page put between two of its steps — a
          // figure, a page break — and each block is its own <ol>, which
          // counts from one unless told otherwise. The server sends this only
          // when the run does not start at one.
          start={block.ordered ? block.start : undefined}
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderStyledText(item)}</li>
          ))}
        </ListTag>
      );
    }

    if (block.type === "code") {
      return (
        <pre key={index} className="lesson-reader__code">
          <code>{block.text}</code>
        </pre>
      );
    }

    if (block.type === "term") {
      return (
        <p key={index} className="lesson-reader__term">
          <strong className="lesson-reader__term-name">{block.term}</strong>
          <span className="lesson-reader__term-sep" aria-hidden="true">
            {" — "}
          </span>
          {renderStyledText(block.text)}
        </p>
      );
    }

    return (
      <p
        key={index}
        className={
          isFigureCaption(block.text)
            ? "lesson-reader__p lesson-reader__caption"
            : "lesson-reader__p"
        }
      >
        {renderStyledText(block.text)}
      </p>
    );
  });
}

function LearningModules() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const studentId = getStoredSession()?.user?.id;

  const [modules, setModules] = useState([]);
  // The course this reader is open on — its name, its run, and whether that
  // run is over. An ended course is read-only: see courseAccess.js.
  const [course, setCourse] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // The item shown in the right-hand viewer: { type: "lesson" | "assessment", item }.
  const [selected, setSelected] = useState(null);
  const [textByModule, setTextByModule] = useState({});
  const [textStatus, setTextStatus] = useState("idle");
  const [textRetry, setTextRetry] = useState(0);
  const [completionBusy, setCompletionBusy] = useState(false);
  // Selected exercise answers, per module: { [moduleId]: { [questionId]: choiceIndex } }.
  const [answersByModule, setAnswersByModule] = useState({});
  // Modules whose reader was scrolled to the end this session.
  const [endReachedIds, setEndReachedIds] = useState([]);
  // Section dropdown state: which chapter is expanded + fetched section lists.
  const [expandedId, setExpandedId] = useState(null);
  const [sectionsByModule, setSectionsByModule] = useState({});
  const [sectionsLoadingId, setSectionsLoadingId] = useState(null);
  // Section to scroll to once the lesson text is on screen.
  const [pendingSection, setPendingSection] = useState(null);
  // Section the rail keeps lit. Unlike pendingSection this survives the
  // scroll, so the list still shows where in the lesson you landed.
  const [activeSection, setActiveSection] = useState(null);
  // The badge a quiz was just passed for, shown in the corner for five seconds.
  const [earnedBadge, setEarnedBadge] = useState(null);
  // The scrollable reader pane — watched to auto-complete lessons.
  const readerRef = useRef(null);
  // How far this student has read, per lesson and per section within it:
  // { [moduleId]: { percent, sections: { [sectionId]: percent } } }. Kept in
  // the browser rather than on the server — see lessonProgress.js.
  const [reading, setReading] = useState(() => readStoredReading(studentId));
  // Where each section of the open lesson sits in the reader's scroll space,
  // as [{ id, top, height }]. Measured from the rendered headings, because
  // nothing but the layout knows how tall a section turned out to be.
  const sectionGeometryRef = useRef([]);

  // Course title travels via navigation state; fall back to the modules'
  // subject code after a hard refresh.
  const courseTitle =
    location.state?.title ?? course?.title ?? modules[0]?.subject ?? "Course";

  // The server sends `ended` with the course and refuses the writes itself;
  // the date rule is only the fallback for a response without the field.
  const ended = course?.ended ?? hasCourseEnded(course);

  // The class holding this student in the course has been switched off in the
  // admin console. Unlike an ended run it is not read-only — the server sends
  // no lessons and refuses the content routes — so the page says so instead of
  // drawing an empty curriculum it cannot explain.
  const suspended = Boolean(course?.suspended);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setSelected(null);

    Promise.all([
      fetchCourseModules(courseId).catch(() => ({ course: null, modules: [] })),
      fetchCourseAssessments(studentId, courseId).catch(() => []),
      fetchCourseProgress(studentId, courseId).catch(() => [])
    ])
      .then(([lessons, assessmentList, completedList]) => {
        if (!active) return;
        const moduleList = lessons.modules;
        setCourse(lessons.course);
        setModules(moduleList);
        setAssessments(assessmentList);
        setCompletedIds(completedList.map(String));
        // Open the first lesson by default so the viewer isn't empty. Falling
        // back to a quiz, only one that can actually be opened: the list
        // includes locked placeholders for papers the assessor has not posted,
        // and auto-opening one would put a 404 in the viewer on arrival.
        if (moduleList.length > 0) {
          setSelected({ type: "lesson", item: moduleList[0] });
        } else {
          const openable = assessmentList.find(
            (assessment) => !assessment.locked && !assessment.placeholder
          );
          if (openable) setSelected({ type: "assessment", item: openable });
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseId, studentId]);

  const selectedLessonId = selected?.type === "lesson" ? selected.item.id : null;
  const selectedAssessmentId =
    selected?.type === "assessment" ? selected.item.id : null;
  const lessonText = selectedLessonId ? textByModule[selectedLessonId] : null;

  // Fetch the extracted text once per module (the server caches too, so
  // repeat visits are instant).
  useEffect(() => {
    if (!selectedLessonId || textByModule[selectedLessonId]) {
      return undefined;
    }

    let active = true;
    setTextStatus("loading");

    fetchModuleText(selectedLessonId)
      .then((data) => {
        if (!active) return;
        setTextByModule((cache) => ({ ...cache, [selectedLessonId]: data }));
        setTextStatus("idle");
      })
      .catch(() => {
        if (active) setTextStatus("error");
      });

    return () => {
      active = false;
    };
  }, [selectedLessonId, textByModule, textRetry]);

  // Once the target lesson's text is rendered, jump to the chosen section.
  useEffect(() => {
    if (!pendingSection || pendingSection.moduleId !== selectedLessonId) return;
    if (!lessonText) return;

    const reader = readerRef.current;
    const target = document.getElementById(
      `lesson-section-${pendingSection.sectionId}`
    );

    // scrollIntoView() scrolls *every* scrollable ancestor, so it moved the
    // reader pane and dragged the page behind it along too. Scrolling the
    // pane directly leaves the rest of the page where the student left it.
    if (reader && target) {
      // The app renders at --app-zoom (see styles.css), and the two coordinate
      // spaces disagree under it: getBoundingClientRect() reports scaled
      // pixels while scrollTop counts unscaled ones. Dividing the measured gap
      // by the element's zoom puts it back in scrollTop's units, so the jump
      // lands on the heading instead of ~10% short of it.
      const zoom =
        reader.currentCSSZoom ??
        (Number(getComputedStyle(document.documentElement).zoom) || 1);
      const offset =
        (target.getBoundingClientRect().top - reader.getBoundingClientRect().top) /
        zoom;
      reader.scrollTo({
        top: reader.scrollTop + offset - SECTION_SCROLL_MARGIN,
        behavior: "smooth"
      });
    }

    setPendingSection(null);
  }, [pendingSection, lessonText, selectedLessonId]);

  const isCompleted = (moduleId) => completedIds.includes(String(moduleId));

  // Multiple-choice questions the server extracted from the module's own
  // evaluation section — empty when the PDF has none.
  const exerciseQuestionsFor = (moduleId) => {
    const blocks = textByModule[moduleId]?.blocks ?? [];
    return blocks
      .filter((block) => block.type === "exercise")
      .flatMap((block) => block.questions);
  };

  // A module with an exercise only completes once every question is answered.
  const isExerciseFulfilled = (moduleId) => {
    const answers = answersByModule[moduleId] ?? {};
    return exerciseQuestionsFor(moduleId).every(
      (question) => answers[question.id] !== undefined
    );
  };

  const selectAnswer = (moduleId, questionId, choiceIndex) => {
    setAnswersByModule((all) => ({
      ...all,
      [moduleId]: { ...(all[moduleId] ?? {}), [questionId]: choiceIndex }
    }));
  };

  const noteEndReached = (moduleId) => {
    setEndReachedIds((ids) =>
      ids.includes(String(moduleId)) ? ids : [...ids, String(moduleId)]
    );
  };

  /**
   * Where the open lesson's sections landed, in the reader's scroll space.
   *
   * The same zoom correction the section jump makes, and for the same reason:
   * the app renders at --app-zoom, so getBoundingClientRect() reports scaled
   * pixels while scrollTop counts unscaled ones. Measuring in one space and
   * comparing in the other would put every section's percentage out by the
   * zoom factor.
   */
  const measureSections = useCallback(() => {
    const reader = readerRef.current;
    const sections = lessonText?.sections ?? [];

    if (!reader || sections.length === 0) {
      sectionGeometryRef.current = [];
      return;
    }

    const zoom =
      reader.currentCSSZoom ??
      (Number(getComputedStyle(document.documentElement).zoom) || 1);
    const readerTop = reader.getBoundingClientRect().top;

    sectionGeometryRef.current = sections
      .map((section) => {
        const element = document.getElementById(`lesson-section-${section.id}`);
        if (!element) return null;

        const box = element.getBoundingClientRect();
        return {
          id: section.id,
          top: reader.scrollTop + (box.top - readerTop) / zoom,
          height: box.height / zoom
        };
      })
      .filter(Boolean);
  }, [lessonText]);

  /**
   * Takes a reading of how far down the pane has been, and keeps it if it is
   * further than before.
   *
   * Called on every scroll event, so it is written to cost nothing when
   * nothing changed: `mergeReading` hands back the object it was given when no
   * figure rose, and returning the same state object tells React there is
   * nothing to re-render — which matters when the thing that would re-render
   * is the pane being scrolled.
   */
  const recordReading = useCallback(() => {
    const reader = readerRef.current;
    if (!reader || !selectedLessonId) return;

    const depth = reader.scrollTop + reader.clientHeight;
    const measured = {
      percent: lessonPercent(depth, reader.scrollHeight),
      sections: sectionPercents(sectionGeometryRef.current, depth)
    };

    const key = String(selectedLessonId);
    setReading((current) => {
      const merged = mergeReading(current[key], measured);
      if (merged === current[key]) return current;
      return { ...current, [key]: merged };
    });
  }, [selectedLessonId]);

  // Lesson quizzes are stored one per module, so the rail groups them by their
  // module and shows each inside that module's dropdown. The course's single
  // final exam belongs to no lesson and sits at the foot of the rail.
  const assessmentsByModule = assessments.reduce((groups, assessment) => {
    if (assessment.scope === "final") return groups;
    const key = String(assessment.moduleId ?? "");
    if (!key) return groups;
    (groups[key] ??= []).push(assessment);
    return groups;
  }, {});

  const finalAssessment = assessments.find((assessment) => assessment.scope === "final") ?? null;

  /**
   * How far through the course, counting everything the rail holds.
   *
   * A course is its lessons, a quiz for each of them and one final — the same
   * three things this rail lists — so the bar counts all three. Reading alone
   * put a student at 100% with every paper still to sit.
   *
   * The denominator is what the course *owes* rather than what has been posted:
   * counting only released papers would drop the figure each time an assessor
   * posted another one, and a percentage that falls for something the student
   * did not do is worse than one that starts low.
   *
   * This is the same sum `progressSummary` makes on the server for the My
   * Courses card (courses.controller.js). The two must agree — a course cannot
   * report one figure on its card and another inside it — so change them
   * together.
   */
  const lessonsDone = modules.filter((module) => isCompleted(module.id)).length;

  // A set of lesson ids rather than a count of rows: a retaken paper must not
  // read as two quizzes passed.
  const quizzesPassed = new Set(
    assessments
      .filter((row) => row.scope === "lesson" && row.result?.passed)
      .map((row) => String(row.moduleId))
  ).size;

  const finalPassed = assessments.some((row) => row.scope === "final" && row.result?.passed);

  // A course with no lessons owes nothing yet — not even a final.
  const courseItems = modules.length ? modules.length * 2 + 1 : 0;
  const completedCount = Math.min(
    lessonsDone + Math.min(quizzesPassed, modules.length) + (finalPassed ? 1 : 0),
    courseItems
  );
  const progressPercent = courseItems
    ? Math.round((completedCount / courseItems) * 100)
    : 0;

  /** Whether this lesson's quiz has been passed — the second half of it. */
  const quizPassedFor = (moduleId) =>
    (assessmentsByModule[String(moduleId)] ?? []).some((quiz) => quiz.result?.passed);

  /**
   * How far through a lesson, and through one of its sections, this student
   * has got.
   *
   * The lesson counts its quiz as well as its text — half each, see
   * lessonShare. The reading half is read off the record when the lesson is
   * ticked rather than off wherever this browser was last left: the tick is the
   * server's and the scroll position is this browser's, and they must not be
   * able to contradict each other on the same row. A lesson marked complete on
   * another machine would otherwise sit there ticked and showing nothing read.
   *
   * A section is a piece of the text, so it stays a reading figure — the quiz
   * belongs to the whole lesson and to no section of it.
   */
  const lessonProgressFor = (moduleId) => {
    const read = isCompleted(moduleId) ? 100 : (reading[String(moduleId)]?.percent ?? 0);
    return lessonShare(read, quizPassedFor(moduleId));
  };

  const sectionProgressFor = (moduleId, sectionId) =>
    isCompleted(moduleId) ? 100 : (reading[String(moduleId)]?.sections?.[sectionId] ?? 0);

  const toggleSections = (module) => {
    const moduleId = module.id;
    setExpandedId((current) => (current === moduleId ? null : moduleId));

    if (!sectionsByModule[moduleId]) {
      setSectionsLoadingId(moduleId);
      fetchModuleSections(moduleId)
        .then((sections) =>
          setSectionsByModule((cache) => ({ ...cache, [moduleId]: sections }))
        )
        .catch(() =>
          setSectionsByModule((cache) => ({ ...cache, [moduleId]: [] }))
        )
        .finally(() =>
          setSectionsLoadingId((current) => (current === moduleId ? null : current))
        );
    }
  };

  const openSection = (module, section) => {
    setSelected({ type: "lesson", item: module });
    setPendingSection({ moduleId: module.id, sectionId: section.id });
    setActiveSection({ moduleId: module.id, sectionId: section.id });
  };

  // Opening a lesson from its row lands at the top, so no section is current.
  const openLesson = (module) => {
    setSelected({ type: "lesson", item: module });
    setActiveSection(null);
  };

  const openAssessment = (assessment) => {
    setSelected({ type: "assessment", item: assessment });
    setActiveSection(null);
  };

  /**
   * The lesson a shut quiz sends the student back to, or null when there is
   * nowhere useful to send them.
   *
   * Read off the completion record rather than off the sentence the server
   * sent: "Finish this lesson to unlock its quiz" and "Your assessor will
   * unlock this quiz" are two different states, and only the first has an
   * answer the student can act on. A final exam has no single lesson behind
   * it, so it never gets one either.
   */
  const lockedLessonFor = (item) => {
    if (!item || item.scope === "final" || !item.moduleId) return null;
    if (isCompleted(item.moduleId)) return null;
    return modules.find((module) => String(module.id) === String(item.moduleId)) ?? null;
  };

  /**
   * A submitted quiz can unlock the final, so the rail's lock states are
   * re-read rather than patched locally — the gate is the server's call.
   */
  // Stable, so the toast's own five-second timer is not restarted by every
  // unrelated re-render of this page.
  const dismissBadge = useCallback(() => setEarnedBadge(null), []);

  const refreshAssessments = () => {
    fetchCourseAssessments(studentId, courseId)
      .then(setAssessments)
      .catch(() => {});
  };


  // Reading to the end of a lesson (and finishing its exercise, when the
  // module has one) marks it complete automatically.
  const markLessonComplete = async (moduleId) => {
    if (!studentId || !moduleId || completionBusy || isCompleted(moduleId)) return;
    if (!isExerciseFulfilled(moduleId)) return;

    // A course whose run is over is read-only. The server refuses this write
    // as well — this is what stops the reader asking for it on every scroll
    // to the foot of a lesson.
    if (ended) return;

    setCompletionBusy(true);
    try {
      await setModuleCompleted(studentId, moduleId, true);
      setCompletedIds((ids) =>
        ids.includes(String(moduleId)) ? ids : [...ids, String(moduleId)]
      );
      // Lock states live in the assessments payload, not in completedIds, so
      // this lesson's quiz stays shut until the rail is re-read — without it
      // the student had to reload the page to see the quiz open. The final's
      // lock counts finished lessons too, so it is re-read by the same call.
      refreshAssessments();
    } catch (_error) {
      // Ignore — the next scroll event retries.
    } finally {
      setCompletionBusy(false);
    }
  };

  const handleReaderScroll = (event) => {
    // Loading/error placeholders are short — scrolling them must not count.
    if (!lessonText) return;
    const reader = event.currentTarget;
    recordReading();
    if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 32) {
      noteEndReached(selectedLessonId);
    }
  };

  // Completion needs both signals: the reader scrolled to the end AND the
  // module's exercise (if any) fully answered — in either order.
  useEffect(() => {
    if (!selectedLessonId || !lessonText) return;
    if (!endReachedIds.includes(String(selectedLessonId))) return;
    if (!isExerciseFulfilled(selectedLessonId)) return;
    markLessonComplete(selectedLessonId);
  }, [endReachedIds, answersByModule, selectedLessonId, lessonText]);

  // Each lesson starts at the top of the pane. Without this, the previous
  // module's scroll position survives the content swap and the bottom-of-pane
  // check instantly completes a module the student never read.
  useLayoutEffect(() => {
    const reader = readerRef.current;
    if (reader) reader.scrollTop = 0;
  }, [selectedLessonId]);

  // Lessons short enough to show without scrolling count as read on open.
  useEffect(() => {
    if (!lessonText || !selectedLessonId) return;
    const reader = readerRef.current;
    if (reader && reader.scrollHeight <= reader.clientHeight + 8) {
      noteEndReached(selectedLessonId);
    }
  }, [lessonText, selectedLessonId]);

  /**
   * Re-measure whenever the lesson could have changed shape under the reader.
   *
   * Not only when the text arrives: the figures are images, and a page whose
   * pictures are still loading is shorter than the page the student will
   * actually read. Every one that lands moves every heading below it, so the
   * geometry taken at first paint would have each section's percentage
   * measured against a page that no longer exists.
   *
   * The observer watches the pane (the window being resized) and its content
   * (the page growing inside it), which between them cover both.
   */
  useEffect(() => {
    const reader = readerRef.current;
    if (!reader || !lessonText) return undefined;

    const take = () => {
      measureSections();
      recordReading();
    };

    take();

    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(take);
    observer.observe(reader);
    if (reader.firstElementChild) observer.observe(reader.firstElementChild);

    return () => observer.disconnect();
  }, [lessonText, measureSections, recordReading]);

  /**
   * Keep what has been read, so a reload does not report a half-finished
   * lesson as untouched.
   *
   * Written on a delay rather than on each reading: the figures move while the
   * student is scrolling, and storage is not the place to be during that.
   */
  useEffect(() => {
    if (!studentId) return undefined;
    const timer = setTimeout(() => writeStoredReading(studentId, reading), 400);
    return () => clearTimeout(timer);
  }, [reading, studentId]);

  return (
    <section className="student-courses modules-page">
      <div className="modules-page__header">
        {/* Icon only: the nav bar is hidden on this route (StudentLayout), so
            the header is the reader's own chrome and the less of it there is,
            the more lesson fits under it. The words the chevron dropped are
            kept on aria-label for a screen reader and on title for a pointer,
            and the course title sits beside it as the thing being left. */}
        <button
          type="button"
          className="sd-btn sd-btn--disc"
          onClick={() => navigate("/student")}
          aria-label="Back to courses"
          title="Back to courses"
        >
          <BackIcon size={16} />
        </button>

        <h2 className="student-courses__title modules-page__title">
          {courseTitle} · Learning Modules
        </h2>
      </div>

      {/* The class is off, so there is nothing under this to show. It stands in
          place of the curriculum rather than above it, so it is centred on the
          space the lessons would have filled rather than tucked into a strip. */}
      {suspended ? (
        <div className="modules-page__closed">
          <span className="modules-page__closed-icon" aria-hidden="true">
            <LockIcon size={56} />
          </span>
          <p className="modules-page__closed-text">
            {course?.suspendedReason ??
              "Your class for this course is switched off, so its lessons are closed for now."}
          </p>
        </div>
      ) : null}

      {/* Said once, above everything it shuts. Centred and locked like the
          switched-off notice, so the reader closes the same way twice — but
          kept to a banner, because unlike that one it has lessons under it that
          are still open to read. */}
      {ended && !suspended ? (
        <div className="modules-page__ended">
          <span className="modules-page__ended-icon" aria-hidden="true">
            <LockIcon size={30} />
          </span>
          <p className="modules-page__ended-text">
            {course?.endedReason ??
              "This course has ended. You can still read it, but it can no longer be worked on."}
          </p>
        </div>
      ) : null}

      {suspended ? null : (
      <div className="modules-layout">
        {/* Left: curriculum — numbered lessons with completion state */}
        <aside className="modules-layout__aside">
          {!isLoading && modules.length > 0 ? (
            <div className="modules-progress">
              {/* The label above the figure rather than beside it. Sharing a
                  line, a small uppercase eyebrow and a large number had to be
                  set on one baseline to sit level, and the count tucked in
                  behind the percentage read as part of it. */}
              <p className="modules-progress__label">Course progress</p>
              <div className="modules-progress__row">
                <span className="modules-progress__count">{progressPercent}%</span>
                <span className="modules-progress__of">
                  {completedCount} of {courseItems}
                </span>
              </div>
              <div
                className="modules-progress__bar"
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Lessons completed"
              >
                <div
                  className="modules-progress__fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          <h3 className="modules-section__title">Lessons</h3>

          {/* Only the list scrolls — the progress block and heading stay put. */}
          <div className="modules-layout__scroll">
            {isLoading ? (
              <SkeletonText lines={5} label="Loading lessons…" />
            ) : modules.length === 0 ? (
              <p className="student-courses__status">
                No lessons have been uploaded for this course yet.
              </p>
            ) : (
              <LessonNav
                modules={modules}
                isCompleted={isCompleted}
                selectedLessonId={selectedLessonId}
                selectedAssessmentId={selectedAssessmentId}
                activeSection={activeSection}
                expandedId={expandedId}
                sectionsByModule={sectionsByModule}
                sectionsLoadingId={sectionsLoadingId}
                assessmentsByModule={assessmentsByModule}
                lessonProgressFor={lessonProgressFor}
                sectionProgressFor={sectionProgressFor}
                onSelectLesson={openLesson}
                onToggleSections={toggleSections}
                onOpenSection={openSection}
                onOpenAssessment={openAssessment}
              />
            )}
          </div>

          {/* Pinned under the scroller rather than sitting at the foot of it.
              It is the last thing you sit and the thing the whole course is
              worked towards, so it should not take scrolling past sixty-eight
              lessons to find out where it is or whether it has opened. It
              stays shut until all lessons are read and all lesson quizzes
              passed — the server decides that and sends the reason with it. */}
          {finalAssessment ? (
            <div className="sd-final">
              <p className="sd-final__label">Final Exam</p>

              {/* Opens whether or not it is shut, like a lesson's quiz: the
                  row keeps its lock and its dashed border, and the viewer is
                  where the reason is given. A dead button left the student
                  pressing nothing with no way to find out why. */}
              <button
                type="button"
                className={`sd-final__btn${
                  String(selectedAssessmentId) === String(finalAssessment.id)
                    ? " is-open-item"
                    : ""
                }${finalAssessment.locked ? " is-locked" : ""}`}
                onClick={() => openAssessment(finalAssessment)}
                aria-current={
                  String(selectedAssessmentId) === String(finalAssessment.id)
                    ? "true"
                    : undefined
                }
              >
                <span className="sd-final__icon">
                  {finalAssessment.locked ? <LockIcon size={15} /> : <QuizIcon size={16} />}
                </span>

                <span className="sd-final__text">
                  {/* A placeholder row carries no title, since there is no
                      generated paper behind it to have been named. */}
                  <span className="sd-final__title">
                    {finalAssessment.title || "Final Exam"}
                  </span>
                  {/* The mark if it has been taken, otherwise what the paper
                      is — and nothing at all for one that has not been
                      written, which has no length or pass mark to report
                      yet. Why it is shut is the viewer's to say. */}
                  {finalAssessment.result ? (
                    <span className="sd-final__state">
                      Scored {finalAssessment.result.score} of{" "}
                      {finalAssessment.result.total}
                    </span>
                  ) : finalAssessment.itemCount ? (
                    <span className="sd-final__state">
                      {finalAssessment.itemCount} questions · pass{" "}
                      {finalAssessment.passMark}
                    </span>
                  ) : null}
                </span>

                {finalAssessment.locked ? (
                  <span className="sd-final__tag">Locked</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </aside>

        {/* Right: the selected module, shown wider */}
        <div className="modules-layout__main">
          {!selected ? (
            <div className="module-viewer module-viewer--empty">
              <span className="module-viewer__mark" aria-hidden="true">
                <BookIcon size={22} />
              </span>
              <p className="student-courses__status">Select a lesson or assessment.</p>
            </div>
          ) : selected.type === "lesson" ? (
            <div className="module-viewer">
              {/* Nothing here says whether the lesson is finished or how far
                  down it you are. The rail says both, on the row for this
                  lesson, and repeating it over the page it describes told the
                  student twice what they had already been told once.

                  The mark beside the title is the only ornament: it gives the
                  page something to start on other than a line of text, and it
                  is the same mark the empty state uses, so opening a lesson
                  reads as the pane filling in rather than being replaced. */}
              <div className="module-viewer__head">
                <span className="module-viewer__mark" aria-hidden="true">
                  <BookIcon size={17} />
                </span>
                <h3 className="module-viewer__title">{selected.item.title}</h3>
              </div>

              <div
                ref={readerRef}
                className="module-viewer__text lesson-reader"
                aria-label={`${selected.item.title} lesson content`}
                onScroll={handleReaderScroll}
              >
                {!lessonText && textStatus === "loading" ? (
                  <p className="student-courses__status">Extracting text…</p>
                ) : !lessonText && textStatus === "error" ? (
                  <div className="module-viewer__text-status">
                    <p className="student-courses__status">
                      Couldn&apos;t extract this module&apos;s text.
                    </p>
                    <button
                      type="button"
                      className="module-row__action"
                      onClick={() => setTextRetry((count) => count + 1)}
                    >
                      Try again
                    </button>
                  </div>
                ) : lessonText && !lessonText.hasText ? (
                  <p className="student-courses__status">No text to extract from this module.</p>
                ) : lessonText ? (
                  <div className="lesson-reader__content">
                    {lessonText.blocks?.length ? (
                      lessonText.sections?.length ? (
                        lessonText.sections.map((section) => (
                          <section
                            key={section.id}
                            id={`lesson-section-${section.id}`}
                            className="lesson-reader__section"
                          >
                            <LessonBlocks
                              blocks={lessonText.blocks.slice(
                                section.start,
                                section.end
                              )}
                              moduleId={selectedLessonId}
                              answers={answersByModule[selectedLessonId]}
                              onAnswer={(questionId, choiceIndex) =>
                                selectAnswer(selectedLessonId, questionId, choiceIndex)
                              }
                            />
                          </section>
                        ))
                      ) : (
                        <LessonBlocks
                          blocks={lessonText.blocks}
                          moduleId={selectedLessonId}
                          answers={answersByModule[selectedLessonId]}
                          onAnswer={(questionId, choiceIndex) =>
                            selectAnswer(selectedLessonId, questionId, choiceIndex)
                          }
                        />
                      )
                    ) : (
                      lessonText.pages.map((page) => (
                        <pre key={page.page} className="module-viewer__page-text">
                          {page.text}
                        </pre>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="module-viewer">
              <div className="module-viewer__head">
                <h3 className="module-viewer__title">
                  {/* A placeholder carries no title — there is no paper behind
                      it to have been named, and the heading cannot be blank
                      now that one can be opened. */}
                  {selected.item.title ||
                    (selected.item.scope === "final" ? "Final Exam" : "Quiz")}
                </h3>
                {selected.item.scope === "final" ? (
                  <span className="module-row__action module-viewer__complete">
                    Final Exam
                  </span>
                ) : null}
              </div>

              {/* The viewer is a locked-height pane, so the paper needs its own
                  scroller — the same job .module-viewer__text does for a
                  lesson. Without it a long quiz is simply clipped. */}
              <div className="module-viewer__body">
                <QuizRunner
                  studentId={studentId}
                  assessment={selected.item}
                  onSubmitted={refreshAssessments}
                  onBadgeEarned={setEarnedBadge}
                  onOpenLesson={
                    lockedLessonFor(selected.item)
                      ? () => openLesson(lockedLessonFor(selected.item))
                      : null
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Fixed to the corner of the screen, so it is unaffected by where in the
          reader or the rail the student happens to be scrolled. */}
      {earnedBadge ? <BadgeToast badge={earnedBadge} onDone={dismissBadge} /> : null}
    </section>
  );
}

export default LearningModules;
