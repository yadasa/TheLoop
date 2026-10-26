import { assert, Doc, httpsUrl, list, text } from "./policy";

export function commandFields(command: Doc, allowed: string[]): void {
  assert(
    Object.keys(command).every((key) => allowed.includes(key)),
    "invalid-argument",
    "This action contains a field that cannot be changed.",
  );
}

export function editablePost(
  input: unknown,
  kind: string,
): { patch: Doc; removeUrl: boolean } {
  assert(
    input && typeof input === "object" && !Array.isArray(input),
    "invalid-argument",
    "Provide the post fields to edit.",
  );
  const entries = Object.entries(input);
  assert(
    entries.length > 0 &&
      entries.every(([key]) => ["title", "body", "tags", "url"].includes(key)),
    "invalid-argument",
    "Only title, body, tags and URL can be edited.",
  );
  const patch: Doc = {};
  let removeUrl = false;
  for (const [key, value] of entries) {
    if (key === "title") patch.title = text(value, "Title", 180);
    if (key === "body")
      patch.body = text(value, "Post", 10000, kind === "poll" ? 0 : 1);
    if (key === "tags") patch.tags = list(value, "Tags", 6, 30);
    if (key === "url") {
      const url = text(value, "URL", 2048, 0);
      if (!url) removeUrl = true;
      else patch.url = httpsUrl(url);
    }
  }
  return { patch, removeUrl };
}
