import React, { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { parseTheme, readTheme, saveTheme, themeStorageKey, type Theme } from "./themeStorage";

const themeChanged = "theloop-theme-change";
const palette = { dark: "#141414", light: "#f7f7f5" };
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const value = document.documentElement.dataset.theme;
  if (value === "dark" || value === "light") return value;
  try { return readTheme(window.localStorage); } catch { return "dark"; }
}
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette[theme]);
}
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try { saveTheme(theme, window.localStorage); } catch { /* Apply the choice for this tab. */ }
  window.dispatchEvent(new Event(themeChanged));
}
function subscribe(update: () => void): () => void {
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    applyTheme(parseTheme(event.key === null ? null : event.newValue));
    update();
  };
  window.addEventListener(themeChanged, update);
  window.addEventListener("storage", storageChanged);
  return () => { window.removeEventListener(themeChanged, update); window.removeEventListener("storage", storageChanged); };
}
export function ThemeSwitcher({ compact = true }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as const), next = theme === "dark" ? "light" : "dark";
  useEffect(() => { applyTheme(theme); }, [theme]);
  const Icon = theme === "dark" ? Sun : Moon;
  return <button type="button" className={`theme-switcher ${compact ? "icon-button" : "button subtle"}`} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} onClick={() => setTheme(next)}><Icon size={17} />{!compact && <span>{theme === "dark" ? "Dark" : "Light"} theme</span>}</button>;
}
