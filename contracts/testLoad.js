const { ethers } = require("ethers");
const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.bnbchain.org");
const vault = new ethers.Contract("0x3ebb3d5EeF6daeD210A0183a616A9D868Bb0983d", ["function totalPoolLiquidity() view returns (uint256)", "function usdt() view returns (address)"], provider);
const usdt = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", ["function balanceOf(address) view returns (uint256)"], provider);
async function run() {
    console.log("totalPoolLiquidity:", (await vault.totalPoolLiquidity()).toString());
    console.log("usdt balance:", (await usdt.balanceOf("0x3ebb3d5EeF6daeD210A0183a616A9D868Bb0983d")).toString());
}
run();
