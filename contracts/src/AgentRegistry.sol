// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Marketplace registry for hireable agents.
 *
 * Listing is permissionless and paid: anyone registers their own agent from
 * their own wallet, sending `listingFee` with the call. That keeps the platform
 * off the critical path — it never holds a key that can list on someone's
 * behalf — and prices spam instead of trying to police it. The registry owner
 * is exempt from the fee so first-party agents can be seeded.
 *
 * Each agent is managed by the wallet that listed it. The owner keeps a
 * deactivate override for moderation but cannot edit anyone's listing.
 */
contract AgentRegistry {
    struct Agent {
        address owner;
        string name;
        string capabilities;
        uint256 priceWei;
        address payout;
        uint256 jobs;
        bool active;
    }

    address public owner;
    address public router;
    address public treasury;
    uint256 public listingFee;
    uint256 public agentCount;
    mapping(uint256 => Agent) public agents;

    event AgentRegistered(uint256 indexed id, address indexed owner, string name, uint256 priceWei, address payout);
    event AgentUpdated(uint256 indexed id, uint256 priceWei, address payout);
    event AgentActiveSet(uint256 indexed id, bool active, address indexed by);
    event RouterSet(address indexed router);
    event ListingFeeSet(uint256 fee);
    event TreasurySet(address indexed treasury);

    error NotOwner();
    error NotAgentOwner();
    error NotRouter();
    error BadPayout();
    error BadPrice();
    error BadTreasury();
    error UnknownAgent();
    error FeeTooLow();
    error FeeTransferFailed();

    constructor(address treasury_, uint256 listingFee_) {
        if (treasury_ == address(0)) revert BadTreasury();
        owner = msg.sender;
        treasury = treasury_;
        listingFee = listingFee_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /** Reverts unless the caller listed this agent. */
    modifier onlyAgentOwner(uint256 id) {
        if (id == 0 || id > agentCount) revert UnknownAgent();
        if (agents[id].owner != msg.sender) revert NotAgentOwner();
        _;
    }

    /* --------------------------------------------------------------- listing */

    /**
     * Lists an agent. Open to anyone; the caller pays `listingFee` plus their
     * own gas. The fee is forwarded to the treasury in this same call, so there
     * is no state where a listing exists without having been paid for.
     */
    function register(string calldata name, string calldata capabilities, uint256 priceWei, address payout)
        external
        payable
        returns (uint256 id)
    {
        bool exempt = msg.sender == owner;
        if (!exempt && msg.value < listingFee) revert FeeTooLow();
        if (payout == address(0)) revert BadPayout();
        if (priceWei == 0) revert BadPrice();

        id = ++agentCount;
        agents[id] = Agent({
            owner: msg.sender,
            name: name,
            capabilities: capabilities,
            priceWei: priceWei,
            payout: payout,
            jobs: 0,
            active: true
        });

        if (msg.value > 0) {
            (bool ok,) = treasury.call{value: msg.value}("");
            if (!ok) revert FeeTransferFailed();
        }

        emit AgentRegistered(id, msg.sender, name, priceWei, payout);
    }

    /* ------------------------------------------------- self-service management */

    function setPrice(uint256 id, uint256 priceWei) external onlyAgentOwner(id) {
        if (priceWei == 0) revert BadPrice();
        agents[id].priceWei = priceWei;
        emit AgentUpdated(id, priceWei, agents[id].payout);
    }

    function setPayout(uint256 id, address payout) external onlyAgentOwner(id) {
        if (payout == address(0)) revert BadPayout();
        agents[id].payout = payout;
        emit AgentUpdated(id, agents[id].priceWei, payout);
    }

    /**
     * Delisting. The agent's owner may toggle their own listing; the registry
     * owner may only force one off, never back on, so moderation cannot be used
     * to resurrect something a lister chose to retire.
     */
    function setActive(uint256 id, bool active) external {
        if (id == 0 || id > agentCount) revert UnknownAgent();
        bool isAgentOwner = agents[id].owner == msg.sender;
        if (!isAgentOwner && !(msg.sender == owner && !active)) revert NotAgentOwner();
        agents[id].active = active;
        emit AgentActiveSet(id, active, msg.sender);
    }

    /* ----------------------------------------------------------------- admin */

    function setRouter(address router_) external onlyOwner {
        router = router_;
        emit RouterSet(router_);
    }

    function setListingFee(uint256 fee) external onlyOwner {
        listingFee = fee;
        emit ListingFeeSet(fee);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert BadTreasury();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    /* ------------------------------------------------------------------ views */

    function getAgent(uint256 id) external view returns (Agent memory) {
        if (id == 0 || id > agentCount) revert UnknownAgent();
        return agents[id];
    }

    function incrementJobs(uint256 id) external {
        if (msg.sender != router) revert NotRouter();
        if (id == 0 || id > agentCount) revert UnknownAgent();
        agents[id].jobs += 1;
    }
}
