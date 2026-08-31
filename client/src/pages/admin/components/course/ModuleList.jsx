import { TrashIcon } from "../icons";
import { SkeletonText } from "../../../../components/Skeleton";
import { impactLabel, moduleMeta } from "./impact";

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
  return (
    <div className="admin-card">
            <h2 className="admin-card__title">Learning Modules</h2>

            {detailStatus === "loading" ? (
              <SkeletonText lines={4} label="Loading modules…" />
            ) : detailStatus === "error" ? (
              <p className="admin-empty-note">Couldn&apos;t load this course.</p>
            ) : (
              <div className="admin-module-list">
                {modules.map((module) => (
                  <div className="admin-module-row" key={module.id}>
                    <div className="admin-module-row__main">
                      <span className="admin-module-row__label">{module.title}</span>
                      <span className="admin-assign-row__meta">{moduleMeta(module)}</span>
                    </div>

                    {confirming === module.id ? (
                      <div className="admin-module-row__actions">
                        <span className="admin-module-row__warn">{impactLabel(impact)}</span>
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
                        <button
                          type="button"
                          className="admin-chip-btn admin-chip-btn--quiet"
                          disabled={busy}
                          onClick={onCancelRemove}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="admin-module-row__actions">
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
                          className="admin-chip-btn admin-chip-btn--icon"
                          disabled={busy}
                          onClick={() => onAskRemove(module)}
                          aria-label={`Remove ${module.title}`}
                        >
                          <TrashIcon />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {modules.length === 0 ? (
                  <p className="admin-empty-note">
                    No learning modules uploaded for this course yet.
                  </p>
                ) : null}
              </div>
            )}
    </div>
  );
}
