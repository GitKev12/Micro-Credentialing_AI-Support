import dotenv from "dotenv";
import app from "./app.js";
import connectDatabase from "./config/db.js";
import { ensureCoreIndexes, summarise } from "./lib/indexes.js";
import { assertAuthSecret } from "./auth/tokens.js";

dotenv.config();

const port = Number(process.env.PORT) || 5000;

const startServer = async () => {
  // Checked here so a missing secret stops the deploy, rather than waiting to
  // surface as a 500 on somebody's first login.
  assertAuthSecret();

  await connectDatabase();

  // Cheap when they already exist, and the alternative is every read path
  // scanning its collection. Never fatal: a database that will not take an
  // index still serves requests, just slowly, and that is a better failure
  // than refusing to start.
  try {
    console.log(summarise(await ensureCoreIndexes()));
  } catch (error) {
    console.warn("Index check failed:", error.message);
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
