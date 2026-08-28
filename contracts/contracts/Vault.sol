// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IBondIssuer {
    function transferBondFrom(uint256 serial, address from, address to) external;
    function transferBond(uint256 serial, address to) external;
}

/// @notice Custody contract for the marketplace. Users deposit ERC20 assets (stablecoin,
/// shares) or bonds here to make them tradeable on the platform; the platform operator
/// (the server, using the balances it tracks in its own database as the source of truth
/// for open orders) is the only address that can move funds back out, via
/// `operateWithdrawal`. On-chain, "verifying the funds were theirs" is enforced by the
/// `balances` ledger decrement itself (it reverts on insufficient balance); verifying
/// there are no pending orders blocking a withdrawal is the server's responsibility,
/// checked against its order database before calling this function.
contract Vault is Ownable {
    using SafeERC20 for IERC20;

    address public operator;
    mapping(address => mapping(address => uint256)) public balances; // user => token => amount
    mapping(address => mapping(address => uint256[])) private _bondCustody; // user => bondContract => serials

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdrawal(address indexed user, address indexed token, uint256 amount);
    event BondDeposited(address indexed user, address indexed bondContract, uint256 serial);
    event BondWithdrawn(address indexed user, address indexed bondContract, uint256 serial);
    event OperatorChanged(address indexed previousOperator, address indexed newOperator);
    event TradeSettled(address indexed from, address indexed to, address indexed token, uint256 amount);
    event BondTradeSettled(address indexed from, address indexed to, address indexed bondContract, uint256 serial);

    modifier onlyOperator() {
        require(msg.sender == operator, "Vault: caller is not the operator");
        _;
    }

    constructor(address operator_) Ownable(msg.sender) {
        operator = operator_;
    }

    function setOperator(address newOperator) external onlyOwner {
        emit OperatorChanged(operator, newOperator);
        operator = newOperator;
    }

    /// @notice Deposit an ERC20 asset (stablecoin or shares). Caller must have already
    /// approved this contract for `amount`.
    function deposit(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    /// @notice Deposit a bond. Caller must have already called
    /// `BondIssuer.approveBond(serial, vaultAddress)`.
    function depositBond(address bondContract, uint256 serial) external {
        IBondIssuer(bondContract).transferBondFrom(serial, msg.sender, address(this));
        _bondCustody[msg.sender][bondContract].push(serial);
        emit BondDeposited(msg.sender, bondContract, serial);
    }

    /// @notice Reassign custody of `amount` of `token` from `from` to `to` within the
    /// Vault, with no external token movement. Operator-only — this is how the server
    /// settles an off-chain-matched trade on-chain, keeping the Vault's ledger in sync
    /// with the platform's database after a buy/sell match.
    function operatorTransfer(address from, address to, address token, uint256 amount) external onlyOperator {
        balances[from][token] -= amount; // reverts if `from` does not actually have it
        balances[to][token] += amount;
        emit TradeSettled(from, to, token, amount);
    }

    /// @notice Reassign custody of one bond from `from` to `to` within the Vault, with
    /// no external ownership change on the BondIssuer (the Vault remains the on-chain
    /// owner throughout). Operator-only, for settling a matched bond trade.
    function operatorTransferBond(address from, address to, address bondContract, uint256 serial) external onlyOperator {
        uint256[] storage fromSerials = _bondCustody[from][bondContract];
        uint256 len = fromSerials.length;
        bool found = false;
        for (uint256 i = 0; i < len; i++) {
            if (fromSerials[i] == serial) {
                fromSerials[i] = fromSerials[len - 1];
                fromSerials.pop();
                found = true;
                break;
            }
        }
        require(found, "Vault: bond not in custody for from");
        _bondCustody[to][bondContract].push(serial);
        emit BondTradeSettled(from, to, bondContract, serial);
    }

    /// @notice Pay `amount` of `token` out to `user`. Operator-only.
    function operateWithdrawal(address user, address token, uint256 amount) external onlyOperator {
        balances[user][token] -= amount; // reverts if the user does not actually have it
        IERC20(token).safeTransfer(user, amount);
        emit Withdrawal(user, token, amount);
    }

    /// @notice Return a custodied bond to `user`. Operator-only.
    function withdrawBond(address user, address bondContract, uint256 serial) external onlyOperator {
        uint256[] storage serials = _bondCustody[user][bondContract];
        uint256 len = serials.length;
        bool found = false;
        for (uint256 i = 0; i < len; i++) {
            if (serials[i] == serial) {
                serials[i] = serials[len - 1];
                serials.pop();
                found = true;
                break;
            }
        }
        require(found, "Vault: bond not in custody for user");
        IBondIssuer(bondContract).transferBond(serial, user);
        emit BondWithdrawn(user, bondContract, serial);
    }

    function bondsInCustody(address user, address bondContract) external view returns (uint256[] memory) {
        return _bondCustody[user][bondContract];
    }
}
