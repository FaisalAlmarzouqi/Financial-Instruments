// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Standard fungible stablecoin. The issuer (owner) can mint or burn
/// units at will, per the "issue or remove units" requirement.
contract Stablecoin is ERC20, ERC20Burnable, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _mint(msg.sender, initialSupply);
    }

    /// @notice Issue new units to `to`. Issuer-only.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // Removing units is covered by the inherited burn()/burnFrom() (ERC20Burnable):
    // the issuer holds the full supply at deployment and can burn its own balance directly.
}
