// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentRegistry} from "./AgentRegistry.sol";
import {PaymentRouter} from "./PaymentRouter.sol";

/**
 * Prepaid credit balances so a task can hire several agents without a wallet
 * popup per hire.
 *
 * The problem this solves: paying hires from a platform-held key means the
 * platform spends its own money for strangers, and any unauthenticated call to
 * the backend drains it. Paying straight from the user's wallet is safe but
 * forces a signature per hire, which ruins a multi-agent task.
 *
 * So the user deposits once and signs one EIP-712 `SpendVoucher` capping what
 * the operator may spend on their behalf and until when. The signature *is* the
 * authorisation — the backend needs no session store, and cannot exceed the cap
 * even if it is compromised. Spending is additionally gated to `operator` as
 * defence in depth, so a leaked voucher alone cannot burn someone's budget.
 *
 * Credits are always withdrawable by their owner. This contract never takes a
 * cut: it debits the balance and forwards the exact price through PaymentRouter,
 * which is what keeps the registry's job counter authoritative.
 */
contract AgentCredits {
    struct SpendVoucher {
        address user;
        uint256 maxSpendWei;
        uint256 epoch;
        uint256 deadline;
    }

    AgentRegistry public immutable registry;
    PaymentRouter public immutable router;

    address public owner;
    address public operator;

    mapping(address => uint256) public credits;
    /// Spent so far against a given voucher hash, so one voucher covers many hires.
    mapping(bytes32 => uint256) public spent;
    /// Bumping a user's epoch invalidates every voucher they have outstanding.
    mapping(address => uint256) public epochOf;

    bytes32 private constant VOUCHER_TYPEHASH =
        keccak256("SpendVoucher(address user,uint256 maxSpendWei,uint256 epoch,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private immutable _cachedDomainSeparator;
    uint256 private immutable _cachedChainId;

    uint256 private constant HALF_ORDER = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    uint256 private _entered;

    event Deposited(address indexed user, uint256 amount, uint256 balance);
    event Withdrawn(address indexed user, uint256 amount, uint256 balance);
    event Spent(address indexed user, uint256 indexed agentId, uint256 amount, uint256 balance);
    event VouchersRevoked(address indexed user, uint256 epoch);
    event OperatorSet(address indexed operator);
    event OwnerSet(address indexed owner);

    error NotOwner();
    error NotOperator();
    error BadAddress();
    error BadAmount();
    error InsufficientCredits();
    error VoucherExpired();
    error VoucherStale();
    error VoucherCapReached();
    error BadSignature();
    error Reentrant();
    error WithdrawFailed();

    constructor(address registry_, address router_, address operator_) {
        if (registry_ == address(0) || router_ == address(0)) revert BadAddress();
        registry = AgentRegistry(registry_);
        router = PaymentRouter(router_);
        owner = msg.sender;
        operator = operator_;
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
        emit OperatorSet(operator_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// The agent payout is an arbitrary address that gets a raw call, so it can reenter.
    modifier nonReentrant() {
        if (_entered == 1) revert Reentrant();
        _entered = 1;
        _;
        _entered = 0;
    }

    /* --------------------------------------------------------------- balances */

    function deposit() external payable {
        _deposit(msg.sender, msg.value);
    }

    receive() external payable {
        _deposit(msg.sender, msg.value);
    }

    function _deposit(address user, uint256 amount) private {
        if (amount == 0) revert BadAmount();
        credits[user] += amount;
        emit Deposited(user, amount, credits[user]);
    }

    /**
     * Pulls credits back out. Unconditional by design — an outstanding voucher
     * never locks funds, it only caps what the operator may spend while they
     * are still here.
     */
    function withdraw(uint256 amount) external nonReentrant {
        _withdraw(msg.sender, amount);
    }

    function withdrawAll() external nonReentrant {
        _withdraw(msg.sender, credits[msg.sender]);
    }

    function _withdraw(address user, uint256 amount) private {
        if (amount == 0) revert BadAmount();
        uint256 balance = credits[user];
        if (amount > balance) revert InsufficientCredits();
        credits[user] = balance - amount;
        emit Withdrawn(user, amount, balance - amount);
        (bool ok,) = user.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    /* --------------------------------------------------------------- vouchers */

    /// Invalidates every voucher signed under the caller's current epoch.
    function revokeVouchers() external {
        uint256 next = ++epochOf[msg.sender];
        emit VouchersRevoked(msg.sender, next);
    }

    /**
     * Debits `voucher.user` by the agent's listed price and pays the agent
     * through PaymentRouter, so the registry still counts the job and the payout
     * still goes to the address the agent's owner chose.
     */
    function spend(SpendVoucher calldata voucher, bytes calldata signature, uint256 agentId)
        external
        nonReentrant
        returns (uint256 price)
    {
        if (msg.sender != operator) revert NotOperator();
        if (block.timestamp > voucher.deadline) revert VoucherExpired();
        if (voucher.epoch != epochOf[voucher.user]) revert VoucherStale();

        bytes32 digest = hashVoucher(voucher);
        if (_recover(digest, signature) != voucher.user) revert BadSignature();

        price = registry.getAgent(agentId).priceWei;
        uint256 used = spent[digest];
        if (used + price > voucher.maxSpendWei) revert VoucherCapReached();

        uint256 balance = credits[voucher.user];
        if (price > balance) revert InsufficientCredits();

        // Book the spend before the external call so a reentering payout cannot
        // double-spend the same credits.
        spent[digest] = used + price;
        credits[voucher.user] = balance - price;

        router.pay{value: price}(agentId);
        emit Spent(voucher.user, agentId, price, balance - price);
    }

    /* ------------------------------------------------------------------ views */

    function domainSeparator() public view returns (bytes32) {
        // Recompute if this ever runs under a forked chain id.
        return block.chainid == _cachedChainId ? _cachedDomainSeparator : _buildDomainSeparator();
    }

    function hashVoucher(SpendVoucher calldata voucher) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(VOUCHER_TYPEHASH, voucher.user, voucher.maxSpendWei, voucher.epoch, voucher.deadline)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// Remaining spendable amount on a voucher, ignoring the user's balance.
    function remaining(SpendVoucher calldata voucher) external view returns (uint256) {
        uint256 used = spent[hashVoucher(voucher)];
        return used >= voucher.maxSpendWei ? 0 : voucher.maxSpendWei - used;
    }

    /* ----------------------------------------------------------------- admin */

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setOwner(address owner_) external onlyOwner {
        if (owner_ == address(0)) revert BadAddress();
        owner = owner_;
        emit OwnerSet(owner_);
    }

    /* --------------------------------------------------------------- internal */

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("Inferno"), keccak256("1"), block.chainid, address(this))
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        // Reject the high-s twin so a voucher has exactly one valid signature.
        if (uint256(s) > HALF_ORDER) revert BadSignature();
        if (v != 27 && v != 28) revert BadSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}
