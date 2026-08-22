// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {DevilEscrow} from "../src/DevilEscrow.sol";

contract InfernoTest is Test {
    AgentRegistry registry;
    PaymentRouter router;
    DevilEscrow escrow;
    address payout = address(0xB0B);

    function setUp() public {
        registry = new AgentRegistry();
        router = new PaymentRouter(address(registry));
        registry.setRouter(address(router));
        registry.register("Web Research", "web", 0.02 ether, payout);
        escrow = new DevilEscrow();
        vm.deal(address(escrow), 10 ether);
    }

    function testPayExact() public {
        address user = address(0xA11CE);
        vm.deal(user, 1 ether);
        vm.prank(user);
        router.pay{value: 0.02 ether}(1);
        assertEq(payout.balance, 0.02 ether);
        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertEq(agent.jobs, 1);
    }

    function testPayWrongPriceReverts() public {
        address user = address(0xA11CE);
        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(PaymentRouter.WrongPrice.selector);
        router.pay{value: 0.01 ether}(1);
    }

    function testGuaranteedDealPaysOut() public {
        address user = address(0xA11CE);
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 id = escrow.acceptDeal{value: 0.5 ether}(0);
        vm.prank(user);
        escrow.resolve(id, 1);
        assertEq(user.balance, 1.2 ether);
    }
}
