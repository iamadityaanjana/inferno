export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet.monadvision.com";

export const REGISTRY = (process.env.NEXT_PUBLIC_REGISTRY ?? "") as `0x${string}`;
export const PAYMENT_ROUTER = (process.env.NEXT_PUBLIC_PAYMENT_ROUTER ?? "") as `0x${string}`;
export const DEVIL_ESCROW = (process.env.NEXT_PUBLIC_DEVIL_ESCROW ?? "") as `0x${string}`;
export const PAY_TO = (process.env.NEXT_PUBLIC_PAY_TO ?? "") as `0x${string}`;

/**
 * Monad charges gas on the limit, not on usage, so padding these is a direct
 * overcharge to the signer. Both cover fixed-size calls, measured on testnet.
 */
export const PAY_GAS = 150_000n;
export const ESCROW_GAS = 180_000n;

/**
 * Registration writes two dynamic strings, and every extra 32-byte word is a
 * cold SSTORE at 8,100 gas on Monad, so cost scales with the description. Never
 * use a fixed limit here — estimate the real call and add this much headroom.
 */
export const GAS_BUFFER_PERCENT = 10n;

export function withGasBuffer(estimate: bigint) {
  return estimate + (estimate * GAS_BUFFER_PERCENT) / 100n;
}

export function explorerTx(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerAddress(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}

export function contractsReady() {
  return Boolean(REGISTRY && PAYMENT_ROUTER && DEVIL_ESCROW);
}
