const net = require("node:net");

function nativePort(value = "8098") {
  if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
    throw new Error("Choose a preview port from 1024 to 65535.");
  return Number(value);
}

async function assertNativePortAvailable(port) {
  for (const host of ["127.0.0.1", "::1"]) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", (error) => {
        if (host === "::1" && ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) {
          resolve();
        } else {
          reject(new Error(`Port ${port} is unavailable on ${host}. Leave the existing app running and choose another --port.`));
        }
      });
      server.listen({ port, host, exclusive: true }, () => server.close(resolve));
    });
  }
}

module.exports = { nativePort, assertNativePortAvailable };
