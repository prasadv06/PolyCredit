// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract crUSD is ERC20, Ownable {
    address public aegisVault;

    // Custom errors
    error crUSD__NotAegisVault();
    error crUSD__ZeroAddress();

    modifier onlyAegisVault() {
        if (msg.sender != aegisVault) revert crUSD__NotAegisVault();
        _;
    }

    constructor() ERC20("crUSD Stability Coin", "crUSD") Ownable(msg.sender) {}

    /**
     * @notice Set the authorized AegisVault address. Only owner can call this.
     * @param _aegisVault The address of the Aegis Vault contract
     */
    function setAegisVault(address _aegisVault) external onlyOwner {
        if (_aegisVault == address(0)) revert crUSD__ZeroAddress();
        aegisVault = _aegisVault;
    }

    /**
     * @notice Mint crUSD tokens to the specified address. Only AegisVault can call this.
     * @param to The address to receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyAegisVault {
        _mint(to, amount);
    }

    /**
     * @notice Burn crUSD tokens from the specified address. Only AegisVault can call this.
     * @param from The address whose tokens will be burned
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyAegisVault {
        _burn(from, amount);
    }
}

