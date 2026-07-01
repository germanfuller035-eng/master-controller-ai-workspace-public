// Emergency Telegram API HTTPS reachability probe.
// SAFE: makes one GET to api.telegram.org root. No token, no bot logic.
"use strict";
const https = require("https");
const dns = require("dns");

function probe(host, family, label) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.request(
      {
        host,
        port: 443,
        path: "/",
        method: "GET",
        timeout: 7000,
        family,
        lookup: family
          ? (h, opts, cb) => dns.lookup(h, { family }, cb)
          : undefined,
      },
      (res) => {
        console.log(
          label + " status=" + res.statusCode + " t=" + (Date.now() - t0) + "ms"
        );
        res.resume();
        resolve();
      }
    );
    req.on("timeout", () => {
      console.log(label + " TIMEOUT t=" + (Date.now() - t0) + "ms");
      req.destroy(new Error("timeout"));
      resolve();
    });
    req.on("error", (e) => {
      console.log(
        label +
          " ERROR code=" +
          (e.code || "n/a") +
          " msg=" +
          e.message +
          " t=" +
          (Date.now() - t0) +
          "ms"
      );
      resolve();
    });
    req.end();
  });
}

(async () => {
  console.log("== node https probe to api.telegram.org ==");
  await probe("api.telegram.org", 0, "default");
  await probe("api.telegram.org", 4, "ipv4 ");
  await probe("api.telegram.org", 6, "ipv6 ");
  console.log("== done ==");
})();
