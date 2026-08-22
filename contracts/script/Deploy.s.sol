// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {DevilEscrow} from "../src/DevilEscrow.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address payout = vm.envOr("PAY_TO", deployer);
        uint256 house = vm.envOr("HOUSE_FUND_WEI", uint256(0.2 ether));
        // Charged to third parties listing an agent. Kept well above the ~0.02 MON
        // of gas a registration costs so spam is never cheaper than a real hire.
        uint256 listingFee = vm.envOr("LISTING_FEE_WEI", uint256(0.05 ether));
        address treasury = vm.envOr("TREASURY", deployer);

        vm.startBroadcast(pk);

        AgentRegistry registry = new AgentRegistry(treasury, listingFee);
        PaymentRouter router = new PaymentRouter(address(registry));
        registry.setRouter(address(router));

        registry.register("Web Research", "Web research, news analysis, market research", 0.02 ether, payout);
        registry.register("DeFi Agent", "Monad DeFi protocol data and opportunity analysis", 0.04 ether, payout);
        registry.register("News Agent", "Current events and headlines", 0.03 ether, payout);
        registry.register("Risk Agent", "Risk scoring and downside analysis", 0.03 ether, payout);
        registry.register("General Research", "Generic research fallback", 0.02 ether, payout);

        DevilEscrow escrow = new DevilEscrow();
        if (house > 0) {
            (bool ok,) = address(escrow).call{value: house}("");
            require(ok, "house fund");
        }

        vm.stopBroadcast();

        console.log("PAY_TO", payout);
        console.log("TREASURY", treasury);
        console.log("LISTING_FEE_WEI", listingFee);
        console.log("REGISTRY", address(registry));
        console.log("PAYMENT_ROUTER", address(router));
        console.log("DEVIL_ESCROW", address(escrow));
    }
}
