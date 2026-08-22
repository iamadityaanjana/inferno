// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {DevilEscrow} from "../src/DevilEscrow.sol";

/**
 * Measures what the table actually returns, rather than what the constants
 * claim. Run with `forge test --match-contract DevilEdge -vv` to read it.
 */
contract DevilEdgeTest is Test {
    DevilEscrow escrow;
    address player = address(0xA11CE);
    uint256 constant HANDS = 2000;
    uint256 constant STAKE = 0.01 ether;

    receive() external payable {}

    function setUp() public {
        escrow = new DevilEscrow();
        vm.deal(address(escrow), 1000 ether);
        vm.deal(player, 1000 ether);
    }

    function _run(DevilEscrow.DealType kind, string memory label) internal {
        uint256 staked;
        uint256 returned;
        uint256 wins;
        for (uint256 i = 0; i < HANDS; i++) {
            uint8 guess = kind == DevilEscrow.DealType.LONGSHOT ? uint8(i % 10) : 0;
            vm.prank(player);
            uint256 id = escrow.acceptDeal{value: STAKE}(uint8(kind), guess);
            staked += STAKE;
            vm.roll(block.number + 2);
            uint256 before = player.balance;
            escrow.settle(id);
            returned += player.balance - before;
            (,,,,,, bool won) = escrow.deals(id);
            if (won) wins++;
        }
        console.log(label);
        console.log("  win rate bps       ", (wins * 10_000) / HANDS);
        console.log("  player return bps  ", (returned * 10_000) / staked);
        console.log("  house edge bps     ", 10_000 - (returned * 10_000) / staked);
    }

    function testSafeEdge() public {
        _run(DevilEscrow.DealType.SAFE, "SAFE (85% @ 1.1x)");
    }

    function testGambleEdge() public {
        _run(DevilEscrow.DealType.GAMBLE, "GAMBLE (45% @ 2x)");
    }

    function testLongshotEdge() public {
        _run(DevilEscrow.DealType.LONGSHOT, "LONGSHOT (1-in-10 @ 9x)");
    }

    function testPactEdge() public {
        _run(DevilEscrow.DealType.PACT, "PACT (50% refund + leak)");
    }
}
