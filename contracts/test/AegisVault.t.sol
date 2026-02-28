// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {OracleResolver} from "../src/OracleResolver.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {MockUMA} from "../src/MockUMA.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// Mock ERC1155 for testing (simulates CTF outcome tokens)
contract MockERC1155 is ERC1155 {
    constructor() ERC1155("") {}
    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

contract AegisVaultTest is Test {
    OracleResolver public resolver;
    AegisVault public vault;
    MockUMA public mockUMA;
    MockUSDT public usdt;
    MockERC1155 public ctf;

    address public owner = address(this);
    address public user1 = address(0x1);
    address public lp = address(0x3);

    uint256 constant TOKEN_ID = 12345;

    function setUp() public {
        // 1. Deploy mocks
        mockUMA = new MockUMA();
        usdt = new MockUSDT();
        ctf = new MockERC1155();

        // 2. Deploy core contracts
        resolver = new OracleResolver(address(mockUMA));
        vault = new AegisVault(address(usdt), address(resolver));

        // 2b. Configure security whitelists
        vault.setWhitelistedCTF(address(ctf), true);
        resolver.setManualDemoPrice(address(ctf), TOKEN_ID, 0.5e18);

        // 3. Mint CTF tokens to user
        ctf.mint(user1, TOKEN_ID, 1000e18);

        // 4. LP provides USDT liquidity
        usdt.mint(lp, 10000e18);
        vm.startPrank(lp);
        usdt.approve(address(vault), type(uint256).max);
        vault.provideLiquidity(5000e18);
        vm.stopPrank();

        // 5. User approves vault for CTF tokens
        vm.prank(user1);
        ctf.setApprovalForAll(address(vault), true);
    }

    function test_DepositERC1155() public {
        vm.prank(user1);
        vault.depositERC1155(address(ctf), TOKEN_ID, 100e18);

        (uint256 collat, uint256 debt, , ) = vault.positions(user1, address(ctf), TOKEN_ID);
        assertEq(collat, 100e18);
        assertEq(debt, 0);
    }

    function test_DepositAndBorrow() public {
        // Deposit collateral
        vm.prank(user1);
        vault.depositERC1155(address(ctf), TOKEN_ID, 100e18);

        // OracleResolver now uses the explicit admin manual entry of $0.50 per token for tests
        // Value = 100 * 0.50 = $50. LTV 50% => max borrow = $25.
        vm.prank(user1);
        vault.borrow(address(ctf), TOKEN_ID, 25e18);

        (uint256 collat, uint256 debt, , ) = vault.positions(user1, address(ctf), TOKEN_ID);
        assertEq(collat, 100e18);
        assertEq(debt, 25e18);
        assertEq(usdt.balanceOf(user1), 25e18);
    }

    function test_Repay() public {
        vm.prank(user1);
        vault.depositERC1155(address(ctf), TOKEN_ID, 100e18);
        vm.prank(user1);
        vault.borrow(address(ctf), TOKEN_ID, 20e18);

        // Repay
        usdt.mint(user1, 5e18); // extra USDT for repay
        vm.startPrank(user1);
        usdt.approve(address(vault), type(uint256).max);
        vault.repay(address(ctf), TOKEN_ID, 10e18);
        vm.stopPrank();

        (, uint256 debt, , ) = vault.positions(user1, address(ctf), TOKEN_ID);
        assertEq(debt, 10e18);
    }

    function test_WithdrawERC1155() public {
        vm.prank(user1);
        vault.depositERC1155(address(ctf), TOKEN_ID, 100e18);

        vm.prank(user1);
        vault.withdrawERC1155(address(ctf), TOKEN_ID, 50e18);

        (uint256 collat, , , ) = vault.positions(user1, address(ctf), TOKEN_ID);
        assertEq(collat, 50e18);
        assertEq(ctf.balanceOf(user1, TOKEN_ID), 950e18);
    }

    function test_RevertOnOverBorrow() public {
        vm.prank(user1);
        vault.depositERC1155(address(ctf), TOKEN_ID, 100e18);

        // Max borrow = 25e18 (100 * 0.5 * 0.5), trying to borrow 30
        vm.expectRevert(AegisVault.AegisVault__Undercollateralized.selector);
        vm.prank(user1);
        vault.borrow(address(ctf), TOKEN_ID, 30e18);
    }
}
