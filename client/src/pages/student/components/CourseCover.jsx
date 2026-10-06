import { courseImageUrl } from "../../../services/courses";

function coverSrc(course) {
  if (course.hasImage) return courseImageUrl(course.id, course.imageUpdatedAt);
  return course.imageUrl || null;
}

/**
 * A course's picture, or its code set as one when it has none.
 *
 * The code is drawn either way and the picture laid over it, so a picture that
 * fails to load leaves the code showing rather than an empty box. Decorative:
 * the title and code are always written out beside it.
 */
export default function CourseCover({ course, className }) {
  const src = coverSrc(course);
  const mark = course.code || course.title.split(/\s+/).slice(0, 2).map((word) => word[0]).join("");

  return (
    <div className={`sd-cover ${className}`} aria-hidden="true">
      <span className="sd-cover__mark">
        {String(mark)
          .split(/\s+/)
          .map((part, index) => (
            <span key={index}>{part}</span>
          ))}
      </span>
      {src ? <span className="sd-cover__img" style={{ backgroundImage: `url(${src})` }} /> : null}
    </div>
  );
}

