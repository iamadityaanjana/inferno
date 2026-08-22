// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DevilEscrow} from "../src/DevilEscrow.sol";

contract DevilEscrowTest is Test {
    DevilEscrow escrow;
    address player = address(0xA11CE);
    address stranger = address(0x57A);

    /// The suite deploys the escrow, so it is the house and must accept payouts.
    receive() external payable {}

    function setUp() public {
        escrow = new DevilEscrow();
        vm.deal(address(escrow), 100 ether);
        vm.deal(player, 100 ether);
        vm.deal(stranger, 10 ether);
    }

    function _accept(DevilEscrow.DealType kind, uint256 stake, uint8 guess) internal returns (uint256 id) {
        vm.prank(player);
        id = escrow.acceptDeal{value: stake}(uint8(kind), guess);
    }

    /* ------------------------------------------------------------ economics */

    /// The whole point of the redesign: no deal may be a faucet.
    function testEveryDealTypeHasAHouseEdge() public view {
        for (uint8 i = 0; i <= uint8(DevilEscrow.DealType.PACT); i++) {
            DevilEscrow.DealType kind = DevilEscrow.DealType(i);
            DevilEscrow.Terms memory t = escrow.termsFor(kind);
            uint256 winChanceBps = kind == DevilEscrow.DealType.LONGSHOT ? 1000 : t.winBps;
            // Expected return in basis points of the stake.
            uint256 evBps = (winChanceBps * t.payBps) / 10_000;
            assertLt(evBps, 10_000, "expected value must sit below the stake");
        }
    }

    function testLongshotIsTheComeback() public view {
        DevilEscrow.Terms memory t = escrow.termsFor(DevilEscrow.DealType.LONGSHOT);
        assertEq(t.payBps, 90_000, "pays 9x so one hit undoes a losing run");
    }

    /* -------------------------------------------------- grinding resistance */

    /**
     * The exploit the previous contract shipped with: the guess fed the roll at
     * settle time, so a player could search all 256 values off-chain and submit
     * only a winner. The guess now lands at accept time, so a settle has no
     * caller-supplied input left to search.
     */
    function testGuessIsFixedAtAcceptTime() public {
        uint256 id = _accept(DevilEscrow.DealType.LONGSHOT, 0.01 ether, 7);
        vm.roll(block.number + 2);

        (,, uint8 committed,,,,) = escrow.deals(id);
        assertEq(committed, 7, "the roll's only player input is committed with the stake");

        // settle() takes a deal id and nothing else, so there is no knob to grind.
        escrow.settle(id);
    }

    /// Settling early would let a player read the anchor before committing to it.
    function testCannotSettleBeforeTheAnchorBlockExists() public {
        uint256 id = _accept(DevilEscrow.DealType.GAMBLE, 0.01 ether, 0);
        vm.expectRevert(DevilEscrow.TooEarly.selector);
        escrow.settle(id);

        vm.roll(block.number + 1);
        vm.expectRevert(DevilEscrow.TooEarly.selector);
        escrow.settle(id);
    }

    /**
     * A player who peeks at a losing outcome must not be able to improve it by
     * refusing to settle, so an abandoned deal forfeits rather than refunds.
     */
    function testWalkingAwayFromALossForfeitsTheStake() public {
        uint256 before = player.balance;
        uint256 id = _accept(DevilEscrow.DealType.GAMBLE, 1 ether, 0);

        vm.roll(block.number + escrow.SETTLE_DELAY() + escrow.SETTLE_WINDOW() + 2);
        vm.expectRevert(DevilEscrow.WindowClosed.selector);
        escrow.settle(id);

        escrow.sweepExpired(id);
        assertEq(player.balance, before - 1 ether, "no refund for going quiet");
        assertEq(escrow.liability(), 0, "sweep releases the reserved payout");
    }

    /// Anyone may settle, but the money only ever moves to the recorded player.
    function testStrangerCanSettleButCannotCollect() public {
        // A guess of 0 against a known anchor; whether it wins is irrelevant here.
        uint256 id = _accept(DevilEscrow.DealType.SAFE, 1 ether, 0);
        vm.roll(block.number + 2);

        uint256 strangerBefore = stranger.balance;
        vm.prank(stranger);
        escrow.settle(id);

        (,,,,,, bool won) = escrow.deals(id);
        assertEq(stranger.balance, strangerBefore, "settler is never the payee");
        if (won) assertGt(player.balance, 99 ether, "winnings reach the player");
    }

    /* ------------------------------------------------------------- solvency */

    /// A win must always pay in full, so a thin house declines the bet instead.
    function testHouseRefusesWhatItCannotCover() public {
        DevilEscrow thin = new DevilEscrow();
        vm.deal(address(thin), 0.05 ether);
        vm.prank(player);
        // A 1 MON longshot would owe 9 MON on a hit.
        vm.expectRevert(DevilEscrow.HouseTooThin.selector);
        thin.acceptDeal{value: 1 ether}(uint8(DevilEscrow.DealType.LONGSHOT), 3);
    }

    function testMaxStakeForTracksTheFreeReserve() public {
        DevilEscrow thin = new DevilEscrow();
        vm.deal(address(thin), 9 ether);
        // 9 MON free at 9x covers a 1 MON longshot exactly.
        assertEq(thin.maxStakeFor(DevilEscrow.DealType.LONGSHOT), 1 ether);

        vm.prank(player);
        thin.acceptDeal{value: 1 ether}(uint8(DevilEscrow.DealType.LONGSHOT), 3);
        // 10 MON held, 9 MON promised: the next longshot must be far smaller.
        assertEq(thin.maxStakeFor(DevilEscrow.DealType.LONGSHOT), uint256(1 ether) / 9);
    }

    function testStakeAtTheAdvertisedCapIsAccepted() public {
        uint256 cap = escrow.maxStakeFor(DevilEscrow.DealType.LONGSHOT);
        vm.prank(player);
        escrow.acceptDeal{value: cap}(uint8(DevilEscrow.DealType.LONGSHOT), 5);
    }

    /* ------------------------------------------------------------ housekeeping */

    function testOwnerCannotWithdrawPromisedFunds() public {
        _accept(DevilEscrow.DealType.LONGSHOT, 1 ether, 4);
        uint256 free = escrow.reserve();
        assertEq(free, 101 ether - 9 ether, "9 MON is spoken for");

        vm.expectRevert(DevilEscrow.BadStake.selector);
        escrow.withdrawHouse(free + 1);

        escrow.withdrawHouse(free);
        assertEq(escrow.reserve(), 0);
    }

    function testOnlyOwnerWithdraws() public {
        vm.prank(stranger);
        vm.expectRevert(DevilEscrow.NotOwner.selector);
        escrow.withdrawHouse(1 ether);
    }

    function testLongshotGuessMustBeADigit() public {
        vm.prank(player);
        vm.expectRevert(DevilEscrow.BadGuess.selector);
        escrow.acceptDeal{value: 0.01 ether}(uint8(DevilEscrow.DealType.LONGSHOT), 10);
    }

    function testCannotSettleTwice() public {
        uint256 id = _accept(DevilEscrow.DealType.SAFE, 0.01 ether, 0);
        vm.roll(block.number + 2);
        escrow.settle(id);
        vm.expectRevert(DevilEscrow.AlreadyResolved.selector);
        escrow.settle(id);
    }

    function testUnknownDealReverts() public {
        vm.expectRevert(DevilEscrow.UnknownDeal.selector);
        escrow.settle(999);
    }

    /**
     * Long-run behaviour is the real acceptance test: across many settled deals
     * the house must end up ahead, or the game is still a faucet.
     */
    function testHouseProfitsOverManyGambles() public {
        uint256 opening = address(escrow).balance;
        for (uint256 i = 0; i < 300; i++) {
            uint256 id = _accept(DevilEscrow.DealType.GAMBLE, 0.05 ether, 0);
            vm.roll(block.number + 2);
            escrow.settle(id);
        }
        assertGt(address(escrow).balance, opening, "a 10% edge should show over 300 hands");
        assertEq(escrow.liability(), 0, "every deal released its reserve");
    }

    function testHouseProfitsOverManyLongshots() public {
        uint256 opening = address(escrow).balance;
        for (uint256 i = 0; i < 300; i++) {
            uint256 id = _accept(DevilEscrow.DealType.LONGSHOT, 0.05 ether, uint8(i % 10));
            vm.roll(block.number + 2);
            escrow.settle(id);
        }
        assertGt(address(escrow).balance, opening, "9x at one-in-ten still favours the house");
    }
}
