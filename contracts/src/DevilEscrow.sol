// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract DevilEscrow {
    enum DealType {
        GUARANTEED,
        RISKY,
        INFO
    }

    struct Deal {
        address player;
        DealType dealType;
        uint256 stake;
        bool resolved;
        bool won;
    }

    uint256 public constant MAX_STAKE = 2 ether;

    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;
    mapping(address => uint256) public bestRun;

    event DealAccepted(uint256 indexed dealId, address indexed player, DealType dealType, uint256 stake);
    event DealResolved(uint256 indexed dealId, address indexed player, bool won, uint256 payout);
    event RunEnded(address indexed player, uint256 finalBalance);
    event HouseFunded(address indexed from, uint256 amount);

    error BadStake();
    error BadType();
    error NotPlayer();
    error AlreadyResolved();
    error PayoutFailed();

    function acceptDeal(uint8 dealType) external payable returns (uint256 id) {
        if (msg.value == 0 || msg.value > MAX_STAKE) revert BadStake();
        if (dealType > uint8(DealType.INFO)) revert BadType();
        id = ++dealCount;
        deals[id] = Deal({
            player: msg.sender,
            dealType: DealType(dealType),
            stake: msg.value,
            resolved: false,
            won: false
        });
        emit DealAccepted(id, msg.sender, DealType(dealType), msg.value);
    }

    function resolve(uint256 dealId, uint8 challengeGuess) external {
        Deal storage deal = deals[dealId];
        if (deal.player != msg.sender) revert NotPlayer();
        if (deal.resolved) revert AlreadyResolved();
        deal.resolved = true;

        bool won;
        uint256 payout;

        if (deal.dealType == DealType.GUARANTEED) {
            won = true;
            payout = (deal.stake * 14) / 10;
        } else if (deal.dealType == DealType.RISKY) {
            uint256 roll = uint256(
                keccak256(abi.encodePacked(block.prevrandao, dealId, challengeGuess, msg.sender, block.number))
            ) % 100;
            won = roll < 60;
            payout = won ? deal.stake * 3 : 0;
        } else {
            won = true;
            payout = 0;
        }

        deal.won = won;
        if (payout > 0) {
            uint256 available = address(this).balance;
            if (payout > available) payout = available;
            (bool ok,) = msg.sender.call{value: payout}("");
            if (!ok) revert PayoutFailed();
        }

        emit DealResolved(dealId, msg.sender, won, payout);
    }

    function recordRunEnd() external {
        uint256 bal = msg.sender.balance;
        if (bal > bestRun[msg.sender]) {
            bestRun[msg.sender] = bal;
        }
        emit RunEnded(msg.sender, bal);
    }

    receive() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }
}
