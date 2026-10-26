export type Theme = "dark" | "light";
export const themeStorageKey = "theloop-theme";
export const parseTheme = (value: unknown): Theme => value === "light" ? "light" : "dark";
export function readTheme(storage?: Pick<Storage, "getItem">): Theme {
  try { return parseTheme(storage?.getItem(themeStorageKey)); } catch { return "dark"; }
}
export function saveTheme(theme: Theme, storage?: Pick<Storage, "setItem">): void {
  try { storage?.setItem(themeStorageKey, theme); } catch { /* The current tab still changes when device storage is unavailable. */ }
}
