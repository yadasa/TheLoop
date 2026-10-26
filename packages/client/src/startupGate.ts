import { defaultPreferences, type Preferences, type Profile } from "@theloop/core";

export type StartupStatus = { ready: boolean; error: string | null };

/** One terminal startup attempt. Only a new, explicitly scoped attempt can recover a failure. */
export class StartupGate {
  private pending: Set<string>;
  private required: Set<string>;
  private stopped = false;
  private failed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private options: {
    pending: string[];
    required?: string[];
    current(): boolean;
    publish(status: StartupStatus): void;
    describeError(error: unknown): string;
    optionalError?(error: unknown): void;
    abort?(message: string): void;
    timeoutMs?: number;
  }) {
    this.pending = new Set(options.pending);
    this.required = new Set(options.required);
    options.publish({ ready: false, error: null });
    this.timer = setTimeout(() => this.fail(new Error("Loading could not finish. Check your connection and try again.")), options.timeoutMs ?? 45000);
  }
  get current(): boolean { return !this.stopped && !this.failed && this.options.current(); }

  loaded(key: string): void {
    if (!this.current) return;
    this.pending.delete(key);
    if (!this.pending.size) {
      this.clearTimer();
      this.options.publish({ ready: true, error: null });
    }
  }

  /** A cached critical record cannot authorize onboarding or supply account preferences. */
  receive(key: string, fromCache: boolean, hydrate: () => void): void {
    if (!this.current || (this.required.has(key) && fromCache)) return;
    try {
      hydrate();
      this.loaded(key);
    } catch (error) { this.fail(error, key); }
  }

  fail(error: unknown, key?: string): void {
    if (!this.current) return;
    if (key && !this.required.has(key)) {
      this.options.optionalError?.(error);
      this.loaded(key);
      return;
    }
    this.failed = true;
    this.clearTimer();
    const message = this.options.describeError(error);
    this.options.abort?.(message);
    this.options.publish({ ready: false, error: message });
  }

  stop(): void { this.stopped = true; this.clearTimer(); }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");

export function startupProfile(data: Record<string, unknown>, userId: string): Profile {
  const invalid = () => { throw new Error("Your profile could not be read. Try again or sign out."); };
  if (data.id !== undefined && data.id !== userId) invalid();
  for (const key of ["name", "initials", "handle", "headline", "company", "location", "bio", "joinedAt"])
    if (typeof data[key] !== "string") invalid();
  for (const key of ["skills", "interests", "openTo"]) if (!strings(data[key])) invalid();
  if (!object(data.trust) || typeof data.trust.score !== "number" || !Number.isFinite(data.trust.score) || !strings(data.trust.reasons)) invalid();
  if (!Array.isArray(data.links) || data.links.some(link => !object(link) || typeof link.label !== "string" || typeof link.url !== "string")) invalid();
  if (typeof data.verified !== "boolean" || !["public", "connections"].includes(String(data.visibility))) invalid();
  return { ...data, id: userId } as Profile;
}

/** Legacy top-level preferences remain supported; missing/invalid account data never becomes defaults-only onboarding. */
export function startupPreferences(data: Record<string, unknown>): Preferences {
  if (data.disabled || data.deletionPending) throw new Error("This account is unavailable. Sign out or try again after your account status is resolved.");
  const source = data.preferences ?? ("subscriptions" in data || "onboardingComplete" in data ? data : undefined);
  if (!object(source)) throw new Error("Your account settings could not be loaded. Try again or sign out.");
  if (typeof source.onboardingComplete !== "boolean" || !object(source.subscriptions))
    throw new Error("Your account settings could not be read. Try again or sign out.");
  const preferences = { ...defaultPreferences(), ...source };
  const invalid = () => { throw new Error("Your account settings could not be read. Try again or sign out."); };
  for (const key of ["joinedCommunityIds", "followingIds", "blockedIds", "savedPostIds", "interests", "squadMutedIds", "dmMutedIds"] as const)
    if (!Array.isArray(preferences[key]) || !preferences[key]!.every(value => typeof value === "string")) invalid();
  if (!object(preferences.subscriptions) || Object.values(preferences.subscriptions).some(value => !["following", "muted", "hidden"].includes(String(value)))) invalid();
  for (const key of ["readChannels", "squadReadAt"] as const)
    if (!object(preferences[key]) || Object.values(preferences[key]!).some(value => typeof value !== "string")) invalid();
  for (const key of ["onboardingComplete", "quietHours", "hideUnsubscribed", "eventReminders"] as const)
    if (typeof preferences[key] !== "boolean") invalid();
  for (const key of ["quietStart", "quietEnd", "timezone"] as const)
    if (typeof preferences[key] !== "string") invalid();
  if (!["off", "daily", "weekly"].includes(preferences.digest) || !["connections", "everyone", "nobody"].includes(preferences.dmPolicy)) invalid();
  return preferences;
}
