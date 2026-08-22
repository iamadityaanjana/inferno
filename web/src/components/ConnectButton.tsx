"use client";

import { monadTestnet } from "wagmi/chains";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { buttonClass } from "./Button";
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
        className={buttonClass("primary")}
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
        <button className={buttonClass("primary", "sm")} onClick={() => switchChain({ chainId: monadTestnet.id })}>
          Switch to Monad Testnet
        </button>
      )}
      <span className="mono text-[12px] text-[#6B7280]">{shortAddr(address)}</span>
      <button className={buttonClass("outline", "sm")} onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
