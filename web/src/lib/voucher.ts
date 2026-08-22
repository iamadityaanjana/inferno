import { AGENT_CREDITS, CHAIN_ID } from "./contracts";

/**
 * A spend voucher is the user's signed permission for the operator to debit
 * their credits, capped in both amount and time. It replaces a wallet popup per
 * hire with one signature per session, and it is what lets the backend hold no
 * session state: the signature is the authorisation.
 */
export type Voucher = {
  user: `0x${string}`;
  maxSpendWei: string;
  epoch: string;
  deadline: string;
};

export type SignedVoucher = { voucher: Voucher; signature: `0x${string}` };

export const VOUCHER_TYPES = {
  SpendVoucher: [
    { name: "user", type: "address" },
    { name: "maxSpendWei", type: "uint256" },
    { name: "epoch", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function voucherDomain() {
  return {
    name: "Inferno",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: AGENT_CREDITS,
  } as const;
}

/** viem wants bigints for uint256 fields; storage and transport want strings. */
export function toTypedMessage(v: Voucher) {
  return {
    user: v.user,
    maxSpendWei: BigInt(v.maxSpendWei),
    epoch: BigInt(v.epoch),
    deadline: BigInt(v.deadline),
  };
}

export function toContractTuple(v: Voucher) {
  return {
    user: v.user,
    maxSpendWei: BigInt(v.maxSpendWei),
    epoch: BigInt(v.epoch),
    deadline: BigInt(v.deadline),
  } as const;
}

/** Session budget and lifetime. Deliberately small — a leak caps out here. */
export const SESSION_BUDGET_WEI = 500_000_000_000_000_000n; // 0.5 MON
export const SESSION_TTL_SECONDS = 3600n;
/** Re-sign this far before real expiry so a hire cannot expire mid-flight. */
const EXPIRY_MARGIN_SECONDS = 120n;

const KEY = "inferno:voucher:v1";

export function loadSignedVoucher(user: string): SignedVoucher | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignedVoucher;
    if (parsed.voucher.user.toLowerCase() !== user.toLowerCase()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSignedVoucher(signed: SignedVoucher) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(signed));
  } catch {
    // A full or blocked store just means we re-sign next time.
  }
}

export function clearSignedVoucher() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function isUsable(signed: SignedVoucher, epoch: bigint, nowSeconds: bigint) {
  if (BigInt(signed.voucher.epoch) !== epoch) return false;
  return BigInt(signed.voucher.deadline) > nowSeconds + EXPIRY_MARGIN_SECONDS;
}

export function buildVoucher(user: `0x${string}`, epoch: bigint, nowSeconds: bigint): Voucher {
  return {
    user,
    maxSpendWei: SESSION_BUDGET_WEI.toString(),
    epoch: epoch.toString(),
    deadline: (nowSeconds + SESSION_TTL_SECONDS).toString(),
  };
}
