import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { fetchAllPrices } from "./priceSource";

const outputArgumentIndex = process.argv.indexOf("--output");
const outputArgument =
  outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : undefined;
const outputPath = path.resolve(
  process.cwd(),
  outputArgument || "dist/data/prices.json"
);

const bundle = await fetchAllPrices();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(bundle), "utf8");

console.log(
  `Wrote ${Object.keys(bundle.products).length} priced products from ${bundle.setCount} sets to ${outputPath}`
);
