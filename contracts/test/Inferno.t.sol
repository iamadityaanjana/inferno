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
    address treasury = address(0x7EA);
    address lister = address(0x1157);
    uint256 constant FEE = 0.05 ether;

    function setUp() public {
        registry = new AgentRegistry(treasury, FEE);
        router = new PaymentRouter(address(registry));
        registry.setRouter(address(router));
        // Registry owner seeds first-party agents fee-free.
        registry.register("Web Research", "web", 0.02 ether, payout);
        escrow = new DevilEscrow();
        vm.deal(address(escrow), 10 ether);
        vm.deal(lister, 10 ether);
    }

    /* ------------------------------------------------------ paid listing */

    function testAnyoneCanListByPayingTheFee() public {
        vm.prank(lister);
        uint256 id = registry.register{value: FEE}("Yield Scout", "monad yields", 0.01 ether, lister);

        AgentRegistry.Agent memory agent = registry.getAgent(id);
        assertEq(agent.owner, lister, "lister owns the listing");
        assertEq(agent.payout, lister);
        assertTrue(agent.active);
        assertEq(treasury.balance, FEE, "fee lands in the treasury atomically");
    }

    function testListingWithoutFeeReverts() public {
        vm.prank(lister);
        vm.expectRevert(AgentRegistry.FeeTooLow.selector);
        registry.register{value: FEE - 1}("Cheapskate", "nope", 0.01 ether, lister);
        assertEq(registry.agentCount(), 1, "no listing created");
    }

    function testOwnerIsExemptFromTheFee() public {
        registry.register("First Party", "seeded", 0.01 ether, payout);
        assertEq(treasury.balance, 0);
        assertEq(registry.agentCount(), 2);
    }

    function testPayoutRoutesToTheListersChosenWallet() public {
        address elsewhere = address(0xFEE5);
        vm.prank(lister);
        uint256 id = registry.register{value: FEE}("Scout", "x", 0.03 ether, elsewhere);

        address user = address(0xA11CE);
        vm.deal(user, 1 ether);
        vm.prank(user);
        router.pay{value: 0.03 ether}(id);

        assertEq(elsewhere.balance, 0.03 ether, "hire fee reaches the nominated wallet");
    }

    /* ------------------------------------------- self-service management */

    function testListerCanRepriceAndRepoint() public {
        vm.prank(lister);
        uint256 id = registry.register{value: FEE}("Scout", "x", 0.01 ether, lister);

        vm.prank(lister);
        registry.setPrice(id, 0.04 ether);
        vm.prank(lister);
        registry.setPayout(id, payout);

        AgentRegistry.Agent memory agent = registry.getAgent(id);
        assertEq(agent.priceWei, 0.04 ether);
        assertEq(agent.payout, payout);
    }

    function testStrangerCannotEditSomeoneElsesListing() public {
        vm.prank(lister);
        uint256 id = registry.register{value: FEE}("Scout", "x", 0.01 ether, lister);

        vm.prank(address(0xBAD));
        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        registry.setPrice(id, 1 wei);

        vm.prank(address(0xBAD));
        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        registry.setPayout(id, address(0xBAD));
    }

    /* ------------------------------------------------------- delisting */

    function testDelistedAgentCannotBeHired() public {
        vm.prank(lister);
        uint256 id = registry.register{value: FEE}("Scout", "x", 0.01 ether, lister);
        vm.prank(lister);
        registry.setActive(id, false);

        address user = address(0xA11CE);
        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(PaymentRouter.Inactive.selector);
        router.pay{value: 0.01 ether}(id);
    }

    function testRegistryOwnerCanForceOffButNotBackOn() public {
        vm.prank(lister);
        uint256 id = registry.register{value: FEE}("Spam", "x", 0.01 ether, lister);

        registry.setActive(id, false);
        assertFalse(registry.getAgent(id).active, "owner can moderate a listing off");

        vm.expectRevert(AgentRegistry.NotAgentOwner.selector);
        registry.setActive(id, true);
    }

    /* ------------------------------------------------------------ admin */

    function testOnlyOwnerTunesTheFee() public {
        registry.setListingFee(0.1 ether);
        assertEq(registry.listingFee(), 0.1 ether);

        vm.prank(lister);
        vm.expectRevert(AgentRegistry.NotOwner.selector);
        registry.setListingFee(0);
    }

    function testFeeChangeTakesEffectWithoutRedeploy() public {
        registry.setListingFee(0.2 ether);
        vm.prank(lister);
        vm.expectRevert(AgentRegistry.FeeTooLow.selector);
        registry.register{value: FEE}("Scout", "x", 0.01 ether, lister);
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
