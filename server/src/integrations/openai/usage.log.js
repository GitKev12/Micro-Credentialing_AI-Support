import mongoose from "mongoose";
import { collectionExists } from "../../lib/mongo.js";

/**
 * A record of every paid call this system makes.
 *
 * Usage is already stamped onto each generated Assessment, but that is not a
 * spend log: a generation the validator rejects costs exactly as much as one it
 * accepts and stores no document at all. Reading spend off the Assessment
 * collection would therefore under-report it, and under-report it precisely
 * when something is going wrong. So every call is written here regardless of
 * how it turned out.
 *
 * Nothing in this file talks to OpenAI. Writing a row costs nothing.
 */

export const USAGE_COLLECTION = "ApiUsage";

const collection = () => mongoose.connection.collection(USAGE_COLLECTION);

/**
 * What a token costs, if anyone has said.
 *
 * Deliberately unset by default. Prices change and are not discoverable from
 * the API, so guessing one would put an authoritative-looking number on a
 * dashboard that nobody had checked. Unset means the dashboard reports tokens
 * and says plainly that it cannot price them.
 */
export function getPricing() {
  const input = Number(process.env.OPENAI_PRICE_INPUT_PER_1M);
  const output = Number(process.env.OPENAI_PRICE_OUTPUT_PER_1M);
  const configured = input > 0 && output > 0;

  return {
    configured,
    currency: process.env.OPENAI_PRICE_CURRENCY || "USD",
    inputPerMillion: configured ? input : null,
    outputPerMillion: configured ? output : null
  };
}

/** Cost of a token count at the configured rate, or null when unpriced. */
export function estimateCost(inputTokens, outputTokens) {
  const pricing = getPricing();
  if (!pricing.configured) return null;

  const input = ((Number(inputTokens) || 0) / 1_000_000) * pricing.inputPerMillion;
  const output = ((Number(outputTokens) || 0) / 1_000_000) * pricing.outputPerMillion;

  return { input, output, total: input + output, currency: pricing.currency };
}

/**
 * Records one call. Never throws: a spend log that can break the thing it is
 * logging is worse than a gap in the log, so a failure here is swallowed after
 * being written to the server output.
 */
export async function recordApiUsage(entry) {
  try {
    if (mongoose.connection.readyState !== 1) return null;

    const row = {
      at: new Date(),
      kind: entry.kind ?? "assessment-generation",
      model: entry.model ?? null,
      courseId: entry.courseId ? String(entry.courseId) : null,
      courseCode: entry.courseCode ?? null,
      moduleId: entry.moduleId ? String(entry.moduleId) : null,
      moduleTitle: entry.moduleTitle ?? null,
      outcome: entry.outcome ?? "unknown",
      inputTokens: Number(entry.inputTokens) || 0,
      outputTokens: Number(entry.outputTokens) || 0,
      totalTokens:
        Number(entry.totalTokens) ||
        (Number(entry.inputTokens) || 0) + (Number(entry.outputTokens) || 0),
      itemsRequested: entry.itemsRequested ?? null,
      itemsUsable: entry.itemsUsable ?? null,
      error: entry.error ?? null
    };

    await collection().insertOne(row);
    return row;
  } catch (error) {
    console.error("Could not record API usage:", error.message);
    return null;
  }
}

/** Every call, newest first. The collection is small by design — one row per
 *  generation attempt, and there are 74 of those in the whole system. */
export async function readApiUsage({ since = null, limit = 5000 } = {}) {
  if (mongoose.connection.readyState !== 1) return [];
  if (!(await collectionExists(USAGE_COLLECTION))) return [];

  const query = since ? { at: { $gte: since } } : {};
  return collection().find(query).sort({ at: -1 }).limit(limit).toArray();
}
