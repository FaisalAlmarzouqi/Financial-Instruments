// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Fungible shares for one company. The issuer can pay a dividend by sending
/// stablecoin into the contract; each holder can then withdraw their proportional
/// share. Uses an accumulator ("reward-debt") pattern so dividend entitlement stays
/// correct across transfers that happen between payouts.
contract Shares is ERC20, Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant PRECISION = 1e18;

    IERC20 public immutable stablecoin;
    uint256 public accDividendPerShare;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public pendingDividend;

    event DividendPaid(uint256 amount);
    event DividendWithdrawn(address indexed holder, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalShares,
        address stablecoinAddress
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        stablecoin = IERC20(stablecoinAddress);
        _mint(msg.sender, totalShares);
    }

    /// @notice Issuer sends `amount` stablecoin into the contract to be split
    /// proportionally among current shareholders.
    function payDividend(uint256 amount) external onlyOwner {
        require(totalSupply() > 0, "Shares: no shares outstanding");
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        accDividendPerShare += (amount * PRECISION) / totalSupply();
        emit DividendPaid(amount);
    }

    /// @notice Stablecoin currently owed to `account` but not yet withdrawn.
    function withdrawableDividend(address account) external view returns (uint256) {
        return pendingDividend[account] + _accumulatedFor(account) - rewardDebt[account];
    }

    /// @notice Claim all stablecoin owed to the caller from past dividend payouts.
    function withdrawDividend() external {
        _harvest(msg.sender);
        _syncRewardDebt(msg.sender);
        uint256 amount = pendingDividend[msg.sender];
        require(amount > 0, "Shares: nothing to withdraw");
        pendingDividend[msg.sender] = 0;
        stablecoin.safeTransfer(msg.sender, amount);
        emit DividendWithdrawn(msg.sender, amount);
    }

    function _accumulatedFor(address account) internal view returns (uint256) {
        return (balanceOf(account) * accDividendPerShare) / PRECISION;
    }

    function _harvest(address account) internal {
        uint256 owed = _accumulatedFor(account) - rewardDebt[account];
        if (owed > 0) pendingDividend[account] += owed;
    }

    function _syncRewardDebt(address account) internal {
        rewardDebt[account] = _accumulatedFor(account);
    }

    /// @dev Settle dividend accounting for both parties around every mint/burn/transfer.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) _harvest(from);
        if (to != address(0)) _harvest(to);
        super._update(from, to, value);
        if (from != address(0)) _syncRewardDebt(from);
        if (to != address(0)) _syncRewardDebt(to);
    }
}
