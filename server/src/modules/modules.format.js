import { ITALIC_CLOSE, ITALIC_OPEN, stripStyleMarkers } from "./modules.ocr.js";

/**
 * Heuristic lesson formatter: turns raw per-page PDF text into structured
 * blocks — headings, paragraphs, lists, code samples, and term definitions —
 * so the client can render a module like a lesson page instead of a wall of
 * text.
 *
 * The rules are tuned to the faculty lecture modules stored in LearningModule:
 *   - page markers ("3/22") and stray page numbers are dropped
 *   - running headers/footers (lines repeated on most pages) are dropped
 *   - ALL-CAPS lines become section headings, "1.2 Topic" lines subheadings
 *   - "•", "1.", "a)" lines become list items (wrapped lines are re-joined)
 *   - source-code and numeric lines group into code blocks, re-indented by
 *     brace depth; "Term – definition" lines become term blocks
 *   - consecutive wrapped lines merge into paragraphs, across pages too
 *   - boilerplate template sections repeated in every module (see
 *     BOILERPLATE_SECTIONS) are removed, heading and content alike
 *
 * Lines may carry inline italic markers from the extractor. Classification
 * always runs on the marker-stripped ("plain") text; paragraph, list, and
 * term content keeps the markers so the client can render the italics.
 * Headings, code, and section titles are emitted plain.
 */

const PAGE_MARKER = /^\d{1,3}\s*\/\s*\d{1,3}$/;
const BARE_NUMBER = /^\d{1,4}$/;
const BULLET_ITEM = /^[•●▪‣◦○*–—-]\s+/;
const ORDERED_ITEM = /^\(?(?:\d{1,2}|[a-z])[.)]\s+/i;
// The same marker when it is a number, so a run can say where it resumes and
// tell "4." continuing a run from "1." restarting one.
const ORDERED_NUMBER = /^\(?(\d{1,2})[.)]\s+/;

// A step's marker left alone on its line. The PDF extractor does this when the
// number and its text are far enough apart on the page to read as separate
// columns, and the run then came through as a paragraph with the numbers still
// inline — "1. Open the editor 2. Type the code" — instead of a list.
const LONE_ORDERED_MARKER = /^[(]?(?:[0-9]{1,2}|[a-z])[.)]$/i;
// Only glyphs that mean nothing else on their own. A lone dash or asterisk is
// as likely to be a separator or a stray, so those are left alone.
const LONE_BULLET_MARKER = /^[•●▪‣◦○]$/;

// "1. Introduction" heading a section, rather than "1. Open the editor"
// starting a list of steps.
const NUMBERED_TITLE = /^[0-9]{1,2}[.)]\s+(.+)$/;
const HEADING_TITLE_WORDS = 2;
const NUMBERED_HEADING = /^\d+(?:\.\d+)+\s+\S/;
// Template part headings like "I. RATIONALE" / "IV. SYNTHESIS" — uppercase
// Roman numerals only, so lettered list items ("a." "i.") stay list items.
const ROMAN_HEADING = /^[IVX]{1,7}[.)]\s+[A-Z0-9("]/;
const TERMINAL_PUNCTUATION = /[.?!:;"”)\]]$/;
// "Syntax – the rules of the language" — a short term, a spaced dash, a
// definition. Becomes a term block rendered with the name emphasized.
const TERM_DEFINITION = /^([A-Za-z][\w ()/]{1,40}?)(?:\s*[–—]\s*|\s+-\s+)(.{3,})$/;
// A definition's term is a name, not a clause. "A character can be any letter"
// and "with a backslash followed by a character" are sentence fragments that
// happened to sit either side of a dash; a term that needs a sentence to state
// it is not a term.
const TERM_NAME_WORDS = 3;

const WORDS_PER_MINUTE = 200;

// ── Code detection ──────────────────────────────────────
// Java-flavored (the modules are programming lectures) but generic enough:
// braces/semicolons, declarations, comments, method calls, numeric rows.
const CODE_STRONG_START = /^(import\b|package\b|public\b|private\b|protected\b|@\w)/;
const CODE_WEAK_START =
  /^(class|interface|enum|static|final|abstract|void|int|double|float|boolean|char|long|short|byte|String|if|else|for|while|switch|break|continue|return|try|catch|finally|new|this|super)\b/;
// Parens and quotes alone don't count — citations like "(Farrell, 2019)"
// appear constantly in prose. Real code brings braces/semicolons/operators.
const CODE_PUNCTUATION = /[;{}=<>[\]]/;
const CODE_COMMENT = /^(\/\/|\/\*|\*\/)/;
const METHOD_CALL = /\w\s*\.\s*\w+\s*\(/;
const NUMERIC_ROW = /^[-+*/=%.,()\d\s]+$/;

function looksLikeCode(line) {
  // Long prose sentences never count, even when they mention code.
  const wordCount = line.split(" ").length;
  if (wordCount > 10 && /[.?!]$/.test(line) && !/[;{}]$/.test(line)) return false;

  if (CODE_COMMENT.test(line)) return true;
  if (/[;{}]$/.test(line)) return true;
  if (CODE_STRONG_START.test(line)) return true;
  if (CODE_WEAK_START.test(line) && CODE_PUNCTUATION.test(line)) return true;
  if (METHOD_CALL.test(line)) return true;
  if (
    NUMERIC_ROW.test(line) &&
    /\d/.test(line) &&
    (/[+\-*/=%]/.test(line) || /\d\s+\d|\d{2,}/.test(line))
  ) {
    return true;
  }
  return false;
}

// Prose frequently quotes code inline ("public class First, you are
// defining…"). Short candidate blocks must prove they're actual code;
// otherwise they flow back into the paragraph.
const PROSE_TAIL = /[a-z]{2,}$/;
const STOPWORDS =
  /\b(the|a|an|is|are|was|were|you|we|it|of|that|this|these|to|in|on|for|with|which|when|while)\b/;

function isStrongCodeLine(line) {
  if (CODE_COMMENT.test(line)) return true;
  if (/[;{}]$/.test(line)) return true;
  if (CODE_STRONG_START.test(line) && !PROSE_TAIL.test(line)) return true;
  return METHOD_CALL.test(line) && !PROSE_TAIL.test(line);
}

function isDefinitelyCodeBlock(lines) {
  const content = lines.filter(Boolean);
  if (content.length >= 3) return true;

  return content.every((line) => {
    // A trailing comma means the sentence continues — an inline quote.
    if (/,$/.test(line)) return false;
    if (!isStrongCodeLine(line)) return false;
    if (/[={}]/.test(line)) return true;
    return !STOPWORDS.test(line);
  });
}

// Flat extracted lines get their nesting back from brace depth.
function reindentCode(lines) {
  let depth = 0;

  return lines
    .map((line) => {
      if (!line) return "";
      const opens = (line.match(/{/g) ?? []).length;
      const closes = (line.match(/}/g) ?? []).length;
      const dedentSelf = /^[}\]]/.test(line) ? 1 : 0;
      const level = Math.max(0, Math.min(depth - dedentSelf, 6));
      depth = Math.max(0, depth + opens - closes);
      return "  ".repeat(level) + line;
    })
    .join("\n");
}

// Template front-matter that appears in every module PDF — dropped from the
// lesson entirely (the section heading and everything under it).
const BOILERPLATE_SECTIONS = [
  "INSTRUCTIONAL MODULE AND ITS COMPONENTS",
  "DEVELOPER AND THEIR BACKGROUND",
  // The developer heading often wraps across two PDF lines, arriving as two
  // separate headings — match both halves so the whole part is dropped.
  "DEVELOPER AND THEIR",
  "BACKGROUND",
  "COURSE OUTLINE",
  "TITLE",
  "REFERENCES",
  // Per-course template variants (surveyed across all 59 PDF modules).
  "COURSE",
  "DESCRIPTION",
  "USERS",
  "THE USERS",
  "GILBERT G. GONZALES"
];

// Wording varies per course ("INSTRUCTIONAL MODULE IN FUNDAMENTALS OF
// BPO102", "COURSE TSM3 …", "INSTRUCTION TO THE USERS") — prefixes catch
// every variant.
const BOILERPLATE_PREFIXES = [
  "INSTRUCTIONAL MODULE",
  "COURSE ",
  "INSTRUCTION TO",
  "DEVELOPER AND",
  "THEIR BACKGROUND",
  "BACKGROUND GILBERT",
  "TITLE "
];

// Any template part mentioning an agreement ("VI. ASSIGNMENT / AGREEMENT",
// "LEARNING AGREEMENT", …) is boilerplate regardless of its exact wording.
const AGREEMENT_HEADING = /\bAGREEMENTS?\b/;

// The lesson's own test/evaluation parts ("V. EVALUATION", "POST-TEST",
// "PRE-TEST / DIAGNOSTIC", "SELF-ASSESSMENT", "QUIZ") — dropped like the other
// boilerplate. Graded work lives in the separate Assessment feature, so this
// scaffolding just clutters the reader. "UNIT TESTING"/"TEST CASES" stay: the
// TEST alternatives require the PRE-/POST- prefix.
const EVALUATION_HEADING = /\b(EVALUATION|POST[-\s]?TEST|PRE[-\s]?TEST|ASSESSMENT|QUIZ)\b/;

// Chapter number banners ("CHAPTER 1", "CHAPTER II", "CHAPTER #", "CHAPTER
// # 3") — dropped along with whatever sits under them until the next heading.
const CHAPTER_HEADING = /^CHAPTER\s*#?\s*(\d{1,3}|[IVXL]{1,7})?$/;

function isBoilerplateHeading(text) {
  // Template parts keep their roman marker ("VI. ASSIGNMENT / AGREEMENT") and
  // the numeral varies between modules, so match with the marker stripped.
  const normalized = text
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/^[IVX]{1,7}[.)]\s*/, "");
  return (
    AGREEMENT_HEADING.test(normalized) ||
    EVALUATION_HEADING.test(normalized) ||
    CHAPTER_HEADING.test(normalized) ||
    BOILERPLATE_SECTIONS.includes(normalized) ||
    BOILERPLATE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

// Drops each boilerplate section: from its level-2 heading up to (not
// including) the next level-2 heading.
function stripBoilerplateSections(blocks) {
  const result = [];
  let skipping = false;

  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      skipping = isBoilerplateHeading(block.text);
    }
    if (!skipping) result.push(block);
  }

  return result;
}

function normalizeLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());
}

function isAllCapsHeading(line) {
  if (line.length > 90) return false;
  // UPPER_SNAKE identifiers (code constants) and lines that end mid-sentence
  // are content, not headings.
  if (line.includes("_")) return false;
  if (/[,.;:]$/.test(line)) return false;
  const alpha = line.replace(/[^A-Za-z]/g, "");
  if (alpha.length < 3) return false;
  const upper = alpha.replace(/[^A-Z]/g, "").length;
  return upper / alpha.length >= 0.8;
}

function isLabelHeading(line) {
  return (
    line.length >= 8 &&
    line.length <= 60 &&
    /^[A-Z]/.test(line) &&
    /:$/.test(line) &&
    !line.includes("_") &&
    line.split(" ").length <= 6
  );
}

// "I. RATIONALE This chapter discusses…" — heading and body share the line
// in the PDF. The title is the numeral plus the run of ALL-CAPS words; the
// remainder flows back into the body text.
function splitRomanHeading(line) {
  const words = line.split(" ");
  const titleWords = [words[0]];
  let index = 1;

  while (index < words.length) {
    const word = words[index];
    const core = word.replace(/[.,:;]+$/, "");
    const isJoiner = /^[/&–—-]+$/.test(core);
    if (!isJoiner && (!/^[A-Z0-9/&-]+$/.test(core) || !/[A-Z]/.test(core))) break;
    titleWords.push(word);
    index++;
  }

  // Joiners ("/") with nothing after them belong to the body, not the title.
  while (titleWords.length > 1 && /^[/&–—-]+$/.test(titleWords[titleWords.length - 1])) {
    titleWords.pop();
    index--;
  }

  // A trailing single capital ("A.") is a list marker for the body, not part
  // of the title.
  if (titleWords.length > 2 && index < words.length) {
    const last = titleWords[titleWords.length - 1];
    if (/^[A-Z][.)]?$/.test(last)) {
      titleWords.pop();
      index--;
    }
  }

  return { title: titleWords.join(" "), rest: words.slice(index).join(" ") };
}

// Lines that repeat on at least half the pages are running headers/footers.
function findRepeatedLines(normalizedPages) {
  const furniture = new Set();
  if (normalizedPages.length < 4) return furniture;

  const pageCounts = new Map();
  for (const lines of normalizedPages) {
    const plainLines = lines
      .map((entry) => stripStyleMarkers(entry))
      .filter((entry) => entry && entry.length <= 100);
    for (const line of new Set(plainLines)) {
      pageCounts.set(line, (pageCounts.get(line) ?? 0) + 1);
    }
  }

  const threshold = Math.ceil(normalizedPages.length / 2);
  for (const [line, count] of pageCounts) {
    if (count >= threshold) furniture.add(line);
  }
  return furniture;
}

/**
 * Rejoins a marker the extractor left stranded on its own line.
 *
 * These modules lay numbered steps out with the marker in its own narrow
 * column, and the extractor reads that as a line of its own. Every rule below
 * reads a marker at the START of a line, so a stranded one matched nothing:
 * the numbers stayed as text and the steps ran together into one paragraph.
 *
 * The line's vertical position follows the marker, which is where the step
 * actually begins on the page.
 */
function joinLooseMarkers(lines, tops) {
  const outLines = [];
  const outTops = [];

  for (let index = 0; index < lines.length; index += 1) {
    const plain = stripStyleMarkers(lines[index]).trim();
    const lone = LONE_ORDERED_MARKER.test(plain) || LONE_BULLET_MARKER.test(plain);

    if (lone) {
      let next = index + 1;
      while (next < lines.length && !stripStyleMarkers(lines[next]).trim()) next += 1;
      const nextPlain = next < lines.length ? stripStyleMarkers(lines[next]).trim() : "";

      // An objectives list running "c) ... d)" with nothing after the d is a
      // marker the author left empty. Joining it to whatever came next ate the
      // template heading below it — "d)" plus "III. CONTENT" became a list
      // item, and the module lost that section from its rail. A marker with a
      // heading under it has no content of its own, so it goes.
      if (ROMAN_HEADING.test(nextPlain) || NUMBERED_HEADING.test(nextPlain)) continue;

      if (nextPlain) {
        outLines.push(plain + ' ' + lines[next]);
        outTops.push(tops[index] ?? tops[next] ?? null);
        index = next;
        continue;
      }
    }

    outLines.push(lines[index]);
    outTops.push(tops[index] ?? null);
  }

  return { lines: outLines, tops: outTops };
}

/**
 * Whether "1. Something" is a section title rather than the first of a list.
 *
 * The two are written identically, so the line alone cannot answer it. What
 * separates them is what comes next: a list's next line is its next step, and
 * a heading's next line is the body it introduces. A title is also short and
 * unpunctuated, which is what keeps a genuine one-line step — "1. Compile" —
 * followed by prose from being read as a heading too eagerly.
 */
function isNumberedHeading(plain, nextPlain) {
  const match = NUMBERED_TITLE.exec(plain);
  if (!match) return false;

  const title = match[1].trim();
  if (title.split(' ').length > HEADING_TITLE_WORDS) return false;
  if (!/^[A-Z]/.test(title)) return false;
  if (TERMINAL_PUNCTUATION.test(title)) return false;

  return Boolean(nextPlain) && !ORDERED_ITEM.test(nextPlain);
}

function parsePage(lines, furniture, page, lineTops = []) {
  ({ lines, tops: lineTops } = joinLooseMarkers(lines, lineTops));

  const blocks = [];
  let paragraph = [];
  // The normalized top of a paragraph/code run's first line, carried onto the
  // block when it flushes (list/term keep theirs on the accumulator object).
  let paragraphTop = null;
  let list = null;
  let codeLines = [];
  let codeTop = null;
  let codeHoldsBlank = false;
  let term = null;
  // The last level-2 heading block and its source line, for re-joining
  // headings that wrap across adjacent lines.
  let headingRun = null;

  const plainLines = lines.map((line) => stripStyleMarkers(line));
  const topAt = (index) => lineTops[index] ?? null;

  // The next line with anything on it, which is what tells a numbered heading
  // from the first step of a numbered list.
  const nextContentPlain = (index) => {
    for (let next = index + 1; next < plainLines.length; next += 1) {
      if (plainLines[next]) return plainLines[next];
    }
    return null;
  };

  const contentIndexes = plainLines
    .map((line, index) => (line ? index : -1))
    .filter((index) => index >= 0);
  const firstContent = contentIndexes[0];
  const lastContent = contentIndexes[contentIndexes.length - 1];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" "), page, top: paragraphTop });
      paragraph = [];
      paragraphTop = null;
    }
  };
  const flushList = () => {
    if (list?.items.length) {
      delete list.paused;
      delete list.lastNumber;
      blocks.push(list);
    }
    list = null;
  };
  const flushCode = () => {
    if (codeLines.length) {
      if (isDefinitelyCodeBlock(codeLines)) {
        blocks.push({ type: "code", text: reindentCode(codeLines), page, top: codeTop });
      } else {
        // Not really a listing — return the lines to the prose flow.
        if (!paragraph.length) paragraphTop = codeTop;
        paragraph.push(...codeLines.filter(Boolean));
      }
      codeLines = [];
      codeTop = null;
    }
    codeHoldsBlank = false;
  };
  const flushTerm = () => {
    if (term) {
      blocks.push({ type: "term", term: term.name, text: term.parts.join(" "), page, top: term.top });
      term = null;
    }
  };
  const flushAll = () => {
    // Code first: a demoted block joins the paragraph before it flushes.
    flushCode();
    flushParagraph();
    flushList();
    flushTerm();
  };

  lines.forEach((line, index) => {
    // Tests and structural output use the plain text; paragraph/list/term
    // content keeps the marked line so italics survive.
    const plain = plainLines[index];
    const top = topAt(index);

    if (!plain) {
      // A blank inside a code sample is kept if more code follows.
      if (codeLines.length) {
        codeHoldsBlank = true;
        return;
      }
      flushParagraph();
      // A blank line between steps pauses the run rather than ending it.
      // Closing it here split every spaced-out list in these modules into one
      // block per step, and the reader draws each block as its own <ol> — so
      // "1. 2. 3." came out as "1. 1. 1.". What actually ends a run is the
      // next line of ordinary text, which is handled where that line arrives.
      if (list) list.paused = true;
      flushTerm();
      return;
    }
    if (PAGE_MARKER.test(plain)) return;
    // A line that is only digits is furniture wherever it falls — a page number,
    // a figure index, a leftover from a two-column reflow. It used to be
    // dropped only at the top and bottom of a page, so one anywhere else was
    // published into the lesson as a paragraph reading \"7\", or swept into the
    // middle of the paragraph beside it.
    if (BARE_NUMBER.test(plain)) return;
    if (furniture.has(plain)) return;

    const isCode = looksLikeCode(plain);

    // Grow an open code block, keeping intentional blank separators.
    if (codeLines.length) {
      if (isCode) {
        if (codeHoldsBlank) {
          codeLines.push("");
          codeHoldsBlank = false;
        }
        codeLines.push(plain);
        return;
      }
      flushCode();
    }

    if (BULLET_ITEM.test(plain)) {
      flushParagraph();
      flushTerm();
      if (!list || list.ordered) {
        flushList();
        list = { type: "list", ordered: false, items: [], page, top };
      }
      list.paused = false;
      // Strip the marker prefix from the marked line when possible so the
      // item keeps its italics; fall back to the plain line.
      const markedItem = line.replace(BULLET_ITEM, "");
      list.items.push(markedItem !== line ? markedItem : plain.replace(BULLET_ITEM, ""));
      return;
    }

    // Roman template parts outrank the ordered-list rule, otherwise
    // "I. RATIONALE" is mistaken for list item "I.".
    if (ROMAN_HEADING.test(plain)) {
      flushAll();
      const { title, rest } = splitRomanHeading(plain);
      const block = { type: "heading", level: 2, text: title, page, top };
      blocks.push(block);
      if (rest && /\w/.test(rest)) {
        if (!paragraph.length) paragraphTop = top;
        paragraph.push(rest);
      } else if (rest) {
        // A dangling joiner ("IV. SYNTHESIS /") — the heading definitely
        // continues on the next line.
        headingRun = { block, lineIndex: index, joiner: " / ", always: true };
      } else {
        headingRun = { block, lineIndex: index, roman: true };
      }
      return;
    }

    if (NUMBERED_HEADING.test(plain) && plain.length <= 90) {
      flushAll();
      blocks.push({ type: "heading", level: 3, text: plain, page, top });
      return;
    }

    // Code outranks the ordered-list rule so "1. int x = 5;" style listings
    // stay code, while plain numbered steps stay lists.
    if (isCode) {
      flushAll();
      codeTop = top;
      codeLines.push(plain);
      return;
    }

    // A numbered section title, not the first step of a list. This used to
    // fall through to the rule below, which made "1. Introduction" a list item
    // and then swallowed the paragraph under it as that item's continuation
    // — so a whole section came out as one numbered line.
    if (isNumberedHeading(plain, nextContentPlain(index))) {
      flushAll();
      blocks.push({ type: "heading", level: 3, text: plain, page, top });
      return;
    }

    if (ORDERED_ITEM.test(plain)) {
      flushParagraph();
      flushTerm();
      const number = Number(ORDERED_NUMBER.exec(plain)?.[1]) || null;
      // A number that does not go forward is a second run, not a continuation
      // of the one before it — two "1." items belong to two lists however
      // little text sits between them.
      const restarts =
        list?.ordered && number != null && list.lastNumber != null && number <= list.lastNumber;

      if (!list || !list.ordered || restarts) {
        flushList();
        list = { type: "list", ordered: true, items: [], page, top };
        // Where the reader has to start counting. Left off a run beginning at
        // one, which is the <ol> default and the overwhelming majority.
        if (number != null && number > 1) list.start = number;
      }
      list.paused = false;
      list.lastNumber = number;
      const markedItem = line.replace(ORDERED_ITEM, "");
      list.items.push(markedItem !== line ? markedItem : plain.replace(ORDERED_ITEM, ""));
      return;
    }

    if (isAllCapsHeading(plain)) {
      // First: is this the open list item wrapping rather than a new heading?
      // These modules label their template parts "A. PREPARATORY ACTIVITIES"
      // and the PDF breaks that over two lines, so "ACTIVITIES" arrived on its
      // own and was read as a heading — which tore the label in half, left
      // "PREPARATORY" as a one-item list, and put a section called
      // "ACTIVITIES" in the rail for every half of every label.
      //
      // Only an ALL-CAPS item can be continued this way. A mixed-case item
      // followed by an ALL-CAPS line is a list that has ended and a heading
      // that has started, which is the far commoner shape.
      const openItem = list?.items[list.items.length - 1];
      const openPlain = openItem ? stripStyleMarkers(openItem) : "";
      if (
        list &&
        !list.paused &&
        openPlain &&
        isAllCapsHeading(openPlain) &&
        !TERMINAL_PUNCTUATION.test(openPlain)
      ) {
        list.items[list.items.length - 1] = openItem + " " + line;
        return;
      }

      flushAll();
      // Headings wrap across PDF lines ("LEARNING" / "OBJECTIVES (GUIDE)",
      // "INSTRUCTION TO THE" / "USERS") — an ALL-CAPS line directly under a
      // heading line continues it when the first part reads incomplete (a
      // dangling joiner, a single word, or a "(...)" fragment follows).
      // Chapter banners stay standalone so their removal rule keeps matching.
      if (
        headingRun &&
        headingRun.lineIndex === index - 1 &&
        !/^CHAPTER\b/i.test(headingRun.block.text)
      ) {
        const previous = headingRun.block.text;
        // "LEARNING" is a dangling modifier; whole words like "CONTENT" are
        // complete — Roman template parts only continue on a clear signal.
        const endsIncomplete = /\b(AND|OF|TO|THE|IN|FOR|WITH|&|LEARNING)$/.test(previous);
        const continues =
          headingRun.always ||
          plain.startsWith("(") ||
          endsIncomplete ||
          (!headingRun.roman && previous.split(" ").length === 1);
        if (continues) {
          headingRun.block.text = previous + (headingRun.joiner ?? " ") + plain;
          headingRun.lineIndex = index;
          headingRun.always = false;
          headingRun.joiner = undefined;
          return;
        }
      }
      const block = { type: "heading", level: 2, text: plain, page, top };
      blocks.push(block);
      headingRun = { block, lineIndex: index };
      return;
    }

    if (isLabelHeading(plain)) {
      flushAll();
      blocks.push({ type: "heading", level: 3, text: plain, page, top });
      return;
    }

    // "Syntax – the rules of the language" style definitions. Prefer the
    // marked line so the definition keeps italics.
    // A figure's caption stands alone. Left in the paragraph flow it merged
    // with the prose around it, and the picture then had nothing short enough
    // to be recognised as a caption to anchor to — so it fell back to raw
    // position, which is exactly what the caption rule exists to avoid.
    if (isFigureCaption(plain)) {
      flushAll();
      blocks.push({ type: "paragraph", text: line, page, top });
      return;
    }

    // A definition begins a block. It never interrupts one.
    //
    // The rule below matches "something — something else", which in a lecture
    // PDF is nearly always an em-dash aside inside a running sentence rather
    // than a definition: "there is only one alternative — the true alternative"
    // was being drawn as a callout card titled "one alternative". All 42 of
    // these callouts across the CC2 modules were fragments of that kind, and
    // none of them was a definition.
    //
    // Requiring the paragraph to be empty is what separates the two: a real
    // definition follows a heading or a blank line. The cost is a definition
    // written directly under a finished sentence, which now reads as prose.
    const definition = TERM_DEFINITION.exec(line) ?? TERM_DEFINITION.exec(plain);
    const termName = definition ? stripStyleMarkers(definition[1]).trim() : "";
    if (
      definition &&
      !list &&
      !paragraph.length &&
      termName.split(" ").length <= TERM_NAME_WORDS
    ) {
      flushParagraph();
      flushTerm();
      term = {
        name: stripStyleMarkers(definition[1]).trim(),
        parts: [definition[2].trim()],
        top
      };
      return;
    }

    // Wrapped continuations: first an open definition, then list items.
    if (term) {
      const tail = stripStyleMarkers(term.parts[term.parts.length - 1]);
      if (!TERMINAL_PUNCTUATION.test(tail)) {
        term.parts.push(line);
        return;
      }
      flushTerm();
    }

    if (list) {
      const lastItem = list.items[list.items.length - 1];
      // Only text on the very next line is the same step wrapping. Once a
      // blank has gone by, this is the prose after the run.
      //
      // An ALL-CAPS item is a label, and a label ends where its capitals do:
      // "B. DEVELOPMENTAL ACTIVITIES" is finished, and the sentence starting
      // the section under it is not more of the label.
      const lastPlain = lastItem ? stripStyleMarkers(lastItem) : "";
      if (
        !list.paused &&
        lastPlain &&
        !isAllCapsHeading(lastPlain) &&
        !TERMINAL_PUNCTUATION.test(lastPlain)
      ) {
        list.items[list.items.length - 1] = `${lastItem} ${line}`;
        return;
      }
      flushList();
    }

    if (!paragraph.length) paragraphTop = top;
    paragraph.push(line);
  });

  flushAll();
  return blocks;
}

/**
 * Concatenates the pages, re-joining what the page break cut in half.
 *
 * Three things can be split by a page ending: a paragraph, a list item, and a
 * list. Only the first was being repaired, so a bullet whose sentence carried
 * on over the page came out as an item, then a stray paragraph, then a second
 * list — one point of the module drawn as three unrelated things.
 */
function stitchPages(pageBlocks) {
  const blocks = [];

  for (const pageEntries of pageBlocks) {
    // How many of this page's leading blocks have been handed back to the
    // page before it. A seam can return the tail of one interrupted thing and
    // then the rest of the run it belonged to — two blocks, no more.
    //
    // An earlier version allowed this for as long as nothing had been pushed,
    // which let a whole page be absorbed one block at a time: the text was
    // kept but re-tagged to the previous page, and a figure whose page then
    // held no blocks was dropped on the floor.
    let handedBack = 0;

    pageEntries.forEach((block, index) => {
      const previous = blocks[blocks.length - 1];
      const continues = index === handedBack && handedBack < 2 && previous;

      // A paragraph the break split.
      //
      // A caption takes no part in this, in either direction. It must not
      // swallow the prose that follows it, and it must not be swallowed by the
      // prose before it: a caption is frequently the last thing on its page,
      // and absorbing it left that page with no blocks at all — which is how
      // insertFigureBlocks decides a figure has nowhere to go and drops it.
      // That is what deleted the Debugging Process diagram from lesson 1.
      if (
        continues &&
        block.type === "paragraph" &&
        previous.type === "paragraph" &&
        !isFigureCaption(stripStyleMarkers(block.text)) &&
        !isFigureCaption(stripStyleMarkers(previous.text)) &&
        !TERMINAL_PUNCTUATION.test(stripStyleMarkers(previous.text))
      ) {
        previous.text += ` ${block.text}`;
        handedBack += 1;
        return;
      }

      // A list item the break split. The list closed with the page, so the
      // item's rest arrived as the first paragraph of the next one.
      if (continues && block.type === "paragraph" && previous.type === "list") {
        const tail = stripStyleMarkers(previous.items[previous.items.length - 1] ?? "");
        if (tail && !TERMINAL_PUNCTUATION.test(tail)) {
          previous.items[previous.items.length - 1] += ` ${block.text}`;
          handedBack += 1;
          return;
        }
      }

      // A run of bullets the break split. Numbered runs are left alone: one
      // that resumes says so through `start`, and one that restarts at 1 is a
      // second run that must not be folded into the first.
      if (
        continues &&
        block.type === "list" &&
        previous.type === "list" &&
        !block.ordered &&
        !previous.ordered
      ) {
        previous.items.push(...block.items);
        handedBack += 1;
        return;
      }

      blocks.push(block);
    });
  }

  return blocks;
}

// ── Long-paragraph splitting ────────────────────────────
// Re-joining wrapped lines (and stitching across pages) can produce paragraph
// walls hundreds of words long. Split those at sentence boundaries into
// chunks a reader can breathe between.
const PARAGRAPH_SPLIT_THRESHOLD = 500; // plain chars before a split kicks in
const PARAGRAPH_CHUNK_TARGET = 320; // aimed-for plain chars per chunk

// A sentence ends with .?! (optionally a closing quote/paren and an italic
// marker) followed by whitespace and a capital/number starting the next one.
const SENTENCE_BOUNDARY = new RegExp(
  `(?<=[.?!]["”)\\]]?[${ITALIC_OPEN}${ITALIC_CLOSE}]?)\\s+` +
    `(?=[${ITALIC_OPEN}]?["“(]?[A-Z0-9])`
);

// An italic run that spans a chunk seam is closed at the seam and reopened in
// the next chunk, so every chunk carries balanced markers.
function balanceItalics(chunks) {
  let open = false;
  return chunks.map((chunk) => {
    let text = open ? ITALIC_OPEN + chunk : chunk;
    for (const character of text) {
      if (character === ITALIC_OPEN) open = true;
      else if (character === ITALIC_CLOSE) open = false;
    }
    if (open) text += ITALIC_CLOSE;
    return text;
  });
}

function splitLongParagraphs(blocks) {
  const result = [];

  for (const block of blocks) {
    if (
      block.type !== "paragraph" ||
      stripStyleMarkers(block.text).length <= PARAGRAPH_SPLIT_THRESHOLD
    ) {
      result.push(block);
      continue;
    }

    const sentences = block.text.split(SENTENCE_BOUNDARY);
    if (sentences.length < 2) {
      result.push(block);
      continue;
    }

    const chunks = [];
    let current = "";
    for (const sentence of sentences) {
      const wouldBe = current ? `${current} ${sentence}` : sentence;
      if (current && stripStyleMarkers(wouldBe).length > PARAGRAPH_CHUNK_TARGET) {
        chunks.push(current);
        current = sentence;
      } else {
        current = wouldBe;
      }
    }
    if (current) chunks.push(current);

    for (const text of balanceItalics(chunks)) {
      result.push({ type: "paragraph", text, page: block.page, top: block.top });
    }
  }

  return result;
}

export function buildLessonBlocks(pages) {
  const normalizedPages = pages.map((entry) => normalizeLines(entry.text));
  const furniture = findRepeatedLines(normalizedPages);
  const pageBlocks = normalizedPages.map((lines, index) =>
    parsePage(lines, furniture, pages[index].page, pages[index].lineTops ?? [])
  );
  return stripBoilerplateSections(splitLongParagraphs(stitchPages(pageBlocks)));
}

/**
 * Splits the block list into sections at every level-2 heading (the template
 * parts: "CHAPTER 1", "I. RATIONALE", "III. CONTENT", "ACTIVITIES", …).
 * Content before the first heading becomes a "Module Overview" section.
 *
 * Sections are index ranges into `blocks` (`end` exclusive) so the text is
 * never duplicated: { id, title, page, start, end }.
 */
export function buildSections(blocks) {
  if (!blocks.length) return [];

  const starts = [];
  blocks.forEach((block, index) => {
    if (block.type === "heading" && block.level === 2) {
      starts.push({ title: block.text, page: block.page, start: index });
    }
  });

  if (!starts.length) {
    return [
      {
        id: "s1",
        title: "Full module",
        page: blocks[0].page,
        start: 0,
        end: blocks.length
      }
    ];
  }

  // Content before the first heading is usually page-header residue ("Week 1
  // Fundamentals of … 1"), not an overview — only keep it as a section when
  // there's real substance.
  const frontBlocks = blocks.slice(0, starts[0].start);
  const frontText = stripStyleMarkers(
    frontBlocks
      .map((block) => (block.type === "list" ? block.items.join(" ") : block.text))
      .join(" ")
  );
  const keepFront = frontBlocks.length > 2 || frontText.length >= 200;

  const entries =
    starts[0].start > 0 && keepFront
      ? [{ title: "Module Overview", page: blocks[0].page, start: 0 }, ...starts]
      : starts;

  // Some headings split across non-adjacent lines survive as two sections —
  // re-join the known template pairs.
  const joined = [];
  for (const entry of entries) {
    const previous = joined[joined.length - 1];
    const title = entry.title.toUpperCase();
    if (previous) {
      const previousTitle = previous.title.toUpperCase();
      if (/\bSYNTHESIS\s*\/?\s*$/.test(previousTitle) && title.startsWith("GENERALIZATION")) {
        previous.title = `${previous.title.replace(/\s*\/\s*$/, "")} / GENERALIZATION`;
        continue;
      }
      if (/\bLEARNING$/.test(previousTitle) && title.startsWith("OBJECTIVES")) {
        previous.title += ` ${entry.title}`;
        continue;
      }
    }
    joined.push(entry);
  }

  return joined.map((entry, index) => ({
    id: `s${index + 1}`,
    title: entry.title,
    page: entry.page,
    start: entry.start,
    // Absorbed and skipped ranges flow into the preceding section.
    end: joined[index + 1]?.start ?? blocks.length
  }));
}

export function countReadingMinutes(blocks) {
  const words = stripStyleMarkers(
    blocks
      .map((block) => {
        if (block.type === "list") return block.items.join(" ");
        if (block.type === "term") return `${block.term} ${block.text}`;
        return block.text;
      })
      .join(" ")
  )
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// A figure's label in the running text — "Figure 3", "Fig. 2". These
// lecture modules label every diagram this way, so the block carrying the
// label is the text the picture belongs with: a far more reliable anchor than
// raw geometry, which the text reflow (merged paragraphs, out-of-order
// captions) makes noisy.
const FIGURE_REFERENCE = /\bfig(?:ure)?\.?\s*\d+\b/i;

// The same label at the very start of a short block — "Figure 4 Anatomy of
// a method". That is a caption, and a caption belongs under its picture.
const FIGURE_CAPTION = /^fig(?:ure)?\.?\s*\d+\b/i;
const CAPTION_MAX_LENGTH = 90;

/**
 * Whether a block is a picture's caption rather than prose that mentions it.
 *
 * The two want opposite placements and were being treated as one thing: any
 * block containing "Figure 4" was read as a caption, so the picture was
 * pushed above it. That is right for a caption and wrong for a sentence
 * introducing the diagram, which then ended up printed underneath the thing
 * it was leading the reader into.
 *
 * A caption opens with the label and is short. A paragraph that opens with the
 * label and runs on for a hundred characters is a sentence about the figure,
 * not a caption for it — the length is what separates them, and it is a
 * judgement rather than a certainty.
 */
function isFigureCaption(text) {
  return FIGURE_CAPTION.test(text) && text.length <= CAPTION_MAX_LENGTH;
}

function blockPlainText(block) {
  if (block.type === "list") return stripStyleMarkers(block.items.join(" "));
  if (block.type === "term") return stripStyleMarkers(`${block.term} ${block.text}`);
  return stripStyleMarkers(block.text ?? "");
}

/**
 * Interleaves extracted figures into the block stream so each picture sits with
 * the text that explains it. For every figure, on its own page:
 *   1. Caption (preferred): a short block opening "Figure N" is that picture's
 *      caption — nearest by vertical position when known — and the image goes
 *      right before it, so the caption reads under its image.
 *   2. Mention: prose carrying "Figure N" anywhere is introducing the picture,
 *      so the image goes after that block rather than above it.
 *   3. Geometry fallback: when the page names no figure at all, place it after
 *      the last text block above it (by normalized `top`); a figure above all
 *      of them leads the page.
 * Figures whose page has no surviving block (e.g. a stripped boilerplate cover
 * page) are dropped, so cover-art and template imagery never leak in.
 *
 * Each figure is `{ fileId, page, width, height, top }`; the emitted block is
 * `{ type: "figure", page, fileId, width, height }`.
 */
export function insertFigureBlocks(blocks, figures) {
  if (!figures?.length) return blocks;

  const figuresByPage = new Map();
  for (const figure of figures) {
    if (!figuresByPage.has(figure.page)) figuresByPage.set(figure.page, []);
    figuresByPage.get(figure.page).push(figure);
  }

  // Block indexes for each page, in reading (top-to-bottom) order.
  const pageBlockIndexes = new Map();
  blocks.forEach((block, index) => {
    if (block.page == null) return;
    if (!pageBlockIndexes.has(block.page)) pageBlockIndexes.set(block.page, []);
    pageBlockIndexes.get(block.page).push(index);
  });

  // Where each figure goes: before a block (its caption), after a block
  // (geometry), or leading its page.
  const beforeBlock = new Map();
  const afterBlock = new Map();
  const leadPage = new Map();
  const pushTo = (map, key, figure) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(figure);
  };

  for (const [page, pageFigures] of figuresByPage) {
    const indexes = pageBlockIndexes.get(page);
    if (!indexes?.length) continue; // page dropped -> its figures go too

    const hasTops = indexes.some((index) => blocks[index].top != null);
    const texts = new Map(indexes.map((index) => [index, blockPlainText(blocks[index])]));
    const captions = indexes.filter((index) => isFigureCaption(texts.get(index)));
    const mentions = indexes.filter(
      (index) =>
        !isFigureCaption(texts.get(index)) && FIGURE_REFERENCE.test(texts.get(index))
    );
    const used = new Set();
    const figuresSorted = [...pageFigures].sort((a, b) => (a.top ?? 1) - (b.top ?? 1));

    // Of the blocks still unclaimed, the one sitting closest to this picture.
    const nearest = (candidates, figure) => {
      const free = candidates.filter((index) => !used.has(index));
      if (!free.length) return null;
      if (hasTops && figure.top != null) {
        free.sort(
          (a, b) =>
            Math.abs((blocks[a].top ?? 1) - figure.top) -
            Math.abs((blocks[b].top ?? 1) - figure.top)
        );
      }
      return free[0];
    };

    for (const figure of figuresSorted) {
      // 1) A caption claims the picture, and sits under it.
      const captionIndex = nearest(captions, figure);
      if (captionIndex != null) {
        used.add(captionIndex);
        pushTo(beforeBlock, captionIndex, figure);
        continue;
      }

      // 2) Otherwise the text naming the figure is introducing it, so the
      //    picture follows rather than interrupting.
      const mentionIndex = nearest(mentions, figure);
      if (mentionIndex != null) {
        used.add(mentionIndex);
        pushTo(afterBlock, mentionIndex, figure);
        continue;
      }

      // 3) Geometry fallback: after the last block above the figure; above all
      //    of them (or no positions at all) it leads / trails the page.
      let anchor = null;
      if (hasTops && figure.top != null) {
        for (const index of indexes) {
          const blockTop = blocks[index].top;
          if (blockTop != null && blockTop <= figure.top) anchor = index;
        }
      } else {
        anchor = indexes[indexes.length - 1];
      }
      if (anchor == null) pushTo(leadPage, page, figure);
      else pushTo(afterBlock, anchor, figure);
    }
  }

  const toFigureBlock = (figure) => ({
    type: "figure",
    page: figure.page,
    fileId: figure.fileId,
    width: figure.width,
    height: figure.height
  });

  // The first block index of each page, so leading figures emit before it.
  const pageFirstIndexes = new Set();
  for (const indexes of pageBlockIndexes.values()) pageFirstIndexes.add(indexes[0]);

  const result = [];
  blocks.forEach((block, index) => {
    if (pageFirstIndexes.has(index) && leadPage.has(block.page)) {
      for (const figure of leadPage.get(block.page)) result.push(toFigureBlock(figure));
    }
    if (beforeBlock.has(index)) {
      for (const figure of beforeBlock.get(index)) result.push(toFigureBlock(figure));
    }
    result.push(block);
    if (afterBlock.has(index)) {
      for (const figure of afterBlock.get(index)) result.push(toFigureBlock(figure));
    }
  });
  return result;
}
