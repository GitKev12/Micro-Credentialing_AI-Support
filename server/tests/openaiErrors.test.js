import { describe, it, expect } from "@jest/globals";
import OpenAI from "openai";
import { callTimeoutMs, describeOpenAiError, unusableAnswer } from "../src/integrations/openai/openai.client.js";

/*
 * What the assessor is told when the AI call goes wrong. Stand-in errors and
 * responses only: nothing here calls OpenAI.
 */

describe("a failed call to OpenAI", () => {
  it("says the AI took too long on a timeout", () => {
    expect(describeOpenAiError(new OpenAI.APIConnectionTimeoutError())).toMatch(/took too long/);
  });

  it("says the server couldn't reach OpenAI when offline", () => {
    expect(describeOpenAiError(new OpenAI.APIConnectionError({}))).toMatch(/couldn't reach OpenAI/);
  });

  it("tells running out of credit apart from too many requests", () => {
    expect(describeOpenAiError(new OpenAI.RateLimitError(429, { code: "insufficient_quota" }))).toBe(
      "The OpenAI account has run out of credit."
    );
    expect(describeOpenAiError(new OpenAI.RateLimitError(429, { code: "rate_limit_exceeded" }))).toMatch(
      /Too many requests/
    );
  });

  it("names a refused key and an OpenAI outage", () => {
    expect(describeOpenAiError(new OpenAI.AuthenticationError(401, {}))).toMatch(/refused the API key/);
    expect(describeOpenAiError(new OpenAI.InternalServerError(500, {}))).toMatch(/having problems/);
  });
});

describe("an answer that can't be used", () => {
  it("says when the answer was cut off", () => {
    const response = { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } };
    expect(unusableAnswer(response)).toMatch(/cut off/);
  });

  it("passes on the model's refusal", () => {
    const response = {
      status: "completed",
      output: [{ content: [{ type: "refusal", refusal: "I can't help with that." }] }],
      output_text: ""
    };
    expect(unusableAnswer(response)).toBe(
      "The AI declined to write questions for this lesson: I can't help with that."
    );
  });

  it("says when the answer is empty, and accepts a normal one", () => {
    expect(unusableAnswer({ status: "completed", output: [], output_text: "" })).toMatch(/empty answer/);
    expect(unusableAnswer({ status: "completed", output: [], output_text: '{"items":[]}' })).toBeNull();
  });
});

describe("how long a call may take", () => {
  it("grows with the number of questions", () => {
    expect(callTimeoutMs(10)).toBe(220 * 1000); // measured: 47 s
    expect(callTimeoutMs(120)).toBe(1320 * 1000); // the largest paper allowed
  });
});
