export type CatalogDocument = Record<string, unknown>;
export type SeedOptions = { projectId: string; ownerId: string; apply: boolean };
export type OwnerIdentity = {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
};
export type CatalogTransaction = {
  get(path: string): Promise<CatalogDocument | undefined>;
  create(path: string, value: CatalogDocument): void;
  update(path: string, value: CatalogDocument): void;
};

export function parseSeedOptions(
  args: string[],
  env: Record<string, string | undefined>,
): SeedOptions {
  if (
    ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FUNCTIONS_EMULATOR"]
      .some((key) => !!env[key])
  ) throw new Error("Use seed:emulator for emulator data. Live initialization refuses emulator settings.");
  const values = new Map<string, string>();
  let apply = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--apply" || flag === "--dry-run") {
      if ((flag === "--apply" && apply) || (flag === "--dry-run" && dryRun))
        throw new Error(`Do not repeat ${flag}.`);
      if (flag === "--apply") apply = true;
      else dryRun = true;
      continue;
    }
    if (flag !== "--project" && flag !== "--owner")
      throw new Error(`Unknown initializer option: ${flag}.`);
    const value = args[++i];
    if (!value || value.startsWith("--") || values.has(flag))
      throw new Error(`Pass ${flag} once with an explicit value.`);
    values.set(flag, value);
  }
  if (apply && dryRun) throw new Error("Choose --dry-run or --apply, not both.");
  const projectId = values.get("--project") || "";
  const ownerId = values.get("--owner") || "";
  if (!/^theloop-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(projectId) || projectId.length > 30)
    throw new Error("Pass an explicitly named dedicated TheLoop project with --project.");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId))
    throw new Error("Pass the authenticated community owner UID with --owner.");
  return { projectId, ownerId, apply };
}

export function firstAfroTechCatalog(ownerId: string, now: string): Record<string, CatalogDocument> {
  return {
    "conferences/afrotech": {
      id: "afrotech",
      name: "AfroTech 2026",
      shortName: "AF",
      city: "Houston, TX",
      startDate: "2026-11-02",
      endDate: "2026-11-06",
      description: "Community-run conversations for AfroTech 2026, November 2–6 at the George R. Brown Convention Center in Houston.",
      members: 0,
      tagline: "Connect before, during and after AfroTech.",
      organizerIds: [ownerId],
      createdAt: now,
    },
    "channels/afrotech-general": {
      id: "afrotech-general",
      conferenceId: "afrotech",
      name: "AfroTech group chat",
      description: "Meet other attendees, ask questions and make plans for AfroTech 2026. This is an independent community chat.",
      icon: "#",
      members: 0,
      topics: ["General", "Introductions", "Jobs & referrals", "Side events", "Travel"],
      visibility: "public",
      moderatorIds: [ownerId],
      creatorId: ownerId,
      createdAt: now,
    },
  };
}

export function assertBootstrappedOwner(
  ownerId: string,
  auth: OwnerIdentity,
  user: CatalogDocument | undefined,
  profile: CatalogDocument | undefined,
): void {
  if (auth.uid !== ownerId || auth.disabled || !auth.emailVerified || !auth.email?.trim())
    throw new Error("The owner must have an active, email-verified Firebase Auth account.");
  if (!user || !profile || user.id !== ownerId || profile.id !== ownerId || !user.preferences || typeof user.preferences !== "object" || Array.isArray(user.preferences))
    throw new Error("The owner must sign in and complete bootstrap with matching user and profile records before catalog initialization.");
  if (user.disabled || user.deletionPending)
    throw new Error("The owner account is disabled or pending deletion. Nothing was initialized.");
}

function verifyExisting(path: string, existing: CatalogDocument, expected: CatalogDocument): void {
  const owners = path.startsWith("conferences/") ? "organizerIds" : "moderatorIds";
  for (const [key, value] of Object.entries(expected)) {
    if (key === "members" || key === "createdAt") continue;
    if (key === owners) {
      if (Array.isArray(existing[key]) && (existing[key] as unknown[]).includes((value as string[])[0])) continue;
    } else if (JSON.stringify(existing[key]) === JSON.stringify(value)) continue;
    throw new Error(`Catalog conflict at ${path}: ${key} differs from the first AfroTech configuration. Existing data was not overwritten. Review it separately.`);
  }
  if (typeof existing.members !== "number" || !Number.isFinite(existing.members) || existing.members < 0)
    throw new Error(`Catalog conflict at ${path}: invalid existing member count. Existing data was not overwritten.`);
  if (path.startsWith("channels/") && existing.communityId !== undefined)
    throw new Error(`Catalog conflict at ${path}: an existing community scope differs. Existing data was not overwritten.`);
}

/** Every read and conflict check finishes before either create or the explicit owner role grant. */
export async function initializeFirstAfroTech(
  tx: CatalogTransaction,
  options: SeedOptions,
  auth: OwnerIdentity,
  now: string,
): Promise<{ created: string[]; skipped: string[]; grantAdmin: boolean }> {
  const catalog = firstAfroTechCatalog(options.ownerId, now);
  const paths = Object.keys(catalog);
  const [user, profile, ...existing] = await Promise.all([
    tx.get(`users/${options.ownerId}`),
    tx.get(`profiles/${options.ownerId}`),
    ...paths.map((path) => tx.get(path)),
  ]);
  assertBootstrappedOwner(options.ownerId, auth, user, profile);
  const created: string[] = [];
  const skipped: string[] = [];
  paths.forEach((path, i) => {
    if (existing[i]) {
      verifyExisting(path, existing[i]!, catalog[path]);
      skipped.push(path);
    } else created.push(path);
  });
  const grantAdmin = user!.role !== "admin";
  if (options.apply) {
    for (const path of created) tx.create(path, catalog[path]);
    if (grantAdmin) tx.update(`users/${options.ownerId}`, { role: "admin" });
  }
  return { created, skipped, grantAdmin };
}
