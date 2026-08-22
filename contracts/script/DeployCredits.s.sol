// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentCredits} from "../src/AgentCredits.sol";

/**
 * Deploys AgentCredits against an already-live registry and router.
 *
 * Kept separate from Deploy.s.sol on purpose: credits are additive, and
 * redeploying the registry would orphan the listings already on it.
 */
contract DeployCredits is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address registry = vm.envAddress("REGISTRY");
        address router = vm.envAddress("PAYMENT_ROUTER");
        address operator = vm.envOr("OPERATOR", vm.addr(pk));

        console.log("REGISTRY", registry);
        console.log("PAYMENT_ROUTER", router);
        console.log("OPERATOR", operator);

        vm.startBroadcast(pk);
        AgentCredits credits = new AgentCredits(registry, router, operator);
        vm.stopBroadcast();

        console.log("AGENT_CREDITS", address(credits));
    }
}
