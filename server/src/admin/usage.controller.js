import mongoose from "mongoose";
import { collectionExists } from "../lib/mongo.js";
import { getEnvironmentConfig } from "../config/env.js";
import { readApiUsage } from "../integrations/openai/usage.log.js";

/**
 * What the API has cost so far.
 *
 * Everything here is read from our own spend log and the Assessment collection.
 * Opening this dashboard makes no call to OpenAI and consumes no tokens — which
 * matters, because a monitor you are afraid to refresh is not a monitor.
 *
 * The one exception is `billed`, which asks OpenAI what it has charged over the
 * same window. That call needs an Admin key (OPENAI_ADMIN_KEY) — a project key
 * is refused — and it still cannot report a remaining balance, because no
 * endpoint exposes one. It reports spend, and says so.
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
 * Cached per window, because the dashboard polls every five seconds and this is
 * the one thing on the page that leaves the building. OpenAI buckets cost by
 * the day, so a figure a few minutes stale is the same figure — and without
 * this, a dashboard left open would call their API twelve times a minute for as
 * long as it stayed open.
 */
const spendCache = new Map();
const SPEND_TTL_MS = 5 * 60 * 1000;

async function readSpend(days) {
  const cached = spendCache.get(days);
  if (cached && Date.now() - cached.at < SPEND_TTL_MS) {
    return { ...cached.value, cached: true, cachedAt: new Date(cached.at).toISOString() };
  }

  const value = await fetchSpend(days);

  // Only successes are cached. A failure should be retried on the next refresh,
  // not held on screen for five minutes.
  if (value.available) spendCache.set(days, { at: Date.now(), value });

  return { ...value, cached: false };
}

/**
 * What OpenAI has billed over a window.
 *
 * Two things worth knowing about their endpoint. It reports **spend, not a
 * remaining balance** — nothing exposes prepaid credit left, so a panel headed
 * "balance" showing this figure would be misnaming the number it holds. And it
 * pages: one bucket per day, so a long window has to be followed to the end or
 * the total silently drops its oldest days.
 *
 * Only attempted when an Admin key is configured. A project key is refused with
 * a permissions error, and calling anyway would put that error in front of the
 * operator on every page load.
 */
async function fetchSpend(days) {
  const adminKey = process.env.OPENAI_ADMIN_KEY;

  if (!adminKey) {
    return {
      available: false,
      reason:
        "Needs an OpenAI Admin key. A project key (sk-proj-…) is refused by the organization cost endpoint, which requires the api.usage.read scope. Set OPENAI_ADMIN_KEY in server/.env to fill this in.",
      spend: null
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const headers = { Authorization: `Bearer ${adminKey}` };
  const base = `https://api.openai.com/v1/organization/costs?start_time=${Math.floor(since.getTime() / 1000)}&limit=180`;

  let spend = 0;
  let currency = null;
  let buckets = 0;
  let url = base;

  try {
    // Bounded: a runaway cursor must not turn a dashboard refresh into an
    // unbounded loop against someone else's API.
    for (let page = 0; page < 5 && url; page += 1) {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return {
          available: false,
          reason: body?.error?.message ?? `OpenAI answered ${response.status}.`,
          spend: null
        };
      }

      const body = await response.json();

      for (const bucket of body.data ?? []) {
        buckets += 1;
        for (const row of bucket.results ?? []) {
          spend += Number(row?.amount?.value) || 0;
          currency = currency ?? row?.amount?.currency ?? null;
        }
      }

      url = body.has_more && body.next_page ? `${base}&page=${encodeURIComponent(body.next_page)}` : null;
    }

    return {
      available: true,
      spend,
      currency: currency ?? "usd",
      since: since.toISOString(),
      days,
      buckets,
      reason: null
    };
  } catch (error) {
    return { available: false, reason: error.message, spend: null };
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
    totals,
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
          estimatedTokens: averageTokens * lessonsRemaining
        }
      : null,
    billed: await readSpend(days)
  });
}
