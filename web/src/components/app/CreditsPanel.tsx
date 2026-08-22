"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { agentCreditsAbi } from "@/lib/abi";
import { AGENT_CREDITS, creditsReady, explorerAddress, withGasBuffer } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { clearSignedVoucher } from "@/lib/voucher";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT } from "@/lib/ui";

export function CreditsPanel() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("0.5");
  const [busy, setBusy] = useState<null | "deposit" | "withdraw" | "revoke">(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicClient || !address || !creditsReady()) return;
    try {
      const next = await publicClient.readContract({
        address: AGENT_CREDITS,
        abi: agentCreditsAbi,
        functionName: "credits",
        args: [address],
      });
      setBalance(next);
    } catch {
      setBalance(null);
    }
  }, [publicClient, address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function send(kind: "deposit" | "withdraw" | "revoke") {
    if (!publicClient || !address) return;
    if (chainId !== monadTestnet.id) {
      setError("Switch to Monad Testnet first.");
      return;
    }
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      // Monad bills the gas limit, so each branch estimates its real cost
      // rather than padding a shared constant.
      const base = { address: AGENT_CREDITS, abi: agentCreditsAbi, chainId: monadTestnet.id } as const;
      let hash: `0x${string}`;

      if (kind === "deposit") {
        const value = parseEther(amount || "0");
        if (value <= 0n) throw new Error("Enter an amount above zero.");
        const gas = withGasBuffer(
          await publicClient.estimateContractGas({
            ...base,
            functionName: "deposit",
            value,
            account: address,
          }),
        );
        hash = await writeContractAsync({ ...base, functionName: "deposit", value, gas });
      } else if (kind === "withdraw") {
        const wanted = parseEther(amount || "0");
        if (wanted <= 0n) throw new Error("Enter an amount above zero.");
        if (balance !== null && wanted > balance) throw new Error("More than your credit balance.");
        const gas = withGasBuffer(
          await publicClient.estimateContractGas({
            ...base,
            functionName: "withdraw",
            args: [wanted],
            account: address,
          }),
        );
        hash = await writeContractAsync({ ...base, functionName: "withdraw", args: [wanted], gas });
      } else {
        const gas = withGasBuffer(
          await publicClient.estimateContractGas({
            ...base,
            functionName: "revokeVouchers",
            account: address,
          }),
        );
        hash = await writeContractAsync({ ...base, functionName: "revokeVouchers", gas });
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted.");

      if (kind === "revoke") {
        // The old signature is dead on-chain; drop it so the next hire re-signs.
        clearSignedVoucher();
        setNote("Outstanding approvals revoked. The next hire will ask you to sign again.");
      } else {
        setNote(kind === "deposit" ? "Credits topped up." : "Withdrawn to your wallet.");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!creditsReady()) {
    return <p className="text-[13px] text-[#8a8a82]">Credits contract is not configured.</p>;
  }

  if (!isConnected) {
    return <p className="text-[13px] text-[#8a8a82]">Connect your wallet to top up credits.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[#eeeeea] bg-[#fafaf8] px-3 py-2.5">
        <span className="text-[12px] text-[#8a8a82]">Credit balance</span>
        <span className="mono text-[15px] text-[#1c1c1a]">
          {balance === null ? "—" : `${Number(formatEther(balance)).toFixed(4)} MON`}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-32 flex-1">
          <span className="text-[11.5px] text-[#a3a39b]">Amount (MON)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={`${INPUT} mt-1`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy !== null}
          onClick={() => void send("deposit")}
        >
          {busy === "deposit" ? "Depositing…" : "Top up"}
        </button>
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy !== null || balance === 0n}
          onClick={() => void send("withdraw")}
        >
          {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
        </button>
      </div>

      {note && <p className="text-[12.5px] text-[#1f8a6a]">{note}</p>}
      {error && <p className="text-[12.5px] text-[#c0392b]">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f2f2ee] pt-3">
        <p className="text-[12px] leading-5 text-[#a3a39b]">
          Credits are yours and withdrawable at any time. Contract{" "}
          <a
            className="mono underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
            href={explorerAddress(AGENT_CREDITS)}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddr(AGENT_CREDITS)}
          </a>
        </p>
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy !== null}
          onClick={() => void send("revoke")}
        >
          {busy === "revoke" ? "Revoking…" : "Revoke approvals"}
        </button>
      </div>
    </div>
  );
}
