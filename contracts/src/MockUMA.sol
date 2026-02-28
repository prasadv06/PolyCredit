// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockUMA
 * @notice A simplified implementation of the UMA Optimistic Oracle V2 for hackathon purposes.
 * @dev This allows us to simulate the request -> propose -> settle lifecycle on any chain.
 */
contract MockUMA {
    struct PriceRequest {
        bytes32 identifier;
        uint32 timestamp;
        bytes ancillaryData;
        address currency;
        uint256 reward;
        int256 proposedPrice;
        bool isProposed;
        bool isSettled;
    }

    // Mapping from hash(identifier, timestamp, ancillaryData) -> Request
    mapping(bytes32 => PriceRequest) public requests;

    event PriceRequested(bytes32 indexed identifier, uint32 timestamp, bytes ancillaryData);
    event PriceProposed(bytes32 indexed identifier, uint32 timestamp, int256 price);
    event PriceSettled(bytes32 indexed identifier, uint32 timestamp, int256 price);

    function requestPrice(
        bytes32 identifier,
        uint32 timestamp,
        bytes memory ancillaryData,
        address currency,
        uint256 reward
    ) external returns (uint256) {
        bytes32 requestHash = keccak256(abi.encodePacked(identifier, timestamp, ancillaryData));
        requests[requestHash] = PriceRequest({
            identifier: identifier,
            timestamp: timestamp,
            ancillaryData: ancillaryData,
            currency: currency,
            reward: reward,
            proposedPrice: 0,
            isProposed: false,
            isSettled: false
        });

        emit PriceRequested(identifier, timestamp, ancillaryData);
        return 0; // Bond amount
    }

    function proposePrice(
        bytes32 identifier,
        uint32 timestamp,
        bytes memory ancillaryData,
        int256 price
    ) external {
        bytes32 requestHash = keccak256(abi.encodePacked(identifier, timestamp, ancillaryData));
        requests[requestHash].proposedPrice = price;
        requests[requestHash].isProposed = true;

        emit PriceProposed(identifier, timestamp, price);
    }

    function settleAndGetPrice(
        bytes32 identifier,
        uint32 timestamp,
        bytes memory ancillaryData
    ) external returns (int256) {
        bytes32 requestHash = keccak256(abi.encodePacked(identifier, timestamp, ancillaryData));
        PriceRequest storage req = requests[requestHash];
        
        require(req.isProposed, "MockUMA: Price not proposed");
        
        req.isSettled = true;
        emit PriceSettled(identifier, timestamp, req.proposedPrice);
        
        return req.proposedPrice;
    }

    function hasPrice(
        bytes32 identifier,
        uint32 timestamp,
        bytes memory ancillaryData
    ) external view returns (bool) {
        bytes32 requestHash = keccak256(abi.encodePacked(identifier, timestamp, ancillaryData));
        return requests[requestHash].isSettled;
    }
}
