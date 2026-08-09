import mongoose from "mongoose";
import { collectionExists } from "../lib/mongo.js";
import { getEnvironmentConfig } from "../config/env.js";
import { estimateCost, getPricing, readApiUsage } from "../integrations/openai/usage.log.js";

/**
 * What the API has cost so far.
 *
 * Everything here is read from our own spend log and the Assessment collection.
 * Opening this dashboard makes no call to OpenAI and consumes no tokens — which
 * matters, because a monitor you are afraid to refresh is not a monitor.
 *
 * The one thing it cannot show from here is the account's remaining balance.
 * That lives behind OpenAI's organization endpoints, which a project key
 * (sk-proj-…) is refused by: they need an Admin key with the api.usage.read
 * scope. Rather than pretend, the balance panel reports why it is empty, and
 * fills itself in if OPENAI_ADMIN_KEY is ever set.
 */

const ASSESSMENTS_COLLECTION = "Assessment";
const MODULES_COLLECTION = "LearningModule";

const collection = (name) => mongoose.connection.collection(name);

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

/** YYYY-MM-DD in local time, which is the day an operator means. */
function dayKey(date) {
  const value = new Date(date);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/**
 * Every day in the window, including the ones with no calls.
 *
 * Skipping empty days would draw a chart whose bars are evenly spaced but whose
 * axis is not — a run of three days would look identical whether it happened
 * this week or across three months.
 */
function emptyDays(days) {
  const series = [];
  const today = new Date();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    series.push({ date: dayKey(date), calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  }

  return series;
}

/**
 * The account balance, when it is knowable.
 *
 * Only attempted when an Admin key is configured — a project key is refused,
 * and trying anyway would put a permission error in front of the operator on
 * every page load for something they never asked for.
 */
async function readCredits() {
  const adminKey = process.env.OPENAI_ADMIN_KEY;

  if (!adminKey) {
    return {
      available: false,
      reason:
        "Needs an OpenAI Admin key. A project key (sk-proj-…) is refused by the organization usage and cost endpoints, which require the api.usage.read scope. Set OPENAI_ADMIN_KEY in server/.env to fill this in.",
      spendToDate: null
    };
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startTime = Math.floor(startOfMonth.getTime() / 1000);

  try {
    const response = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=31`,
      { headers: { Authorization: `Bearer ${adminKey}` } }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        available: false,
        reason: body?.error?.message ?? `OpenAI answered ${response.status}.`,
        spendToDate: null
      };
    }

    const body = await response.json();
    const spend = (body.data ?? []).reduce((sum, bucket) => {
      const amounts = (bucket.results ?? []).reduce(
        (inner, row) => inner + (row.amount?.value ?? 0),
        0
      );
      return sum + amounts;
    }, 0);

    return {
      available: true,
      // OpenAI reports spend, not a remaining balance — prepaid credit left is
      // not exposed by the API at all. Say which one this is.
      spendToDate: spend,
      currency: body.data?.[0]?.results?.[0]?.amount?.currency ?? "usd",
      since: startOfMonth.toISOString(),
      reason: null
    };
  } catch (error) {
    return { available: false, reason: error.message, spendToDate: null };
  }
}

/**
 * GET /api/admin/api-usage?days=30
 */
export async function getApiUsage(request, response) {
  if (!databaseReady()) {
    return response.status(503).json({
      message: "The database is not connected. Set MONGODB_URI and restart the API."
    });
  }

  const days = Math.min(Math.max(Number.parseInt(request.query.days, 10) || 30, 1), 180);
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const [rows, assessments, lessonCount] = await Promise.all([
    readApiUsage({ since }),
    (await collectionExists(ASSESSMENTS_COLLECTION))
      ? collection(ASSESSMENTS_COLLECTION)
          .find({}, { projection: { scope: 1, itemsPerAttempt: 1, items: 1, courseId: 1 } })
          .toArray()
      : [],
    (await collectionExists(MODULES_COLLECTION))
      ? collection(MODULES_COLLECTION).countDocuments()
      : 0
  ]);

  const totals = rows.reduce(
    (sum, row) => {
      sum.calls += 1;
      sum.inputTokens += row.inputTokens ?? 0;
      sum.outputTokens += row.outputTokens ?? 0;
      sum.totalTokens += row.totalTokens ?? 0;
      sum.byOutcome[row.outcome] = (sum.byOutcome[row.outcome] ?? 0) + 1;
      return sum;
    },
    { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, byOutcome: {} }
  );

  const byDay = new Map(emptyDays(days).map((entry) => [entry.date, entry]));
  for (const row of rows) {
    const bucket = byDay.get(dayKey(row.at));
    if (!bucket) continue;
    bucket.calls += 1;
    bucket.inputTokens += row.inputTokens ?? 0;
    bucket.outputTokens += row.outputTokens ?? 0;
    bucket.totalTokens += row.totalTokens ?? 0;
  }

  const byCourse = new Map();
  for (const row of rows) {
    const key = row.courseCode ?? "—";
    const bucket = byCourse.get(key) ?? {
      courseCode: key,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    };
    bucket.calls += 1;
    bucket.inputTokens += row.inputTokens ?? 0;
    bucket.outputTokens += row.outputTokens ?? 0;
    bucket.totalTokens += row.totalTokens ?? 0;
    byCourse.set(key, bucket);
  }

  const lessonQuizzes = assessments.filter((doc) => doc.scope !== "final");
  const questionsStored = assessments.reduce((sum, doc) => sum + (doc.items?.length ?? 0), 0);

  // What finishing the job would cost, projected from what it has cost so far.
  // Only offered once there is a real average to project from — before the first
  // call, any figure would be invention.
  const billedCalls = rows.filter((row) => (row.totalTokens ?? 0) > 0);
  const averageTokens = billedCalls.length
    ? Math.round(totals.totalTokens / billedCalls.length)
    : null;
  const lessonsRemaining = Math.max(0, lessonCount - lessonQuizzes.length);

  return response.json({
    generatedAt: new Date().toISOString(),
    model: getEnvironmentConfig().openAiModel,
    windowDays: days,
    pricing: getPricing(),
    totals: {
      ...totals,
      cost: estimateCost(totals.inputTokens, totals.outputTokens)
    },
    daily: [...byDay.values()],
    byCourse: [...byCourse.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    recent: rows.slice(0, 25).map((row) => ({
      at: row.at,
      courseCode: row.courseCode,
      moduleTitle: row.moduleTitle,
      outcome: row.outcome,
      model: row.model,
      inputTokens: row.inputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      totalTokens: row.totalTokens ?? 0,
      itemsUsable: row.itemsUsable,
      itemsRequested: row.itemsRequested,
      error: row.error
    })),
    corpus: {
      lessons: lessonCount,
      lessonsWithQuiz: lessonQuizzes.length,
      lessonsRemaining,
      finals: assessments.filter((doc) => doc.scope === "final").length,
      questionsStored
    },
    projection: averageTokens
      ? {
          averageTokensPerCall: averageTokens,
          remainingCalls: lessonsRemaining,
          estimatedTokens: averageTokens * lessonsRemaining,
          estimatedCost: estimateCost(
            Math.round(averageTokens * lessonsRemaining * (totals.inputTokens / (totals.totalTokens || 1))),
            Math.round(averageTokens * lessonsRemaining * (totals.outputTokens / (totals.totalTokens || 1)))
          )
        }
      : null,
    credits: await readCredits()
  });
}
