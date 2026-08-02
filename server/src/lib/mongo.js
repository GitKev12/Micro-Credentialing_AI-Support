import mongoose from "mongoose";

const { ObjectId } = mongoose.Types;

export async function collectionExists(name) {
  if (!(mongoose.connection.readyState === 1)) return false;
  const collections = await mongoose.connection.db
    .listCollections({ name }, { nameOnly: true })
    .toArray();
  return collections.length > 0;
}
// Ids may be stored as ObjectId or string depending on how the data was
// seeded — match against both forms.
export function idCandidates(value) {
  const candidates = [value, String(value)];
  if (ObjectId.isValid(String(value))) candidates.push(new ObjectId(String(value)));
  return candidates;
}
