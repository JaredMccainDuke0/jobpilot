import { refreshJobCatalog } from "../src/infrastructure/job-catalog";

const result = await refreshJobCatalog();
console.log(JSON.stringify(result, null, 2));
if (result.status === "failed") process.exitCode = 1;
