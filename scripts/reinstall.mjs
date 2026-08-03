// Clean reinstall of native/platform-specific dependencies.
// Works around npm's optional-dependency bug (https://github.com/npm/cli/issues/4828):
// a node_modules tree built on one OS keeps that OS's binaries, and a plain
// `npm install` on another OS does not reliably replace them.
//
// Run this after switching between Windows and Linux. package-lock.json is
// intentionally left alone — it already lists every platform variant.
//
// Usage: node scripts/reinstall.mjs <client|server|all>
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Native binaries hoist to the workspace root, so removing client/node_modules
// or server/node_modules alone is not enough — the scoped dirs are the target.
const TARGETS = {
  client: {
    remove: ["client/node_modules", "node_modules/@rollup", "node_modules/@esbuild"],
    verify: ["node_modules/@rollup", "node_modules/@esbuild"]
  },
  server: {
    remove: ["server/node_modules", "node_modules/@napi-rs"],
    verify: ["node_modules/@napi-rs"]
  },
  all: {
    remove: ["node_modules", "client/node_modules", "server/node_modules"],
    verify: ["node_modules/@rollup", "node_modules/@esbuild", "node_modules/@napi-rs"]
  }
};

const which = process.argv[2];
const target = TARGETS[which];
if (!target) {
  console.error(`Usage: node scripts/reinstall.mjs <${Object.keys(TARGETS).join("|")}>`);
  process.exit(1);
}

console.log(`Reinstalling "${which}" for ${process.platform}-${process.arch}\n`);

for (const rel of target.remove) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.log(`  skip    ${rel} (absent)`);
    continue;
  }
  fs.rmSync(full, { recursive: true, force: true });
  console.log(`  removed ${rel}`);
}

console.log("\nRunning npm install...\n");
// Passed as one shell string rather than command + args: `npm` is `npm.cmd` on
// Windows, which needs a shell, and a shell with a separate args array trips
// DEP0190. Nothing here is user input.
const install = spawnSync("npm install --no-audit --no-fund", {
  cwd: ROOT,
  stdio: "inherit",
  shell: true
});

if (install.status !== 0) {
  console.error("\nnpm install failed.");
  process.exit(install.status ?? 1);
}

// The canvas failure only ever surfaced as a warning, so confirm rather than
// assume: print what actually landed and fail loudly if a scope is empty.
console.log("\nInstalled platform binaries:");
let missing = false;
for (const rel of target.verify) {
  const full = path.join(ROOT, rel);
  const entries = fs.existsSync(full) ? fs.readdirSync(full) : [];
  // @rollup/@napi-rs prefix the platform ("rollup-win32-x64-msvc"); @esbuild does not ("win32-x64").
  const natives = entries.filter((name) =>
    /(^|-)(win32|linux|darwin|android|freebsd|openbsd|netbsd|sunos|aix)/.test(name)
  );
  if (natives.length === 0) {
    console.log(`  ${rel}: NONE FOUND`);
    missing = true;
  } else {
    console.log(`  ${rel}: ${natives.join(", ")}`);
  }
}

if (missing) {
  console.error("\nNo native binary resolved for this platform. Try: npm run reinstall");
  process.exit(1);
}

console.log("\nDone.");
