// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {AgentCredits} from "../src/AgentCredits.sol";

contract AgentCreditsTest is Test {
    AgentRegistry registry;
    PaymentRouter router;
    AgentCredits credits;

    address treasury = address(0x7EA);
    address payout = address(0xB0B);
    address operator = address(0x09E);
    address attacker = address(0xBAD);

    uint256 userPk = 0xA11CE;
    address user;

    uint256 constant PRICE = 0.02 ether;
    uint256 constant FEE = 0.05 ether;
    uint256 agentId;

    function setUp() public {
        user = vm.addr(userPk);
        registry = new AgentRegistry(treasury, FEE);
        router = new PaymentRouter(address(registry));
        registry.setRouter(address(router));
        agentId = registry.register("Web Research", "web", PRICE, payout);
        credits = new AgentCredits(address(registry), address(router), operator);
        vm.deal(user, 10 ether);
    }

    /* ----------------------------------------------------------- helpers */

    function _voucher(uint256 maxSpend, uint256 deadline) internal view returns (AgentCredits.SpendVoucher memory) {
        return AgentCredits.SpendVoucher({
            user: user,
            maxSpendWei: maxSpend,
            epoch: credits.epochOf(user),
            deadline: deadline
        });
    }

    function _sign(AgentCredits.SpendVoucher memory v, uint256 pk) internal view returns (bytes memory) {
        (uint8 sigV, bytes32 r, bytes32 s) = vm.sign(pk, credits.hashVoucher(v));
        return abi.encodePacked(r, s, sigV);
    }

    function _deposit(uint256 amount) internal {
        vm.prank(user);
        credits.deposit{value: amount}();
    }

    /* ---------------------------------------------------------- balances */

    function testDepositCreditsTheSender() public {
        _deposit(1 ether);
        assertEq(credits.credits(user), 1 ether);
        assertEq(address(credits).balance, 1 ether);
    }

    function testPlainTransferCreditsTheSender() public {
        vm.prank(user);
        (bool ok,) = address(credits).call{value: 0.5 ether}("");
        assertTrue(ok);
        assertEq(credits.credits(user), 0.5 ether);
    }

    function testWithdrawReturnsTheRemainder() public {
        _deposit(1 ether);
        vm.prank(user);
        credits.withdraw(0.4 ether);
        assertEq(credits.credits(user), 0.6 ether);
        assertEq(user.balance, 9.4 ether);
    }

    function testWithdrawAllDrainsTheBalance() public {
        _deposit(1 ether);
        vm.prank(user);
        credits.withdrawAll();
        assertEq(credits.credits(user), 0);
        assertEq(user.balance, 10 ether, "every wei is recoverable");
    }

    function testCannotWithdrawMoreThanDeposited() public {
        _deposit(1 ether);
        vm.prank(user);
        vm.expectRevert(AgentCredits.InsufficientCredits.selector);
        credits.withdraw(1 ether + 1);
    }

    function testCannotWithdrawSomeoneElsesCredits() public {
        _deposit(1 ether);
        vm.prank(attacker);
        vm.expectRevert(AgentCredits.InsufficientCredits.selector);
        credits.withdraw(1 ether);
    }

    /* ------------------------------------------------------------- spend */

    function testOperatorSpendsAgainstAVoucher() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.prank(operator);
        credits.spend(v, sig, agentId);

        assertEq(credits.credits(user), 1 ether - PRICE, "debited exactly the listed price");
        assertEq(payout.balance, PRICE, "agent owner got paid");
        assertEq(registry.getAgent(agentId).jobs, 1, "router still counts the job");
    }

    function testOneVoucherCoversManyHires() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.startPrank(operator);
        credits.spend(v, sig, agentId);
        credits.spend(v, sig, agentId);
        credits.spend(v, sig, agentId);
        vm.stopPrank();

        assertEq(credits.credits(user), 1 ether - 3 * PRICE, "one signature, three hires");
        assertEq(payout.balance, 3 * PRICE);
    }

    function testSpendStopsAtTheVoucherCap() public {
        _deposit(1 ether);
        // Cap allows two hires at 0.02, not three.
        AgentCredits.SpendVoucher memory v = _voucher(PRICE * 2, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.startPrank(operator);
        credits.spend(v, sig, agentId);
        credits.spend(v, sig, agentId);
        vm.expectRevert(AgentCredits.VoucherCapReached.selector);
        credits.spend(v, sig, agentId);
        vm.stopPrank();

        assertEq(credits.credits(user), 1 ether - PRICE * 2, "cap held even though credits remained");
    }

    function testSpendCannotExceedDepositedCredits() public {
        _deposit(PRICE);
        AgentCredits.SpendVoucher memory v = _voucher(10 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.startPrank(operator);
        credits.spend(v, sig, agentId);
        vm.expectRevert(AgentCredits.InsufficientCredits.selector);
        credits.spend(v, sig, agentId);
        vm.stopPrank();
    }

    /* ------------------------------------------------- authorisation holes */

    function testNonOperatorCannotSpendEvenWithAValidVoucher() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.prank(attacker);
        vm.expectRevert(AgentCredits.NotOperator.selector);
        credits.spend(v, sig, agentId);
    }

    /// The whole point of the redesign: no voucher, no spend.
    function testOperatorCannotSpendWithoutTheUsersSignature() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory forged = _sign(v, 0xBADBAD);

        vm.prank(operator);
        vm.expectRevert(AgentCredits.BadSignature.selector);
        credits.spend(v, forged, agentId);
        assertEq(credits.credits(user), 1 ether, "balance untouched");
    }

    function testCannotRaiseTheCapAfterSigning() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(PRICE, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        v.maxSpendWei = 5 ether;
        vm.prank(operator);
        vm.expectRevert(AgentCredits.BadSignature.selector);
        credits.spend(v, sig, agentId);
    }

    function testCannotRetargetAVoucherAtAnotherUser() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        v.user = attacker;
        vm.prank(operator);
        vm.expectRevert(AgentCredits.BadSignature.selector);
        credits.spend(v, sig, agentId);
    }

    function testExpiredVoucherIsRejected() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(operator);
        vm.expectRevert(AgentCredits.VoucherExpired.selector);
        credits.spend(v, sig, agentId);
    }

    function testRevokeKillsOutstandingVouchers() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.prank(operator);
        credits.spend(v, sig, agentId);

        vm.prank(user);
        credits.revokeVouchers();

        vm.prank(operator);
        vm.expectRevert(AgentCredits.VoucherStale.selector);
        credits.spend(v, sig, agentId);
    }

    function testMalleableHighSSignatureIsRejected() public {
        _deposit(1 ether);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        (uint8 sigV, bytes32 r, bytes32 s) = vm.sign(userPk, credits.hashVoucher(v));

        uint256 order = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 flippedS = bytes32(order - uint256(s));
        uint8 flippedV = sigV == 27 ? 28 : 27;

        vm.prank(operator);
        vm.expectRevert(AgentCredits.BadSignature.selector);
        credits.spend(v, abi.encodePacked(r, flippedS, flippedV), agentId);
    }

    function testInactiveAgentCannotBePaid() public {
        _deposit(1 ether);
        registry.setActive(agentId, false);
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.prank(operator);
        vm.expectRevert(PaymentRouter.Inactive.selector);
        credits.spend(v, sig, agentId);
        assertEq(credits.credits(user), 1 ether, "failed hire costs nothing");
    }

    /* ------------------------------------------------------------- admin */

    function testOnlyOwnerRotatesTheOperator() public {
        vm.prank(attacker);
        vm.expectRevert(AgentCredits.NotOwner.selector);
        credits.setOperator(attacker);

        credits.setOperator(address(0xFEED));
        assertEq(credits.operator(), address(0xFEED));
    }

    function testRotatingOperatorLocksOutTheOldOne() public {
        _deposit(1 ether);
        credits.setOperator(address(0xFEED));
        AgentCredits.SpendVoucher memory v = _voucher(0.5 ether, block.timestamp + 1 hours);
        bytes memory sig = _sign(v, userPk);

        vm.prank(operator);
        vm.expectRevert(AgentCredits.NotOperator.selector);
        credits.spend(v, sig, agentId);
    }
}

/// Payout that tries to reenter while PaymentRouter is forwarding to it.
contract ReenteringPayout {
    AgentCredits immutable credits;
    AgentCredits.SpendVoucher voucher;
    bytes signature;
    uint256 agentId;
    bool tried;

    constructor(AgentCredits credits_) {
        credits = credits_;
    }

    function arm(AgentCredits.SpendVoucher calldata v, bytes calldata sig, uint256 id) external {
        voucher = v;
        signature = sig;
        agentId = id;
    }

    receive() external payable {
        if (tried) return;
        tried = true;
        // Must revert the whole hire rather than double-spend the credits.
        credits.spend(voucher, signature, agentId);
    }
}

contract AgentCreditsReentrancyTest is Test {
    AgentRegistry registry;
    PaymentRouter router;
    AgentCredits credits;
    ReenteringPayout attackerPayout;

    address operator = address(0x09E);
    uint256 userPk = 0xA11CE;
    address user;
    uint256 agentId;
    uint256 constant PRICE = 0.02 ether;

    function setUp() public {
        user = vm.addr(userPk);
        registry = new AgentRegistry(address(0x7EA), 0.05 ether);
        router = new PaymentRouter(address(registry));
        registry.setRouter(address(router));
        credits = new AgentCredits(address(registry), address(router), operator);
        attackerPayout = new ReenteringPayout(credits);
        agentId = registry.register("Reenterer", "evil", PRICE, address(attackerPayout));
        vm.deal(user, 10 ether);
        vm.prank(user);
        credits.deposit{value: 1 ether}();
    }

    function testReenteringPayoutCannotDoubleSpend() public {
        AgentCredits.SpendVoucher memory v = AgentCredits.SpendVoucher({
            user: user,
            maxSpendWei: 1 ether,
            epoch: credits.epochOf(user),
            deadline: block.timestamp + 1 hours
        });
        (uint8 sigV, bytes32 r, bytes32 s) = vm.sign(userPk, credits.hashVoucher(v));
        bytes memory sig = abi.encodePacked(r, s, sigV);
        attackerPayout.arm(v, sig, agentId);

        vm.prank(operator);
        vm.expectRevert();
        credits.spend(v, sig, agentId);

        assertEq(credits.credits(user), 1 ether, "no credits lost");
    }
}
