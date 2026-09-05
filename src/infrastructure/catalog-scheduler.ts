import { catalogSettings } from "@/domain/job-catalog";
import { getCatalogStatus, refreshJobCatalog } from "@/infrastructure/job-catalog";

type SchedulerState = {
  timer: ReturnType<typeof setInterval>;
  running: boolean;
};

const globalState = globalThis as typeof globalThis & {
  jobpilotCatalogScheduler?: SchedulerState;
};

async function refreshIfDue() {
  const state = globalState.jobpilotCatalogScheduler;
  if (!state || state.running) return;
  const status = getCatalogStatus();
  if (status.lastRefreshAt && status.nextRefreshAt && Date.parse(status.nextRefreshAt) > Date.now()) return;
  state.running = true;
  try {
    await refreshJobCatalog();
  } catch (error) {
    console.error("[JobPilot] catalog refresh failed", error instanceof Error ? error.message : error);
  } finally {
    state.running = false;
  }
}

export function startCatalogScheduler() {
  if (process.env.JOBPILOT_CATALOG_SCHEDULER === "0") return;
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (globalState.jobpilotCatalogScheduler) return;
  const intervalMs = catalogSettings().refreshIntervalMinutes * 60 * 1000;
  const timer = setInterval(() => void refreshIfDue(), intervalMs);
  timer.unref?.();
  globalState.jobpilotCatalogScheduler = { timer, running: false };
  void refreshIfDue();
}

export function stopCatalogSchedulerForTests() {
  const state = globalState.jobpilotCatalogScheduler;
  if (!state) return;
  clearInterval(state.timer);
  delete globalState.jobpilotCatalogScheduler;
}
