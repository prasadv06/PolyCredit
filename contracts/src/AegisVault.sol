// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

interface IOracleResolver {
    function getCollateralValue(address ctf, uint256 tokenId, uint256 amount) external view returns (uint256);
}

contract AegisVault is Ownable, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;

    IERC20 public usdt;
    IOracleResolver public oracleResolver;

    // LTV Configuration (50% = 50e16 / 1e18)
    uint256 public constant LTV_PERCENTAGE = 50e16; 
    uint256 public constant PRECISION = 1e18;

    enum CollateralType { NONE, ERC20, ERC1155 }

    // Security: Whitelist of approved Predict.fun CTF collateral tokens
    mapping(address => bool) public isWhitelistedCTF;

    struct Position {
        uint256 collateralAmount;
        uint256 debtAmount;
        CollateralType cType;
        uint256 tokenId; // Only for ERC1155
    }

    // Mapping: user => tokenAddress => tokenId => Position
    // For ERC20, tokenId is always 0
    mapping(address => mapping(address => mapping(uint256 => Position))) public positions;

    // Pool state
    uint256 public totalPoolLiquidity;
    uint256 public totalBorrowed;

    event CollateralDeposited(address indexed user, address indexed token, uint256 tokenId, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 tokenId, uint256 amount);
    event DebtBorrowed(address indexed user, address indexed token, uint256 tokenId, uint256 amount);
    event DebtRepaid(address indexed user, address indexed token, uint256 tokenId, uint256 amount);
    event LiquidityProvided(address indexed provider, uint256 amount);
    event LiquidityRemoved(address indexed provider, uint256 amount);

    error AegisVault__InvalidAmount();
    error AegisVault__Undercollateralized();
    error AegisVault__InsufficientPoolLiquidity();
    error AegisVault__UnauthorizedCTF();

    constructor(address _usdt, address _oracleResolver) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        oracleResolver = IOracleResolver(_oracleResolver);
    }

    /**
     * @notice Provide USDT liquidity to the pool
     */
    function provideLiquidity(uint256 amount) external nonReentrant {
        if (amount == 0) revert AegisVault__InvalidAmount();
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        totalPoolLiquidity += amount;
        emit LiquidityProvided(msg.sender, amount);
    }

    /**
     * @notice Remove USDT liquidity (if available)
     */
    function removeLiquidity(uint256 amount) external nonReentrant {
        uint256 available = usdt.balanceOf(address(this));
        if (amount > available) revert AegisVault__InsufficientPoolLiquidity();
        totalPoolLiquidity -= amount;
        usdt.safeTransfer(msg.sender, amount);
        emit LiquidityRemoved(msg.sender, amount);
    }

    /**
     * @notice Deposit ERC1155 (CTF) tokens as collateral
     */
    function depositERC1155(address ctf, uint256 tokenId, uint256 amount) external nonReentrant {
        if (!isWhitelistedCTF[ctf]) revert AegisVault__UnauthorizedCTF();
        if (amount == 0) revert AegisVault__InvalidAmount();

        Position storage pos = positions[msg.sender][ctf][tokenId];
        pos.collateralAmount += amount;
        pos.cType = CollateralType.ERC1155;
        pos.tokenId = tokenId;

        IERC1155(ctf).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        emit CollateralDeposited(msg.sender, ctf, tokenId, amount);
    }

    /**
     * @notice Borrow USDT against ERC1155 collateral
     */
    function borrow(address ctf, uint256 tokenId, uint256 amount) external nonReentrant {
        if (!isWhitelistedCTF[ctf]) revert AegisVault__UnauthorizedCTF();
        if (amount == 0) revert AegisVault__InvalidAmount();

        Position storage pos = positions[msg.sender][ctf][tokenId];
        uint256 collateralValue = oracleResolver.getCollateralValue(ctf, tokenId, pos.collateralAmount);
        uint256 maxBorrow = (collateralValue * LTV_PERCENTAGE) / PRECISION;

        if (pos.debtAmount + amount > maxBorrow) revert AegisVault__Undercollateralized();
        if (usdt.balanceOf(address(this)) < amount) revert AegisVault__InsufficientPoolLiquidity();

        pos.debtAmount += amount;
        totalBorrowed += amount;
        usdt.safeTransfer(msg.sender, amount);

        emit DebtBorrowed(msg.sender, ctf, tokenId, amount);
    }

    /**
     * @notice Repay USDT debt
     */
    function repay(address ctf, uint256 tokenId, uint256 amount) external nonReentrant {
        Position storage pos = positions[msg.sender][ctf][tokenId];
        uint256 actualRepay = amount > pos.debtAmount ? pos.debtAmount : amount;

        pos.debtAmount -= actualRepay;
        totalBorrowed -= actualRepay;
        usdt.safeTransferFrom(msg.sender, address(this), actualRepay);

        emit DebtRepaid(msg.sender, ctf, tokenId, actualRepay);
    }

    /**
     * @notice Withdraw collateral
     */
    function withdrawERC1155(address ctf, uint256 tokenId, uint256 amount) external nonReentrant {
        Position storage pos = positions[msg.sender][ctf][tokenId];
        pos.collateralAmount -= amount;

        if (pos.debtAmount > 0) {
            uint256 val = oracleResolver.getCollateralValue(ctf, tokenId, pos.collateralAmount);
            if (pos.debtAmount > (val * LTV_PERCENTAGE) / PRECISION) {
                revert AegisVault__Undercollateralized();
            }
        }

        IERC1155(ctf).safeTransferFrom(address(this), msg.sender, tokenId, amount, "");
        emit CollateralWithdrawn(msg.sender, ctf, tokenId, amount);
    }

    // Admin
    function setOracleResolver(address _oracle) external onlyOwner {
        oracleResolver = IOracleResolver(_oracle);
    }

    function setWhitelistedCTF(address ctf, bool isWhitelisted) external onlyOwner {
        isWhitelistedCTF[ctf] = isWhitelisted;
    }
}
