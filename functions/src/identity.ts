import { Doc } from "./policy";

/** Participation identity is shared with this record's readers, not the full profile. */
export function participationIdentity(profile: Doc): {
  name: string;
  initials: string;
} {
  const name =
    String(profile.name || "Loop member")
      .trim()
      .slice(0, 80) || "Loop member";
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 8) || "LM";
  return { name, initials };
}
export function authorSnapshot(profile: Doc): {
  authorName: string;
  authorInitials: string;
} {
  const { name, initials } = participationIdentity(profile);
  return { authorName: name, authorInitials: initials };
}
