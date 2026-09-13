/**
 * A question's code sample, shown the way code is read.
 *
 * Questions are paragraphs, and a paragraph folds a snippet's line breaks and
 * indentation into one line — which turns "what does this print?" into a
 * puzzle about where the lines were. This keeps both, and numbers the lines,
 * because an error-tracing question says "line 4" and the student has to be
 * able to find it.
 *
 * The numbers are drawn by CSS rather than written into the text, so copying
 * the code copies the code and not a column of digits beside it.
 *
 * A model that numbers its snippet in the returned text gets those numbers
 * tucked into a hidden span here: they stay in the source, so a pasted block
 * keeps exactly what the generator wrote, but they must not show next to the
 * CSS column or the lines would count twice.
 *
 * Shared by the student's quiz and the assessor's review, so a question is laid
 * out the same for the person writing it as for the person answering it.
 */
// "12      int n = 0;" — a number the model glued onto a line, with enough
// whitespace after it to read as line label rather than as code.
const lineNumberLabel = /^\d+[.)]?\s+(?=\S)/;

function CodeBlock({ code, className = "" }) {
  const source = String(code ?? "");
  if (!source.trim()) return null;

  return (
    <pre className={`code-block${className ? ` ${className}` : ""}`}>
      <code>
        {/* Inline spans ending in their own newline, so `pre` does the line
            breaking and a copied snippet keeps its breaks. */}
        {source.split("\n").map((line, index) => {
          const label = lineNumberLabel.exec(line)?.[0];
          return (
            <span className="code-block__line" key={index}>
              {label && (
                <span className="code-block__label" aria-hidden="true">
                  {label}
                </span>
              )}
              {label ? line.slice(label.length) : line}
              {"\n"}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

export default CodeBlock;
