export const registryAbi = [
  {
    type: "function",
    name: "agentCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "capabilities", type: "string" },
          { name: "priceWei", type: "uint256" },
          { name: "payout", type: "address" },
          { name: "jobs", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
] as const;

export const paymentRouterAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "payable",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "Payment",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const devilEscrowAbi = [
  {
    type: "function",
    name: "acceptDeal",
    stateMutability: "payable",
    inputs: [{ name: "dealType", type: "uint8" }],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dealId", type: "uint256" },
      { name: "challengeGuess", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recordRunEnd",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "DealAccepted",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "dealType", type: "uint8", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DealResolved",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "won", type: "bool", indexed: false },
      { name: "payout", type: "uint256", indexed: false },
    ],
  },
] as const;
