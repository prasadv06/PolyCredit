// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IMockUMA {
    function requestPrice(
        bytes32 identifier,
        uint32 timestamp,
        bytes calldata ancillaryData,
        address currency,
        uint256 reward
    ) external returns (uint256);

    function settleAndGetPrice(
        bytes32 identifier,
        uint32 timestamp,
        bytes calldata ancillaryData
    ) external returns (int256);

    function hasPrice(
        bytes32 identifier,
        uint32 timestamp,
        bytes calldata ancillaryData
    ) external view returns (bool);
}

contract OracleResolver is Ownable {
    IMockUMA public mockUMA;
    bytes32 public constant PRICE_IDENTIFIER = "YES_OR_NO_MARKET";

    // Mapping from (ctfAddress, tokenId) -> resolved price (in 1e18)
    mapping(address => mapping(uint256 => uint256)) public prices;
    
    // Mapping from (ctfAddress, tokenId) -> UMA request timestamp
    mapping(address => mapping(uint256 => uint32)) public pendingRequests;

    event PriceRequested(address indexed ctf, uint256 indexed tokenId, uint32 timestamp);
    event PriceResolved(address indexed ctf, uint256 indexed tokenId, uint256 price);

    constructor(address _mockUMA) Ownable(msg.sender) {
        mockUMA = IMockUMA(_mockUMA);
    }

    /**
     * @notice Request price for a specific CTF tokenId via UMA
     */
    function requestPrice(address ctf, uint256 tokenId) external {
        uint32 timestamp = uint32(block.timestamp);
        
        // Use tokenId as part of ancillary data to identify the specific outcome
        bytes memory ancillaryData = abi.encodePacked(ctf, tokenId);
        
        mockUMA.requestPrice(
            PRICE_IDENTIFIER,
            timestamp,
            ancillaryData,
            address(0), // No specific reward currency for mock
            0
        );

        pendingRequests[ctf][tokenId] = timestamp;
        emit PriceRequested(ctf, tokenId, timestamp);
    }

    /**
     * @notice Settles the UMA request and updates the local price
     */
    function settlePrice(address ctf, uint256 tokenId) external {
        uint32 timestamp = pendingRequests[ctf][tokenId];
        require(timestamp != 0, "OracleResolver: No pending request");

        bytes memory ancillaryData = abi.encodePacked(ctf, tokenId);
        
        int256 resolvedPrice = mockUMA.settleAndGetPrice(
            PRICE_IDENTIFIER,
            timestamp,
            ancillaryData
        );

        require(resolvedPrice >= 0, "OracleResolver: Invalid price");

        prices[ctf][tokenId] = uint256(resolvedPrice);
        delete pendingRequests[ctf][tokenId];

        emit PriceResolved(ctf, tokenId, uint256(resolvedPrice));
    }

    // For hackathon fallback: explicit safe defaults by admin only
    mapping(address => mapping(uint256 => uint256)) public manualDemoPrice;

    /**
     * @notice Returns the USD value of a given amount of tokens based on the last resolved price
     * @param ctf The CTF contract address (ERC-1155)
     * @param tokenId The outcome token identifier
     * @param amount The amount of tokens
     * @return The US dollar value in 1e18 precision
     */
    function getCollateralValue(address ctf, uint256 tokenId, uint256 amount) external view returns (uint256) {
        uint256 price = prices[ctf][tokenId];
        
        // If price is not explicitly resolved via UMA, check if admin set a manual demo price
        if (price == 0) {
            price = manualDemoPrice[ctf][tokenId];
            // Hackathon Quick-Start: If no manual price explicitly set for a known whitelisted CTF, 
            // you might want to revert instead of defaulting. BUT to keep the frontend demo working 
            // without UMA settling delay, we can fallback ONLY if the manual price is non-zero.
            require(price > 0, "OracleResolver: Price not resolved via UMA or Admin");
        }
        
        return (amount * price) / 1e18;
    }

    function setMockUMA(address _mockUMA) external onlyOwner {
        mockUMA = IMockUMA(_mockUMA);
    }

    function setManualDemoPrice(address ctf, uint256 tokenId, uint256 price) external onlyOwner {
        manualDemoPrice[ctf][tokenId] = price;
    }
}
