import { formatEther, parseEther } from "viem";

export function mon(wei: bigint) {
  return Number(formatEther(wei));
}

export function wei(amount: number) {
  return parseEther(amount.toString());
}

export function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function clock() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
