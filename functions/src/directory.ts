type DirectoryProfile = { name?: string; headline?: string; company?: string; location?: string; skills?: string[]; interests?: string[] };

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";
}

/** Server-owned search metadata: no private fields, unbounded arrays, or full-text payloads. */
export function directoryFields(profile: DirectoryProfile): { nameKey: string; searchKeys: string[] } {
  const nameKey = Array.from(normalize(profile.name ?? "")).slice(0, 160).join("");
  const groups = [[profile.name], [profile.headline], [profile.company], [profile.location], (profile.skills ?? []).slice(0, 30), (profile.interests ?? []).slice(0, 30)];
  const groupKeys = groups.map(fields => {
    const candidates = new Set<string>();
    for (const field of fields) {
      const words = normalize(typeof field === "string" ? field : "").split(" ").filter(Boolean).slice(0, 24);
      // Suffixes let a prefix such as "data eng" find "Senior data engineer".
      for (let index = 0; index < words.length; index++) candidates.add(Array.from(words.slice(index).join(" ")).slice(0, 32).join(""));
    }
    const keys = new Set<string>([...candidates].slice(0, 500));
    for (let length = 1; length <= 32 && keys.size < 500; length++) for (const candidate of candidates) {
      const points = Array.from(candidate);
      if (length <= points.length) keys.add(points.slice(0, length).join(""));
      if (keys.size === 500) break;
    }
    return [...keys][Symbol.iterator]();
  });
  // Share the finite budget across field types so a long headline cannot crowd
  // company, location, skills, or interests out of the index.
  const keys = new Set<string>();
  let remaining = true;
  while (remaining && keys.size < 500) {
    remaining = false;
    for (const group of groupKeys) {
      const next = group.next();
      if (!next.done) { remaining = true; keys.add(next.value); }
      if (keys.size === 500) break;
    }
  }
  return { nameKey, searchKeys: [...keys] };
}
