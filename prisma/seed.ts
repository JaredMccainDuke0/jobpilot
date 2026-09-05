import { now, run } from "../src/infrastructure/db";

if (!process.argv.includes("--init-only")) {
  run("INSERT OR REPLACE INTO settings VALUES(?,?,?)", "catalogMode", "scheduled", now());
}

console.log(process.argv.includes("--init-only")
  ? "Database initialized"
  : "Catalog mode enabled; configure public feeds before refreshing jobs");
