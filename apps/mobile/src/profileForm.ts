export type ProfileLinkDraft = { label: string; url: string };

export function profileTags(values: string[], pending = ""): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...values, ...pending.split(/[,\n]/)]) {
    const value = raw.trim();
    if (!value) continue;
    if (value.length > 60)
      throw new Error("Keep each skill or interest to 60 characters.");
    const key = value.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  if (result.length > 20)
    throw new Error("Choose up to 20 items in each section.");
  return result;
}

export function profileLinks(rows: ProfileLinkDraft[]): ProfileLinkDraft[] {
  const result: ProfileLinkDraft[] = [];
  for (const [index, row] of rows.entries()) {
    let address = row.url.trim();
    const label = row.label.trim();
    if (!address && !label) continue;
    if (!address)
      throw new Error(`Add a web address for link ${index + 1}, or remove it.`);
    if (!/^[a-z][a-z\d+.-]*:/i.test(address)) address = `https://${address}`;
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      throw new Error(`Check the web address for link ${index + 1}.`);
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /\s/.test(address) ||
      address.length > 2048
    )
      throw new Error(
        `Use an HTTPS web address without a username or password for link ${index + 1}.`,
      );
    if (label.length > 40)
      throw new Error(`Keep the name for link ${index + 1} to 40 characters.`);
    const name =
      label ||
      (url.hostname.replace(/^www\./, "") === "linkedin.com"
        ? "LinkedIn"
        : url.hostname.replace(/^www\./, "").slice(0, 40));
    if (!result.some((item) => item.url === url.href))
      result.push({ label: name, url: url.href });
  }
  if (result.length > 8) throw new Error("Add up to eight profile links.");
  return result;
}
