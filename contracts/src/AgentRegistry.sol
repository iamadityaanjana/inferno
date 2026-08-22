// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract AgentRegistry {
    struct Agent {
        string name;
        string capabilities;
        uint256 priceWei;
        address payout;
        uint256 jobs;
        bool active;
    }

    address public owner;
    address public router;
    uint256 public agentCount;
    mapping(uint256 => Agent) public agents;

    event AgentRegistered(uint256 indexed id, string name, uint256 priceWei, address payout);
    event RouterSet(address indexed router);

    error NotOwner();
    error NotRouter();
    error BadPayout();
    error BadPrice();
    error UnknownAgent();

    constructor() {
        owner = msg.sender;
    }

    function setRouter(address router_) external {
        if (msg.sender != owner) revert NotOwner();
        router = router_;
        emit RouterSet(router_);
    }

    function register(string calldata name, string calldata capabilities, uint256 priceWei, address payout)
        external
        returns (uint256 id)
    {
        if (msg.sender != owner) revert NotOwner();
        if (payout == address(0)) revert BadPayout();
        if (priceWei == 0) revert BadPrice();
        id = ++agentCount;
        agents[id] = Agent({
            name: name,
            capabilities: capabilities,
            priceWei: priceWei,
            payout: payout,
            jobs: 0,
            active: true
        });
        emit AgentRegistered(id, name, priceWei, payout);
    }

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
