/** Creates collections and indexes. Safe to run any number of times: `npm run db:setup`. */
import { getDb, resetMongoForTests } from "@/lib/mongodb";

async function main() {
  const db = await getDb(); // getDb() runs ensureIndexes()
  for (const name of ["tasks", "members", "events"]) {
    const indexes = await db.collection(name).indexes();
    console.log(`✔ ${name}: ${indexes.map((i) => i.name).join(", ")}`);
  }
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName) {
    console.warn("⚠ This MongoDB is not a replica set. TaskLOL needs one for transactions and live updates (Atlas always is).");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("✖", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => resetMongoForTests());
