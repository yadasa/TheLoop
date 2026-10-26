import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(
  readFileSync(path.join(root, "firestore.indexes.json"), "utf8"),
);
// Spark supports the ordinary indexes. TTL is billed and requires an approved billing link.
const spark = {
  ...source,
  fieldOverrides: (source.fieldOverrides || []).filter(
    (field) => field.ttl !== true,
  ),
};
if (JSON.stringify(spark).includes('"ttl":true'))
  throw new Error("Refusing a TTL-enabled Spark deployment.");
mkdirSync(path.join(root, ".cache"), { recursive: true });
writeFileSync(
  path.join(root, ".cache/firestore.spark.indexes.json"),
  JSON.stringify(spark, null, 2) + "\n",
);
console.log(
  `Prepared Spark-safe Firestore indexes (${spark.indexes.length} composites, no TTL).`,
);
