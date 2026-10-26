import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { readTheme, saveTheme, themeStorageKey } from "../src/themeStorage";

test("appearance defaults dark and preserves the explicit light choice across visits", () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readTheme(storage), "dark"); saveTheme("light", storage); assert.equal(readTheme(storage), "light");
  values.set(themeStorageKey, "system"); assert.equal(readTheme(storage), "dark");
  assert.doesNotThrow(() => saveTheme("light", { setItem() { throw new Error("Storage blocked"); } }));
  assert.equal(readTheme({ getItem() { throw new Error("Storage blocked"); } }), "dark");
});

test("the first-paint script applies saved light before app startup and survives blocked storage", () => {
  const source = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
  for (const stored of [null, "light", "dark", "invalid", "blocked"]) {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> }, meta = new Map<string, string>();
    runInNewContext(source, { localStorage: { getItem() { if (stored === "blocked") throw new Error("Storage blocked"); return stored; } }, document: { documentElement: root, querySelector: () => ({ setAttribute: (key: string, value: string) => meta.set(key, value) }) } });
    const expected = stored === "light" ? "light" : "dark";
    assert.equal(root.dataset.theme, expected); assert.equal(root.style.colorScheme, expected);
    assert.equal(meta.get("content"), expected === "light" ? "#f7f7f5" : "#141414");
  }
});
