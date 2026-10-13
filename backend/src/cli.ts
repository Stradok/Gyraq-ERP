import { migrate, pool } from "./db";
import { boot, migrateState } from "./world";

const cmd = process.argv[2];
if (cmd === "migrate") { await migrate(); }
else if (cmd === "reset") {
  // Wipes ALL data and starts a fresh seed anchored to today.
  await pool.query("drop schema public cascade; create schema public;");
  await migrate(); console.log("database reset. Start the server to create users and the seed.");
} else if (cmd === "migrate-state") {
  // Moves this database from "rebuild by replaying commands" to "read the state tables". Back up first (pg_dump).
  const dry = !process.argv.includes("--yes");
  await migrate();
  const r = await migrateState(dry);
  console.log(`commands replayed: ${r.commands}\ndocuments: ${r.documents}\nconsistency problems: ${r.problems.length ? JSON.stringify(r.problems) : "none"}`);
  console.log(r.moved ? "Done. Start with STATE_SOURCE=tables." : dry ? "Dry run only: nothing was written. Re-run with --yes after a backup to apply." : "Not moved: fix the problems above first.");
} else if (cmd === "reproject") { await migrate(); await boot(); }
else console.log("usage: tsx src/cli.ts migrate | reset | reproject");
await pool.end();
