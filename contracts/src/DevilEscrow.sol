// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * The house side of Devil Mode.
 *
 * Every deal is a gamble with a house edge, settled against a block that did
 * not exist when the bet was placed. Three properties matter here, and each one
 * exists because the previous version of this contract lacked it:
 *
 * 1. Randomness is committed, not chosen. A player picks their number and their
 *    block at `accept` time, then settlement derives from `blockhash` of a later
 *    block. Previously the roll mixed in caller-supplied data at settle time,
 *    so a player could simulate every guess off-chain, submit only a winner, and
 *    win every time.
 * 2. Settling is permissionless and always pays the player. A player who
 *    simulates a loss and walks away gains nothing: the stake is forfeit once
 *    the settle window closes, so declining to settle is never better than
 *    settling. Payouts go to the recorded player, never to the caller.
 * 3. A deal is only accepted if the house can already cover its maximum payout.
 *    Outstanding maximums are tracked as liability and cannot be withdrawn, so a
 *    win always pays in full. Previously a thin house silently paid less than
 *    promised and still recorded the deal as won.
 *
 * Honest caveat on the randomness: `blockhash` is influenceable by a validator
 * willing to withhold a block. This is a testnet game with capped stakes, not a
 * lottery, and the edge is small enough that the attack costs more than it wins.
 * A production version would use a VRF.
 */
contract DevilEscrow {
    /// Settlement is a lookup in ODDS, so adding a deal type is a data change.
    enum DealType {
        SAFE,
        GAMBLE,
        LONGSHOT,
        PACT
    }

    struct Terms {
        /// Chance of winning, in basis points. Unused by LONGSHOT, which matches a digit.
        uint16 winBps;
        /// Payout on a win, in basis points of the stake. 11000 = 1.1x.
        uint32 payBps;
    }

    struct Deal {
        address player;
        DealType dealType;
        uint8 guess;
        uint64 commitBlock;
        uint256 stake;
        bool resolved;
        bool won;
    }

    uint256 public constant MAX_STAKE = 2 ether;
    /// A settle must land at least one whole block after the commit.
    uint256 public constant SETTLE_DELAY = 1;
    /// `blockhash` only reaches back 256 blocks, so the window is finite.
    uint256 public constant SETTLE_WINDOW = 250;
    /// LONGSHOT matches a single digit, so a guess is one of ten.
    uint8 public constant LONGSHOT_SIDES = 10;

    address public immutable owner;

    /// Sum of the maximum payouts of every unresolved deal. Never withdrawable.
    uint256 public liability;
    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;

    bool private entered;

    event DealAccepted(
        uint256 indexed dealId,
        address indexed player,
        DealType dealType,
        uint256 stake,
        uint8 guess,
        uint256 settleFrom
    );
    event DealResolved(uint256 indexed dealId, address indexed player, bool won, uint256 payout, uint256 roll);
    event DealExpired(uint256 indexed dealId, address indexed player, uint256 stake);
    event HouseFunded(address indexed from, uint256 amount);
    event HouseWithdrawn(address indexed to, uint256 amount);

    error BadStake();
    error BadType();
    error BadGuess();
    error HouseTooThin();
    error UnknownDeal();
    error AlreadyResolved();
    error TooEarly();
    error WindowClosed();
    error StillLive();
    error PayoutFailed();
    error NotOwner();
    error Reentrant();

    modifier guarded() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * The full rule set, and the only place the economics are defined.
     *
     * Every line is deliberately below 1x expected value — that is what makes it
     * a gamble rather than a faucet. LONGSHOT is the comeback: it almost always
     * loses, and pays 9x when luck lands.
     */
    function termsFor(DealType dealType) public pure returns (Terms memory) {
        if (dealType == DealType.SAFE) return Terms({winBps: 8500, payBps: 11_000}); // 0.935x EV
        if (dealType == DealType.GAMBLE) return Terms({winBps: 4500, payBps: 20_000}); // 0.90x EV
        if (dealType == DealType.LONGSHOT) return Terms({winBps: 1000, payBps: 90_000}); // 0.90x EV
        return Terms({winBps: 5000, payBps: 10_000}); // PACT: 0.50x EV, and it buys the leak
    }

    /// What a win on this stake would cost the house.
    function maxPayout(DealType dealType, uint256 stake) public pure returns (uint256) {
        return (stake * termsFor(dealType).payBps) / 10_000;
    }

    /// House funds not already promised to an open deal.
    function reserve() public view returns (uint256) {
        uint256 bal = address(this).balance;
        return bal > liability ? bal - liability : 0;
    }

    /**
     * The largest stake the house can currently cover for this deal type.
     *
     * The frontend reads this so it never offers a deal that would revert, which
     * is the honest alternative to accepting the stake and short-paying the win.
     */
    function maxStakeFor(DealType dealType) external view returns (uint256) {
        uint256 free = reserve();
        if (free == 0) return 0;
        uint256 cap = (free * 10_000) / termsFor(dealType).payBps;
        return cap > MAX_STAKE ? MAX_STAKE : cap;
    }

    /**
     * Takes the bet and locks the block it will settle against.
     *
     * The guess is committed here on purpose: it is an input to the roll, so
     * letting it arrive at settle time would let a player search for a winner.
     */
    function acceptDeal(uint8 dealType, uint8 guess) external payable guarded returns (uint256 id) {
        if (msg.value == 0 || msg.value > MAX_STAKE) revert BadStake();
        if (dealType > uint8(DealType.PACT)) revert BadType();
        DealType kind = DealType(dealType);
        if (kind == DealType.LONGSHOT && guess >= LONGSHOT_SIDES) revert BadGuess();

        // The stake is already in the balance and counts toward covering its own
        // win, which is correct: a losing stake is house money, so the house only
        // needs to find the difference between the stake and the payout.
        uint256 owed = maxPayout(kind, msg.value);
        if (reserve() < owed) revert HouseTooThin();
        liability += owed;

        id = ++dealCount;
        deals[id] = Deal({
            player: msg.sender,
            dealType: kind,
            guess: guess,
            commitBlock: uint64(block.number),
            stake: msg.value,
            resolved: false,
            won: false
        });
        emit DealAccepted(id, msg.sender, kind, msg.value, guess, block.number + SETTLE_DELAY + 1);
    }

    /**
     * Settles a deal against the committed block's hash.
     *
     * Deliberately callable by anyone, always paying the recorded player. That
     * combination is what removes the free option: a player who peeks at the
     * outcome cannot improve it by staying silent, and the operator can settle
     * on behalf of someone who closed their tab.
     */
    function settle(uint256 dealId) external guarded {
        Deal storage deal = deals[dealId];
        if (deal.player == address(0)) revert UnknownDeal();
        if (deal.resolved) revert AlreadyResolved();

        uint256 target = uint256(deal.commitBlock) + SETTLE_DELAY;
        if (block.number <= target) revert TooEarly();
        if (block.number > target + SETTLE_WINDOW) revert WindowClosed();

        bytes32 anchor = blockhash(target);
        // Defensive: the window above should make a zero anchor unreachable.
        if (anchor == bytes32(0)) revert WindowClosed();

        deal.resolved = true;
        Terms memory terms = termsFor(deal.dealType);
        liability -= maxPayout(deal.dealType, deal.stake);

        uint256 seed = uint256(keccak256(abi.encodePacked(anchor, dealId, deal.player, deal.guess)));
        uint256 roll;
        bool won;
        if (deal.dealType == DealType.LONGSHOT) {
            roll = seed % LONGSHOT_SIDES;
            won = roll == deal.guess;
        } else {
            roll = seed % 10_000;
            won = roll < terms.winBps;
        }

        deal.won = won;
        uint256 payout = won ? (deal.stake * terms.payBps) / 10_000 : 0;
        emit DealResolved(dealId, deal.player, won, payout, roll);
        if (payout > 0) _pay(deal.player, payout);
    }

    /**
     * Retires a deal nobody settled in time. The stake is forfeit, which is what
     * keeps walking away from a peeked loss no better than settling it.
     */
    function sweepExpired(uint256 dealId) external guarded {
        Deal storage deal = deals[dealId];
        if (deal.player == address(0)) revert UnknownDeal();
        if (deal.resolved) revert AlreadyResolved();
        if (block.number <= uint256(deal.commitBlock) + SETTLE_DELAY + SETTLE_WINDOW) revert StillLive();

        deal.resolved = true;
        liability -= maxPayout(deal.dealType, deal.stake);
        emit DealExpired(dealId, deal.player, deal.stake);
    }

    /// Only ever the free reserve, so an open deal can never be rugged.
    function withdrawHouse(uint256 amount) external guarded {
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0 || amount > reserve()) revert BadStake();
        emit HouseWithdrawn(msg.sender, amount);
        _pay(msg.sender, amount);
    }

    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayoutFailed();
    }

    receive() external payable {
        emit HouseFunded(msg.sender, msg.value);
    }
}
