// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Holds all outstanding bonds from a single issuer. Each bond has a unique
/// serial number, principal, interest rate, issuance/maturity dates and an owner.
/// Bonds are 1-year, single-payment instruments: `repay` pays principal + interest
/// once, at or after maturity, to whoever currently owns the bond.
contract BondIssuer is Ownable {
    using SafeERC20 for IERC20;

    struct Bond {
        uint256 serialNumber;
        uint256 principal;
        uint256 interestRateBps; // e.g. 1000 = 10.00%
        uint256 issuanceDate;
        uint256 maturityDate;
        address owner;
        bool repaid;
    }

    IERC20 public immutable stablecoin;
    uint256 public nextSerialNumber = 1;
    mapping(uint256 => Bond) public bonds;
    mapping(address => uint256[]) private _bondsByOwner;
    mapping(uint256 => address) public approvedSpender;

    event BondIssued(uint256 indexed serialNumber, uint256 principal, uint256 interestRateBps, uint256 maturityDate);
    event BondTransferred(uint256 indexed serialNumber, address indexed from, address indexed to);
    event BondApproval(uint256 indexed serialNumber, address indexed owner, address indexed spender);
    event BondRepaid(uint256 indexed serialNumber, address indexed owner, uint256 amountPaid);

    constructor(address stablecoinAddress) Ownable(msg.sender) {
        stablecoin = IERC20(stablecoinAddress);
    }

    /// @notice Issue `count` new bonds, all owned by the issuer, maturing in 1 year.
    function issueBonds(uint256 count, uint256 principal, uint256 interestRateBps) external onlyOwner {
        for (uint256 i = 0; i < count; i++) {
            uint256 serial = nextSerialNumber++;
            bonds[serial] = Bond({
                serialNumber: serial,
                principal: principal,
                interestRateBps: interestRateBps,
                issuanceDate: block.timestamp,
                maturityDate: block.timestamp + 365 days,
                owner: msg.sender,
                repaid: false
            });
            _bondsByOwner[msg.sender].push(serial);
            emit BondIssued(serial, principal, interestRateBps, block.timestamp + 365 days);
        }
    }

    /// @notice Move a bond to a new owner. Callable only by the bond's current owner
    /// (used directly for the populate script's transfers).
    function transferBond(uint256 serial, address to) external {
        require(bonds[serial].owner == msg.sender, "BondIssuer: not bond owner");
        _transferBond(serial, msg.sender, to);
    }

    /// @notice Authorize `spender` (e.g. the Vault) to move a specific bond on the
    /// owner's behalf, mirroring ERC20's approve/transferFrom pattern.
    function approveBond(uint256 serial, address spender) external {
        require(bonds[serial].owner == msg.sender, "BondIssuer: not bond owner");
        approvedSpender[serial] = spender;
        emit BondApproval(serial, msg.sender, spender);
    }

    /// @notice Move a bond from `from` to `to`. Callable only by the address `from`
    /// previously approved via `approveBond`.
    function transferBondFrom(uint256 serial, address from, address to) external {
        require(bonds[serial].owner == from, "BondIssuer: not bond owner");
        require(approvedSpender[serial] == msg.sender, "BondIssuer: not approved");
        approvedSpender[serial] = address(0);
        _transferBond(serial, from, to);
    }

    function _transferBond(uint256 serial, address from, address to) private {
        Bond storage bond = bonds[serial];
        require(bond.serialNumber != 0, "BondIssuer: unknown bond");
        bond.owner = to;
        _removeFromOwnerList(from, serial);
        _bondsByOwner[to].push(serial);
        emit BondTransferred(serial, from, to);
    }

    /// @notice Pay principal + interest to the current owner. Anyone may trigger it
    /// once matured (the issuer is the one who must hold sufficient stablecoin
    /// allowance/balance, since the payment is pulled from the issuer).
    function repay(uint256 serial) external {
        Bond storage bond = bonds[serial];
        require(bond.serialNumber != 0, "BondIssuer: unknown bond");
        require(!bond.repaid, "BondIssuer: already repaid");
        require(block.timestamp >= bond.maturityDate, "BondIssuer: not matured");

        bond.repaid = true;
        uint256 interest = (bond.principal * bond.interestRateBps) / 10000;
        uint256 total = bond.principal + interest;
        stablecoin.safeTransferFrom(owner(), bond.owner, total);
        emit BondRepaid(serial, bond.owner, total);
    }

    function getBond(uint256 serial) external view returns (Bond memory) {
        return bonds[serial];
    }

    function bondsOf(address account) external view returns (uint256[] memory) {
        return _bondsByOwner[account];
    }

    function _removeFromOwnerList(address account, uint256 serial) private {
        uint256[] storage list = _bondsByOwner[account];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == serial) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }
}
