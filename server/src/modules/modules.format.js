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
const NUMBERED_HEADING = /^\d+(?:\.\d+)+\s+\S/;
// Template part headings like "I. RATIONALE" / "IV. SYNTHESIS" — uppercase
// Roman numerals only, so lettered list items ("a." "i.") stay list items.
const ROMAN_HEADING = /^[IVX]{1,7}[.)]\s+[A-Z0-9("]/;
const TERMINAL_PUNCTUATION = /[.?!:;"”)\]]$/;
// "Syntax – the rules of the language" — a short term, a spaced dash, a
// definition. Becomes a term block rendered with the name emphasized.
const TERM_DEFINITION = /^([A-Za-z][\w ()/]{1,40}?)(?:\s*[–—]\s*|\s+-\s+)(.{3,})$/;

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

function parsePage(lines, furniture, page) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  let codeLines = [];
  let codeHoldsBlank = false;
  let term = null;
  // The last level-2 heading block and its source line, for re-joining
  // headings that wrap across adjacent lines.
  let headingRun = null;

  const plainLines = lines.map((line) => stripStyleMarkers(line));

  const contentIndexes = plainLines
    .map((line, index) => (line ? index : -1))
    .filter((index) => index >= 0);
  const firstContent = contentIndexes[0];
  const lastContent = contentIndexes[contentIndexes.length - 1];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" "), page });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list?.items.length) blocks.push(list);
    list = null;
  };
  const flushCode = () => {
    if (codeLines.length) {
      if (isDefinitelyCodeBlock(codeLines)) {
        blocks.push({ type: "code", text: reindentCode(codeLines), page });
      } else {
        // Not really a listing — return the lines to the prose flow.
        paragraph.push(...codeLines.filter(Boolean));
      }
      codeLines = [];
    }
    codeHoldsBlank = false;
  };
  const flushTerm = () => {
    if (term) {
      blocks.push({ type: "term", term: term.name, text: term.parts.join(" "), page });
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

    if (!plain) {
      // A blank inside a code sample is kept if more code follows.
      if (codeLines.length) {
        codeHoldsBlank = true;
        return;
      }
      flushParagraph();
      flushList();
      flushTerm();
      return;
    }
    if (PAGE_MARKER.test(plain)) return;
    if (BARE_NUMBER.test(plain) && (index === firstContent || index === lastContent)) return;
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
        list = { type: "list", ordered: false, items: [], page };
      }
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
      const block = { type: "heading", level: 2, text: title, page };
      blocks.push(block);
      if (rest && /\w/.test(rest)) {
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
      blocks.push({ type: "heading", level: 3, text: plain, page });
      return;
    }

    // Code outranks the ordered-list rule so "1. int x = 5;" style listings
    // stay code, while plain numbered steps stay lists.
    if (isCode) {
      flushAll();
      codeLines.push(plain);
      return;
    }

    if (ORDERED_ITEM.test(plain)) {
      flushParagraph();
      flushTerm();
      if (!list || !list.ordered) {
        flushList();
        list = { type: "list", ordered: true, items: [], page };
      }
      const markedItem = line.replace(ORDERED_ITEM, "");
      list.items.push(markedItem !== line ? markedItem : plain.replace(ORDERED_ITEM, ""));
      return;
    }

    if (isAllCapsHeading(plain)) {
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
      const block = { type: "heading", level: 2, text: plain, page };
      blocks.push(block);
      headingRun = { block, lineIndex: index };
      return;
    }

    if (isLabelHeading(plain)) {
      flushAll();
      blocks.push({ type: "heading", level: 3, text: plain, page });
      return;
    }

    // "Syntax – the rules of the language" style definitions. Prefer the
    // marked line so the definition keeps italics.
    const definition = TERM_DEFINITION.exec(line) ?? TERM_DEFINITION.exec(plain);
    if (definition && !list) {
      flushParagraph();
      flushTerm();
      term = {
        name: stripStyleMarkers(definition[1]).trim(),
        parts: [definition[2].trim()]
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
      if (lastItem && !TERMINAL_PUNCTUATION.test(stripStyleMarkers(lastItem))) {
        list.items[list.items.length - 1] = `${lastItem} ${line}`;
        return;
      }
      flushList();
    }

    paragraph.push(line);
  });

  flushAll();
  return blocks;
}

// Concatenate pages, re-joining a paragraph the page break split in half.
function stitchPages(pageBlocks) {
  const blocks = [];

  for (const pageEntries of pageBlocks) {
    pageEntries.forEach((block, index) => {
      const previous = blocks[blocks.length - 1];
      if (
        index === 0 &&
        block.type === "paragraph" &&
        previous?.type === "paragraph" &&
        !TERMINAL_PUNCTUATION.test(stripStyleMarkers(previous.text))
      ) {
        previous.text += ` ${block.text}`;
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
      result.push({ type: "paragraph", text, page: block.page });
    }
  }

  return result;
}

export function buildLessonBlocks(pages) {
  const normalizedPages = pages.map((entry) => normalizeLines(entry.text));
  const furniture = findRepeatedLines(normalizedPages);
  const pageBlocks = normalizedPages.map((lines, index) =>
    parsePage(lines, furniture, pages[index].page)
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

/**
 * Interleaves extracted figures into the block stream, placing each page's
 * figures right after that page's last text block. Figures whose page has no
 * surviving block (e.g. a boilerplate cover page that was stripped) are
 * dropped, so cover-art and template imagery never leak into the lesson.
 *
 * Each figure is `{ fileId, page, width, height }`; the emitted block is
 * `{ type: "figure", page, fileId, width, height }`.
 */
export function insertFigureBlocks(blocks, figures) {
  if (!figures?.length) return blocks;

  const figuresByPage = new Map();
  for (const figure of figures) {
    if (!figuresByPage.has(figure.page)) figuresByPage.set(figure.page, []);
    figuresByPage.get(figure.page).push(figure);
  }

  // The index of the last block belonging to each page.
  const lastBlockOfPage = new Map();
  blocks.forEach((block, index) => {
    if (block.page != null) lastBlockOfPage.set(block.page, index);
  });

  const result = [];
  blocks.forEach((block, index) => {
    result.push(block);
    if (figuresByPage.has(block.page) && lastBlockOfPage.get(block.page) === index) {
      for (const figure of figuresByPage.get(block.page)) {
        result.push({
          type: "figure",
          page: block.page,
          fileId: figure.fileId,
          width: figure.width,
          height: figure.height
        });
      }
    }
  });
  return result;
}
