import { migrate, pool } from "./db";
import { boot } from "./world";

const cmd = process.argv[2];
if (cmd === "migrate") { await migrate(); }
else if (cmd === "reset") {
  // Wipes ALL data and starts a fresh seed anchored to today.
  await pool.query("drop schema public cascade; create schema public;");
  await migrate(); console.log("database reset. Start the server to create users and the seed.");
} else if (cmd === "reproject") { await migrate(); await boot(); }
else console.log("usage: tsx src/cli.ts migrate | reset | reproject");
await pool.end();
