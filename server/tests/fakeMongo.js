/**
 * A tiny in-memory stand-in for `mongoose.connection.collection(name)`.
 *
 * It understands only what the Discover code asks of Mongo: plain values,
 * $in / $nin / $ne (on single values and on arrays), $or, and the $set /
 * $addToSet / $pull updates, plus insertOne, upserts and deletes. Every write is pushed onto `db.log`, so a test
 * can check what was written and in what order.
 *
 * Not a test file itself (no ".test.js"), so Jest does not run it.
 */

function fieldMatches(value, condition) {
  const values = Array.isArray(value) ? value : [value];
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    if ("$in" in condition) return values.some((item) => condition.$in.includes(item));
    if ("$nin" in condition) return !values.some((item) => condition.$nin.includes(item));
    if ("$ne" in condition) return !values.includes(condition.$ne);
  }
  return values.includes(condition);
}

export function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, condition]) =>
    key === "$or" ? condition.some((part) => matches(doc, part)) : fieldMatches(doc[key], condition)
  );
}

function applyUpdate(doc, change) {
  Object.assign(doc, change.$set ?? {});
  for (const [field, value] of Object.entries(change.$addToSet ?? {})) {
    if (!(doc[field] ?? []).includes(value)) doc[field] = [...(doc[field] ?? []), value];
  }
  for (const [field, condition] of Object.entries(change.$pull ?? {})) {
    doc[field] = (doc[field] ?? []).filter((item) => !fieldMatches(item, condition));
  }
}

/** `db` is { CollectionName: [docs] }. Returns the `collection(name)` function. */
export function fakeCollections(db) {
  db.log = [];
  return (name) => {
    const rows = () => db[name] ?? [];
    return {
      // Reads hand back copies, as the real driver does.
      findOne: async (filter) => structuredClone(rows().find((doc) => matches(doc, filter)) ?? null),
      find: (filter) => {
        const cursor = {
          sort: () => cursor, // order is the order the test wrote them in
          toArray: async () => {
            const found = rows().filter((doc) => matches(doc, filter)).map((doc) => structuredClone(doc));
            db.onFind?.(name);
            return found;
          }
        };
        return cursor;
      },
      insertOne: async (doc) => {
        const insertedId = doc._id ?? `new${rows().length + 1}`;
        db[name] = [...rows(), { ...structuredClone(doc), _id: insertedId }];
        db.log.push({ op: "insertOne", name, doc });
        return { insertedId };
      },
      countDocuments: async (filter) => rows().filter((doc) => matches(doc, filter)).length,
      updateOne: async (filter, change, options = {}) => {
        const doc = rows().find((row) => matches(row, filter));
        if (!doc && options.upsert) {
          // Like Mongo: the filter's plain values plus the $set fields.
          const plain = Object.fromEntries(
            Object.entries(filter).filter(([key, value]) => !key.startsWith("$") && (value === null || typeof value !== "object"))
          );
          const created = { _id: `new${rows().length + 1}`, ...plain };
          applyUpdate(created, change);
          db[name] = [...rows(), created];
          db.log.push({ op: "upsert", name, filter, change });
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        if (!doc) return { matchedCount: 0, modifiedCount: 0 };
        applyUpdate(doc, change);
        db.log.push({ op: "updateOne", name, filter, change });
        return { matchedCount: 1, modifiedCount: 1 };
      },
      deleteMany: async (filter) => {
        const before = rows().length;
        db[name] = rows().filter((doc) => !matches(doc, filter));
        db.log.push({ op: "deleteMany", name, filter });
        return { deletedCount: before - db[name].length };
      },
      updateMany: async (filter, change) => {
        const docs = rows().filter((row) => matches(row, filter));
        docs.forEach((doc) => applyUpdate(doc, change));
        db.log.push({ op: "updateMany", name, filter, change });
        return { matchedCount: docs.length, modifiedCount: docs.length };
      }
    };
  };
}
