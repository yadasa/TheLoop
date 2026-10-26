const { test } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { nativePort, assertNativePortAvailable } = require("./native-port.cjs");

test("preview ports are explicit bounded integers", () => {
  assert.equal(nativePort(), 8098);
  assert.equal(nativePort("8109"), 8109);
  for (const input of ["", "0", "1023", "65536", "8e3", "8109.5", "8109x"])
    assert.throws(() => nativePort(input), /1024 to 65535/);
});

test("an IPv4-only listener is detected and left running", async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await assert.rejects(assertNativePortAvailable(port), /choose another --port/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  await assertNativePortAvailable(port);
});
