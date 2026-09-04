import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve("miniapp");
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}

for (const file of await walk(root)) {
  const relative = path.relative(process.cwd(), file);
  const source = await readFile(file, "utf8");
  try {
    if (file.endsWith(".json")) JSON.parse(source);
    if (file.endsWith(".js")) new vm.Script(source, { filename: relative });
  } catch (error) {
    errors.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("miniapp: all JSON files parse and all JavaScript files compile");
}
