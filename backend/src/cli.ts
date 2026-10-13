import { migrate, pool } from "./db";
import { migrateState } from "./world";

const cmd = process.argv[2];
if (cmd === "migrate") { await migrate(); }
else if (cmd === "reset") {
  // Wipes ALL data and starts a fresh company on the next server start.
  await pool.query("drop schema public cascade; create schema public;");
  await migrate(); console.log("database reset. Start the server to create users and the company.");
} else if (cmd === "migrate-state") {
  // For a database made before the state tables existed: rebuild its state once from its command log, check the books, and
  // write it to the tables. Back up first (pg_dump). Without --yes nothing is written.
  const dry = !process.argv.includes("--yes");
  await migrate();
  const r = await migrateState(dry);
  console.log(`commands replayed: ${r.commands}\ndocuments: ${r.documents}\nconsistency problems: ${r.problems.length ? JSON.stringify(r.problems) : "none"}`);
  console.log(r.moved ? "Done. The server now reads the state tables." : dry ? "Dry run only: nothing was written. Re-run with --yes after a backup to apply." : "Not moved: fix the problems above first.");
} else console.log("usage: tsx src/cli.ts migrate | reset | migrate-state [--yes]");
await pool.end();
