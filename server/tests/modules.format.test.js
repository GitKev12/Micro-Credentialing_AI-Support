import { describe, it, expect } from "@jest/globals";
import { buildLessonBlocks, insertFigureBlocks } from "../src/modules/modules.format.js";

/**
 * What the lesson reader is handed for a module.
 *
 * These modules are lecture PDFs, so the text arrives already broken into
 * lines by the extractor and nothing about the original document's structure
 * survives except what can be read back out of those lines. Everything here
 * is a shape that came off a real module and was being read wrongly.
 */

const page = (text, number = 1, lineTops = []) => ({ page: number, text, lineTops });

const listBlocks = (blocks) => blocks.filter((block) => block.type === "list");
const kinds = (blocks) => blocks.map((block) => block.type);

describe("numbered steps", () => {
  /**
   * The reader draws an ordered list as a bare <ol>, so every list block it is
   * given starts counting at one again. A run of steps split into three blocks
   * is therefore drawn "1. 1. 1." however it was numbered in the module.
   */
  it("keeps steps spaced out in the PDF as one run", () => {
    const blocks = buildLessonBlocks([
      page("1. Open the editor.\n\n2. Type the program.\n\n3. Run it.")
    ]);

    const lists = listBlocks(blocks);
    expect(lists).toHaveLength(1);
    expect(lists[0].items).toEqual(["Open the editor.", "Type the program.", "Run it."]);
  });

  it("still ends the run when ordinary text follows it", () => {
    const blocks = buildLessonBlocks([
      page("1. Open the editor.\n\n2. Run it.\n\nThat is the whole cycle.")
    ]);

    expect(listBlocks(blocks)).toHaveLength(1);
    expect(blocks[blocks.length - 1]).toMatchObject({
      type: "paragraph",
      text: "That is the whole cycle."
    });
  });

  /**
   * A step whose sentence wrapped onto the next line is still that step. The
   * blank line is what separates one step from the next, so a continuation
   * must not be able to reach across one.
   */
  it("does not swallow the paragraph after a spaced-out run", () => {
    const blocks = buildLessonBlocks([
      page("1. Open the editor\n\nJava is a compiled language.")
    ]);

    expect(kinds(blocks)).toEqual(["list", "paragraph"]);
    expect(listBlocks(blocks)[0].items).toEqual(["Open the editor"]);
  });

  it("still joins a step that wrapped onto the very next line", () => {
    const blocks = buildLessonBlocks([
      page("1. Open the editor and\ncreate a new file.\n2. Run it.")
    ]);

    expect(listBlocks(blocks)[0].items).toEqual([
      "Open the editor and create a new file.",
      "Run it."
    ]);
  });

  /**
   * When a run does get split anyway — a page break, a figure between two
   * steps — the second half has to say where it resumes, or the reader starts
   * it at one.
   */
  it("says which number a run starts at", () => {
    const blocks = buildLessonBlocks([
      page("Steps 4 and 5 finish the job.\n\n4. Compile it.\n5. Run it.")
    ]);

    expect(listBlocks(blocks)[0].start).toBe(4);
  });

  it("says nothing about a run that starts at one", () => {
    const blocks = buildLessonBlocks([page("1. Compile it.\n2. Run it.")]);
    expect(listBlocks(blocks)[0].start).toBeUndefined();
  });
});

describe("where a figure lands", () => {
  const FIGURE = { fileId: "f1", page: 1, width: 400, height: 300, top: 0.5 };

  /**
   * A caption sits under its picture. These modules label every diagram
   * "Figure N ...", on its own short line.
   */
  it("puts the picture above its caption", () => {
    const blocks = [
      { type: "paragraph", text: "A method has four parts.", page: 1, top: 0.2 },
      { type: "paragraph", text: "Figure 4 Anatomy of a method", page: 1, top: 0.8 }
    ];

    expect(kinds(insertFigureBlocks(blocks, [FIGURE]))).toEqual([
      "paragraph",
      "figure",
      "paragraph"
    ]);
  });

  /**
   * Prose that mentions a figure is introducing it, not captioning it — the
   * picture belongs after the sentence that sends you to it. This was reading
   * any mention of "Figure 4" as a caption, which put the picture above the
   * explanation and left the text sitting under a diagram it had not reached.
   */
  it("puts the picture below the sentence that introduces it", () => {
    const blocks = [
      {
        type: "paragraph",
        text:
          "The parts of a method are easiest to see side by side. Figure 4 shows the " +
          "return type, the name, the parameter list and the body of one method, and " +
          "the order they have to be written in.",
        page: 1,
        top: 0.2
      }
    ];

    expect(kinds(insertFigureBlocks(blocks, [FIGURE]))).toEqual(["paragraph", "figure"]);
  });

  /** Both on one page: the caption claims the picture, the prose does not. */
  it("prefers a caption over a mention when the page has both", () => {
    const blocks = [
      { type: "paragraph", text: "As Figure 4 makes clear, order matters here.", page: 1, top: 0.1 },
      { type: "paragraph", text: "Figure 4 Anatomy of a method", page: 1, top: 0.9 }
    ];

    expect(kinds(insertFigureBlocks(blocks, [FIGURE]))).toEqual([
      "paragraph",
      "figure",
      "paragraph"
    ]);
  });
});

/**
 * Markers the extractor stranded on their own line.
 *
 * These modules set the number in its own narrow column, and the extractor
 * reads that as a separate line. Every rule in the formatter looks for a
 * marker at the start of a line, so a stranded one matched nothing.
 */
describe("a marker split from its step", () => {
  it("rejoins a number left on its own line", () => {
    const blocks = buildLessonBlocks([
      page("1.\nOpen the editor\n2.\nType the code\n3.\nRun it")
    ]);

    expect(kinds(blocks)).toEqual(["list"]);
    expect(listBlocks(blocks)[0].items).toEqual([
      "Open the editor",
      "Type the code",
      "Run it"
    ]);
  });

  it("rejoins a stranded bullet the same way", () => {
    const blocks = buildLessonBlocks([page("•\nFirst point\n•\nSecond point")]);

    const list = listBlocks(blocks)[0];
    expect(list.ordered).toBe(false);
    expect(list.items).toEqual(["First point", "Second point"]);
  });

  /** A lone dash is as likely to be a separator, so it is left where it is. */
  it("leaves an ambiguous glyph alone", () => {
    const blocks = buildLessonBlocks([page("-\nJava is a language.")]);
    expect(listBlocks(blocks)).toHaveLength(0);
  });
});

describe("a numbered section title", () => {
  /**
   * "1. Introduction" and "1. Open the editor" are written identically. The
   * title used to become a list item, and the paragraph under it was then
   * taken as that item wrapping — so a whole section came out as one numbered
   * line with its body folded inside.
   */
  it("is a heading, not the first step of a list", () => {
    const blocks = buildLessonBlocks([
      page("1. Introduction\nJava is a language.\n2. Variables\nA variable holds a value.")
    ]);

    expect(kinds(blocks)).toEqual(["heading", "paragraph", "heading", "paragraph"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 3, text: "1. Introduction" });
    expect(blocks[1].text).toBe("Java is a language.");
  });

  /** What tells them apart is that a step is followed by the next step. */
  it("stays a list when the next line is the next step", () => {
    const blocks = buildLessonBlocks([page("1. Introduction\n2. Variables\n3. Methods")]);

    expect(kinds(blocks)).toEqual(["list"]);
    expect(listBlocks(blocks)[0].items).toEqual(["Introduction", "Variables", "Methods"]);
  });

  /** A step long enough to read as an instruction is not a title. */
  it("leaves a written-out step as a step", () => {
    const blocks = buildLessonBlocks([
      page("1. Open the editor and start\n\nJava is a compiled language.")
    ]);

    expect(kinds(blocks)).toEqual(["list", "paragraph"]);
  });
});

describe("a line that is only a number", () => {
  /**
   * A page number, a figure index, a leftover from a two-column reflow — never
   * prose. It was dropped only at the top and bottom of a page, so one
   * anywhere else was published into the lesson.
   */
  it("is dropped wherever it falls on the page", () => {
    const blocks = buildLessonBlocks([
      page("Java is a language.\n\n7\n\nA variable holds a value.")
    ]);

    expect(kinds(blocks)).toEqual(["paragraph", "paragraph"]);
    expect(blocks.map((block) => block.text)).toEqual([
      "Java is a language.",
      "A variable holds a value."
    ]);
  });

  it("does not take the number out of the middle of a sentence", () => {
    const blocks = buildLessonBlocks([page("A byte holds 8 bits of data.")]);
    expect(blocks[0].text).toBe("A byte holds 8 bits of data.");
  });
});

/**
 * Shapes taken verbatim from the CC2 modules.
 *
 * Every one of these is a line sequence that came out of the real PDFs, so
 * what is asserted here is what a student actually sees on the page.
 */
describe("shapes from the real modules", () => {
  /**
   * These modules label their template parts "A. PREPARATORY ACTIVITIES", and
   * the PDF breaks that over two lines. "ACTIVITIES" arrived alone and was
   * read as an ALL-CAPS heading, so the label was torn in half: "PREPARATORY"
   * became a one-item list and "ACTIVITIES" a heading. Because sections split
   * at every level-2 heading, each half also put a section called "ACTIVITIES"
   * into the rail — two of them per module.
   */
  it("keeps a label the page break split over two lines", () => {
    const blocks = buildLessonBlocks([
      page(
        "III. CONTENT\nA. PREPARATORY\nACTIVITIES\nB. DEVELOPMENTAL\nACTIVITIES\n" +
          "The if and if…else Statements"
      )
    ]);

    expect(listBlocks(blocks)[0].items).toEqual([
      "PREPARATORY ACTIVITIES",
      "DEVELOPMENTAL ACTIVITIES"
    ]);
    expect(blocks.filter((b) => b.type === "heading" && b.text === "ACTIVITIES")).toHaveLength(0);
  });

  /** A list that has genuinely ended, followed by a real heading. */
  it("still lets an ALL-CAPS heading end a list", () => {
    const blocks = buildLessonBlocks([
      page("a) Describe loop structure\nb) Create for loops\nLEARNING OBJECTIVES\nSome prose.")
    ]);

    expect(listBlocks(blocks)[0].items).toEqual([
      "Describe loop structure",
      "Create for loops"
    ]);
    expect(blocks.some((b) => b.type === "heading" && b.text === "LEARNING OBJECTIVES")).toBe(true);
  });

  /**
   * A sentence that wrapped mid-line and happens to carry a dash is not a
   * definition. This was drawing the second half of a sentence as a callout in
   * the middle of the paragraph it belonged to.
   */
  it("does not turn the rest of a sentence into a definition", () => {
    const blocks = buildLessonBlocks([
      page(
        "As an object, a String variable name is\n" +
          "not a simple data type—it is a reference; that is, a\n" +
          "variable that holds a memory address."
      )
    ]);

    expect(kinds(blocks)).toEqual(["paragraph"]);
    expect(blocks[0].text).toContain("a String variable name is not a simple data type");
  });

  /**
   * A definition begins a block. Every one of the 42 callouts across these
   * modules was an em-dash aside inside a running sentence, so what tells a
   * definition from an aside is that a definition starts something.
   */
  /** A term that needs a sentence to state it is not a term. */
  it("ignores a dash in the middle of a stated sentence", () => {
    const blocks = buildLessonBlocks([
      page("A character can be any letter – uppercase or lowercase.")
    ]);

    expect(kinds(blocks)).toEqual(["paragraph"]);
  });

  it("still reads a definition that begins a block", () => {
    const blocks = buildLessonBlocks([
      page("The parts are these.\n\nSyntax – the rules of the language")
    ]);

    expect(kinds(blocks)).toEqual(["paragraph", "term"]);
    expect(blocks[1].term).toBe("Syntax");
  });

  /**
   * The cost of that rule, recorded rather than hidden: a definition written
   * straight under a finished sentence now reads as prose. Worth it at 42
   * wrong callouts against no right ones, but it is a real trade.
   */
  it("reads a definition written under a sentence as prose", () => {
    const blocks = buildLessonBlocks([
      page("The parts are these.\nSyntax – the rules of the language")
    ]);

    expect(kinds(blocks)).toEqual(["paragraph"]);
  });

  /**
   * An objectives list that runs "c) ... d)" with nothing after the d. Joining
   * that empty marker to the next line ate the template heading below it, and
   * the module lost that section from its rail.
   */
  it("drops an empty marker instead of eating the heading under it", () => {
    const blocks = buildLessonBlocks([
      page("c) Use the StringBuilder class\nd)\nIII. CONTENT\nA. PREPARATORY ACTIVITIES")
    ]);

    expect(blocks.some((b) => b.type === "heading" && b.text === "III. CONTENT")).toBe(true);
    expect(JSON.stringify(blocks)).not.toContain("d) III. CONTENT");
  });

  /**
   * A caption is a whole label. Stitching the next page's opening paragraph
   * onto it also cost the picture its anchor, since a caption is only
   * recognised while it is still short.
   */
  it("does not swallow the next page into a figure's caption", () => {
    const blocks = buildLessonBlocks([
      page("Redeclaring a variable is illegal.\nFigure 1 A Method with nested Blocks", 2),
      page("Although you cannot declare a variable twice\nwithin the same block, you can.", 3)
    ]);

    const caption = blocks.find((block) => /^Figure 1/.test(block.text ?? ""));
    expect(caption.text).toBe("Figure 1 A Method with nested Blocks");
  });

  /**
   * A caption is often the last thing on its page. Absorbed into the prose
   * before it, that page is left with no blocks at all — and a figure whose
   * page holds no blocks is dropped, which is how lesson 1 lost its Debugging
   * Process diagram.
   */
  it("keeps a page alive when a caption ends it", () => {
    const pages = [
      page("Repairing all syntax errors is the first part of", 3),
      page("the process of debugging a program.\nFigure 1 Debugging Process", 4)
    ];

    const blocks = buildLessonBlocks(pages);
    const onPage4 = blocks.filter((block) => block.page === 4);

    expect(onPage4).toHaveLength(1);
    expect(onPage4[0].text).toBe("Figure 1 Debugging Process");

    // And with a figure on that page, it survives.
    const withFigure = insertFigureBlocks(blocks, [
      { fileId: "f1", page: 4, width: 400, height: 300 }
    ]);
    expect(withFigure.filter((block) => block.type === "figure")).toHaveLength(1);
  });

  /**
   * A seam hands back the tail of one interrupted thing and the rest of the
   * run it belonged to. No more than that: an earlier version kept merging for
   * as long as nothing had been pushed, which absorbed whole pages into the
   * page before them. The text survived but was re-tagged to the wrong page,
   * and a figure whose page then held no blocks was dropped entirely.
   */
  it("does not let one page swallow the next", () => {
    // Every paragraph on the second page ends mid-sentence, so each one in
    // turn looks like the continuation of what came before it. That is the
    // cascade: the page is absorbed a block at a time.
    const blocks = buildLessonBlocks([
      page("A sentence that runs off the end of the", 3),
      page(
        "page and continues on\n\nand keeps going without stopping\n\n" +
          "and still has not stopped\n\nuntil finally here.",
        4
      )
    ]);

    expect(blocks.filter((block) => block.page === 4).length).toBeGreaterThan(0);
  });

  /**
   * A bullet whose sentence carried on over the page came out as an item, a
   * stray paragraph, and then a second list — one point drawn as three things.
   */
  it("rejoins a bullet the page break split", () => {
    const blocks = buildLessonBlocks([
      page("Every method must include the two parts\n• A method header—A method's\nheader provides information about how other", 2),
      page("methods can interact with it. A method\nheader is also called a declaration.\n• A method body between a pair of\ncurly braces—The method body contains the statements.", 3)
    ]);

    const lists = listBlocks(blocks);
    expect(lists).toHaveLength(1);
    expect(lists[0].items).toHaveLength(2);
    expect(lists[0].items[0]).toContain("also called a declaration.");
    expect(kinds(blocks)).not.toContain("term");
  });
});
