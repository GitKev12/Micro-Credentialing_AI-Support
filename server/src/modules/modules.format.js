/**
 * Heuristic lesson formatter: turns raw per-page PDF text into structured
 * blocks — headings, paragraphs, and lists — so the client can render a
 * module like a lesson page instead of a wall of text.
 *
 * The rules are tuned to the faculty lecture modules stored in LearningModule:
 *   - page markers ("3/22") and stray page numbers are dropped
 *   - running headers/footers (lines repeated on most pages) are dropped
 *   - ALL-CAPS lines become section headings, "1.2 Topic" lines subheadings
 *   - "•", "1.", "a)" lines become list items (wrapped lines are re-joined)
 *   - consecutive wrapped lines merge into paragraphs, across pages too
 */

const PAGE_MARKER = /^\d{1,3}\s*\/\s*\d{1,3}$/;
const BARE_NUMBER = /^\d{1,4}$/;
const BULLET_ITEM = /^[•●▪‣◦○*–—-]\s+/;
const ORDERED_ITEM = /^\(?(?:\d{1,2}|[a-z])[.)]\s+/i;
const NUMBERED_HEADING = /^\d+(?:\.\d+)+\s+\S/;
const TERMINAL_PUNCTUATION = /[.?!:;"”)\]]$/;

const WORDS_PER_MINUTE = 200;

function normalizeLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());
}

function isAllCapsHeading(line) {
  if (line.length > 90) return false;
  const alpha = line.replace(/[^A-Za-z]/g, "");
  if (alpha.length < 3) return false;
  const upper = alpha.replace(/[^A-Z]/g, "").length;
  return upper / alpha.length >= 0.8;
}

function isLabelHeading(line) {
  return (
    line.length >= 8 &&
    line.length <= 60 &&
    /:$/.test(line) &&
    line.split(" ").length <= 6
  );
}

// Lines that repeat on at least half the pages are running headers/footers.
function findRepeatedLines(normalizedPages) {
  const furniture = new Set();
  if (normalizedPages.length < 4) return furniture;

  const pageCounts = new Map();
  for (const lines of normalizedPages) {
    for (const line of new Set(lines.filter((entry) => entry && entry.length <= 100))) {
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

  const contentIndexes = lines
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

  lines.forEach((line, index) => {
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }
    if (PAGE_MARKER.test(line)) return;
    if (BARE_NUMBER.test(line) && (index === firstContent || index === lastContent)) return;
    if (furniture.has(line)) return;

    if (BULLET_ITEM.test(line)) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { type: "list", ordered: false, items: [], page };
      }
      list.items.push(line.replace(BULLET_ITEM, ""));
      return;
    }

    if (NUMBERED_HEADING.test(line) && line.length <= 90) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: 3, text: line, page });
      return;
    }

    if (ORDERED_ITEM.test(line)) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { type: "list", ordered: true, items: [], page };
      }
      list.items.push(line.replace(ORDERED_ITEM, ""));
      return;
    }

    if (isAllCapsHeading(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: 2, text: line, page });
      return;
    }

    if (isLabelHeading(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: 3, text: line, page });
      return;
    }

    // A wrapped list item continues until its sentence finishes.
    if (list) {
      const lastItem = list.items[list.items.length - 1];
      if (lastItem && !TERMINAL_PUNCTUATION.test(lastItem)) {
        list.items[list.items.length - 1] = `${lastItem} ${line}`;
        return;
      }
      flushList();
    }

    paragraph.push(line);
  });

  flushParagraph();
  flushList();
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
        !TERMINAL_PUNCTUATION.test(previous.text)
      ) {
        previous.text += ` ${block.text}`;
        return;
      }
      blocks.push(block);
    });
  }

  return blocks;
}

export function buildLessonBlocks(pages) {
  const normalizedPages = pages.map((entry) => normalizeLines(entry.text));
  const furniture = findRepeatedLines(normalizedPages);
  const pageBlocks = normalizedPages.map((lines, index) =>
    parsePage(lines, furniture, pages[index].page)
  );
  return stitchPages(pageBlocks);
}

export function countReadingMinutes(blocks) {
  const words = blocks
    .map((block) =>
      block.type === "list" ? block.items.join(" ") : block.text
    )
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
