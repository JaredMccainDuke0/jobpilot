export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCatalogScheduler } = await import("@/infrastructure/catalog-scheduler");
    startCatalogScheduler();
  }
}
