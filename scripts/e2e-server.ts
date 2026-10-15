/**
 * Starts a throwaway MongoDB replica set, creates two test members, then runs
 * the production build (`next start`) against it. Used by Playwright's webServer.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { E2E_PORT, E2E_USERS } from "../tests/e2e/users";

async function main() {
  // Keep the throwaway database inside the project and wipe it on every start, so a
  // hard-killed run (Playwright stops the server forcefully on Windows) can't leave
  // hundreds of MB behind in the system temp folder.
  const dbPath = path.join(process.cwd(), ".e2e-db", String(E2E_PORT)); // one per port: preview and tests can run side by side
  rmSync(dbPath, { recursive: true, force: true });
  mkdirSync(dbPath, { recursive: true });
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ dbPath }],
  });
  const env = {
    ...process.env,
    MONGODB_URI: replSet.getUri(),
    MONGODB_DB: "tasklol_e2e",
    // Every Playwright test signs in from the same IP.
    LOGIN_RATE_LIMIT_PER_MINUTE: "1000",
    SESSION_SECRET: "e2e-session-secret-that-is-definitely-32+",
    NODE_ENV: (process.env.E2E_NEXT_MODE === "dev" ? "development" : "production") as "development" | "production",
  };
  Object.assign(process.env, env);

  const { createMember } = await import("@/services/members");
  const { resetMongoForTests } = await import("@/lib/mongodb");
  for (const u of Object.values(E2E_USERS)) await createMember(u);
  await resetMongoForTests();

  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, process.env.E2E_NEXT_MODE === "dev" ? "dev" : "start", "-p", String(E2E_PORT)], { env, stdio: "inherit" });

  const shutdown = async () => {
    child.kill();
    await replSet.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", async (code) => {
    await replSet.stop().catch(() => undefined);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
