import qrcode from "qrcode-generator";
import { validLinkId } from "@theloop/core";
import { resolveShareTarget } from "./sharedLinks";

/** No names, email addresses or profile fields are embedded in the code. */
export function profileCode(id: string, webURL?: string) {
  if (!validLinkId(id)) throw new Error("Profile unavailable.");
  const link = resolveShareTarget({ kind: "profile", id }, webURL);
  if (link.url.length > 1024 || /[^\x20-\x7e]/.test(link.url))
    throw new Error("Use the profile link instead.");
  const code = qrcode(0, "M");
  code.addData(link.url, "Byte");
  code.make();
  const modules = code.getModuleCount(),
    quiet = 4;
  let path = "";
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!code.isDark(row, col)) continue;
      const start = col;
      while (col + 1 < modules && code.isDark(row, col + 1)) col++;
      path += `M${start + quiet} ${row + quiet}h${col - start + 1}v1h-${col - start + 1}z`;
    }
  }
  return { ...link, size: modules + quiet * 2, path };
}
