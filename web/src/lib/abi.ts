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
    name: "listingFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "router",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
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
          { name: "owner", type: "address" },
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
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "capabilities", type: "string" },
      { name: "priceWei", type: "uint256" },
      { name: "payout", type: "address" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "setPrice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "priceWei", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setPayout",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "payout", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setActive",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "priceWei", type: "uint256", indexed: false },
      { name: "payout", type: "address", indexed: false },
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

const spendVoucherComponents = [
  { name: "user", type: "address" },
  { name: "maxSpendWei", type: "uint256" },
  { name: "epoch", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

export const agentCreditsAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "withdrawAll", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "revokeVouchers", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "credits",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "epochOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "remaining",
    stateMutability: "view",
    inputs: [{ name: "voucher", type: "tuple", components: spendVoucherComponents }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "spend",
    stateMutability: "nonpayable",
    inputs: [
      { name: "voucher", type: "tuple", components: spendVoucherComponents },
      { name: "signature", type: "bytes" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ name: "price", type: "uint256" }],
  },
  {
    type: "event",
    name: "Spent",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "balance", type: "uint256", indexed: false },
    ],
  },
] as const;
