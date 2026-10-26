// Render the original vector mark for Expo. Sharp is already a backend dependency.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const sharp = require("sharp");
const assets = new URL("../apps/mobile/assets/", import.meta.url);
const mark = '<g fill="none" stroke="#f6f6f3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M31 7.4A17 17 0 1 0 37.4 35L43 38l-2.3-9.2"/><path d="M18 16v15h12"/><circle cx="37" cy="12" r="4" fill="#f6f6f3" stroke="none"/></g>';
const svg = (content, viewBox = "0 0 64 64") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>\n`;
const icon = svg(`<rect width="64" height="64" fill="#101112"/><g transform="translate(8 8)">${mark}</g>`);
const adaptive = svg(`<g transform="translate(18 18) scale(.5833333333)">${mark}</g>`);
const transparent = svg(mark, "0 0 48 48");
for (const [name, source, size] of [["icon.png", icon, 1024], ["favicon.png", icon, 64], ["adaptive-icon.png", adaptive, 1024], ["notification-icon.png", transparent, 96], ["loop-mark.png", transparent, 192]]) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(fileURLToPath(new URL(name, assets)));
}
await writeFile(new URL("logo.svg", assets), icon);
await writeFile(new URL("adaptive-icon.svg", assets), adaptive);
await writeFile(new URL("loop-mark.svg", assets), transparent);
console.log("Rendered TheLoop conversation mark for Expo.");
