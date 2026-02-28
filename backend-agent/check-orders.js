const https = require("https");
const getJSON = (path) => new Promise((resolve) => {
  https.get({ hostname: "api.predict.fun", path, headers: { "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14" }}, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } }); });
});

(async () => {
  // Try different order statuses
  for (const status of ["MATCHED", "OPEN", "FILLED", "CANCELLED"]) {
    console.log(`\n=== ORDERS status=${status} ===`);
    const r = await getJSON(`/v1/orders?maker=0x4c3dcc47c2a9da23c2bac680cf23364a39fc6d6a&status=${status}&limit=3`);
    console.log(JSON.stringify(r, null, 2));
  }
})();
