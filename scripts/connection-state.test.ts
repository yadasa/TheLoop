import test from "node:test";
import assert from "node:assert/strict";
import { isOffline } from "../apps/mobile/src/connectionState";

test("unknown connectivity does not report offline; either explicit failure does", () => {
  assert.equal(isOffline({}), false);
  assert.equal(isOffline({ isConnected: true }), false);
  assert.equal(
    isOffline({ isConnected: true, isInternetReachable: true }),
    false,
  );
  assert.equal(isOffline({ isConnected: false }), true);
  assert.equal(
    isOffline({ isConnected: true, isInternetReachable: false }),
    true,
  );
  assert.equal(
    isOffline({ isConnected: false, isInternetReachable: true }),
    true,
  );
});
