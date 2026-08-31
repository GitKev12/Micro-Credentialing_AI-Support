/** The strip above the blueprint: what it covers, and what it adds up to. */
export default function BlueprintSummary({
  courseCode,
  lessons,
  exam,
  onExamChange,
  grandTotal,
  itemsPerQuiz,
  totalHours
}) {
  return (
    <div className="admin-tos-summary">
      <div>
        <div className="admin-tos-summary__label">Course</div>
        <div className="admin-tos-summary__value">
          {courseCode || "—"} · {lessons} lessons
        </div>
      </div>
      <div>
        <div className="admin-tos-summary__label">Examination</div>
        <input
          className="admin-tos-summary__input"
          value={exam}
          aria-label="Examination name"
          onChange={(event) => onExamChange(event.target.value)}
        />
      </div>
      <div>
        <div className="admin-tos-summary__label">Total Items</div>
        <div className="admin-tos-summary__value admin-tos-summary__value--brand">
          {grandTotal}
        </div>
      </div>
      <div>
        <div className="admin-tos-summary__label">Items per Quiz</div>
        <div className="admin-tos-summary__value admin-tos-summary__value--brand">
          {itemsPerQuiz ?? "varies"}
        </div>
      </div>
      <div>
        <div className="admin-tos-summary__label">Contact Hours</div>
        <div className="admin-tos-summary__value admin-tos-summary__value--brand">
          {totalHours}
        </div>
      </div>
    </div>
  );
}
