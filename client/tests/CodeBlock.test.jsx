import { describe, expect, it } from "@jest/globals";
import { render } from "@testing-library/react";
import CodeBlock from "../src/components/CodeBlock";

describe("CodeBlock", () => {
  it("highlights code without losing its line numbers or indentation", () => {
    const code = [
      "int total = 0;",
      "for (int i = 1; i <= 3; i++) {",
      "    total += i;",
      "}"
    ].join("\n");
    const { container } = render(<CodeBlock code={code} />);

    const block = container.querySelector("pre.code-block");
    expect(block).not.toBeNull();
    expect(block.querySelectorAll(".code-block__line")).toHaveLength(4);
    expect(block.querySelector("code .hljs-keyword")).not.toBeNull();
    expect(block.querySelector("code .hljs-number")).not.toBeNull();
    expect(block.querySelector("code").textContent).toContain("    total += i;");
  });

  it("removes a legacy line-number column before highlighting", () => {
    const { container } = render(<CodeBlock code={"1.  int count = 1;\n2.  count++;"} />);
    const code = container.querySelector("code");

    expect(code).toHaveTextContent("int count = 1;");
    expect(code).not.toHaveTextContent("1.  int");
    expect(container.querySelectorAll(".code-block__line")).toHaveLength(2);
  });

  it("escapes code instead of creating elements from it", () => {
    const { container } = render(<CodeBlock code={'<script>alert("test")</script>'} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("code")).toHaveTextContent('<script>alert("test")</script>');
  });

  it("draws no block for empty code", () => {
    const { container } = render(<CodeBlock code="  " />);
    expect(container.querySelector("pre.code-block")).toBeNull();
  });
});
