// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentRegistry} from "./AgentRegistry.sol";

contract PaymentRouter {
    AgentRegistry public immutable registry;

    event Payment(address indexed from, address indexed to, uint256 indexed agentId, uint256 amount);

    error Inactive();
    error WrongPrice();
    error ForwardFailed();

    constructor(address registry_) {
        registry = AgentRegistry(registry_);
    }

    function pay(uint256 agentId) external payable {
        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        if (!agent.active) revert Inactive();
        if (msg.value != agent.priceWei) revert WrongPrice();
        registry.incrementJobs(agentId);
        (bool ok,) = agent.payout.call{value: msg.value}("");
        if (!ok) revert ForwardFailed();
        emit Payment(msg.sender, agent.payout, agentId, msg.value);
    }
}
