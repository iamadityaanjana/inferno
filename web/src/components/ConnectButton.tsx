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
        className="rounded-sm bg-[#c23b22] px-4 py-2 text-sm font-medium text-[#f2e6d4]"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect"}
      </button>
    );
  }

  const wrong = chainId !== monadTestnet.id;

  return (
    <div className="flex items-center gap-2">
      {wrong && (
        <button
          className="rounded-sm bg-[#c9a36b] px-3 py-2 text-xs font-medium text-[#0c0908]"
          onClick={() => switchChain({ chainId: monadTestnet.id })}
        >
          Switch to Monad Testnet
        </button>
      )}
      <span className="mono text-xs text-[#9a8070]">{shortAddr(address)}</span>
      <button className="rounded-sm border border-[#2b1d16] px-3 py-1.5 text-xs" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
