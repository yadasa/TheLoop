import test from "node:test";
import assert from "node:assert/strict";
import { readableError } from "./errorCopy";
const failure = (code: string, message = "Raw SDK detail") => Object.assign(new Error(message), { code, name: "FirebaseError" });

test("credential failures have identical useful copy without revealing account existence", () => {
  const codes = ["auth/wrong-password", "auth/user-not-found", "auth/invalid-credential", "auth/invalid-login-credentials", "auth/user-disabled"];
  const messages = codes.map(code => readableError(failure(code, `Private account detail for ${code}`)));
  assert.equal(new Set(messages).size, 1); assert.match(messages[0], /email and password/); assert.match(messages[0], /reset your password/);
  assert.ok(messages.every(message => !/not found|disabled|Private account/.test(message)));
});
test("Firebase text-only wrappers cannot collapse auth errors into just Error", () => {
  assert.equal(readableError(new Error("Firebase: Error (auth/invalid-credential).")), readableError(failure("auth/invalid-credential")));
  assert.match(readableError(failure("auth/invalid-email")), /valid email address/);
  assert.match(readableError(failure("auth/requires-recent-login")), /Sign in again/);
  assert.match(readableError(failure("auth/email-already-in-use")), /Try signing in/);
  assert.doesNotMatch(readableError(failure("auth/email-already-in-use")), /already.*use|exists/i);
});
test("network and timeout errors give recovery guidance without transport details", () => {
  for (const error of [failure("auth/network-request-failed"), new TypeError("Failed to fetch"), new TypeError("Network request failed")]) assert.match(readableError(error), /Check your connection/);
  assert.match(readableError(failure("functions/deadline-exceeded")), /timed out/);
  assert.match(readableError(failure("unavailable")), /temporarily unavailable/);
});
test("trusted callable validation retains useful version, permission and quota instructions", () => {
  for (const [code, message] of [["permission-denied", "Verify your email before posting."], ["failed-precondition", "This event changed. Refresh its details before saving."], ["resource-exhausted", "You can join up to 50 active Squads."], ["invalid-argument", "Use a valid HTTPS link."], ["aborted", "Another refresh is running. Try again in a moment."]]) assert.equal(readableError(failure(`functions/${code}`, message)), message);
  assert.match(readableError(failure("permission-denied", "Missing or insufficient permissions.")), /right account/);
});
test("internal and unknown Firebase errors never expose endpoint, account or debug messages", () => {
  const hidden = "POST https://us-central1-example.cloudfunctions.net/getMedia projects/example/documents/users/private-user token=secret";
  for (const code of ["functions/internal", "functions/unknown", "auth/internal-error", "auth/new-sdk-error", "auth/constructor", "auth/__proto__", "firestore/data-loss", "functions/new-status"]) assert.equal(readableError(failure(code, hidden)), readableError(undefined));
  for (const message of [hidden, "http://127.0.0.1:5019/request failed", "Connection refused at 192.168.1.2:5019", "D:\\private\\service.json", '{"password":"private"}', "token=private", "Bearer private", "Error: invalid request\n at handler (server.js:40)", "500 INTERNAL_SERVER_ERROR", "An internal error has occurred.", "Request failed with status code 500", "opaquePrivateIdentifier98432"]) assert.equal(readableError(new Error(message)), readableError(undefined));
});
test("callable details with raw infrastructure are replaced by safe domain guidance", () => {
  for (const message of ["Missing projects/private/databases/default/documents/users/private", "Request to https://example.test/private failed", "Authorization: Bearer private", "TypeError: Cannot read properties of undefined"]) assert.doesNotMatch(readableError(failure("functions/permission-denied", message)), /projects\/|https:|Bearer|TypeError/);
});
test("empty, opaque and non-error values always produce a complete sentence", () => {
  for (const error of [undefined, null, "private string", 42, {}, { message: "untrusted detail" }, new Error(""), new Error("Firebase: Error"), new Error("INTERNAL"), new SyntaxError("Unexpected private JSON")]) assert.equal(readableError(error), readableError(undefined));
  assert.match(readableError({ code: "auth/invalid-email", message: "opaque" }), /valid email/);
  const inaccessible = Object.defineProperty({}, "message", { get() { throw new Error("Do not read"); } }); assert.doesNotThrow(() => readableError(inaccessible));
});
test("local validation is sanitized, bounded and stable when formatted twice", () => {
  assert.equal(readableError(new Error("  Enter\u0000 a name.\nTry another name.  ")), "Enter a name. Try another name.");
  const message = readableError(new Error("Choose another topic. ".repeat(50))); assert.ok(message.length <= 240); assert.ok(message.endsWith("…"));
  assert.equal(readableError(new Error("Very long response ".repeat(1000))), readableError(undefined));
  assert.equal(readableError(new Error(message)), message);
  assert.equal(readableError(new Error("Use a password with at least 8 characters.")), "Use a password with at least 8 characters.");
});
