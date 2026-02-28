const https = require("https");

// First, get auth message
const getJSON = (method, path, headers, body) => new Promise((resolve, reject) => {
  const options = { hostname: "api.predict.fun", path, method, headers: { "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14", "Content-Type": "application/json", ...headers } };
  const req = https.request(options, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } }); });
  req.on("error", reject);
  if (body) req.write(JSON.stringify(body));
  req.end();
});

(async () => {
  // Check positions endpoint
  console.log("=== POSITIONS ===");
  const pos = await getJSON("GET", "/v1/positions?walletId=0x4c3dcc47c2a9da23c2bac680cf23364a39fc6d6a", {});
  console.log(JSON.stringify(pos, null, 2));

  // Check trades endpoint  
  console.log("\n=== TRADES ===");
  const trades = await getJSON("GET", "/v1/trades?walletId=0x4c3dcc47c2a9da23c2bac680cf23364a39fc6d6a&limit=5", {});
  console.log(JSON.stringify(trades, null, 2));
})();
