// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUMA} from "../src/MockUMA.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {OracleResolver} from "../src/OracleResolver.sol";
import {AegisVault} from "../src/AegisVault.sol";

contract DeployPhase1 is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock UMA (Optimistic Oracle V2)
        MockUMA mockUMA = new MockUMA();
        console2.log("MockUMA deployed at:", address(mockUMA));

        // 2. Deploy Mock USDT (Lending Asset)
        MockUSDT usdt = new MockUSDT();
        console2.log("MockUSDT deployed at:", address(usdt));

        // 3. Deploy OracleResolver linked to MockUMA
        OracleResolver resolver = new OracleResolver(address(mockUMA));
        console2.log("OracleResolver deployed at:", address(resolver));

        // 4. Deploy AegisVault linked to USDT and Resolver
        AegisVault vault = new AegisVault(address(usdt), address(resolver));
        console2.log("AegisVault deployed at:", address(vault));

        // 5. Initial Pool Liquidity (Admin bootstrap)
        usdt.approve(address(vault), 1000 * 1e18);
        vault.provideLiquidity(1000 * 1e18);
        console2.log("Vault bootstrapped with 1000 USDT liquidity");

        vm.stopBroadcast();
    }
}
