// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {DevilEscrow} from "../src/DevilEscrow.sol";

/**
 * Deploys DevilEscrow on its own and seeds the house.
 *
 * Separate from Deploy.s.sol because the escrow is the only contract whose
 * balance *is* its state: the registry and router can be left untouched while
 * the game's economics are replaced. HOUSE_WEI is sent at deploy time because a
 * house with no reserve refuses every deal by design — `maxStakeFor` returns 0
 * and the frontend would have nothing to offer.
 */
contract DeployDevil is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 house = vm.envOr("HOUSE_WEI", uint256(0));

        vm.startBroadcast(pk);
        DevilEscrow escrow = new DevilEscrow();
        if (house > 0) {
            (bool ok,) = address(escrow).call{value: house}("");
            require(ok, "house funding failed");
        }
        vm.stopBroadcast();

        console.log("DEVIL_ESCROW", address(escrow));
        console.log("house balance wei", address(escrow).balance);
        console.log("max SAFE stake wei", escrow.maxStakeFor(DevilEscrow.DealType.SAFE));
        console.log("max LONGSHOT stake wei", escrow.maxStakeFor(DevilEscrow.DealType.LONGSHOT));
    }
}
