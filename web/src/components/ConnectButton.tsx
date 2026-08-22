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
        className="rounded-md bg-[#c41e3a] px-4 py-2 text-sm font-medium text-white"
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
          className="rounded-md bg-[#14161c] px-3 py-2 text-xs font-medium text-white"
          onClick={() => switchChain({ chainId: monadTestnet.id })}
        >
          Switch to Monad Testnet
        </button>
      )}
      <span className="mono text-xs text-[#5a6170]">{shortAddr(address)}</span>
      <button className="rounded-md border border-[#e2e5ec] px-3 py-1.5 text-xs" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
