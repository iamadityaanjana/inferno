"use client";

import { monadTestnet } from "wagmi/chains";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortAddr } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  if (!isConnected || !address) {
    return (
      <button
        className="rounded-md bg-[#ff3b1f] px-4 py-2 text-sm font-semibold text-white"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const wrong = chainId !== monadTestnet.id;

  return (
    <div className="flex items-center gap-2">
      {wrong && (
        <button
          className="rounded-md bg-[#ffb020] px-3 py-2 text-xs font-semibold text-black"
          onClick={() => switchChain({ chainId: monadTestnet.id })}
        >
          Switch to Monad Testnet
        </button>
      )}
      <span className="mono text-xs text-[#b08978]">{shortAddr(address)}</span>
      <button className="rounded-md border border-[#3a1a14] px-3 py-1.5 text-xs" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
