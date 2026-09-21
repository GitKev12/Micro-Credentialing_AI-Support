import { Chip } from "../ui";
import { levelByKey } from "./levels";

/**
 * The level of thinking one question was written at.
 *
 * The blueprint orders a mix — so many remembering, so many analysing — and the
 * generator answers with a level on every question it writes. Whether the
 * question really asks for that kind of thinking is a judgement only a person
 * reading it can make, and this is where they make it: the label sits on the
 * question itself, so checking the paper is reading down the list.
 *
 * Each level is drawn in its own colour — the same colour that level's share of
 * the blueprint's bar is drawn in, so a question and the bar it was written to
 * fill are read as the same thing.
 *
 * Never shown to a student. The server leaves the level out of their copy of
 * the paper altogether — see toStudentAssessment.
 */
export default function LevelChip({ level }) {
  const known = levelByKey(level);

  // A question written before the generator named levels, or labelled with a
  // word outside the taxonomy. Saying so is the point: an unlabelled question
  // is one the mix cannot account for, so this one is not drawn like a level.
  if (!known) return <Chip tone="outline">No level</Chip>;

  return (
    <Chip tone="level" level={known.key}>
      {known.label}
    </Chip>
  );
}
