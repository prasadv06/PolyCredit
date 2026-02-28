// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUMA} from "../src/MockUMA.sol";
import {OracleResolver} from "../src/OracleResolver.sol";
import {AegisVault} from "../src/AegisVault.sol";

/**
 * @title DeployMainnet
 * @notice Deploys AegisVault + OracleResolver + MockUMA to BNB Mainnet.
 *         Uses REAL USDT (0x55d398326f99059fF775485246999027B3197955) — NOT a mock.
 *
 * Usage:
 *   export PATH="$HOME/.foundry/bin:$PATH"
 *   forge script script/DeployMainnet.s.sol --rpc-url bsc_mainnet --broadcast --legacy
 */
contract DeployMainnet is Script {
    // Real BNB Mainnet USDT (BSC-USD, 18 decimals)
    address constant REAL_USDT = 0x55d398326f99059fF775485246999027B3197955;
    // Real BNB Mainnet Predict.fun CTF
    address constant BNB_MAINNET_CTF = 0x22DA1810B194ca018378464a58f6Ac2B10C9d244;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockUMA (Optimistic Oracle V2 simulation — real UMA not on BNB)
        MockUMA mockUMA = new MockUMA();
        console2.log("MockUMA deployed at:", address(mockUMA));

        // 2. Deploy OracleResolver linked to MockUMA
        OracleResolver resolver = new OracleResolver(address(mockUMA));
        console2.log("OracleResolver deployed at:", address(resolver));

        // 3. Deploy AegisVault linked to REAL USDT and OracleResolver
        AegisVault vault = new AegisVault(REAL_USDT, address(resolver));
        console2.log("AegisVault deployed at:", address(vault));

        // 4. Configure security and defaults
        vault.setWhitelistedCTF(BNB_MAINNET_CTF, true);
        console2.log("Whitelisted CTF logic configured for:", BNB_MAINNET_CTF);
        
        // As a fallback for hackathon frontend demo without waiting on UMA
        resolver.setManualDemoPrice(BNB_MAINNET_CTF, 1, 0.5e18); // YES default $0.50
        resolver.setManualDemoPrice(BNB_MAINNET_CTF, 2, 0.5e18); // NO default $0.50

        // NOTE: Vault starts with 0 liquidity.
        // To enable borrowing, call vault.provideLiquidity(amount)
        // after approving real USDT to the vault address.

        vm.stopBroadcast();

        console2.log("---");
        console2.log("USDT address (real):", REAL_USDT);
        console2.log("Deployment complete! Update frontend page.tsx with these addresses.");
    }
}
