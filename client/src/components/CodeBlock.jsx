import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";

/**
 * A question's code sample, shown the way code is read.
 *
 * Questions are paragraphs, and a paragraph folds a snippet's line breaks and
 * indentation into one line — which turns "what does this print?" into a
 * puzzle about where the lines were. This keeps both, and numbers the lines,
 * because an error-tracing question says "line 4" and the student has to be
 * able to find it.
 *
 * The number column is separate from the highlighted code, so copying the code
 * copies the code and not the digits beside it.
 *
 * Shared by the student's quiz and the assessor's review, so a question is laid
 * out the same for the person writing it as for the person answering it.
 */
// "12      int n = 0;" — a number the model glued onto a line, with enough
// whitespace after it to read as line label rather than as code.
const lineNumberLabel = /^\d+[.)]?\s+(?=\S)/;

const languages = {
  bash,
  c,
  cpp,
  csharp,
  java,
  javascript,
  json,
  php,
  python,
  sql,
  xml
};

for (const [name, importedDefinition] of Object.entries(languages)) {
  const definition = importedDefinition.default ?? importedDefinition;
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, definition);
}

const languageNames = Object.keys(languages);

function CodeBlock({ code, className = "" }) {
  const source = String(code ?? "");
  if (!source.trim()) return null;

  // Old generated papers sometimes wrote their own line-number column. Remove
  // it before highlighting because this component already draws the numbers.
  const cleanSource = source
    .split("\n")
    .map((line) => line.replace(lineNumberLabel, ""))
    .join("\n");
  const highlighted = hljs.highlightAuto(cleanSource, languageNames);
  const lines = cleanSource.split("\n");

  return (
    <pre
      className={`code-block${className ? ` ${className}` : ""}`}
      data-language={highlighted.language || undefined}
    >
      <span className="code-block__lines" aria-hidden="true">
        {lines.map((_, index) => (
          <span className="code-block__line" key={index}>
            {index + 1}
          </span>
        ))}
      </span>
      <code
        className={`hljs${highlighted.language ? ` language-${highlighted.language}` : ""}`}
        dangerouslySetInnerHTML={{ __html: highlighted.value }}
      />
    </pre>
  );
}

export default CodeBlock;
