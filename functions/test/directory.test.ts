import test from "node:test";
import assert from "node:assert/strict";
import { directoryFields } from "../src/directory";

test("directory metadata finds normalized names and professional field prefixes", () => {
  const result = directoryFields({ name: "Élodie N'Goma", headline: "Senior Data Engineer", company: "Société Labs", location: "São Paulo", skills: ["TypeScript"], interests: ["Mentoring"] });
  assert.equal(result.nameKey, "elodie n goma");
  for (const key of ["elodie", "goma", "data eng", "societe", "sao p", "typescript", "mentor"]) assert.ok(result.searchKeys.includes(key), key);
  assert.equal(result.searchKeys.length, new Set(result.searchKeys).size);
});

test("directory metadata is bounded by Unicode codepoints and key count", () => {
  const result = directoryFields({ name: "𠮷".repeat(80), headline: "a".repeat(200), skills: Array.from({ length: 3000 }, (_, index) => `${index} skill ${"x".repeat(100)}`) });
  assert.ok(result.searchKeys.length <= 500);
  assert.ok(result.searchKeys.every(key => Array.from(key).length <= 32));
  assert.ok(result.searchKeys.includes("𠮷".repeat(32)));
  assert.ok(!result.searchKeys.some(key => /[\uD800-\uDBFF]$/.test(key)));
});

test("empty directory metadata is safe and contains no invented search record", () => {
  assert.deepEqual(directoryFields({}), { nameKey: "", searchKeys: [] });
  assert.deepEqual(directoryFields({ name: "  ---  " }), { nameKey: "", searchKeys: [] });
});

test("large professional fields share the bounded index budget", () => {
  const result = directoryFields({ name: "Ada", headline: Array.from({ length: 24 }, (_, index) => `headline${index}`).join(" "), company: "Loop", location: "Austin", skills: ["TypeScript"], interests: ["Mentoring"] });
  for (const key of ["ada", "loop", "austin", "typescript", "mentor"]) assert.ok(result.searchKeys.includes(key), key);
  assert.ok(result.searchKeys.length <= 500);
});
