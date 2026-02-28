const { ethers } = require("ethers");
async function run() {
  const wallet = new ethers.Wallet("0x0123456789012345678901234567890123456789012345678901234567890123");
  const msgRes = await fetch("https://api.predict.fun/v1/auth/message", { headers: {"x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14"}});
  const msgData = await msgRes.json();
  const message = msgData.data.message;
  const signature = await wallet.signMessage(message);
  
  const authRes = await fetch("https://api.predict.fun/v1/auth", {
    method: "POST",
    headers: {"x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14", "Content-Type": "application/json"},
    body: JSON.stringify({ message, signature, signer: wallet.address })
  });
  console.log(JSON.stringify(await authRes.json(), null, 2));
}
run().catch(console.error);
