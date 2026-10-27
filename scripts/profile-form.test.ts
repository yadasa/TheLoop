import test from "node:test";
import assert from "node:assert/strict";
import { profileLinks, profileTags } from "../apps/mobile/src/profileForm";

test("profile links accept ordinary pasted domains, infer labels and ignore empty rows", () => {
  assert.deepEqual(
    profileLinks([
      { label: "", url: "" },
      { label: "", url: "www.linkedin.com/in/example" },
      { label: " Work ", url: "https://example.com" },
    ]),
    [
      { label: "LinkedIn", url: "https://www.linkedin.com/in/example" },
      { label: "Work", url: "https://example.com/" },
    ],
  );
  assert.equal(
    profileLinks([
      { label: "One", url: "example.com" },
      { label: "Duplicate", url: "https://example.com/" },
    ]).length,
    1,
  );
});
test("profile links reject credentials, unsafe schemes, missing addresses and server-limit violations", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/some path",
    "data:text/html,test",
    "https://",
  ]) {
    assert.throws(() => profileLinks([{ label: "Website", url }]));
  }
  assert.throws(
    () => profileLinks([{ label: "Portfolio", url: "" }]),
    /web address/,
  );
  assert.throws(
    () => profileLinks([{ label: "a".repeat(41), url: "https://example.com" }]),
    /40 characters/,
  );
  assert.throws(
    () =>
      profileLinks(
        Array.from({ length: 9 }, (_, index) => ({
          label: "Website",
          url: `https://example.com/${index}`,
        })),
      ),
    /eight/,
  );
});
test("saving tags includes unfinished input and rejects overflow without changing the original list", () => {
  const values = ["Design"];
  assert.deepEqual(profileTags(values, "design, Engineering\nMentoring"), [
    "Design",
    "Engineering",
    "Mentoring",
  ]);
  assert.deepEqual(values, ["Design"]);
  assert.throws(() => profileTags(values, "a".repeat(61)), /60 characters/);
  assert.throws(
    () =>
      profileTags(
        Array.from({ length: 20 }, (_, index) => `${index}`),
        "one too many",
      ),
    /20 items/,
  );
});
