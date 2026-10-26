import test from "node:test";
import assert from "node:assert/strict";
import { defaultPreferences, initialState } from "@theloop/core";
import { StartupGate, startupPreferences, startupProfile, type StartupStatus } from "./startupGate";
import { readableError } from "./errorCopy";

function harness() {
  let active = true;
  const statuses: StartupStatus[] = [], aborted: string[] = [], optional: unknown[] = [];
  const gate = new StartupGate({
    pending: ["bootstrap", "owner", "preferences", "posts"],
    required: ["bootstrap", "owner", "preferences"],
    current: () => active,
    publish: value => statuses.push(value),
    describeError: readableError,
    optionalError: error => optional.push(error),
    abort: message => aborted.push(message),
  });
  return { gate, statuses, aborted, optional, deactivate() { active = false; } };
}

test("bootstrap failures remain blocked despite late successful callbacks; retry needs a new attempt", () => {
  const h = harness();
  h.gate.fail({ code: "functions/unavailable" });
  h.gate.loaded("bootstrap"); h.gate.loaded("owner"); h.gate.loaded("preferences"); h.gate.loaded("posts");
  let hydrated = false;
  h.gate.receive("preferences", false, () => { hydrated = true; });
  assert.equal(hydrated, false);
  assert.equal(h.statuses.at(-1)?.ready, false);
  assert.ok(h.statuses.at(-1)?.error);
  assert.equal(h.aborted.length, 1);
  const retry = harness();
  retry.gate.loaded("bootstrap"); retry.gate.loaded("owner"); retry.gate.loaded("preferences"); retry.gate.loaded("posts");
  assert.deepEqual(retry.statuses.at(-1), { ready: true, error: null });
  h.gate.stop(); retry.gate.stop();
});

test("cached critical records cannot hydrate defaults or complete startup; metadata confirmation can", () => {
  const h = harness(); let hydrated = 0;
  h.gate.loaded("bootstrap"); h.gate.loaded("posts");
  h.gate.receive("owner", true, () => { hydrated++; });
  h.gate.receive("preferences", true, () => { hydrated++; });
  assert.equal(hydrated, 0);
  assert.deepEqual(h.statuses.at(-1), { ready: false, error: null });
  h.gate.receive("owner", false, () => { hydrated++; });
  assert.equal(h.statuses.at(-1)?.ready, false);
  h.gate.receive("preferences", false, () => { hydrated++; });
  assert.equal(hydrated, 2);
  assert.deepEqual(h.statuses.at(-1), { ready: true, error: null });
  h.gate.stop();
});

test("critical snapshot failures and invalid hydration cannot become ready-empty accounts", () => {
  for (const key of ["owner", "preferences"]) {
    const h = harness();
    h.gate.loaded("bootstrap"); h.gate.loaded("posts");
    h.gate.fail({ code: "permission-denied" }, key);
    h.gate.loaded("owner"); h.gate.loaded("preferences");
    assert.equal(h.statuses.at(-1)?.ready, false);
    assert.equal(h.aborted.length, 1);
    h.gate.stop();
  }
  const h = harness();
  h.gate.receive("preferences", false, () => startupPreferences({ id: "uid" }));
  assert.match(h.statuses.at(-1)?.error ?? "", /settings could not be loaded/);
  assert.equal(h.aborted.length, 1);
  h.gate.stop();
});

test("optional collection errors finish their wait without discarding confirmed account state", () => {
  const h = harness();
  h.gate.loaded("bootstrap"); h.gate.loaded("owner"); h.gate.loaded("preferences");
  h.gate.fail(new Error("Missing optional index"), "posts");
  assert.equal(h.optional.length, 1);
  assert.equal(h.aborted.length, 0);
  assert.deepEqual(h.statuses.at(-1), { ready: true, error: null });
  h.gate.stop();
});

test("normal post-ready updates remain live, while later critical revocation blocks and purges", () => {
  const h = harness(); let updates = 0;
  for (const key of ["bootstrap", "owner", "preferences", "posts"]) h.gate.loaded(key);
  h.gate.receive("preferences", false, () => { updates++; });
  assert.equal(updates, 1);
  h.gate.fail({ code: "permission-denied" }, "owner");
  h.gate.receive("preferences", false, () => { updates++; });
  assert.equal(updates, 1);
  assert.equal(h.statuses.at(-1)?.ready, false);
  assert.equal(h.aborted.length, 1);
  h.gate.stop();
});

test("auth switch and synchronous retry cancellation fence every stale success/error before hydration", () => {
  for (const cancel of ["auth", "retry"] as const) {
    const h = harness(); let hydrated = false;
    if (cancel === "auth") h.deactivate(); else h.gate.stop();
    const count = h.statuses.length;
    h.gate.receive("owner", false, () => { hydrated = true; });
    h.gate.fail(new Error("Old user's failure"));
    h.gate.loaded("bootstrap");
    assert.equal(hydrated, false);
    assert.equal(h.statuses.length, count);
    assert.equal(h.aborted.length, 0);
    h.gate.stop();
  }
});

test("a stalled runtime or server confirmation becomes a bounded retryable error", async () => {
  const statuses: StartupStatus[] = [];
  const gate = new StartupGate({ pending: ["runtime"], current: () => true, publish: status => statuses.push(status), describeError: readableError, timeoutMs: 1 });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(statuses.at(-1)?.ready, false);
  assert.match(statuses.at(-1)?.error ?? "", /connection.*try again/);
  gate.loaded("runtime");
  assert.equal(statuses.at(-1)?.ready, false);
  gate.stop();
});

test("account hydration preserves actual saved preferences and fills only valid legacy gaps", () => {
  const saved = { ...defaultPreferences(), onboardingComplete: true, interests: ["Design"], subscriptions: { afrotech: "following" as const }, blockedIds: ["blocked-peer"] };
  assert.deepEqual(startupPreferences({ id: "uid", preferences: saved }), saved);
  const legacy = startupPreferences({ subscriptions: { afrotech: "hidden" }, onboardingComplete: true });
  assert.equal(legacy.onboardingComplete, true);
  assert.equal(legacy.subscriptions.afrotech, "hidden");
  assert.deepEqual(legacy.blockedIds, []);
  for (const invalid of [
    {}, { preferences: [] }, { preferences: null }, { preferences: {} },
    { preferences: saved, disabled: true }, { preferences: saved, deletionPending: true },
    { preferences: { ...saved, blockedIds: "wrong" } }, { preferences: { ...saved, subscriptions: { afrotech: "unknown" } } },
    { preferences: { ...saved, onboardingComplete: "true" } },
  ]) assert.throws(() => startupPreferences(invalid), /account|settings/);
});

test("critical owner hydration validates renderable profile fields instead of casting a malformed document", () => {
  const profile = initialState().profiles[0];
  assert.deepEqual(startupProfile(profile, profile.id), profile);
  for (const patch of [
    { id: "different-owner" }, { name: null }, { initials: [] }, { skills: "invalid" },
    { interests: [42] }, { links: [null] }, { links: [{ label: "Bad link", url: 123 }] },
    { trust: {} }, { trust: { score: NaN, reasons: [] } }, { trust: { score: 5, reasons: "wrong" } },
  ]) assert.throws(() => startupProfile({ ...profile, ...patch }, profile.id), /profile could not be read/);
  const h = harness();
  h.gate.receive("owner", false, () => startupProfile({ id: profile.id }, profile.id));
  assert.equal(h.statuses.at(-1)?.ready, false);
  assert.equal(h.aborted.length, 1);
  h.gate.stop();
});
