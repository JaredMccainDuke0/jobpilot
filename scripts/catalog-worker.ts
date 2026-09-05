import { catalogSettings } from "../src/domain/job-catalog";
import { refreshJobCatalog } from "../src/infrastructure/job-catalog";

const intervalMs = catalogSettings().refreshIntervalMinutes * 60 * 1000;
let running = false;

async function refresh() {
  if (running) return;
  running = true;
  try {
    const result = await refreshJobCatalog();
    console.log(`[JobPilot] catalog ${result.status}: ${result.acceptedCount} accepted, ${result.expiredCount} expired`);
    if (result.errors.length) console.error(result.errors.join("\n"));
  } catch (error) {
    console.error("[JobPilot] catalog worker failed", error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

await refresh();
const timer = setInterval(() => void refresh(), intervalMs);
const stop = () => {
  clearInterval(timer);
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
