import { ModulesIcon, TrashIcon } from "../icons";
import { SectionTitle } from "../ui";
import { SkeletonText } from "../../../../components/Skeleton";
import { impactLabel, moduleMeta } from "./impact";
import { plural } from "../../lib/format";

/**
 * The lessons on a course, and the two-step removal of one.
 *
 * Removal confirms in the row rather than in a dialog, because what it costs
 * is per-lesson and is read beside the lesson it is about. The confirm is held
 * shut until those counts arrive — agreeing to a removal whose cost is still
 * loading is agreeing to nothing in particular.
 */
export default function ModuleList({
  modules,
  detailStatus,
  busy,
  confirming,
  impact,
  onPreview,
  onAskRemove,
  onRemove,
  onCancelRemove
}) {
  const ready = detailStatus !== "loading" && detailStatus !== "error";

  return (
    <div className="admin-card admin-lessons">
      <div className="admin-lessons__head">
        <SectionTitle icon={ModulesIcon}>Learning Modules</SectionTitle>
        {ready && modules.length > 0 ? (
          <span className="admin-lessons__count">{plural(modules.length, "lesson")}</span>
        ) : null}
      </div>

      {detailStatus === "loading" ? (
        <SkeletonText lines={4} label="Loading modules…" />
      ) : detailStatus === "error" ? (
        <p className="admin-empty-note">Couldn&apos;t load this course.</p>
      ) : modules.length === 0 ? (
        <p className="admin-empty-note">No learning modules uploaded for this course yet.</p>
      ) : (
        // Numbered because the order is the course's: lesson 3 is read after 2.
        <ol className="admin-lesson-list">
          {modules.map((module, index) => {
            const asking = confirming === module.id;
            return (
              <li
                className={`admin-lesson${asking ? " is-confirming" : ""}`}
                key={module.id}
              >
                <span className="admin-lesson__num" aria-hidden="true">
                  {index + 1}
                </span>

                <div className="admin-lesson__main">
                  <span className="admin-lesson__title">{module.title}</span>
                  {asking ? (
                    <span className="admin-lesson__warn" role="status">
                      {impactLabel(impact)}
                    </span>
                  ) : (
                    <span className="admin-lesson__meta">{moduleMeta(module)}</span>
                  )}
                </div>

                {asking ? (
                  <div className="admin-lesson__actions">
                    <button
                      type="button"
                      className="admin-chip-btn admin-chip-btn--quiet"
                      disabled={busy}
                      onClick={onCancelRemove}
                    >
                      Cancel
                    </button>
                    {/* Held back until the counts are in: agreeing to a
                        removal whose cost is still loading is agreeing to
                        nothing in particular. */}
                    <button
                      type="button"
                      className="admin-chip-btn"
                      disabled={busy || !impact}
                      onClick={() => onRemove(module)}
                    >
                      Yes, remove
                    </button>
                  </div>
                ) : (
                  <div className="admin-lesson__actions">
                    <button
                      type="button"
                      className="admin-chip-btn admin-chip-btn--quiet"
                      onClick={() => onPreview(module)}
                      aria-label={`Preview ${module.title}`}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="admin-lesson__remove"
                      disabled={busy}
                      onClick={() => onAskRemove(module)}
                      aria-label={`Remove ${module.title}`}
                      title="Remove"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
