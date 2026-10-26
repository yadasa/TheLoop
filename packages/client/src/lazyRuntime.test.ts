import test from "node:test";
import assert from "node:assert/strict";
import { lazyRuntime, resolveLiveRuntime } from "./lazyRuntime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

test("a cold preview creates no runtime work and concurrent live requests share the import", async () => {
  let imports = 0;
  const pending = deferred<{ ready: boolean }>(), load = lazyRuntime(() => { imports++; return pending.promise; });
  assert.equal(imports, 0);
  const first = load(), second = load();
  assert.equal(first, second);
  pending.resolve({ ready: true });
  assert.deepEqual(await first, { ready: true });
  assert.equal(imports, 1);
  assert.equal(await load(), await first);
});

test("failed chunk downloads are retryable instead of permanently breaking live sign-in", async () => {
  let attempts = 0;
  const load = lazyRuntime(async () => { if (++attempts === 1) throw new Error("offline"); return "runtime"; });
  await assert.rejects(load(), /offline/);
  assert.equal(await load(), "runtime");
  assert.equal(attempts, 2);
});

test("leaving live mode during a slow import never calls native persistence or initializes auth", async () => {
  const pending = deferred<string>(); let current = true, prepared = 0;
  const result = resolveLiveRuntime({ load: () => pending.promise, prepare: () => { prepared++; return "persistence"; }, current: () => current });
  current = false; pending.resolve("runtime");
  assert.equal(await result, undefined);
  assert.equal(prepared, 0);
});

test("unmount or an auth-generation change during persistence cannot create listeners", async () => {
  const persistence = deferred<string>(); let generation = 1;
  const result = resolveLiveRuntime({ load: async () => "runtime", prepare: () => persistence.promise, current: () => generation === 1 });
  await Promise.resolve(); generation++; persistence.resolve("native persistence");
  assert.equal(await result, undefined);
});

test("an existing callable Persistence value passes through without being invoked as a factory", async () => {
  let invoked = 0;
  const persistence = () => { invoked++; }, result = await resolveLiveRuntime({ load: async () => "runtime", prepare: () => persistence, current: () => true });
  assert.equal(result?.prepared, persistence);
  assert.equal(invoked, 0);
});
